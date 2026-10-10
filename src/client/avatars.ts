import { AvatarModifierArea, AvatarModifierType, AvatarShape, Entity, Transform, engine } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { PlayerSlot } from '../shared/components'
import { AVATAR_Y, BOARD_SIZE, CELL, RAFT_Y, SHARKS_TIME, cellCenter, inHarbor, pathCells } from '../shared/config'
import { myCell, mySlot } from './state'
import { cinema, CINEMA_SURFACE } from './cinematic'

// Every player is drawn as an AvatarShape copy of their real look (profile
// synced in their slot), gliding cell to cell: swim emote while changing
// cell, float emote while holding a cell. On the practice raft they stand
// on the deck with no emote. Real avatars stand on the floor
// under the opaque water (see WATER_Y), still moved with movePlayerTo so the
// camera and voice follow the game; only their nametags need hiding.
// (AMT_HIDE_AVATARS would hide the AvatarShapes too, verified on the phone.)

const SWIM = 'assets/animations/swim_emote.glb'
const FLOAT = 'assets/animations/float_emote.glb'
const GLIDE_TIME = SHARKS_TIME * 0.9 // s for a whole planned path (fits the execution)
// Scene emotes on an AvatarShape never loop, so the float clip (1.6 s) is
// re-triggered a little early: waiting for its end drops the client to idle
// for a few frames. Both clips start and end on the same pose.
const FLOAT_LOOP = 1.5
// swim_emote.glb is 1.2 s. Repeat before its end, never at the float interval.
const SWIM_LOOP = 1.1
// The Godot client ignores an emote request less than 0.5 s after the last
// one, and any request while an emote is still loading. Triggers are queued
// until the gap has passed instead of being fired and lost.
const EMOTE_GAP = 0.6
// At spawn both clips are triggered once so they are loaded before the first
// swim; the avatar waits under the opaque water (inside the view, so its
// animation still runs) until then.
const PRELOAD_HIDE = 2.4
const PRELOAD_Y = 0
// The swim clip lays the body flat with the hips ~0.70 m above the avatar's
// origin (float keeps them ~0.94 m up, upright). At neck depth that sinks a
// swimmer ~0.5 m under the opaque water, so lift it to the surface while
// swimming, easing in and out.
const SWIM_LIFT = 0.45
const LIFT_EASE = 0.15 // s

// The AvatarShape sits at the origin of a parent "mover" that we slide each
// frame. Changing an AvatarShape's own Transform makes the client walk it
// there at its own pace (lagging the cell frame), so its Transform never
// changes; the mover carries position, rotation and hide-on-death.
interface Swimmer {
  mover: Entity
  entity: Entity
  profileKey: string
  points: { x: number; y: number; z: number }[] // polyline being swum, start → end
  toX: number
  toZ: number
  t: number // seconds since the last cell change
  lift: number // current extra height (SWIM_LIFT while swimming)
  yaw: number
  emote: string // what it should be doing
  pending: string // emote waiting for the client's trigger gap
  lastTrigger: number // clock of the last trigger actually sent
  revealAt: number // clock when the spawn preload ends
  preloadFloat: boolean // float clip still to be preloaded
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

// Where my avatar is drawn right now (mid-swim included), so the cell
// frame and camera move with it instead of jumping to the synced cell.
export function myAvatarPosition(): { x: number; y: number; z: number } | null {
  const me = mySlot()
  if (!me) return null
  for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.address !== me.address) continue
    const s = swimmers.get(slotEntity)
    return s ? Transform.get(s.mover).position : null
  }
  return null
}

function heightAt(i: number, j: number): number {
  return inHarbor(i, j) ? RAFT_Y : AVATAR_Y
}

function point(i: number, j: number) {
  return { x: cellCenter(i), y: heightAt(i, j), z: cellCenter(j) }
}

function trigger(s: Swimmer, emote: string): void {
  s.lastTrigger = clock
  s.stamp += 1
  const shape = AvatarShape.getMutable(s.entity)
  shape.expressionTriggerId = emote
  shape.expressionTriggerTimestamp = s.stamp
}

// Ask for an emote; it goes out as soon as the client will accept it.
function play(s: Swimmer, emote: string): void {
  s.emote = emote
  s.pending = emote
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
      if (s) {
        engine.removeEntity(s.entity)
        engine.removeEntity(s.mover)
      }
      const mover = engine.addEntity()
      Transform.create(mover, { position: Vector3.create(x, heightAt(cell.i, cell.j), z) })
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
      Transform.create(entity, { parent: mover })
      s = {
        mover, entity, profileKey, points: [point(cell.i, cell.j)], toX: x, toZ: z, t: GLIDE_TIME, lift: 0, yaw: 0,
        emote: '', pending: '', lastTrigger: -999, revealAt: clock + PRELOAD_HIDE, preloadFloat: true, stamp: 0
      }
      swimmers.set(slotEntity, s)
      trigger(s, SWIM) // preload; float follows once the client accepts it
    }
    const preloading = clock < s.revealAt
    if (preloading && s.preloadFloat && clock - s.lastTrigger >= EMOTE_GAP) {
      s.preloadFloat = false
      trigger(s, FLOAT)
    }

    if (cinema.active) {
      const visible = isMe && !cinema.swallowed && cinema.elapsed >= 0.55
      Transform.createOrReplace(s.mover, {
        position: Vector3.create(cinema.x, CINEMA_SURFACE - 1.05 + Math.sin(clock * 2) * 0.035, cinema.z),
        rotation: Quaternion.fromEulerDegrees(0, 90, 0),
        scale: visible ? Vector3.create(1.5, 1.5, 1.5) : Vector3.Zero()
      })
      if (isMe && (s.emote !== SWIM || clock - s.lastTrigger >= SWIM_LOOP) && clock - s.lastTrigger >= EMOTE_GAP) {
        s.emote = SWIM
        s.pending = ''
        trigger(s, SWIM)
      }
      continue
    }

    // New cell: swim the executed path (still in slot.path) corner by
    // corner; anything else (respawn, join) snaps.
    if (x !== s.toX || z !== s.toZ) {
      const pos = Transform.get(s.mover).position
      const path = Array.from(slot.path)
      const di = path.reduce((a, c) => a + (c === 3 ? 1 : c === 2 ? -1 : 0), 0)
      const dj = path.reduce((a, c) => a + (c === 0 ? 1 : c === 1 ? -1 : 0), 0)
      const startI = cell.i - di
      const startJ = cell.j - dj
      const fromPath = path.length > 0 && Math.abs(cellCenter(startI) - pos.x) + Math.abs(cellCenter(startJ) - pos.z) < CELL
      const near = Math.abs(x - pos.x) + Math.abs(z - pos.z) <= CELL + 0.1
      const here = { x: pos.x, y: pos.y - s.lift, z: pos.z } // path heights exclude the swim lift
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
    const liftTarget = s.emote === SWIM ? SWIM_LIFT : 0
    s.lift += (liftTarget - s.lift) * Math.min(1, dt / LIFT_EASE)
    Transform.createOrReplace(s.mover, {
      position: Vector3.create(a.x + (b.x - a.x) * f, preloading ? PRELOAD_Y : a.y + (b.y - a.y) * f + s.lift, a.z + (b.z - a.z) * f),
      rotation: Quaternion.fromEulerDegrees(0, s.yaw, 0),
      scale: slot.dead ? Vector3.Zero() : Vector3.One()
    })

    // Settle into float when the glide ends; keep treading on a loop. On the
    // raft just stand (a running clip ends on its own). Nothing is asked of
    // the client while the spawn preload is running.
    if (preloading) continue
    const done = k >= 1
    if (onRaft && done) {
      s.emote = ''
      s.pending = ''
    } else if (s.emote === SWIM && done) play(s, FLOAT)
    else if (s.emote === FLOAT && clock - s.lastTrigger > FLOAT_LOOP) play(s, FLOAT)
    else if (s.emote === '' && !onRaft && done) play(s, FLOAT)

    if (s.pending && clock - s.lastTrigger >= EMOTE_GAP) {
      trigger(s, s.pending)
      s.pending = ''
    }
  }

  // Players who left.
  for (const [slotEntity, s] of swimmers) {
    if (!PlayerSlot.getOrNull(slotEntity)) {
      engine.removeEntity(s.entity)
      engine.removeEntity(s.mover)
      swimmers.delete(slotEntity)
    }
  }
}
