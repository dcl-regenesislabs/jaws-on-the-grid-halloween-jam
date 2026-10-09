import {
  AvatarModifierArea,
  AvatarShape,
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

import { GameState, Pickup, PlayerSlot, Shark } from '../shared/components'
import { ATTACK_TIME, BOARD_SIZE, CELL, GRID, WATER_Y, attackCells, cellCenter } from '../shared/config'
import { createGridLines, createWaterFloor, waterScrollSystem } from './water'
import { audioSystem, startAmbient } from './audio'
import { inputSystem_ } from './input'
import { gamePhase, hop, HOP_TIME, hopOffset, mySlot, worldOffset, worldTarget } from './state'

// Everything presentation-only lives here: water, grid, camera, touch HUD
// config, and shark/pickup/avatar visuals driven by synced state. The real
// avatars are hidden; everyone is a capsule at their game cell.

let gridRoot: Entity

export function initClient() {
  console.log('[client] boot hb5')
  // No walk/jump/emote: grid movement comes from our UI buttons.
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })

  // Hide all real avatars (remote AND ours); game shows fake capsules instead.
  const hideArea = engine.addEntity()
  Transform.create(hideArea, { position: Vector3.create(BOARD_SIZE / 2, 2, BOARD_SIZE / 2) })
  AvatarModifierArea.create(hideArea, {
    area: Vector3.create(800, 30, 800),
    excludeIds: [],
    modifiers: [2] // AMT_HIDE_NAMETAGS only — HIDE_AVATARS also eats AvatarShape NPCs
  })

  // Native touch HUD: joystick/crosshair hidden; only the big central button
  // (attack, fist icon) stays. Movement arrows are custom UI on the left.
  const icon = (src: string) => ({ tex: { $case: 'texture' as const, texture: { src } } })
  TouchScreenControls.createOrReplace(engine.RootEntity, {
    hideJoystick: true,
    hideCrosshair: true,
    touchInputs: [
      { inputAction: InputAction.IA_POINTER, hide: true },
      { inputAction: InputAction.IA_PRIMARY, hide: true },
      { inputAction: InputAction.IA_SECONDARY, hide: true },
      { inputAction: InputAction.IA_ACTION_3, hide: true },
      { inputAction: InputAction.IA_ACTION_4, hide: true },
      { inputAction: InputAction.IA_ACTION_5, hide: true },
      { inputAction: InputAction.IA_ACTION_6, hide: true },
      { inputAction: InputAction.IA_JUMP, hide: false, icon: icon('assets/images/ui/fist.png') }
    ]
  })

  // Static camera over the board center: the player never leaves the frame.
  const cam = engine.addEntity()
  Transform.create(cam, {
    position: Vector3.create(BOARD_SIZE / 2, 9, BOARD_SIZE / 2 - 6),
    rotation: Quaternion.fromEulerDegrees(52, 0, 0)
  })
  VirtualCamera.create(cam, {})
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cam })

  // Ocean covers the whole 50x50-parcel scene.
  createWaterFloor(800, WATER_Y, BOARD_SIZE / 2, BOARD_SIZE / 2)
  gridRoot = createGridLines()

  engine.addSystem(waterScrollSystem)
  engine.addSystem(worldShiftSystem)
  engine.addSystem(inputSystem_)
  engine.addSystem(sharkVisualSystem)
  engine.addSystem(pickupVisualSystem)
  engine.addSystem(fakeAvatarSystem)
  engine.addSystem(audioSystem)
  startAmbient()
}

// World slides toward its target; hop animation advances. Grid moves as one
// parented root.
function worldShiftSystem(dt: number): void {
  const k = Math.min(1, dt / 0.22)
  const ease = k * k * (3 - 2 * k)
  worldOffset.x += (worldTarget.x - worldOffset.x) * ease
  worldOffset.z += (worldTarget.z - worldOffset.z) * ease
  if (gridRoot) {
    Transform.createOrReplace(gridRoot, { position: Vector3.create(worldOffset.x, 0, worldOffset.z) })
  }
  if (hop.active) {
    hop.k += dt / HOP_TIME
    if (hop.k >= 1) hop.active = false
  }
}

// Static tile index for content relative to the board center (the player is
// always rendered there).
function tileOffset(entityPos: number): number {
  return Math.round((BOARD_SIZE / 2 - entityPos) / BOARD_SIZE) * BOARD_SIZE
}

// --- shark visuals: fin, telegraph cells, breach head per synced shark ---
interface SharkVisual {
  fin: Entity
  telegraph: Entity[] // 9 border planes, one per threatened cell
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
    Transform.create(fin, { scale: Vector3.create(0.7, 1.1, 1.8) })

    // One outlined-cell marker per threatened grid cell.
    const telegraph: Entity[] = []
    for (let k = 0; k < 9; k++) {
      const cell = engine.addEntity()
      MeshRenderer.setPlane(cell)
      Material.setPbrMaterial(cell, {
        texture: Material.Texture.Common({ src: 'assets/images/ui/cell-border.png' }),
        albedoColor: Color4.create(1, 0.15, 0.15, 1),
        emissiveColor: Color3.create(1, 0.1, 0.1),
        emissiveIntensity: 0.9,
        transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
        castShadows: false
      })
      Transform.create(cell, {
        rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
        scale: Vector3.Zero()
      })
      telegraph.push(cell)
    }

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

    const baseX = cellCenter(shark.cellI)
    const baseZ = cellCenter(shark.cellJ)
    const ox = tileOffset(baseX) + worldOffset.x
    const oz = tileOffset(baseZ) + worldOffset.z

    const finT = Transform.getMutable(v.fin)
    const targetX = baseX + ox
    const targetZ = baseZ + oz
    const bob = Math.sin(animClock * 6) * 0.1

    if (shark.phase === 'attack') {
      // Fin dives, head breaches over the zone.
      v.attackK = Math.min(1, v.attackK + dt / ATTACK_TIME)
      const dive = Math.min(v.attackK / 0.25, 1)
      finT.position = Vector3.create(targetX, WATER_Y - 0.2 - dive * 2.5, targetZ)

      const c = zoneCenter(shark.cellI, shark.cellJ, shark.dirX, shark.dirZ)
      Transform.createOrReplace(v.head, {
        position: Vector3.create(c.x + ox, headY(v.attackK), c.z + oz),
        rotation: Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0),
        scale: Vector3.create(CELL * 0.8, CELL * 0.55, CELL)
      })
      hideTelegraph(v)
    } else {
      // Cruise: ease toward the cell, bob, face the swim direction.
      const k = Math.min(1, dt / 0.25)
      finT.position.x += (targetX - finT.position.x) * k
      finT.position.z += (targetZ - finT.position.z) * k
      finT.position.y = WATER_Y - 0.2 + bob
      finT.rotation = Quaternion.fromEulerDegrees(0, yaw(shark.dirX, shark.dirZ), 0)
      Transform.getMutable(v.head).scale = Vector3.Zero()

      if (shark.phase === 'telegraph') {
        // Outline exactly the 9 threatened cells.
        const cells = attackCells(shark.cellI, shark.cellJ, shark.dirX, shark.dirZ)
        for (let k = 0; k < 9; k++) {
          const [ci, cj] = cells[k]
          Transform.createOrReplace(v.telegraph[k], {
            position: Vector3.create(cellCenter(ci) + ox, WATER_Y + 0.06, cellCenter(cj) + oz),
            rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
            scale: Vector3.create(CELL, CELL, 1)
          })
        }
        finT.position.y += Math.sin(animClock * 30) * 0.06
      } else {
        hideTelegraph(v)
      }
    }
  }
}

function hideTelegraph(v: SharkVisual): void {
  for (const cell of v.telegraph) Transform.getMutable(cell).scale = Vector3.Zero()
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
    const baseX = cellCenter(pickup.cellI)
    const baseZ = cellCenter(pickup.cellJ)
    Transform.createOrReplace(visual, {
      position: Vector3.create(baseX + tileOffset(baseX) + worldOffset.x, WATER_Y + 0.4, baseZ + tileOffset(baseZ) + worldOffset.z),
      scale: pickup.taken ? Vector3.Zero() : Vector3.create(1, 1, 1)
    })
  }
}

// --- fake avatars: one AvatarShape per player slot at their game cell ---
const avatarVisuals = new Map<Entity, { entity: Entity; profileKey: string }>()

// Synced Schemas.Array arrives as a non-plain structure; normalize to a fresh
// mutable string[] or AvatarShape.encode crashes the scene update loop.
function wearablesOf(slot: { wearables: unknown }): string[] {
  const w = slot.wearables
  if (!w) return []
  try {
    return Array.from(w as Iterable<string>)
  } catch {
    return []
  }
}

function fakeAvatarSystem(): void {
  const mine = mySlot()
  const hopOff = hopOffset()

  for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    const profileKey = slot.bodyShape + slot.name + wearablesOf(slot).join(',')
    let visual = avatarVisuals.get(entity)
    if (!visual || visual.profileKey !== profileKey) {
      if (visual) engine.removeEntity(visual.entity)
      const avatar = engine.addEntity()
      AvatarShape.create(avatar, {
        id: slot.address || 'player',
        name: slot.name,
        bodyShape: slot.bodyShape,
        wearables: wearablesOf(slot),
        emotes: [],
        skinColor: slot.skinColor,
        hairColor: slot.hairColor,
        eyeColor: slot.eyesColor
      })
      visual = { entity: avatar, profileKey }
      avatarVisuals.set(entity, visual)
    }

    const baseX = cellCenter(slot.cellI)
    const baseZ = cellCenter(slot.cellJ)
    const isMine = mine !== null && slot.address === mine.address
    const hx = isMine ? hopOff.x : 0
    const hz = isMine ? hopOff.z : 0
    Transform.createOrReplace(visual.entity, {
      position: Vector3.create(
        baseX + tileOffset(baseX) + worldOffset.x + hx,
        slot.dead ? -3 : 0, // standing on the floor; water hits chest-high
        baseZ + tileOffset(baseZ) + worldOffset.z + hz
      ),
      scale: slot.dead ? Vector3.Zero() : Vector3.create(1, 1, 1)
    })
  }

  // Cleanup visuals of removed slots.
  for (const [entity, visual] of avatarVisuals) {
    if (!PlayerSlot.getOrNull(entity)) {
      engine.removeEntity(visual.entity)
      avatarVisuals.delete(entity)
    }
  }
}
