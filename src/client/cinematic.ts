import { Animator, AudioSource, AvatarModifierArea, AvatarModifierType, Entity, GltfContainer, MainCamera, Material, MeshRenderer, ParticleSystem, PBParticleSystem_PlaybackState, Transform, VideoPlayer, VideoState, videoEventsSystem, VirtualCamera, engine } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { BOARD_SIZE, WATER_Y, SHARK_ENDING_TIME, cellCenter } from '../shared/config'
import { mySlot, pendingPlan } from './state'

// A local set above the same cell gives the poster enough underwater depth
// without changing the live board's floor, water or multiplayer simulation.
export const CINEMA_SURFACE = WATER_Y + 24
export const cinema = { active: false, elapsed: 0, black: 0, flash: 0, x: 0, z: 0, swallowed: false, ready: false, returning: 0 }
const DURATION = SHARK_ENDING_TIME
const CUT = 0.55
const BITE = 6.6
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
let root: Entity
let camera: Entity
let shark: Entity
let hide: Entity
let splash: Entity
let gameCamera: Entity
let wasDead = false
let staged = false
let backdrop: Entity
const spray: Entity[] = []
let videoVisible = false

function oceanTexture(video: boolean): void {
  videoVisible = video
  Material.setBasicMaterial(backdrop, {
    texture: video ? Material.Texture.Video({ videoPlayerEntity: backdrop }) : Material.Texture.Common({ src: 'assets/images/cinematic-ocean.png' }),
    diffuseColor: Color4.White(), castShadows: false
  })
}

function stopEffects(): void {
  VideoPlayer.getMutable(backdrop).playing = false
  for (const e of spray) ParticleSystem.getMutable(e).playbackState = PBParticleSystem_PlaybackState.PS_STOPPED
}

export function initCinematic(normalCamera: Entity): void {
  gameCamera = normalCamera
  root = engine.addEntity()
  Transform.create(root, { scale: Vector3.Zero() })
  shark = engine.addEntity()
  Transform.create(shark, { parent: root })
  GltfContainer.create(shark, { src: 'assets/models/shark-meshy-cinematic.glb', visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  Animator.create(shark, { states: [{ clip: 'CinematicBite', playing: false, loop: false }] })
  camera = engine.addEntity()
  Transform.create(camera, {})
  VirtualCamera.create(camera, { fov: 60, defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.01) } })
  // Unlit full-bleed image: camera parenting keeps the waterline stable
  // through the dolly and avoids lighting turning the sea black on mobile.
  backdrop = engine.addEntity()
  Transform.create(backdrop, { parent: camera, position: Vector3.create(0, 0, 20), scale: Vector3.Zero() })
  MeshRenderer.setPlane(backdrop)
  oceanTexture(false)
  VideoPlayer.create(backdrop, { src: 'assets/videos/cinematic-ocean.mp4', playing: false, loop: true, volume: 0 })
  // Keep the still visible until decoding succeeds; never show a black video frame.
  videoEventsSystem.registerVideoEventsEntity(backdrop, event => {
    if (!cinema.active || cinema.ready) return
    if (event.state === VideoState.VS_PLAYING && !videoVisible) oceanTexture(true)
    if (event.state === VideoState.VS_ERROR && videoVisible) oceanTexture(false)
  })
  for (const x of [-1.05, 1.05]) {
    const e = engine.addEntity()
    Transform.create(e, { parent: root, position: Vector3.create(x, 0.02, -0.1), rotation: Quaternion.fromEulerDegrees(-90, 0, 0) })
    ParticleSystem.create(e, {
      playbackState: PBParticleSystem_PlaybackState.PS_STOPPED,
      loop: true, rate: 28, maxParticles: 32, lifetime: 0.45, gravity: 0.7,
      texture: { src: 'assets/images/cinematic-droplet.png' },
      shape: ParticleSystem.Shape.Cone({ radius: 0.18, angle: 35 }),
      initialVelocitySpeed: { start: 0.8, end: 1.8 },
      initialSize: { start: 0.025, end: 0.07 }, sizeOverTime: { start: 1, end: 0.25 },
      initialColor: { start: Color4.create(0.65, 0.9, 1, 0.8), end: Color4.White() },
      colorOverTime: { start: Color4.White(), end: Color4.create(0.8, 0.95, 1, 0) }
    })
    spray.push(e)
  }
  hide = engine.addEntity()
  Transform.create(hide, { position: Vector3.create(BOARD_SIZE / 2, 6, BOARD_SIZE / 2) })
  splash = engine.addEntity()
  Transform.create(splash, {})
  AudioSource.create(splash, { audioClipUrl: 'assets/sounds/big-water-splash.mp3', playing: false, loop: false, global: true, volume: 1 })
  // Run before the swimmer/camera systems: they see the same death edge.
  engine.addSystem(cinematicSystem)
}

function restore(): void {
  stopEffects()
  VirtualCamera.getMutable(gameCamera).defaultTransition = { transitionMode: VirtualCamera.Transition.Time(0.01) }
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = gameCamera
  Transform.getMutable(root).scale = Vector3.Zero()
  Transform.getMutable(backdrop).scale = Vector3.Zero()
  AvatarModifierArea.deleteFrom(hide)
  cinema.active = false
  cinema.ready = false
  cinema.returning = 0.65
  cinema.black = 1
  cinema.flash = 0
  cinema.swallowed = false
  staged = false
}

function cinematicSystem(dt: number): void {
  if (cinema.returning > 0) {
    cinema.returning = Math.max(0, cinema.returning - dt)
    cinema.black = smooth(cinema.returning / 0.65)
  }
  const slot = mySlot()
  if (!slot || !slot.dead) {
    if (cinema.active) restore()
    wasDead = false
    return
  }
  if (!wasDead) {
    wasDead = true
    // Mine deaths retain their explosion ending; this is the shark ending.
    if (slot.deathCause !== 'shark') return
    cinema.active = true
    cinema.elapsed = 0
    Animator.playSingleAnimation(shark, 'CinematicBite', true)
    cinema.x = Math.max(61, Math.min(BOARD_SIZE - 61, cellCenter(slot.cellI)))
    cinema.z = Math.max(36, Math.min(BOARD_SIZE - 36, cellCenter(slot.cellJ)))
    pendingPlan.active = false
    oceanTexture(false)
    VideoPlayer.createOrReplace(backdrop, { src: 'assets/videos/cinematic-ocean.mp4', playing: true, loop: true, volume: 0, position: 0 })
    console.log('[cinematic] begin')
  }
  if (!cinema.active || cinema.ready) return
  cinema.elapsed = Math.min(DURATION, cinema.elapsed + dt)
  const t = cinema.elapsed
  cinema.black = t < CUT ? smooth(t / CUT) : t < 1.5 ? 1 - smooth((t - CUT) / 0.95) : smooth((t - 7.25) / 0.85)
  if (t >= CUT && !staged) {
    staged = true
    Transform.getMutable(root).position = Vector3.create(cinema.x, CINEMA_SURFACE, cinema.z)
    Transform.getMutable(root).scale = Vector3.One()
    Transform.getMutable(backdrop).scale = Vector3.create(54, 23.5, 1)
    AvatarModifierArea.createOrReplace(hide, { area: Vector3.create(BOARD_SIZE, 18, BOARD_SIZE), excludeIds: [], modifiers: [AvatarModifierType.AMT_HIDE_AVATARS] })
    MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = camera
    for (const e of spray) ParticleSystem.getMutable(e).playbackState = PBParticleSystem_PlaybackState.PS_PLAYING
  }
  const dolly = smooth((t - CUT) / 5.5)
  const cam = Transform.getMutable(camera)
  const distance = 11.5 - dolly
  cam.position = Vector3.create(cinema.x, CINEMA_SURFACE - distance * 0.3464, cinema.z - distance)
  cam.rotation = Quaternion.Identity()
  // Long approach, a held silhouette, then accelerate through the surface.
  const rise = smooth((t - 1.5) / 4.4)
  const strike = clamp((t - 6) / 0.6)
  for (let i = 0; i < spray.length; i++) {
    const ps = ParticleSystem.getMutable(spray[i])
    // Alternating hand/foot splashes follow the 1.1-second swimming cadence.
    const stroke = Math.max(0, Math.sin(t * Math.PI * 2 / 1.1 + i * Math.PI))
    ps.rate = t >= BITE ? (t < BITE + 0.25 ? 85 : 0) : 12 + stroke * 35
  }
  const s = Transform.getMutable(shark)
  s.position = Vector3.create(0, -17 + rise * 5 + strike * strike * 6.3, 3)
  s.rotation = Quaternion.fromEulerDegrees(-78, 180, 0)
  // Meshy shark is 1.903 m nose-to-tail; 9.43 gives the cinematic's 17.94 m length.
  s.scale = Vector3.create(9.43, 9.43, 9.43)
  if (t >= BITE && !cinema.swallowed) {
    cinema.swallowed = true
    AudioSource.playSound(splash, 'assets/sounds/big-water-splash.mp3')
    console.log('[cinematic] bite')
  }
  cinema.flash = t >= BITE ? Math.max(0, 1 - (t - BITE) / 0.3) : 0
  if (t >= BITE) {
    const impact = Math.max(0, 1 - (t - BITE) / 0.55)
    cam.position.x += Math.sin(t * 75) * 0.12 * impact
    cam.position.y += Math.cos(t * 63) * 0.08 * impact
  }
  if (t >= DURATION && !cinema.ready) {
    cinema.ready = true
    stopEffects()
    console.log('[cinematic] complete')
  }
}
