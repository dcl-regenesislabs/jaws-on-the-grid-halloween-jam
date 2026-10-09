import {
  Entity,
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

import { GameState, Pickup, PlayerSlot, Shark } from '../shared/components'
import { ATTACK_TIME, BOARD_SIZE, CELL, GRID, WATER_Y, cellCenter } from '../shared/config'
import { createGridLines, createWaterFloor, waterScrollSystem } from './water'

// Everything presentation-only lives here: water, grid, camera, touch HUD
// config, avatar follow, and shark/pickup visuals driven by synced state.

// NOTE: no getPlayer() here — its internal getUserData promise rejects with
// 'channel closed' on scene reloads and kills the scene's update loop.
// With one player connected, the single slot is unambiguous. For real
// multiplayer matching by address, revisit with a guarded fetch.
let camEntity: Entity

const CAM_OFFSET = { x: 0, y: 16, z: -9 }
const CAM_DEADZONE = 5 // m the avatar can wander before the camera follows

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

export function mySlot(): ReturnType<typeof PlayerSlot.getOrNull> {
  let only: ReturnType<typeof PlayerSlot.getOrNull> = null
  let count = 0
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    only = slot
    count++
  }
  return count === 1 ? only : null
}

export function gamePhase(): string {
  for (const [_e, state] of engine.getEntitiesWith(GameState)) return state.phase
  return 'players'
}

export function initClient() {
  console.log('[client] boot hb2')
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
  const cam = engine.addEntity()
  Transform.create(cam, {
    position: Vector3.create(BOARD_SIZE / 2, 16, BOARD_SIZE / 2 - 9),
    rotation: Quaternion.fromEulerDegrees(58, 0, 0)
  })
  VirtualCamera.create(cam, {})
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cam })
  camEntity = cam

  // Ocean covers the whole 50x50-parcel scene.
  createWaterFloor(800, WATER_Y, BOARD_SIZE / 2, BOARD_SIZE / 2)
  createGridLines()

  engine.addSystem(waterScrollSystem)
  engine.addSystem(avatarFollowSystem)
  engine.addSystem(cameraFollowSystem)
  engine.addSystem(sharkVisualSystem)
  engine.addSystem(pickupVisualSystem)
}

// --- avatar follow: hop to the server-authoritative cell via movePlayerTo ---
// (direct Transform writes on PlayerEntity are ignored by the client)
let lastCell = ''

function avatarFollowSystem(_dt: number): void {
  const slot = mySlot()
  if (!slot || slot.dead) return

  const key = `${slot.cellI},${slot.cellJ}`
  if (key === lastCell) return
  const first = lastCell === ''
  lastCell = key
  movePlayerTo({
    newRelativePosition: Vector3.create(cellCenter(slot.cellI), 0, cellCenter(slot.cellJ)),
    duration: first ? undefined : 0.25 // client-side interpolated hop
  }).catch(() => {})
}

// --- shark visuals: fin, telegraph patch, breach head per synced shark ---
interface SharkVisual {
  fin: Entity
  telegraph: Entity
  head: Entity
  phase: string
  attackK: number
}

const visuals = new Map<Entity, SharkVisual>()

function makeBox(color: Color4, emissive?: Color3): Entity {
  const e = engine.addEntity()
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    emissiveColor: emissive,
    emissiveIntensity: emissive ? 0.4 : 0,
    transparencyMode: color.a < 1 ? MaterialTransparencyMode.MTM_ALPHA_BLEND : MaterialTransparencyMode.MTM_OPAQUE,
    castShadows: false
  })
  Transform.create(e, { scale: Vector3.Zero() })
  return e
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
    Transform.create(fin, { scale: Vector3.create(1.4, 2, 3) })

    const telegraph = makeBox(Color4.create(1, 0.1, 0.1, 0.35))

    const head = engine.addEntity()
    MeshRenderer.setSphere(head)
    Material.setPbrMaterial(head, {
      albedoColor: Color4.create(0.2, 0.24, 0.3, 1),
      metallic: 0.1,
      roughness: 0.5
    })
    Transform.create(head, { scale: Vector3.Zero() })
    const jaw = makeBox(Color4.create(0.9, 0.9, 0.92, 1))
    Transform.createOrReplace(jaw, {
      parent: head,
      position: Vector3.create(0, -0.28, 0.28),
      rotation: Quaternion.fromEulerDegrees(25, 0, 0),
      scale: Vector3.create(0.7, 0.18, 0.6)
    })

    v = { fin, telegraph, head, phase: '', attackK: 0 }
    visuals.set(shark, v)
  }
  return v
}

function zoneCenter(cellI: number, cellJ: number, dirX: number, dirZ: number) {
  return {
    x: cellCenter(cellI) + dirX * CELL * 1.5,
    z: cellCenter(cellJ) + dirZ * CELL * 1.5
  }
}

function yaw(dirX: number, dirZ: number): number {
  return (Math.atan2(dirX, dirZ) * 180) / Math.PI
}

// Breach curve: rise fast, hold, sink back.
function headY(k: number): number {
  const UP = WATER_Y + 1.6
  const DOWN = -8
  if (k < 0.25) return DOWN + (UP - DOWN) * (k / 0.25)
  if (k > 0.75) return UP + (DOWN - UP) * ((k - 0.75) / 0.25)
  return UP
}

let animClock = 0

function sharkVisualSystem(dt: number): void {
  animClock += dt

  for (const [entity, shark] of engine.getEntitiesWith(Shark)) {
    const v = ensureVisual(entity)
    if (v.phase !== shark.phase) {
      v.phase = shark.phase
      v.attackK = 0
    }

    const finT = Transform.getMutable(v.fin)
    const targetX = cellCenter(shark.cellI)
    const targetZ = cellCenter(shark.cellJ)
    const bob = Math.sin(animClock * 6) * 0.1

    if (shark.phase === 'attack') {
      // Fin dives, head breaches over the zone.
      v.attackK = Math.min(1, v.attackK + dt / ATTACK_TIME)
      const dive = Math.min(v.attackK / 0.25, 1)
      finT.position = Vector3.create(targetX, WATER_Y - 0.2 - dive * 2.5, targetZ)

      const c = zoneCenter(shark.cellI, shark.cellJ, shark.dirX, shark.dirZ)
      Transform.createOrReplace(v.head, {
        position: Vector3.create(c.x, headY(v.attackK), c.z),
        rotation: Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0),
        scale: Vector3.create(CELL * 1.2, CELL * 0.9, CELL * 1.4)
      })
      Transform.getMutable(v.telegraph).scale = Vector3.Zero()
    } else {
      // Cruise: ease toward the cell, bob, face the swim direction.
      const k = Math.min(1, dt / 0.25)
      finT.position.x += (targetX - finT.position.x) * k
      finT.position.z += (targetZ - finT.position.z) * k
      finT.position.y = WATER_Y - 0.2 + bob
      finT.rotation = Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0)
      Transform.getMutable(v.head).scale = Vector3.Zero()

      if (shark.phase === 'telegraph') {
        const c = zoneCenter(shark.cellI, shark.cellJ, shark.dirX, shark.dirZ)
        Transform.createOrReplace(v.telegraph, {
          position: Vector3.create(c.x, WATER_Y + 0.05, c.z),
          rotation: Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0),
          scale: Vector3.create(3 * CELL, 0.1, 3 * CELL)
        })
        finT.position.y += Math.sin(animClock * 30) * 0.06
      } else {
        Transform.getMutable(v.telegraph).scale = Vector3.Zero()
      }
    }
  }
}

// --- pickup visuals: coin / life-buoy per synced pickup, hidden when taken ---
const pickupVisuals = new Map<Entity, Entity>()

function pickupVisualSystem(): void {
  for (const [entity, pickup] of engine.getEntitiesWith(Pickup)) {
    let visual = pickupVisuals.get(entity)
    if (!visual) {
      visual = engine.addEntity()
      if (pickup.kind === 'coin') {
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
      pickupVisuals.set(entity, visual)
    }
    Transform.createOrReplace(visual, {
      position: Vector3.create(cellCenter(pickup.cellI), WATER_Y + 0.4, cellCenter(pickup.cellJ)),
      scale: pickup.taken ? Vector3.Zero() : Vector3.create(1, 1, 1)
    })
  }
}
