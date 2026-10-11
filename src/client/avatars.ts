import {
  AvatarModifierArea,
  AvatarModifierType,
  AvatarShape,
  Billboard,
  BillboardMode,
  Entity,
  TextShape,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { PlayerSlot } from '../shared/components'
import { AVATAR_Y, BOARD_SIZE, CELL, NAMETAG_CELLS, RAFT_Y, SHARKS_TIME, cellCenter, inHarbor, pathCells } from '../shared/config'
import { myCell, mySlot, scoreboard } from './state'
import { cinema, CINEMA_SURFACE } from './cinematic'

// Every player is drawn as an AvatarShape copy of their real look (profile
// synced in their slot), gliding cell to cell: swim emote while changing
// cell, float emote while holding a cell. On the practice raft they stand
// on the deck with walk/idle scene emotes. Real avatars stand on the floor
// under the opaque water (see WATER_Y), still moved with movePlayerTo so the
// camera and voice follow the game; only their nametags need hiding.
// (AMT_HIDE_AVATARS would hide the AvatarShapes too, verified on the phone.)

const SWIM = 'assets/animations/swim_emote.glb'
const FLOAT = 'assets/animations/float_emote.glb'
const WALK = 'assets/animations/walk_emote.glb'
const IDLE = 'assets/animations/idle_emote.glb'
const PRELOAD_CLIPS = [SWIM, FLOAT, WALK, IDLE]
const LOOP_SECONDS: Record<string, number> = { [SWIM]: 1.1, [FLOAT]: 1.5, [WALK]: 0.95, [IDLE]: 2.9 }
const GLIDE_TIME = SHARKS_TIME * 0.9 // s for a whole planned path (fits the execution)
// Scene emotes on an AvatarShape never loop, so the float clip (1.6 s) is
// re-triggered a little early: waiting for its end drops the client to idle
// for a few frames. Both clips start and end on the same pose.
// swim_emote.glb is 1.2 s. Repeat before its end, never at the float interval.
const SWIM_LOOP = 1.1
// The Godot client ignores an emote request less than 0.5 s after the last
// one, and any request while an emote is still loading. Triggers are queued
// until the gap has passed instead of being fired and lost.
const EMOTE_GAP = 0.6
// At spawn all clips are triggered once so they are loaded before the first
// swim; the avatar waits under the opaque water (inside the view, so its
// animation still runs) until then.
const PRELOAD_HIDE = 3
const PRELOAD_Y = 0
// The swim clip lays the body flat with the hips ~0.70 m above the avatar's
// origin (float keeps them ~0.94 m up, upright). At neck depth that sinks a
// swimmer ~0.5 m under the opaque water, so lift it to the surface while
// swimming, easing in and out.
const SWIM_LIFT = 0.45
const LIFT_EASE = 0.15 // s
// Nametag height over the mover: above the head standing or floating, lower
// over a flat swimmer (eased with the swim lift). Starting values.
const TAG_UP = 2.2
const TAG_SWIM = 1.2

// The AvatarShape sits at the origin of a parent "mover" that we slide each
// frame. Changing an AvatarShape's own Transform makes the client walk it
// there at its own pace (lagging the cell frame), so its Transform never
// changes; the mover carries position, rotation and hide-on-death.
// The nametag is its own top-level entity placed from the mover each frame,
// so the mover's 0 / 1.5 scales never reach the billboarded text.
interface Swimmer {
  mover: Entity
  entity: Entity
  tag: Entity
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
  preloadIndex: number // next clip to preload
  stamp: number
  offs: { x: number; z: number }[] // group offset of each point of the polyline (meters)
  ox: number // group offset being drawn right now
  oz: number
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

// TextShape reads <size>/<color> markup: strip it, like the scoreboard does.
function tagText(name: string): string {
  return Array.from(name.replace(/[<>\r\n]/g, '')).slice(0, 20).join('') // by code point: no split emoji
}

function hideTag(s: Swimmer): void {
  const t = Transform.getMutable(s.tag)
  if (t.scale.x !== 0) t.scale = Vector3.Zero()
}

function removeSwimmer(s: Swimmer): void {
  engine.removeEntity(s.entity)
  engine.removeEntity(s.mover)
  engine.removeEntity(s.tag)
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

// The group offset my avatar is drawn with, so the selector can leave it out.
export function myGroupOffset(): { x: number; z: number } {
  const me = mySlot()
  if (!me) return { x: 0, z: 0 }
  for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.address !== me.address) continue
    const s = swimmers.get(slotEntity)
    return s ? { x: s.ox, z: s.oz } : { x: 0, z: 0 }
  }
  return { x: 0, z: 0 }
}

function heightAt(i: number, j: number): number {
  return inHarbor(i, j) ? RAFT_Y : AVATAR_Y
}

function point(i: number, j: number, dx = 0, dz = 0) {
  return { x: cellCenter(i) + dx, y: heightAt(i, j), z: cellCenter(j) + dz }
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

// Several players in one cell stand in a tidy block instead of overlapping:
// 2 side by side, 3 = 2 over 1, 4 = 2 over 2, 5 = 2 / 1 / 2, 6 = 3 over 3...
// The camera looks toward +z, so screen-right is +x and screen-up is +z.
const GROUP_SPAN = CELL * 0.75 // meters the block may cover
const GROUP_GAP = 1.1 // widest spacing between neighbours

function rowSizes(n: number): number[] {
  if (n === 5) return [2, 1, 2]
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const sizes: number[] = []
  for (let r = 0; r < rows; r++) sizes.push(Math.floor(n / rows) + (r < n % rows ? 1 : 0))
  return sizes
}

// Offset (meters) from the cell center for each slot, by a stable order.
function groupOffsets(cellOf: (slot: Entity) => { i: number; j: number } | null): Map<Entity, { dx: number; dz: number }> {
  const byCell = new Map<number, Entity[]>()
  for (const [e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.dead) continue
    const c = cellOf(e)
    if (!c) continue
    const key = c.i * 100000 + c.j
    const list = byCell.get(key)
    if (list) list.push(e)
    else byCell.set(key, [e])
  }
  const out = new Map<Entity, { dx: number; dz: number }>()
  for (const list of byCell.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a - b)
    const sizes = rowSizes(list.length)
    const widest = Math.max(sizes.length, ...sizes)
    const gap = Math.min(GROUP_GAP, GROUP_SPAN / Math.max(1, widest - 1))
    let n = 0
    sizes.forEach((count, r) => {
      const dz = ((sizes.length - 1) / 2 - r) * gap // first row on top (+z)
      for (let k = 0; k < count; k++) out.set(list[n++], { dx: (k - (count - 1) / 2) * gap, dz })
    })
  }
  return out
}

function swimmerSystem(dt: number): void {
  clock += dt
  const me = mySlot()
  const offsets = groupOffsets((e) => {
    const slot = PlayerSlot.get(e)
    return me !== null && slot.address === me.address ? myCell() : { i: slot.cellI, j: slot.cellJ }
  })

  for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    const isMe = me !== null && slot.address === me.address
    const cell = isMe ? myCell() : { i: slot.cellI, j: slot.cellJ }
    if (!cell) continue
    const off = offsets.get(slotEntity)
    const x = cellCenter(cell.i) + (off ? off.dx : 0)
    const z = cellCenter(cell.j) + (off ? off.dz : 0)
    const onRaft = inHarbor(cell.i, cell.j)

    // (Re)build when the profile changes.
    const wearables = wearablesOf(slot)
    const profileKey = `${slot.bodyShape}|${slot.name}|${wearables.join(',')}`
    let s = swimmers.get(slotEntity)
    if (!s || s.profileKey !== profileKey) {
      if (s) removeSwimmer(s)
      const mover = engine.addEntity()
      Transform.create(mover, { position: Vector3.create(x, heightAt(cell.i, cell.j), z) })
      const entity = engine.addEntity()
      AvatarShape.create(entity, {
        id: `swimmer-${slot.address}`,
        name: '', // the client's nametag is hidden; our TextShape tag shows the name
        bodyShape: slot.bodyShape,
        wearables,
        emotes: [],
        skinColor: slot.skinColor,
        hairColor: slot.hairColor,
        eyeColor: slot.eyesColor
      })
      Transform.create(entity, { parent: mover })
      const tag = engine.addEntity()
      Transform.create(tag, { scale: Vector3.Zero() })
      Billboard.create(tag, { billboardMode: BillboardMode.BM_ALL })
      TextShape.create(tag, {
        text: tagText(slot.name),
        fontSize: 5,
        textColor: Color4.White(),
        outlineColor: Color4.Black(),
        outlineWidth: 0.2
      })
      s = {
        mover, entity, tag, profileKey, points: [point(cell.i, cell.j, off?.dx, off?.dz)], toX: x, toZ: z, t: GLIDE_TIME, lift: 0, yaw: 0,
        emote: '', pending: '', lastTrigger: -999, revealAt: clock + PRELOAD_HIDE, preloadIndex: 1, stamp: 0,
        offs: [{ x: off ? off.dx : 0, z: off ? off.dz : 0 }], ox: off ? off.dx : 0, oz: off ? off.dz : 0
      }
      swimmers.set(slotEntity, s)
      trigger(s, SWIM) // preload; float follows once the client accepts it
    }
    const preloading = clock < s.revealAt
    if (preloading && s.preloadIndex < PRELOAD_CLIPS.length && clock - s.lastTrigger >= EMOTE_GAP) {
      trigger(s, PRELOAD_CLIPS[s.preloadIndex++])
    }

    if (cinema.active) {
      hideTag(s)
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
      const end = point(cell.i, cell.j, off?.dx, off?.dz)
      const now = { x: s.ox, z: s.oz }
      const to = { x: off ? off.dx : 0, z: off ? off.dz : 0 }
      if (fromPath) {
        const mid = pathCells(startI, startJ, path).map(([i, j]) => point(i, j)).slice(0, -1)
        s.points = [here, ...mid, end]
        s.offs = [now, ...mid.map(() => ({ x: 0, z: 0 })), to]
      } else if (near) {
        s.points = [here, end]
        s.offs = [now, to]
      } else {
        s.points = [end]
        s.offs = [to]
      }
      s.toX = x
      s.toZ = z
      s.t = 0
    }

    s.t += dt
    const k = Math.min(1, s.t / GLIDE_TIME)
    const e = k * k * (3 - 2 * k)
    const segs = s.points.length - 1
    const at = segs > 0 ? Math.min(segs - 1, Math.floor(e * segs)) : 0
    const a = s.points[at]
    const b = s.points[Math.min(at + 1, segs)]
    const f = segs > 0 ? e * segs - at : 1
    const done = k >= 1 || segs === 0
    // Group offset in effect: interpolated along the same polyline as the position.
    const oa = s.offs[Math.min(at, s.offs.length - 1)]
    const ob = s.offs[Math.min(at + 1, s.offs.length - 1)]
    s.ox = done ? ob.x : oa.x + (ob.x - oa.x) * f
    s.oz = done ? ob.z : oa.z + (ob.z - oa.z) * f
    // Parent movement doesn't trigger native locomotion. Select a scene
    // emote for the current segment, then explicitly settle at the endpoint.
    const desired = done ? (onRaft ? IDLE : FLOAT) : (a.y === AVATAR_Y || b.y === AVATAR_Y ? SWIM : WALK)
    if (!preloading && (s.emote !== desired || clock - s.lastTrigger >= LOOP_SECONDS[desired])) play(s, desired)
    if (b.x !== a.x || b.z !== a.z) s.yaw = (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI
    const liftTarget = s.emote === SWIM ? SWIM_LIFT : 0
    s.lift += (liftTarget - s.lift) * Math.min(1, dt / LIFT_EASE)
    Transform.createOrReplace(s.mover, {
      position: Vector3.create(a.x + (b.x - a.x) * f, preloading ? PRELOAD_Y : a.y + (b.y - a.y) * f + s.lift, a.z + (b.z - a.z) * f),
      rotation: Quaternion.fromEulerDegrees(0, s.yaw, 0),
      scale: slot.dead ? Vector3.Zero() : Vector3.One()
    })

    // Name always over me; over other players only near me (by cell); never
    // over the dead, and none while the camera is zoomed onto the scoreboard.
    const tagNear =
      isMe ||
      (me !== null && !me.dead && Math.max(Math.abs(slot.cellI - me.cellI), Math.abs(slot.cellJ - me.cellJ)) <= NAMETAG_CELLS)
    if (slot.dead || preloading || !tagNear || scoreboard.open) hideTag(s)
    else {
      const pos = Transform.get(s.mover).position
      const tag = Transform.getMutable(s.tag) // mutable, not replace: unchanged frames aren't resent
      tag.position = Vector3.create(pos.x, pos.y + TAG_UP + (TAG_SWIM - TAG_UP) * (s.lift / SWIM_LIFT), pos.z)
      if (tag.scale.x !== 1) tag.scale = Vector3.One()
    }

    // Nothing is asked of the client while the spawn preload is running.
    if (preloading) continue

    if (s.pending && clock - s.lastTrigger >= EMOTE_GAP) {
      trigger(s, s.pending)
      s.pending = ''
    }
  }

  // Players who left.
  for (const [slotEntity, s] of swimmers) {
    if (!PlayerSlot.getOrNull(slotEntity)) {
      removeSwimmer(s)
      swimmers.delete(slotEntity)
    }
  }
}
