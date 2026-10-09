import { AvatarModifierArea, AvatarModifierType, AvatarShape, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { PlayerSlot } from '../shared/components'
import { AVATAR_Y, BOARD_SIZE, cellCenter } from '../shared/config'
import { myCell, mySlot } from './state'

// Every player is drawn as an AvatarShape copy of their real look (profile
// synced in their slot), gliding cell to cell: swim emote while changing
// cell, float emote while holding a cell. Real avatars stand on the floor
// under the opaque water (see WATER_Y), still moved with movePlayerTo so the
// camera and voice follow the game; only their nametags need hiding.
// (AMT_HIDE_AVATARS would hide the AvatarShapes too, verified on the phone.)

const SWIM = 'assets/animations/swim_emote.glb'
const FLOAT = 'assets/animations/float_emote.glb'
const GLIDE_TIME = 0.4 // s from cell to cell
const SWIM_HOLD = 0.7 // s of swim before settling into float
const FLOAT_LOOP = 1.6 // clip length; re-triggered so it keeps treading

interface Swimmer {
  entity: Entity
  profileKey: string
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  t: number // seconds since the last cell change
  yaw: number
  emote: string
  emoteAt: number
  stamp: number
}

const swimmers = new Map<Entity, Swimmer>()
let clock = 0

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

export function initAvatars(): void {
  // Real avatars' nametags poke out of the water: hide them board-wide.
  const hide = engine.addEntity()
  Transform.create(hide, {
    position: Vector3.create(BOARD_SIZE / 2, 10, BOARD_SIZE / 2),
    scale: Vector3.create(BOARD_SIZE, 40, BOARD_SIZE)
  })
  AvatarModifierArea.create(hide, {
    area: Vector3.create(BOARD_SIZE, 40, BOARD_SIZE),
    excludeIds: [],
    modifiers: [AvatarModifierType.AMT_HIDE_NAMETAGS]
  })
  engine.addSystem(swimmerSystem)
}

function play(s: Swimmer, emote: string): void {
  s.emote = emote
  s.emoteAt = clock
  s.stamp += 1
  const shape = AvatarShape.getMutable(s.entity)
  shape.expressionTriggerId = emote
  shape.expressionTriggerTimestamp = s.stamp
}

function swimmerSystem(dt: number): void {
  clock += dt
  const me = mySlot()

  for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    const isMe = me !== null && slot.address === me.address
    const cell = isMe ? myCell() : { i: slot.cellI, j: slot.cellJ }
    if (!cell) continue
    const x = cellCenter(cell.i)
    const z = cellCenter(cell.j)

    // (Re)build when the profile changes.
    const wearables = wearablesOf(slot)
    const profileKey = `${slot.bodyShape}|${slot.name}|${wearables.join(',')}`
    let s = swimmers.get(slotEntity)
    if (!s || s.profileKey !== profileKey) {
      if (s) engine.removeEntity(s.entity)
      const entity = engine.addEntity()
      AvatarShape.create(entity, {
        id: `swimmer-${slot.address}`,
        name: slot.name,
        bodyShape: slot.bodyShape,
        wearables,
        emotes: [],
        skinColor: slot.skinColor,
        hairColor: slot.hairColor,
        eyeColor: slot.eyesColor
      })
      Transform.create(entity, { position: Vector3.create(x, AVATAR_Y, z) })
      s = { entity, profileKey, fromX: x, fromZ: z, toX: x, toZ: z, t: GLIDE_TIME, yaw: 0, emote: '', emoteAt: 0, stamp: 0 }
      swimmers.set(slotEntity, s)
      play(s, FLOAT)
    }

    // New cell: glide there from wherever we are, swimming.
    if (x !== s.toX || z !== s.toZ) {
      const t = Transform.get(s.entity).position
      const far = Math.abs(x - t.x) + Math.abs(z - t.z) > 2 * 4 + 0.1 // respawn/teleport
      s.fromX = far ? x : t.x
      s.fromZ = far ? z : t.z
      s.toX = x
      s.toZ = z
      s.t = far ? GLIDE_TIME : 0
      if (!far) {
        s.yaw = (Math.atan2(x - t.x, z - t.z) * 180) / Math.PI
        play(s, SWIM)
      }
    }

    s.t += dt
    const k = Math.min(1, s.t / GLIDE_TIME)
    const e = k * k * (3 - 2 * k)
    Transform.createOrReplace(s.entity, {
      position: Vector3.create(s.fromX + (s.toX - s.fromX) * e, AVATAR_Y, s.fromZ + (s.toZ - s.fromZ) * e),
      rotation: Quaternion.fromEulerDegrees(0, s.yaw, 0),
      scale: slot.dead ? Vector3.Zero() : Vector3.One()
    })

    // Settle into float after the stroke; keep treading on a loop.
    if (s.emote === SWIM && clock - s.emoteAt > SWIM_HOLD) play(s, FLOAT)
    else if (s.emote === FLOAT && clock - s.emoteAt > FLOAT_LOOP) play(s, FLOAT)
  }

  // Players who left.
  for (const [slotEntity, s] of swimmers) {
    if (!PlayerSlot.getOrNull(slotEntity)) {
      engine.removeEntity(s.entity)
      swimmers.delete(slotEntity)
    }
  }
}
