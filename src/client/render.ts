import {
  AudioSource,
  Entity,
  InputAction,
  InputModifier,
  MainCamera,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  PlayerIdentityData,
  TouchScreenControls,
  Transform,
  VirtualCamera,
  engine
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { GameState, Pickup, PlayerSlot, Shark } from '../shared/components'
import {
  BOARD_SIZE,
  CELL,
  CENTER_CELL,
  COIN_POINTS,
  HARBOR_RADIUS,
  SHARKS_TIME,
  VIEW_CELLS,
  WATER_Y,
  cellCenter
} from '../shared/config'
import { createBoardEdge, createGridWindow, createHarbor, createWaterFloor, gridWindowSystem, waterScrollSystem } from './water'

// Everything presentation-only lives here: water, grid, camera, touch HUD
// config, avatar follow, and shark/pickup visuals driven by synced state.

// NOTE: no getPlayer() here — its internal getUserData promise rejects with
// 'channel closed' on scene reloads and kills the scene's update loop.
// The local address comes straight from PlayerIdentityData instead.
let camEntity: Entity

// x < 0 frames the avatar right of center, clear of the d-pad (bottom-left).
const CAM_OFFSET = { x: -4, y: 16, z: -9 }
const CAM_DEADZONE = 0.8 // m the avatar can wander before the camera follows
const SIGHT_CELLS = VIEW_CELLS + 3 // sharks/pickups beyond this stay hidden

// Camera trails the avatar, but only past a deadzone so movement reads on screen.
function cameraFollowSystem(dt: number): void {
  if (!camEntity) return
  const playerT = Transform.getOrNull(engine.PlayerEntity)
  if (!playerT) return
  const camT = Transform.getMutable(camEntity)
  const anchorX = camT.position.x - CAM_OFFSET.x
  const anchorZ = camT.position.z - CAM_OFFSET.z
  const dx = playerT.position.x - anchorX
  const dz = playerT.position.z - anchorZ
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist <= CAM_DEADZONE) return
  const pull = (dist - CAM_DEADZONE) / dist
  const k = Math.min(1, dt * 6)
  camT.position.x += dx * pull * k
  camT.position.z += dz * pull * k
}

function myAddress(): string {
  return (PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? '').toLowerCase()
}

// My slot by wallet address. A lone slot is mine too (guest/review mode,
// where the server may key slots by entity instead of address).
export function mySlot(): ReturnType<typeof PlayerSlot.getOrNull> {
  const address = myAddress()
  let only: ReturnType<typeof PlayerSlot.getOrNull> = null
  let count = 0
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (address && slot.address === address) return slot
    only = slot
    count++
  }
  return count === 1 ? only : null
}

export function gameState(): { phase: string; turn: number } {
  for (const [_e, state] of engine.getEntitiesWith(GameState)) return state
  return { phase: 'players', turn: 0 }
}

// Seconds since the current phase started, measured locally.
let phaseKey = ''
let phaseClock = 0

export function phaseElapsed(): number {
  return phaseClock
}

function phaseClockSystem(dt: number): void {
  const state = gameState()
  const key = `${state.phase}:${state.turn}`
  if (key !== phaseKey) {
    phaseKey = key
    phaseClock = 0
    if (state.phase === 'players') sfx(SFX.turn, 0.5)
    else sfx(SFX.sharks, 0.6)
  } else {
    phaseClock += dt
  }
}

// Is my cell on a shark's lane right now?
export function myCellInDanger(): boolean {
  const slot = mySlot()
  if (!slot || slot.dead) return false
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (!s.active || s.phase !== 'plan' || s.len <= 0) continue
    for (let k = 0; k <= s.len; k++) {
      if (s.cellI + s.dirX * k === slot.cellI && s.cellJ + s.dirZ * k === slot.cellJ) return true
    }
  }
  return false
}

// --- sound cues: one global source per cue so they can overlap ---
const SFX = {
  turn: 'assets/sounds/kenney-interface/tick_002.mp3',
  sharks: 'assets/sounds/kenney-interface/drop_002.mp3',
  hop: 'assets/sounds/kenney-interface/select_001.mp3',
  coin: 'assets/sounds/kenney-interface/confirmation_001.mp3',
  life: 'assets/sounds/kenney-interface/maximize_003.mp3',
  saved: 'assets/sounds/kenney-interface/glass_002.mp3',
  bite: 'assets/sounds/big-water-splash.mp3'
}
const sfxEntities = new Map<string, Entity>()

function sfx(src: string, volume = 1): void {
  let e = sfxEntities.get(src)
  if (!e) {
    e = engine.addEntity()
    Transform.create(e, {})
    AudioSource.create(e, { audioClipUrl: src, playing: false, loop: false, volume, global: true })
    sfxEntities.set(src, e)
  }
  AudioSource.playSound(e, src)
}

export function initClient() {
  console.log('[client] boot', 'turns')
  // No walk/jump/emote: grid movement comes from our UI buttons.
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })

  // Clear the native mobile HUD: no joystick, no crosshair, no gamepad
  // buttons. Movement and attack are our own touch UI (see ui.tsx).
  TouchScreenControls.createOrReplace(engine.RootEntity, {
    hideJoystick: true,
    hideCrosshair: true,
    touchInputs: [
      InputAction.IA_POINTER,
      InputAction.IA_PRIMARY,
      InputAction.IA_SECONDARY,
      InputAction.IA_JUMP,
      InputAction.IA_ACTION_3,
      InputAction.IA_ACTION_4,
      InputAction.IA_ACTION_5,
      InputAction.IA_ACTION_6
    ].map((a) => ({ inputAction: a, hide: true }))
  })

  // Isometric-ish camera that follows the avatar from above/behind.
  // Positive pitch = down; never exactly 90 (breaks direction reference).
  const spawn = cellCenter(CENTER_CELL)
  const cam = engine.addEntity()
  Transform.create(cam, {
    position: Vector3.create(spawn + CAM_OFFSET.x, CAM_OFFSET.y, spawn + CAM_OFFSET.z),
    rotation: Quaternion.fromEulerDegrees(58, 0, 0)
  })
  VirtualCamera.create(cam, {})
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cam })
  camEntity = cam

  // Ocean covers the whole 50x50-parcel scene; the grid is only drawn
  // around you, so it unrolls as you swim.
  createWaterFloor(BOARD_SIZE, WATER_Y, BOARD_SIZE / 2, BOARD_SIZE / 2)
  createGridWindow()
  createHarbor(HARBOR_RADIUS)
  createBoardEdge()
  createMyCellMarker()

  // Ambient sea, quiet so the turn cues cut through.
  const ocean = engine.addEntity()
  Transform.create(ocean, {})
  AudioSource.create(ocean, {
    audioClipUrl: 'assets/sounds/ocean-waves.mp3',
    playing: true,
    loop: true,
    volume: 0.25,
    global: true
  })

  engine.addSystem(phaseClockSystem)
  engine.addSystem(waterScrollSystem)
  engine.addSystem(() => {
    const slot = mySlot()
    if (slot) gridWindowSystem(slot.cellI, slot.cellJ)
  })
  engine.addSystem(avatarFollowSystem)
  engine.addSystem(myCellMarkerSystem)
  engine.addSystem(cameraFollowSystem)
  engine.addSystem(sharkVisualSystem)
  engine.addSystem(pickupVisualSystem)
}

// --- avatar follow: hop to the server-authoritative cell via movePlayerTo ---
// (direct Transform writes on PlayerEntity are ignored by the client)
let lastI = -1
let lastJ = -1
let lastScore = 0
let lastLives = 0
let lastDead = false

function avatarFollowSystem(_dt: number): void {
  const slot = mySlot()
  if (!slot) return

  // Feedback cues from my own slot's changes.
  if (slot.dead && !lastDead) sfx(SFX.bite)
  if (!slot.dead) {
    if (slot.extraLives > lastLives) sfx(SFX.life)
    else if (slot.extraLives < lastLives) sfx(SFX.saved)
    if (slot.score - lastScore >= COIN_POINTS) sfx(SFX.coin, 0.8)
  }
  lastDead = slot.dead
  lastLives = slot.extraLives
  lastScore = slot.score
  if (slot.dead) return

  if (slot.cellI === lastI && slot.cellJ === lastJ) return
  // Teleport on spawn/respawn; hop between neighbouring cells.
  const jump = lastI < 0 || Math.abs(slot.cellI - lastI) + Math.abs(slot.cellJ - lastJ) > 1
  if (!jump) sfx(SFX.hop, 0.4)
  lastI = slot.cellI
  lastJ = slot.cellJ
  movePlayerTo({
    newRelativePosition: Vector3.create(cellCenter(slot.cellI), 0, cellCenter(slot.cellJ)),
    duration: jump ? undefined : 0.2 // client-side interpolated hop
  }).catch(() => {})
}

// --- my cell: a glowing aqua frame so you can find yourself at a glance ---
let myMarker: Entity

function createMyCellMarker(): void {
  myMarker = engine.addEntity()
  Transform.create(myMarker, { scale: HIDDEN })
  const half = CELL / 2 - 0.15
  for (const [x, z, sx, sz] of [
    [0, half, CELL - 0.1, 0.3],
    [0, -half, CELL - 0.1, 0.3],
    [half, 0, 0.3, CELL - 0.1],
    [-half, 0, 0.3, CELL - 0.1]
  ]) {
    const bar = engine.addEntity()
    Transform.create(bar, { parent: myMarker, position: Vector3.create(x, 0, z), scale: Vector3.create(sx, 0.14, sz) })
    MeshRenderer.setBox(bar)
    Material.setPbrMaterial(bar, {
      albedoColor: Color4.create(0.4, 1, 0.95, 1),
      emissiveColor: Color3.create(0.3, 1, 0.9),
      emissiveIntensity: 1.6,
      castShadows: false
    })
  }
}

function myCellMarkerSystem(dt: number): void {
  const slot = mySlot()
  const t = Transform.getMutable(myMarker)
  if (!slot || slot.dead) {
    t.scale = HIDDEN
    return
  }
  const x = cellCenter(slot.cellI)
  const z = cellCenter(slot.cellJ)
  const first = t.scale.x === 0
  const k = first ? 1 : Math.min(1, dt / 0.08)
  t.position = Vector3.create(
    t.position.x + (x - t.position.x) * k,
    WATER_Y + 0.26,
    t.position.z + (z - t.position.z) * k
  )
  t.scale = Vector3.One()
}

// --- shark visuals: fin, lane telegraph, breach head per synced shark ---
interface SharkVisual {
  fin: Entity
  lane: Entity
  head: Entity
  phase: string
  clock: number
  rise: number // 0 submerged → 1 surfaced
  active: boolean
}

const visuals = new Map<Entity, SharkVisual>()
const HIDDEN = Vector3.Zero()

function laneMaterial(e: Entity, hunting: boolean) {
  Material.setPbrMaterial(e, {
    albedoColor: hunting ? Color4.create(1, 0.08, 0.05, 0.5) : Color4.create(1, 0.45, 0.1, 0.4),
    emissiveColor: hunting ? Color3.create(0.9, 0.05, 0.02) : Color3.create(0.8, 0.35, 0.05),
    emissiveIntensity: 0.9,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    castShadows: false
  })
}

function ensureVisual(shark: Entity): SharkVisual {
  let v = visuals.get(shark)
  if (!v) {
    const fin = engine.addEntity()
    MeshRenderer.setBox(fin)
    Material.setPbrMaterial(fin, {
      albedoColor: Color4.create(0.15, 0.17, 0.2, 1),
      metallic: 0.1,
      roughness: 0.6
    })
    Transform.create(fin, { scale: HIDDEN })

    const lane = engine.addEntity()
    MeshRenderer.setBox(lane)
    laneMaterial(lane, true)
    Transform.create(lane, { scale: HIDDEN })

    const head = engine.addEntity()
    MeshRenderer.setSphere(head)
    Material.setPbrMaterial(head, {
      albedoColor: Color4.create(0.2, 0.24, 0.3, 1),
      metallic: 0.1,
      roughness: 0.5
    })
    Transform.create(head, { scale: HIDDEN })
    const jaw = engine.addEntity()
    MeshRenderer.setBox(jaw)
    Material.setPbrMaterial(jaw, { albedoColor: Color4.create(0.9, 0.9, 0.92, 1), castShadows: false })
    Transform.create(jaw, {
      parent: head,
      position: Vector3.create(0, -0.28, 0.28),
      rotation: Quaternion.fromEulerDegrees(25, 0, 0),
      scale: Vector3.create(0.7, 0.18, 0.6)
    })

    v = { fin, lane, head, phase: '', clock: 0, rise: 0, active: false }
    visuals.set(shark, v)
  }
  return v
}

function yaw(dirX: number, dirZ: number): number {
  return (Math.atan2(dirX, dirZ) * 180) / Math.PI
}

const laneHunting = new Map<Entity, boolean>()
let animClock = 0

function sharkVisualSystem(dt: number): void {
  animClock += dt
  const me = mySlot()

  for (const [entity, shark] of engine.getEntitiesWith(Shark)) {
    const v = ensureVisual(entity)
    const near =
      me !== null &&
      Math.max(Math.abs(shark.cellI - me.cellI), Math.abs(shark.cellJ - me.cellJ)) <= SIGHT_CELLS

    if (!shark.active || !near) {
      if (v.active) {
        Transform.getMutable(v.fin).scale = HIDDEN
        Transform.getMutable(v.lane).scale = HIDDEN
        Transform.getMutable(v.head).scale = HIDDEN
      }
      v.active = false
      v.rise = 0
      continue
    }

    const x = cellCenter(shark.cellI)
    const z = cellCenter(shark.cellJ)
    const finT = Transform.getMutable(v.fin)
    if (!v.active) {
      // Surfacing: snap under its cell, then rise.
      v.active = true
      finT.position = Vector3.create(x, WATER_Y - 2, z)
      finT.scale = Vector3.create(1.2, 2, 2.6)
    }
    if (v.phase !== shark.phase) {
      v.phase = shark.phase
      v.clock = 0
    }
    v.clock += dt
    v.rise = Math.min(1, v.rise + dt / 0.6)
    const finY = WATER_Y - 2 + (1.8 + Math.sin(animClock * 6) * 0.1) * v.rise

    if (shark.phase === 'lunge') {
      // Dash along the lane, ease-in, and breach at the far end.
      const k = Math.min(1, v.clock / SHARKS_TIME)
      const e = k * k
      const toX = cellCenter(shark.cellI + shark.dirX * shark.len)
      const toZ = cellCenter(shark.cellJ + shark.dirZ * shark.len)
      finT.position = Vector3.create(x + (toX - x) * e, finY, z + (toZ - z) * e)
      finT.rotation = Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0)
      Transform.getMutable(v.lane).scale = HIDDEN
      const breach = Math.sin(Math.min(1, k * 1.4) * Math.PI)
      Transform.createOrReplace(v.head, {
        position: Vector3.create(toX, WATER_Y - 1 + breach * 2.4, toZ),
        rotation: Quaternion.fromEulerDegrees(-30 * breach, yaw(shark.dirX, shark.dirZ), 0),
        scale: Vector3.create(CELL * 0.6, CELL * 0.45, CELL * 0.8)
      })
      continue
    }

    // Plan: cruise toward its cell, show the lane it will dash along.
    const kk = Math.min(1, dt / 0.15)
    finT.position = Vector3.create(
      finT.position.x + (x - finT.position.x) * kk,
      finY,
      finT.position.z + (z - finT.position.z) * kk
    )
    finT.rotation = Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0)
    Transform.getMutable(v.head).scale = HIDDEN

    if (shark.len > 0 && v.rise >= 1) {
      if (laneHunting.get(entity) !== shark.hunting) {
        laneHunting.set(entity, shark.hunting)
        laneMaterial(v.lane, shark.hunting)
      }
      const cells = shark.len + 1
      const mid = shark.len / 2
      const horizontal = shark.dirX !== 0
      Transform.createOrReplace(v.lane, {
        position: Vector3.create(
          cellCenter(shark.cellI + shark.dirX * mid),
          WATER_Y + 0.08,
          cellCenter(shark.cellJ + shark.dirZ * mid)
        ),
        scale: horizontal
          ? Vector3.create(cells * CELL - 0.4, 0.06, CELL - 0.4)
          : Vector3.create(CELL - 0.4, 0.06, cells * CELL - 0.4)
      })
    } else {
      Transform.getMutable(v.lane).scale = HIDDEN
    }
  }
}

// --- pickup visuals: spinning coin / life-buoy per synced pickup ---
const pickupVisuals = new Map<Entity, { e: Entity; kind: string }>()

function pickupVisual(kind: string): Entity {
  const visual = engine.addEntity()
  if (kind === 'coin') {
    MeshRenderer.setCylinder(visual)
    Material.setPbrMaterial(visual, {
      albedoColor: Color4.fromHexString('#FFD700FF'),
      emissiveColor: Color3.fromHexString('#AA8800'),
      emissiveIntensity: 0.6,
      metallic: 0.8,
      roughness: 0.3
    })
  } else {
    MeshRenderer.setSphere(visual)
    Material.setPbrMaterial(visual, {
      albedoColor: Color4.fromHexString('#FF4444FF'),
      emissiveColor: Color3.fromHexString('#AA0000'),
      emissiveIntensity: 0.6
    })
  }
  Transform.create(visual, { scale: HIDDEN })
  return visual
}

function pickupVisualSystem(): void {
  const me = mySlot()
  const spin = Quaternion.fromEulerDegrees(90, (animClock * 120) % 360, 0)
  for (const [entity, pickup] of engine.getEntitiesWith(Pickup)) {
    let visual = pickupVisuals.get(entity)
    // Pool slots get reused for either kind: rebuild when the kind changes.
    if (!visual || visual.kind !== pickup.kind) {
      if (visual) engine.removeEntity(visual.e)
      visual = { e: pickupVisual(pickup.kind), kind: pickup.kind }
      pickupVisuals.set(entity, visual)
    }
    const near =
      me !== null &&
      Math.max(Math.abs(pickup.cellI - me.cellI), Math.abs(pickup.cellJ - me.cellJ)) <= SIGHT_CELLS
    const t = Transform.getMutable(visual.e)
    if (!pickup.active || !near) {
      t.scale = HIDDEN
      continue
    }
    t.position = Vector3.create(cellCenter(pickup.cellI), WATER_Y + 0.5 + Math.sin(animClock * 3) * 0.1, cellCenter(pickup.cellJ))
    if (pickup.kind === 'coin') {
      t.rotation = spin
      t.scale = Vector3.create(1.1, 0.15, 1.1)
    } else {
      t.scale = Vector3.create(1, 1, 1)
    }
  }
}
