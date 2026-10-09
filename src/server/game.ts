import { engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Storage } from '@dcl/sdk/server'

import { GameState, Pickup, PlayerSlot, Shark } from '../shared/components'
import { room } from '../shared/messages'
import {
  ATTACK_COOLDOWN,
  ATTACK_TIME,
  CENTER_CELL,
  COIN_POINTS,
  GRID,
  LIFE_DROP_CHANCE,
  MAX_PICKUPS,
  PICKUP_INTERVAL,
  PLAYERS_TIME,
  SHARK_SPOTS,
  SHARKS_MOVE_TIME,
  SHARKS_ATTACK_TIME,
  STEP_TIME,
  STUN_SECONDS,
  SURVIVAL_BONUS,
  TELEGRAPH_TIME
} from '../shared/config'

// Server-authoritative game. Runs headless; owns all state in the synced
// components. Clients only send intent messages (move/attack/respawn).

let enumIdSeq = 1
let gameStateEntity: Entity
let phase: 'players' | 'sharks-move' | 'sharks-attack' = 'players'
let phaseTimer = PLAYERS_TIME
let pickupTimer = 2
let scoreTimer = 0
let now = 0 // server clock, seconds since start

let lastAttackAt = new Map<string, number>()
let pingTimer = 0
// Shark runtime state that clients don't need (timers, step counts).
const sharkRuntime = new Map<Entity, { timer: number; stepsLeft: number }>()

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

function clampCell(v: number): number {
  return Math.min(Math.max(v, 0), GRID - 1)
}

// The 9 cells of a 3x3 ahead of (i,j) along a cardinal direction.
function attackCells(i: number, j: number, dirX: number, dirZ: number): [number, number][] {
  const cells: [number, number][] = []
  for (let f = 1; f <= 3; f++) {
    for (let lat = -1; lat <= 1; lat++) {
      cells.push([i + dirX * f + -dirZ * lat, j + dirZ * f + dirX * lat])
    }
  }
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

export function initServer() {
  // Only the server writes game state.
  const serverOnly = (value: { senderAddress: string }) => value.senderAddress === AUTH_SERVER_PEER_ID
  Shark.validateBeforeChange(serverOnly)
  Pickup.validateBeforeChange(serverOnly)
  PlayerSlot.validateBeforeChange(serverOnly)
  GameState.validateBeforeChange(serverOnly)

  gameStateEntity = engine.addEntity()
  GameState.create(gameStateEntity, { phase })
  syncEntity(gameStateEntity, [GameState.componentId], enumIdSeq++)

  for (const [i, j] of SHARK_SPOTS) {
    const shark = engine.addEntity()
    Shark.create(shark, { phase: 'move', dirX: 1, dirZ: 0, cellI: i, cellJ: j })
    sharkRuntime.set(shark, { timer: 0.2, stepsLeft: 3 })
    syncEntity(shark, [Shark.componentId], enumIdSeq++)
  }

  room.onMessage('move', (data, context) => {
    console.log('[server] move', JSON.stringify(data), 'phase', phase, 'slot', !!senderSlot(context))
    if (phase !== 'players') return
    const found = senderSlot(context)
    if (!found || found.slot.dead || found.slot.stunned) return
    const { di, dj } = data
    if (Math.abs(di) + Math.abs(dj) !== 1) return
    found.slot.cellI = clampCell(found.slot.cellI + di)
    found.slot.cellJ = clampCell(found.slot.cellJ + dj)
  })

  room.onMessage('attack', (_data, context) => {
    const attacker = senderSlot(context)
    if (!attacker || attacker.slot.dead || attacker.slot.stunned) return
    const key = context ? context.from.toLowerCase() : attacker.slot.address
    const last = lastAttackAt.get(key) ?? -999
    if (now - last < ATTACK_COOLDOWN) return
    lastAttackAt.set(key, now)
    for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      if (entity === attacker.entity || slot.dead) continue
      const di = Math.abs(slot.cellI - attacker.slot.cellI)
      const dj = Math.abs(slot.cellJ - attacker.slot.cellJ)
      if (Math.max(di, dj) <= 1) {
        PlayerSlot.getMutable(entity).stunned = true
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
  })

  room.onMessage('saveScore', async (_data, context) => {
    const found = senderSlot(context)
    if (!found) return
    let board: { name: string; score: number }[] = []
    try {
      const raw = await Storage.get<string>('leaderboard')
      if (raw) board = JSON.parse(raw)
      if (!Array.isArray(board)) board = []
    } catch {
      board = []
    }
    board.push({ name: found.slot.name || 'anon', score: found.slot.score })
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
  sharksTick(dt)
  pickupsTick(dt)
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
        score: 0,
        extraLives: 0,
        dead: false,
        stunned: false
      })
      syncEntity(slot, [PlayerSlot.componentId], enumIdSeq++)
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
    // Sharks swim: 3 steps.
    phase = 'sharks-move'
    phaseTimer = SHARKS_MOVE_TIME
    for (const [entity, shark] of engine.getEntitiesWith(Shark)) {
      if (shark.phase !== 'move') Shark.getMutable(entity).phase = 'move'
      const runtime = sharkRuntime.get(entity)
      if (runtime) {
        runtime.stepsLeft = 3
        runtime.timer = 0.1 // first step lands almost immediately
      }
    }
  } else if (phase === 'sharks-move') {
    // Sharks aim and bite.
    phase = 'sharks-attack'
    phaseTimer = SHARKS_ATTACK_TIME
    for (const [entity] of engine.getEntitiesWith(Shark)) {
      Shark.getMutable(entity).phase = 'telegraph'
      const runtime = sharkRuntime.get(entity)
      if (runtime) runtime.timer = TELEGRAPH_TIME
    }
  } else {
    // Players move; stun wears off after sitting out the sharks' turns.
    // Sharks resurface where they stopped, fins visible during this phase.
    phase = 'players'
    phaseTimer = PLAYERS_TIME
    for (const [entity] of engine.getEntitiesWith(PlayerSlot)) {
      PlayerSlot.getMutable(entity).stunned = false
    }
    for (const [entity, shark] of engine.getEntitiesWith(Shark)) {
      if (shark.phase !== 'move') Shark.getMutable(entity).phase = 'move'
    }
  }
  GameState.getMutable(gameStateEntity).phase = phase
}

function sharksTick(dt: number) {
  for (const [entity, shark] of engine.getEntitiesWith(Shark)) {
    const runtime = sharkRuntime.get(entity)
    if (!runtime) continue
    runtime.timer -= dt
    if (runtime.timer > 0) continue

    const s = Shark.getMutable(entity)

    if (phase === 'sharks-move') {
      if (runtime.stepsLeft > 0) {
        const dir = DIRS[Math.floor(Math.random() * DIRS.length)]
        s.dirX = dir[0]
        s.dirZ = dir[1]
        s.cellI = clampCell(s.cellI + dir[0])
        s.cellJ = clampCell(s.cellJ + dir[1])
        runtime.stepsLeft -= 1
        runtime.timer = STEP_TIME
      }
    } else if (phase === 'sharks-attack' && s.phase === 'telegraph') {
      s.phase = 'attack'
      runtime.timer = ATTACK_TIME
      // The bite lands on cells, server-verified.
      const zone = attackCells(s.cellI, s.cellJ, s.dirX, s.dirZ)
      for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
        if (slot.dead) continue
        if (zone.some(([i, j]) => i === slot.cellI && j === slot.cellJ)) {
          const mut = PlayerSlot.getMutable(slotEntity)
          if (mut.extraLives > 0) {
            mut.extraLives -= 1
            mut.score += SURVIVAL_BONUS
          } else {
            mut.dead = true
            mut.score = 0
          }
        }
      }
    }
  }
}

function pickupsTick(dt: number) {
  // Spawn.
  pickupTimer -= dt
  if (pickupTimer <= 0) {
    pickupTimer = PICKUP_INTERVAL
    let count = 0
    for (const [_e, p] of engine.getEntitiesWith(Pickup)) if (!p.taken) count += 1
    if (count < MAX_PICKUPS) {
      const pickup = engine.addEntity()
      Pickup.create(pickup, {
        kind: Math.random() < LIFE_DROP_CHANCE ? 'life' : 'coin',
        cellI: Math.floor(Math.random() * GRID),
        cellJ: Math.floor(Math.random() * GRID),
        taken: false
      })
      syncEntity(pickup, [Pickup.componentId], enumIdSeq++)
    }
  }

  // Pickup by standing on the cell. Points for staying alive tick here too.
  scoreTimer += dt
  const wholeSecond = scoreTimer >= 1
  if (wholeSecond) scoreTimer -= 1

  for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.dead) continue
    const mut = PlayerSlot.getMutable(slotEntity)
    if (wholeSecond) mut.score += 1
    for (const [pickupEntity, pickup] of engine.getEntitiesWith(Pickup)) {
      if (pickup.taken || pickup.cellI !== slot.cellI || pickup.cellJ !== slot.cellJ) continue
      Pickup.getMutable(pickupEntity).taken = true
      if (pickup.kind === 'coin') mut.score += COIN_POINTS
      else mut.extraLives += 1
    }
  }
}
