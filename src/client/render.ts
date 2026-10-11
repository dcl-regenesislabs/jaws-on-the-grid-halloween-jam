import {
  Animator,
  Billboard,
  BillboardMode,
  Entity,
  GltfContainer,
  InputAction,
  InputModifier,
  MainCamera,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  TouchScreenControls,
  Transform,
  VirtualCamera,
  engine
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { Chum, Pickup, PlayerSlot, Shark } from '../shared/components'
import {
  BOARD_SIZE,
  CELL,
  CENTER_CELL,
  PROP_SCALE,
  SHARKS_TIME,
  VIEW_CELLS,
  WATER_Y,
  cellCenter,
  inHarbor
} from '../shared/config'
import { initAudio, sfx, SFX } from './audio'
import { initAvatars, myAvatarPosition, myGroupOffset } from './avatars'
import { cinema, initCinematic } from './cinematic'
import { inputSystem_ } from './input'
import { initHarbor } from './harbor'
import { cameraShake, mineVisualSystem } from './mines'
import { gameState, myCell, myPlanCells, mySlot, phaseClockSystem } from './state'
import { setSpriteMaterial } from './sprite'
import { createBoardEdge, createDepthLines, createGridWindow, createWaterFloor, gridWindowSystem, waterScrollSystem } from './water'

// Everything presentation-only lives here: water, grid, camera, touch HUD
// config, avatar follow, and shark/pickup visuals driven by synced state.

let camEntity: Entity
let previousShake = { x: 0, z: 0 }

// x < 0 frames the avatar right of center, clear of the d-pad (bottom-left).
const CAM_OFFSET = { x: -4, y: 16, z: -9 }
const CAM_DEADZONE = 0.8 * PROP_SCALE // m the avatar can wander before the camera follows
const SIGHT_CELLS = VIEW_CELLS + 4 // sharks/pickups beyond this stay hidden (~48 m, as with 4 m cells)

// Camera trails my drawn avatar (the real one is hidden underwater), only
// past a deadzone so movement reads on screen.
function cameraFollowSystem(dt: number): void {
  if (cinema.active) return
  if (!camEntity) return
  const target = myAvatarPosition() ?? Transform.getOrNull(engine.PlayerEntity)?.position
  if (!target) return
  const camT = Transform.getMutable(camEntity)
  camT.position.x -= previousShake.x
  camT.position.z -= previousShake.z
  const anchorX = camT.position.x - CAM_OFFSET.x
  const anchorZ = camT.position.z - CAM_OFFSET.z
  const dx = target.x - anchorX
  const dz = target.z - anchorZ
  const dist = Math.sqrt(dx * dx + dz * dz)
  const pull = dist > CAM_DEADZONE ? (dist - CAM_DEADZONE) / dist : 0
  const k = Math.min(1, dt * 6)
  camT.position.x += dx * pull * k
  camT.position.z += dz * pull * k
  previousShake = cameraShake()
  camT.position.x += previousShake.x
  camT.position.z += previousShake.z
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
  // around you, so it unrolls as you swim, up to the shark net.
  createWaterFloor(BOARD_SIZE, WATER_Y, BOARD_SIZE / 2, BOARD_SIZE / 2)
  createGridWindow()
  initHarbor()
  createBoardEdge()
  createDepthLines()
  createMyCellMarker()

  initAudio()
  initCinematic(cam)
  initAvatars()

  engine.addSystem(phaseClockSystem)
  engine.addSystem(inputSystem_)
  engine.addSystem(waterScrollSystem)
  engine.addSystem(() => {
    const cell = myCell()
    if (cell) gridWindowSystem(cell.i, cell.j)
  })
  engine.addSystem(avatarFollowSystem)
  engine.addSystem(myCellMarkerSystem)
  engine.addSystem(mineVisualSystem)
  engine.addSystem(cameraFollowSystem)
  engine.addSystem(sharkVisualSystem)
  engine.addSystem(pickupVisualSystem)
  engine.addSystem(chumVisualSystem)
}

// --- avatar follow: hop to my cell via movePlayerTo (camera + voice follow) ---
// (direct Transform writes on PlayerEntity are ignored by the client)
let lastI = -1
let lastJ = -1

function avatarFollowSystem(_dt: number): void {
  const slot = mySlot()
  const cell = myCell()
  if (!slot || !cell || slot.dead) return
  if (cell.i === lastI && cell.j === lastJ) return
  // Teleport on spawn/respawn; glide when swimming a planned path.
  const jump = lastI < 0 || Math.abs(cell.i - lastI) + Math.abs(cell.j - lastJ) > Math.max(1, slot.maxSteps)
  if (!jump && !inHarbor(cell.i, cell.j)) sfx(SFX.hop, 0.4) // the raft is silent practice
  lastI = cell.i
  lastJ = cell.j
  movePlayerTo({
    newRelativePosition: Vector3.create(cellCenter(cell.i), 0, cellCenter(cell.j)),
    duration: jump ? undefined : SHARKS_TIME * 0.8 // client-side interpolated glide
  }).catch(() => {})
}

// --- my cell: a glowing aqua frame so you can find yourself at a glance;
// my plan: gold frames on the cells I'll swim through, the last one full
// size (pool sized for a few boosted steps) ---
let myMarker: Entity
const stepMarkers: Entity[] = []
const MAX_STEP_MARKERS = 4

function cellFrame(color: Color4, emissive: Color3): Entity {
  const root = engine.addEntity()
  Transform.create(root, { scale: HIDDEN })
  const half = CELL / 2 - 0.15
  for (const [x, z, sx, sz] of [
    [0, half, CELL - 0.1, 0.3],
    [0, -half, CELL - 0.1, 0.3],
    [half, 0, 0.3, CELL - 0.1],
    [-half, 0, 0.3, CELL - 0.1]
  ]) {
    const bar = engine.addEntity()
    Transform.create(bar, { parent: root, position: Vector3.create(x, 0, z), scale: Vector3.create(sx, 0.14, sz) })
    MeshRenderer.setBox(bar)
    Material.setPbrMaterial(bar, { albedoColor: color, emissiveColor: emissive, emissiveIntensity: 1.6, castShadows: false })
  }
  return root
}

function createMyCellMarker(): void {
  myMarker = cellFrame(Color4.create(0.4, 1, 0.95, 1), Color3.create(0.3, 1, 0.9))
  for (let n = 0; n < MAX_STEP_MARKERS; n++) {
    stepMarkers.push(cellFrame(Color4.create(1, 0.84, 0.32, 1), Color3.create(1, 0.7, 0.1)))
  }
}

function myCellMarkerSystem(): void {
  const slot = mySlot()
  const cell = myCell()
  const t = Transform.getMutable(myMarker)
  if (!slot || !cell || slot.dead) {
    t.scale = HIDDEN
    hideStepMarkers(0)
    return
  }
  // Ride along with my avatar as it swims, so frame and avatar move as one.
  const at = myAvatarPosition()
  const off = myGroupOffset() // the frame marks the cell, not my spot in a crowd
  t.position = Vector3.create(at ? at.x - off.x : cellCenter(cell.i), WATER_Y + 0.26, at ? at.z - off.z : cellCenter(cell.j))
  t.scale = Vector3.One()

  // Plan frames, only while picking (myPlanCells is empty otherwise).
  const cells = myPlanCells()
  const pulse = 0.92 + Math.sin(animClock * 10) * 0.06
  cells.slice(0, MAX_STEP_MARKERS).forEach(([i, j], n) => {
    const last = n === cells.length - 1
    const size = last ? pulse : 0.55
    Transform.createOrReplace(stepMarkers[n], {
      position: Vector3.create(cellCenter(i), WATER_Y + 0.27, cellCenter(j)),
      scale: Vector3.create(size, 1, size)
    })
  })
  hideStepMarkers(cells.length)
}

function hideStepMarkers(from: number): void {
  for (let n = from; n < stepMarkers.length; n++) {
    const t = Transform.getMutable(stepMarkers[n])
    if (t.scale.x !== 0) t.scale = HIDDEN
  }
}

// --- shark visuals: animated GLB shark per synced shark + lane telegraph ---
interface SharkVisual {
  fin: Entity // small GLB, deep: only the dorsal fin out, circling its cell
  attacker: Entity // big GLB, hidden until the lunge: grows and bites
  lane: Entity
  mark: Entity // my hunters only: fang tip (Bruce) or crossbar (the Tiger) at the lane's end
  barrels: Entity[] // yellow barrels riding a harpooned fin
  arrows: Entity[] // flat arrows flowing along the lane, toward where it lunges
  phase: string
  clock: number
  bite: number // lane cell of the swimmer this dash eats, -1 if none (fixed at dash start)
  rise: number // 0 submerged → 1 surfaced
  active: boolean
}

const visuals = new Map<Entity, SharkVisual>()
const HIDDEN = Vector3.Zero()
const FIN_SCALE = Vector3.create(1.4 * PROP_SCALE, 1.4 * PROP_SCALE, 1.4 * PROP_SCALE) // fin GLB is ~1m tall

// Lane colour answers "can this hurt me?" for whoever is looking:
// red = a shark hunting me, orange = any lane I could swim into this turn,
// grey-blue = out of my reach. A lane that can bite me is never dimmed.
type LaneTone = 'mine' | 'near' | 'far'
const LANE_COLORS: Record<LaneTone, { albedo: Color4; emissive: Color3 }> = {
  mine: { albedo: Color4.create(1, 0.08, 0.05, 0.55), emissive: Color3.create(0.95, 0.05, 0.02) },
  near: { albedo: Color4.create(1, 0.45, 0.1, 0.42), emissive: Color3.create(0.8, 0.35, 0.05) },
  far: { albedo: Color4.create(0.45, 0.6, 0.75, 0.25), emissive: Color3.create(0.15, 0.25, 0.35) }
}

// One arrow per lane cell (lanes are at most ELROY_LUNGE + 1 cells).
const LANE_ARROWS = 5
const ARROW_FLOW = 1.4 // cells per second the arrows drift toward the lane's end
const ARROW_TEX = Material.Texture.Common({ src: 'assets/images/ui/arrow-up.png' })

function arrowMaterial(e: Entity, tone: LaneTone) {
  const c = LANE_COLORS[tone]
  Material.setPbrMaterial(e, {
    texture: ARROW_TEX,
    emissiveTexture: ARROW_TEX,
    albedoColor: Color4.create(1, 1, 1, Math.min(1, c.albedo.a * 2)),
    emissiveColor: Color3.create(Math.min(1, c.emissive.r + 0.3), Math.min(1, c.emissive.g + 0.3), Math.min(1, c.emissive.b + 0.3)),
    emissiveIntensity: 1.2,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    castShadows: false
  })
}

function hideArrows(v: SharkVisual) {
  for (const a of v.arrows) Transform.getMutable(a).scale = HIDDEN
}

function laneMaterial(e: Entity, tone: LaneTone) {
  Material.setPbrMaterial(e, {
    albedoColor: LANE_COLORS[tone].albedo,
    emissiveColor: LANE_COLORS[tone].emissive,
    emissiveIntensity: 0.9,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    castShadows: false
  })
}

function solid(e: Entity, color: Color4, emissive: Color3, intensity = 1) {
  Material.setPbrMaterial(e, { albedoColor: color, emissiveColor: emissive, emissiveIntensity: intensity, castShadows: false })
}

function ensureVisual(shark: Entity): SharkVisual {
  let v = visuals.get(shark)
  if (!v) {
    // Swim: real fin mesh (procedural GLB), tip above the water.
    const fin = engine.addEntity()
    GltfContainer.create(fin, { src: 'assets/models/shark-fin.glb' })
    Transform.create(fin, { scale: HIDDEN })

    const attacker = engine.addEntity()
    GltfContainer.create(attacker, { src: 'assets/models/shark.glb' })
    Animator.create(attacker, {
      states: [{ clip: 'Armature|Swim', playing: true, loop: true }]
    })
    Transform.create(attacker, { scale: HIDDEN })

    const lane = engine.addEntity()
    MeshRenderer.setBox(lane)
    laneMaterial(lane, 'near')
    Transform.create(lane, { scale: HIDDEN })

    const mark = engine.addEntity()
    MeshRenderer.setBox(mark)
    solid(mark, Color4.create(1, 0.1, 0.06, 1), Color3.create(1, 0.08, 0.04), 1.6)
    Transform.create(mark, { scale: HIDDEN })

    const barrels: Entity[] = []
    for (let n = 0; n < 2; n++) {
      const barrel = engine.addEntity()
      MeshRenderer.setCylinder(barrel)
      solid(barrel, Color4.create(1, 0.8, 0.08, 1), Color3.create(0.6, 0.45, 0), 0.6)
      Transform.create(barrel, { parent: fin, scale: HIDDEN })
      barrels.push(barrel)
    }

    const arrows: Entity[] = []
    for (let n = 0; n < LANE_ARROWS; n++) {
      const arrow = engine.addEntity()
      MeshRenderer.setPlane(arrow)
      Transform.create(arrow, { scale: HIDDEN })
      arrows.push(arrow)
    }

    v = { fin, attacker, lane, mark, barrels, arrows, phase: '', clock: 0, bite: -1, rise: 0, active: false }
    visuals.set(shark, v)
  }
  return v
}

function yaw(dirX: number, dirZ: number): number {
  return (Math.atan2(dirX, dirZ) * 180) / Math.PI
}

// Lunge shape: a surge under the surface, a leap only onto a swimmer.
const SURGE_DEPTH = 1.2 // m below the surface
// Fraction of the dash at the top of the leap: swimmers' avatars are about
// at their cell by then (GLIDE_TIME, smoothstep), and the leap is symmetric,
// so it starts at 2*LEAP_PEAK-1 and lands exactly as the dash ends.
const LEAP_PEAK = 0.78

// First lane cell (0 = the shark's own) holding a swimmer this dash eats,
// or -1. A life jacket absorbs the bite (no one is eaten), so it is skipped.
function biteIndex(shark: { cellI: number; cellJ: number; dirX: number; dirZ: number; len: number }): number {
  let first = -1
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.dead || slot.extraLives > 0) continue
    const di = slot.cellI - shark.cellI
    const dj = slot.cellJ - shark.cellJ
    const n = shark.dirX !== 0 ? di * shark.dirX : dj * shark.dirZ
    const across = shark.dirX !== 0 ? dj : di
    if (across !== 0 || n < 0 || n > shark.len) continue
    if (first < 0 || n < first) first = n
  }
  return first
}

const laneTones = new Map<Entity, LaneTone>()
// debug probe: how many fins are actually visible and where
export function finDebug(): string {
  let total = 0
  let shown = 0
  let info = '-'
  for (const [_e, v] of visuals) {
    total++
    const t = Transform.getOrNull(v.fin)
    if (t && t.scale.x > 0) {
      shown++
      info = `y${t.position.y.toFixed(2)} @${t.position.x.toFixed(0)},${t.position.z.toFixed(0)}`
    }
  }
  return `fins ${shown}/${total} ${info}`
}

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
        Transform.getMutable(v.attacker).scale = HIDDEN
        Transform.getMutable(v.lane).scale = HIDDEN
        Transform.getMutable(v.mark).scale = HIDDEN
        hideArrows(v)
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
      finT.position = Vector3.create(x, WATER_Y - 3, z)
      finT.scale = FIN_SCALE
      Transform.createOrReplace(v.attacker, { scale: HIDDEN })
    }
    if (v.phase !== shark.phase) {
      // The dash ended at the lane's far cell: the fin is there now, not
      // swimming back from where the lunge started.
      if (v.phase === 'lunge') finT.position = Vector3.create(x, finT.position.y, z)
      v.phase = shark.phase
      v.clock = 0
      // Cells arrive with the phase; deaths and leavers only after it.
      v.bite = shark.phase === 'lunge' ? biteIndex(shark) : -1
    }
    // My pack swims bigger: Bruce the biggest.
    const mineHunter = me !== null && shark.role > 0 && shark.target === me.address
    const finScale = !mineHunter ? FIN_SCALE : Vector3.scale(FIN_SCALE, shark.role === 1 ? 1.6 : 1.3)
    const tagged = shark.tagUntilTurn > gameState().turn
    v.barrels.forEach((b, n) => {
      // Barrel count is a gameplay readout: undo the fin's PROP_SCALE so it keeps its size.
      Transform.getMutable(b).scale = n < shark.barrels ? Vector3.scale(Vector3.create(0.32, 0.22, 0.32), 1 / PROP_SCALE) : HIDDEN
      Transform.getMutable(b).position = Vector3.create(-0.5 - n * 0.4, tagged ? 0.55 : 0.4, n === 0 ? 0.35 : -0.35)
    })
    v.clock += dt
    v.rise = Math.min(1, v.rise + dt / 0.6)
    // Cruise: fin base just under the surface line (GLB base is y=0).
    const finY = WATER_Y - 3 + (3 - 0.3 * PROP_SCALE + Math.sin(animClock * 6) * 0.06) * v.rise

    if (shark.phase === 'lunge') {
      // Fin dives; the big shark surges along the lane just under the
      // surface. It only leaps out when it eats someone: it reaches the
      // victim's cell as their avatar does (end of the glide), leaps there
      // and comes down nose-first on them as the dash ends.
      const k = Math.min(1, v.clock / SHARKS_TIME)
      const toX = cellCenter(shark.cellI + shark.dirX * shark.len)
      const toZ = cellCenter(shark.cellJ + shark.dirZ * shark.len)
      let e = k * k
      let y = WATER_Y - SURGE_DEPTH + Math.sin(k * Math.PI) * 0.25
      let pitch = -6 * Math.sin(k * Math.PI)
      let grow = 0.8 + k * 0.4
      if (v.bite >= 0) {
        // Along the lane: to the victim by the peak, then on to the far
        // cell (where the server leaves it) while diving back in.
        const f = v.bite / shark.len
        if (k < LEAP_PEAK) {
          const t = k / LEAP_PEAK
          e = f * t * t
        } else {
          e = f + (1 - f) * ((k - LEAP_PEAK) / (1 - LEAP_PEAK))
        }
        const d = (k - LEAP_PEAK) / (1 - LEAP_PEAK)
        if (d > -1) {
          const leap = 0.5 * (1 + Math.cos(Math.PI * d))
          y += leap * (WATER_Y + 1 - y)
          pitch += 40 * Math.sin(Math.PI * d) // nose up rising, down on them
        }
        grow = 0.7 + k * 0.8
      }
      finT.scale = HIDDEN
      Transform.createOrReplace(v.attacker, {
        position: Vector3.create(x + (toX - x) * e, y, z + (toZ - z) * e),
        rotation: Quaternion.fromEulerDegrees(pitch, yaw(shark.dirX, shark.dirZ), 0),
        scale: Vector3.scale(Vector3.One(), grow * PROP_SCALE)
      })
      Transform.getMutable(v.lane).scale = HIDDEN
      Transform.getMutable(v.mark).scale = HIDDEN
      hideArrows(v)
      continue
    }

    // Plan: if the cell moved (after a lunge), swim straight to it; once
    // there, idle in circles with the fin trailing the motion.
    Transform.getMutable(v.attacker).scale = HIDDEN
    if (finT.scale.x !== finScale.x) finT.scale = finScale // restore after a lunge / role change
    const swimSpeed = 4 * PROP_SCALE // m/s
    const toCellX = x - finT.position.x
    const toCellZ = z - finT.position.z
    const dist = Math.sqrt(toCellX * toCellX + toCellZ * toCellZ)

    if (dist > 0.9 * PROP_SCALE) {
      // Swim toward the cell, nose into the direction of travel.
      const step = Math.min(dist, swimSpeed * dt)
      finT.position = Vector3.create(
        finT.position.x + (toCellX / dist) * step,
        finY,
        finT.position.z + (toCellZ / dist) * step
      )
      const yawDeg = (Math.atan2(toCellX, toCellZ) * 180) / Math.PI - 90 // model faces +X
      finT.rotation = Quaternion.fromEulerDegrees(0, yawDeg, 0)
    } else {
      // Idle: circle the cell, tip trailing the direction of motion.
      const circle = 0.8 * PROP_SCALE // m radius
      const spin = animClock * 0.7
      const spinDeg = (spin * 180) / Math.PI
      finT.position = Vector3.create(x + Math.cos(spin) * circle, finY, z + Math.sin(spin) * circle)
      finT.rotation = Quaternion.fromEulerDegrees(0, 90 - spinDeg, 0)
    }

    if (shark.len > 0 && v.rise >= 1) {
      const tone = laneToneFor(shark, me, mineHunter)
      if (laneTones.get(entity) !== tone) {
        laneTones.set(entity, tone)
        laneMaterial(v.lane, tone)
        for (const a of v.arrows) arrowMaterial(a, tone)
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
      // Arrows drift from the shark toward the lane's end, one per cell,
      // fading in at the start and out at the end.
      const flow = (animClock * ARROW_FLOW) % 1
      const arrowRot = Quaternion.fromEulerDegrees(90, yaw(shark.dirX, shark.dirZ), 0)
      v.arrows.forEach((a, n) => {
        if (n >= cells) {
          Transform.getMutable(a).scale = HIDDEN
          return
        }
        const along = n + flow // cells from the lane's back edge
        const size = 0.85 * CELL * Math.max(0, Math.min(1, along / 0.5, (cells - along) / 0.5))
        const u = along - 0.5 // from the shark's cell center
        Transform.createOrReplace(a, {
          position: Vector3.create(cellCenter(shark.cellI) + shark.dirX * u * CELL, WATER_Y + 0.13, cellCenter(shark.cellJ) + shark.dirZ * u * CELL),
          rotation: arrowRot,
          scale: Vector3.create(size, size, 1)
        })
      })
      // Role by shape at the lane's end: Bruce's fang points along the
      // lane, the Tiger's crossbar cuts across it.
      if (mineHunter) {
        const endX = cellCenter(shark.cellI + shark.dirX * shark.len)
        const endZ = cellCenter(shark.cellJ + shark.dirZ * shark.len)
        const along = shark.role === 1
        Transform.createOrReplace(v.mark, {
          position: Vector3.create(endX + shark.dirX * (along ? 0.3 : 0.4) * CELL, WATER_Y + 0.14, endZ + shark.dirZ * (along ? 0.3 : 0.4) * CELL),
          rotation: Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ) + (along ? 45 : 0), 0),
          scale: along ? Vector3.create(1.3 * PROP_SCALE, 0.1, 1.3 * PROP_SCALE) : Vector3.create(CELL - 0.2, 0.1, 0.35 * PROP_SCALE)
        })
      } else {
        Transform.getMutable(v.mark).scale = HIDDEN
      }
    } else {
      Transform.getMutable(v.lane).scale = HIDDEN
      Transform.getMutable(v.mark).scale = HIDDEN
      hideArrows(v)
    }
  }
}

function laneToneFor(
  shark: { cellI: number; cellJ: number; dirX: number; dirZ: number; len: number },
  me: ReturnType<typeof mySlot>,
  mineHunter: boolean
): LaneTone {
  if (mineHunter) return 'mine'
  if (!me || me.dead) return 'near'
  for (let k = 0; k <= shark.len; k++) {
    const i = shark.cellI + shark.dirX * k
    const j = shark.cellJ + shark.dirZ * k
    if (Math.abs(i - me.cellI) + Math.abs(j - me.cellJ) <= me.maxSteps && !inHarbor(i, j)) return 'near'
  }
  return 'far'
}

// --- chum: a pulsing red slick where it was dropped ---
const chumVisuals = new Map<Entity, Entity>()

function chumVisualSystem(): void {
  const me = mySlot()
  for (const [entity, chum] of engine.getEntitiesWith(Chum)) {
    let visual = chumVisuals.get(entity)
    if (!visual) {
      visual = engine.addEntity()
      MeshRenderer.setCylinder(visual)
      Material.setPbrMaterial(visual, {
        albedoColor: Color4.create(0.75, 0.04, 0.04, 0.55),
        emissiveColor: Color3.create(0.5, 0.02, 0.02),
        emissiveIntensity: 0.8,
        transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
        castShadows: false
      })
      Transform.create(visual, { scale: HIDDEN })
      chumVisuals.set(entity, visual)
    }
    const near = me !== null && Math.max(Math.abs(chum.cellI - me.cellI), Math.abs(chum.cellJ - me.cellJ)) <= SIGHT_CELLS
    const t = Transform.getMutable(visual)
    if (!chum.active || !near) {
      if (t.scale.x !== 0) t.scale = HIDDEN
      continue
    }
    const pulse = 1 + Math.sin(animClock * 4) * 0.08
    t.position = Vector3.create(cellCenter(chum.cellI), WATER_Y + 0.05, cellCenter(chum.cellJ))
    t.scale = Vector3.create(CELL * 1.3 * pulse, 0.04, CELL * 1.3 * pulse)
  }
}

// --- pickup visuals: spinning coin / life-buoy per synced pickup ---
const pickupVisuals = new Map<Entity, { e: Entity; kind: string }>()

function pickupVisual(kind: string): Entity {
  const visual = engine.addEntity()
  if (kind === 'barrel') {
    MeshRenderer.setCylinder(visual)
    Material.setPbrMaterial(visual, {
      albedoColor: Color4.create(1, 0.8, 0.08, 1),
      emissiveColor: Color3.create(0.6, 0.45, 0),
      emissiveIntensity: 0.5,
      roughness: 0.5
    })
  } else if (kind === 'coin') {
    MeshRenderer.setCylinder(visual)
    Material.setPbrMaterial(visual, {
      albedoColor: Color4.fromHexString('#FFD700FF'),
      emissiveColor: Color3.fromHexString('#AA8800'),
      emissiveIntensity: 0.6,
      metallic: 0.8,
      roughness: 0.3
    })
  } else {
    MeshRenderer.setPlane(visual)
    Billboard.create(visual, { billboardMode: BillboardMode.BM_ALL })
    const image = kind === 'mine' ? 'sea-mine' : kind === 'boost' ? 'swim-boost' : kind === 'chum' ? 'bait-fish' : 'life-jacket'
    setSpriteMaterial(visual, `assets/images/items/${image}.png`)
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
    t.position = Vector3.create(cellCenter(pickup.cellI), WATER_Y + 0.5 * PROP_SCALE + Math.sin(animClock * 3) * 0.1, cellCenter(pickup.cellJ))
    if (pickup.kind === 'coin') {
      t.rotation = spin
      t.scale = Vector3.scale(Vector3.create(1.1, 0.15, 1.1), PROP_SCALE)
    } else if (pickup.kind === 'barrel') {
      t.rotation = Quaternion.fromEulerDegrees(0, (animClock * 40) % 360, Math.sin(animClock * 2) * 8)
      t.scale = Vector3.scale(Vector3.create(1, 1.3, 1), PROP_SCALE)
    } else {
      t.position.y = WATER_Y + 1.1 * PROP_SCALE + Math.sin(animClock * 3 + entity) * 0.15
      t.scale = Vector3.scale(Vector3.One(), 2.2 * PROP_SCALE)
    }
  }
}
