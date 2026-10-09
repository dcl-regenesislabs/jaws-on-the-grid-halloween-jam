import { AvatarModifierArea, AvatarModifierType, AvatarShape, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { PlayerSlot } from '../shared/components'
import { AVATAR_Y, BOARD_SIZE, CELL, RAFT_Y, cellCenter, inHarbor, pathCells } from '../shared/config'
import { myCell, mySlot } from './state'

// Every player is drawn as an AvatarShape copy of their real look (profile
// synced in their slot), gliding cell to cell: swim emote while changing
// cell, float emote while holding a cell. On the practice raft they stand
// on the deck with no emote. Real avatars stand on the floor
// under the opaque water (see WATER_Y), still moved with movePlayerTo so the
// camera and voice follow the game; only their nametags need hiding.
// (AMT_HIDE_AVATARS would hide the AvatarShapes too, verified on the phone.)

const SWIM = 'assets/animations/swim_emote.glb'
const FLOAT = 'assets/animations/float_emote.glb'
const GLIDE_TIME = 0.45 // s for a whole planned path (fits the 0.5 s execution)
const SWIM_HOLD = 0.7 // s of swim before settling into float
const FLOAT_LOOP = 1.6 // clip length; re-triggered so it keeps treading

interface Swimmer {
  entity: Entity
  profileKey: string
  points: { x: number; y: number; z: number }[] // polyline being swum, start → end
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

function heightAt(i: number, j: number): number {
  return inHarbor(i, j) ? RAFT_Y : AVATAR_Y
}

function point(i: number, j: number) {
  return { x: cellCenter(i), y: heightAt(i, j), z: cellCenter(j) }
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
    const onRaft = inHarbor(cell.i, cell.j)

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
      Transform.create(entity, { position: Vector3.create(x, heightAt(cell.i, cell.j), z) })
      s = { entity, profileKey, points: [point(cell.i, cell.j)], toX: x, toZ: z, t: GLIDE_TIME, yaw: 0, emote: '', emoteAt: 0, stamp: 0 }
      swimmers.set(slotEntity, s)
      if (!onRaft) play(s, FLOAT)
    }

    // New cell: swim the executed path (still in slot.path) corner by
    // corner; anything else (respawn, join) snaps.
    if (x !== s.toX || z !== s.toZ) {
      const pos = Transform.get(s.entity).position
      const path = Array.from(slot.path)
      const di = path.reduce((a, c) => a + (c === 3 ? 1 : c === 2 ? -1 : 0), 0)
      const dj = path.reduce((a, c) => a + (c === 0 ? 1 : c === 1 ? -1 : 0), 0)
      const startI = cell.i - di
      const startJ = cell.j - dj
      const fromPath = path.length > 0 && Math.abs(cellCenter(startI) - pos.x) + Math.abs(cellCenter(startJ) - pos.z) < CELL
      const near = Math.abs(x - pos.x) + Math.abs(z - pos.z) <= CELL + 0.1
      const here = { x: pos.x, y: pos.y, z: pos.z }
      if (fromPath) s.points = [here, ...pathCells(startI, startJ, path).map(([i, j]) => point(i, j))]
      else if (near) s.points = [here, point(cell.i, cell.j)]
      else s.points = [point(cell.i, cell.j)]
      s.toX = x
      s.toZ = z
      s.t = 0
      // Swim if any of the way is water; walking the deck needs no emote.
      if (s.points.length > 1 && s.points.some((p) => p.y === AVATAR_Y)) play(s, SWIM)
      else s.emote = ''
    }

    s.t += dt
    const k = Math.min(1, s.t / GLIDE_TIME)
    const e = k * k * (3 - 2 * k)
    const segs = s.points.length - 1
    const at = segs > 0 ? Math.min(segs - 1, Math.floor(e * segs)) : 0
    const a = s.points[at]
    const b = s.points[Math.min(at + 1, segs)]
    const f = segs > 0 ? e * segs - at : 1
    if (b.x !== a.x || b.z !== a.z) s.yaw = (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI
    Transform.createOrReplace(s.entity, {
      position: Vector3.create(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f),
      rotation: Quaternion.fromEulerDegrees(0, s.yaw, 0),
      scale: slot.dead ? Vector3.Zero() : Vector3.One()
    })

    // Settle into float after the stroke; keep treading on a loop. On the
    // raft just stand (a running clip ends on its own).
    const done = k >= 1
    if (onRaft && done) s.emote = ''
    else if (s.emote === SWIM && clock - s.emoteAt > SWIM_HOLD && done) play(s, FLOAT)
    else if (s.emote === FLOAT && clock - s.emoteAt > FLOAT_LOOP) play(s, FLOAT)
    else if (s.emote === '' && !onRaft && done) play(s, FLOAT)
  }

  // Players who left.
  for (const [slotEntity, s] of swimmers) {
    if (!PlayerSlot.getOrNull(slotEntity)) {
      engine.removeEntity(s.entity)
      swimmers.delete(slotEntity)
    }
  }
}
