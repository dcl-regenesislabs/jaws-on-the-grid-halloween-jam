import { engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Storage } from '@dcl/sdk/server'

import { GameState, Pickup, PlayerSlot, Shark } from '../shared/components'
import { room } from '../shared/messages'
import {
  ATTACK_COOLDOWN,
  CENTER_CELL,
  COIN_POINTS,
  DESPAWN_CELLS,
  HUNT_CHANCE,
  HUNT_RADIUS,
  LIFE_DROP_CHANCE,
  LUNGE_CELLS,
  MAX_PICKUPS,
  MAX_SHARKS,
  MOVES_PER_TURN,
  PICKUPS_NEAR,
  PLAYERS_TIME,
  SHARKS_NEAR_BASE,
  SHARKS_NEAR_MAX,
  SHARKS_PER_TIER,
  SHARKS_TIME,
  SPAWN_MAX,
  SPAWN_MIN,
  SURVIVAL_BONUS,
  inBoard,
  inHarbor,
  tierOf
} from '../shared/config'

// Server-authoritative game. Runs headless; owns all state in the synced
// components. Clients only send intent messages (move/attack/respawn).
//
// Global turns: players get PLAYERS_TIME to hop up to MOVES_PER_TURN cells
// while every shark shows its lunge lane. Then the sharks' turn
// (SHARKS_TIME): nobody moves, sharks dash, and whoever stands on a lane
// when it ends is bitten.

let enumIdSeq = 1
let gameStateEntity: Entity
let phase: 'players' | 'sharks' = 'players'
let phaseTimer = PLAYERS_TIME
let turn = 0
let now = 0 // server clock, seconds since start
let pingTimer = 0

const lastAttackAt = new Map<string, number>()
const sharkPool: Entity[] = []
const pickupPool: Entity[] = []

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function chebyshev(ai: number, aj: number, bi: number, bj: number): number {
  return Math.max(Math.abs(ai - bi), Math.abs(aj - bj))
}

// Sharks swim open water only: inside the board, never into the harbor.
function sharkCanEnter(i: number, j: number): boolean {
  return inBoard(i, j) && !inHarbor(i, j)
}

// Cells a shark's lunge covers: its own cell plus `len` cells ahead.
function laneCells(i: number, j: number, dirX: number, dirZ: number, len: number): [number, number][] {
  const cells: [number, number][] = []
  for (let k = 0; k <= len; k++) cells.push([i + dirX * k, j + dirZ * k])
  return cells
}

function findSlot(key: string) {
  for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.address.toLowerCase() === key.toLowerCase()) return { entity, slot: PlayerSlot.getMutable(entity) }
  }
  return null
}

// Resolve the sender's slot. With exactly one player connected, an
// unidentified sender (review/guest mode) maps to that single slot.
function senderSlot(context: { from: string } | null | undefined) {
  if (context) {
    const found = findSlot(context.from)
    if (found) return found
  }
  const all = [...engine.getEntitiesWith(PlayerSlot)]
  if (all.length === 1) return { entity: all[0][0], slot: PlayerSlot.getMutable(all[0][0]) }
  return null
}

function alivePlayers() {
  const out: { i: number; j: number }[] = []
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (!slot.dead) out.push({ i: slot.cellI, j: slot.cellJ })
  }
  return out
}

export function initServer() {
  // Only the server writes game state.
  const serverOnly = (value: { senderAddress: string }) => value.senderAddress === AUTH_SERVER_PEER_ID
  Shark.validateBeforeChange(serverOnly)
  Pickup.validateBeforeChange(serverOnly)
  PlayerSlot.validateBeforeChange(serverOnly)
  GameState.validateBeforeChange(serverOnly)

  gameStateEntity = engine.addEntity()
  GameState.create(gameStateEntity, { phase, turn })
  syncEntity(gameStateEntity, [GameState.componentId], enumIdSeq++)

  // Fixed pools, created once: surfacing/sinking only toggles `active`.
  for (let n = 0; n < MAX_SHARKS; n++) {
    const shark = engine.addEntity()
    Shark.create(shark, { active: false, phase: 'plan', cellI: 0, cellJ: 0, dirX: 1, dirZ: 0, len: 0, hunting: false })
    syncEntity(shark, [Shark.componentId], enumIdSeq++)
    sharkPool.push(shark)
  }
  for (let n = 0; n < MAX_PICKUPS; n++) {
    const pickup = engine.addEntity()
    Pickup.create(pickup, { active: false, kind: 'coin', cellI: 0, cellJ: 0, value: 0 })
    syncEntity(pickup, [Pickup.componentId], enumIdSeq++)
    pickupPool.push(pickup)
  }

  room.onMessage('move', (data, context) => {
    if (phase !== 'players') return
    const found = senderSlot(context)
    if (!found || found.slot.dead || found.slot.stunned || found.slot.movesLeft <= 0) return
    const { di, dj } = data
    if (Math.abs(di) + Math.abs(dj) !== 1) return
    const ni = found.slot.cellI + di
    const nj = found.slot.cellJ + dj
    if (!inBoard(ni, nj)) return // the net at the world's edge
    found.slot.cellI = ni
    found.slot.cellJ = nj
    found.slot.movesLeft -= 1
    collectPickups(found.slot)
  })

  room.onMessage('attack', (_data, context) => {
    const attacker = senderSlot(context)
    if (!attacker || attacker.slot.dead || attacker.slot.stunned) return
    const key = attacker.slot.address
    const last = lastAttackAt.get(key) ?? -999
    if (now - last < ATTACK_COOLDOWN) return
    lastAttackAt.set(key, now)
    for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      if (entity === attacker.entity || slot.dead) continue
      if (chebyshev(slot.cellI, slot.cellJ, attacker.slot.cellI, attacker.slot.cellJ) <= 1) {
        // Frozen until the next players' turn: a sitting duck on a lane.
        const mut = PlayerSlot.getMutable(entity)
        mut.stunned = true
        mut.movesLeft = 0
      }
    }
  })

  room.onMessage('respawn', (_data, context) => {
    const found = senderSlot(context)
    if (!found || !found.slot.dead) return
    found.slot.dead = false
    found.slot.stunned = false
    found.slot.cellI = CENTER_CELL
    found.slot.cellJ = CENTER_CELL
    found.slot.movesLeft = phase === 'players' ? MOVES_PER_TURN : 0
  })

  // Leaderboard keeps each player's best saved score.
  room.onMessage('saveScore', async (_data, context) => {
    const found = senderSlot(context)
    if (!found) return
    const name = found.slot.name || 'anon'
    const score = found.slot.score
    let board: { name: string; score: number }[] = []
    try {
      const raw = await Storage.get<string>('leaderboard')
      if (raw) board = JSON.parse(raw)
      if (!Array.isArray(board)) board = []
    } catch {
      board = []
    }
    const mine = board.find((e) => e.name === name)
    if (mine) mine.score = Math.max(mine.score, score)
    else board.push({ name, score })
    board.sort((a, b) => b.score - a.score)
    const ok = await Storage.set('leaderboard', JSON.stringify(board.slice(0, 10)))
    if (!ok) console.error('[server] leaderboard save failed')
  })

  engine.addSystem(serverTick)
}

function serverTick(dt: number) {
  now += dt
  // Heartbeat: clients gate the error modal on this.
  pingTimer -= dt
  if (pingTimer <= 0) {
    pingTimer = 2
    room.send('ping', {})
  }
  syncPlayerSlots()
  turnTick(dt)
}

// One synced slot per connected player. Keyed by verified address; in
// review/guest mode the address can be empty, so fall back to the entity id.
function syncPlayerSlots() {
  const seen = new Set<string>()
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const key = identity.address.toLowerCase() || `entity-${entity}`
    seen.add(key)
    if (!findSlot(key)) {
      console.log('[server] new player slot:', key)
      const slot = engine.addEntity()
      PlayerSlot.create(slot, {
        address: key,
        name: identity.address.slice(0, 8),
        cellI: CENTER_CELL,
        cellJ: CENTER_CELL,
        movesLeft: phase === 'players' ? MOVES_PER_TURN : 0,
        score: 0,
        extraLives: 0,
        dead: false,
        stunned: false
      })
      // No explicit sync id: auto-allocation can't collide on reconnects.
      syncEntity(slot, [PlayerSlot.componentId])
    }
  }
  // Drop slots of players who left.
  for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (!seen.has(slot.address.toLowerCase())) engine.removeEntity(entity)
  }
}

function turnTick(dt: number) {
  phaseTimer -= dt
  if (phaseTimer > 0) return
  if (phase === 'players') {
    // Freeze players; sharks dash along the lanes they showed.
    phase = 'sharks'
    phaseTimer = SHARKS_TIME
    for (const [entity] of engine.getEntitiesWith(PlayerSlot)) {
      PlayerSlot.getMutable(entity).movesLeft = 0
    }
    for (const shark of sharkPool) {
      const s = Shark.get(shark)
      if (s.active && s.len > 0) Shark.getMutable(shark).phase = 'lunge'
    }
  } else {
    resolveLunges()
    phase = 'players'
    phaseTimer = PLAYERS_TIME
    turn += 1
    for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      const mut = PlayerSlot.getMutable(entity)
      mut.stunned = false
      mut.movesLeft = slot.dead ? 0 : MOVES_PER_TURN
    }
    populateSharks()
    populatePickups()
    planLanes()
  }
  const state = GameState.getMutable(gameStateEntity)
  state.phase = phase
  state.turn = turn
}

// The bite lands as the dash ends: everyone on a lane is hit, sharks end
// at the lane's far cell, survivors out in open water score.
function resolveLunges() {
  const bitten = new Set<Entity>()
  for (const shark of sharkPool) {
    const s = Shark.get(shark)
    if (!s.active || s.len <= 0) continue
    const lane = laneCells(s.cellI, s.cellJ, s.dirX, s.dirZ, s.len)
    for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      if (slot.dead) continue
      if (lane.some(([i, j]) => i === slot.cellI && j === slot.cellJ)) bitten.add(slotEntity)
    }
    const mut = Shark.getMutable(shark)
    mut.cellI = s.cellI + s.dirX * s.len
    mut.cellJ = s.cellJ + s.dirZ * s.len
    mut.len = 0
    mut.phase = 'plan'
  }

  for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.dead) continue
    const mut = PlayerSlot.getMutable(slotEntity)
    if (bitten.has(slotEntity)) {
      if (mut.extraLives > 0) {
        mut.extraLives -= 1
        mut.score += SURVIVAL_BONUS
      } else {
        mut.dead = true
      }
    } else if (!inHarbor(slot.cellI, slot.cellJ)) {
      mut.score += 1 + tierOf(slot.cellI, slot.cellJ)
    }
  }
}

// A random open-water cell in the ring around (ci, cj), or null.
function ringCell(ci: number, cj: number, taken: (i: number, j: number) => boolean): [number, number] | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const i = ci + randInt(-SPAWN_MAX, SPAWN_MAX)
    const j = cj + randInt(-SPAWN_MAX, SPAWN_MAX)
    if (chebyshev(i, j, ci, cj) < SPAWN_MIN) continue
    if (!sharkCanEnter(i, j) || taken(i, j)) continue
    return [i, j]
  }
  return null
}

function nearAnyPlayer(i: number, j: number, players: { i: number; j: number }[], radius: number): boolean {
  return players.some((p) => chebyshev(i, j, p.i, p.j) <= radius)
}

// Sharks sink when nobody is near and surface around players up to a
// depth-scaled count. This is what makes the ocean feel endless.
function populateSharks() {
  const players = alivePlayers()
  for (const shark of sharkPool) {
    const s = Shark.get(shark)
    if (s.active && !nearAnyPlayer(s.cellI, s.cellJ, players, DESPAWN_CELLS)) {
      const mut = Shark.getMutable(shark)
      mut.active = false
      mut.len = 0
    }
  }

  const occupied = (i: number, j: number) =>
    players.some((p) => p.i === i && p.j === j) ||
    sharkPool.some((e) => {
      const s = Shark.get(e)
      return s.active && s.cellI === i && s.cellJ === j
    })

  for (const p of players) {
    const want = Math.min(SHARKS_NEAR_MAX, SHARKS_NEAR_BASE + SHARKS_PER_TIER * tierOf(p.i, p.j))
    let have = 0
    for (const shark of sharkPool) {
      const s = Shark.get(shark)
      if (s.active && chebyshev(s.cellI, s.cellJ, p.i, p.j) <= SPAWN_MAX) have++
    }
    for (; have < want; have++) {
      const free = sharkPool.find((e) => !Shark.get(e).active)
      if (free === undefined) return // pool exhausted
      const cell = ringCell(p.i, p.j, occupied)
      if (!cell) break
      const mut = Shark.getMutable(free)
      mut.active = true
      mut.phase = 'plan'
      mut.cellI = cell[0]
      mut.cellJ = cell[1]
      mut.len = 0
    }
  }
}

function populatePickups() {
  const players = alivePlayers()
  for (const pickup of pickupPool) {
    const p = Pickup.get(pickup)
    if (p.active && !nearAnyPlayer(p.cellI, p.cellJ, players, DESPAWN_CELLS)) Pickup.getMutable(pickup).active = false
  }

  const occupied = (i: number, j: number) =>
    pickupPool.some((e) => {
      const p = Pickup.get(e)
      return p.active && p.cellI === i && p.cellJ === j
    })

  for (const pl of players) {
    let have = 0
    for (const pickup of pickupPool) {
      const p = Pickup.get(pickup)
      if (p.active && chebyshev(p.cellI, p.cellJ, pl.i, pl.j) <= SPAWN_MAX) have++
    }
    if (have >= PICKUPS_NEAR) continue
    // One per turn per player: they trickle in rather than pop all at once.
    const free = pickupPool.find((e) => !Pickup.get(e).active)
    if (free === undefined) return
    const cell = ringCell(pl.i, pl.j, occupied)
    if (!cell) continue
    const life = Math.random() < LIFE_DROP_CHANCE
    const mut = Pickup.getMutable(free)
    mut.active = true
    mut.kind = life ? 'life' : 'coin'
    mut.cellI = cell[0]
    mut.cellJ = cell[1]
    mut.value = life ? 0 : COIN_POINTS * (1 + tierOf(cell[0], cell[1]))
  }
}

function collectPickups(slot: { cellI: number; cellJ: number; score: number; extraLives: number }) {
  for (const pickup of pickupPool) {
    const p = Pickup.get(pickup)
    if (!p.active || p.cellI !== slot.cellI || p.cellJ !== slot.cellJ) continue
    Pickup.getMutable(pickup).active = false
    if (p.kind === 'coin') slot.score += p.value
    else slot.extraLives += 1
  }
}

// Longest straight run (up to max) a shark can dash from (i, j).
function clearRun(i: number, j: number, dirX: number, dirZ: number, max: number): number {
  let len = 0
  while (len < max && sharkCanEnter(i + dirX * (len + 1), j + dirZ * (len + 1))) len++
  return len
}

// Each shark commits to a straight lane for this turn. Hunters aim at the
// nearest player in range along the longer axis, ending on their cell if
// it's within reach; the rest wander a cell or two.
function planLanes() {
  const players = alivePlayers().filter((p) => !inHarbor(p.i, p.j))
  for (const shark of sharkPool) {
    const s = Shark.get(shark)
    if (!s.active) continue

    let target: { i: number; j: number } | null = null
    let best = HUNT_RADIUS + 1
    for (const p of players) {
      const d = chebyshev(s.cellI, s.cellJ, p.i, p.j)
      if (d < best) {
        best = d
        target = p
      }
    }

    let dir: [number, number] = DIRS[randInt(0, 3)]
    let want = randInt(1, 2)
    let hunting = false
    if (target && Math.random() < HUNT_CHANCE) {
      const di = target.i - s.cellI
      const dj = target.j - s.cellJ
      const alongI = dj === 0 || (di !== 0 && (Math.abs(di) > Math.abs(dj) || (Math.abs(di) === Math.abs(dj) && Math.random() < 0.5)))
      if (di !== 0 || dj !== 0) {
        dir = alongI ? [Math.sign(di), 0] : [0, Math.sign(dj)]
        want = Math.max(1, Math.min(LUNGE_CELLS, alongI ? Math.abs(di) : Math.abs(dj)))
      }
      hunting = true
    }

    let len = clearRun(s.cellI, s.cellJ, dir[0], dir[1], want)
    if (len === 0) {
      // Boxed in by the harbor or the edge: turn around.
      dir = [-dir[0], -dir[1]]
      len = clearRun(s.cellI, s.cellJ, dir[0], dir[1], want)
    }
    const mut = Shark.getMutable(shark)
    mut.dirX = dir[0]
    mut.dirZ = dir[1]
    mut.len = len
    mut.hunting = hunting
    mut.phase = 'plan'
  }
}
