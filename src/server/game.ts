import { AvatarBase, AvatarEquippedData, engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Storage } from '@dcl/sdk/server'

import { Chum, GameState, Mine, Pickup, PlayerSlot, Shark } from '../shared/components'
import { objectives, objectiveProgress } from '../shared/objectives'
import { room } from '../shared/messages'
import {
  BARREL_CAPACITY,
  BARREL_LUNGE,
  BARREL_RANGE,
  BARREL_TURNS,
  BARRELS_TO_SINK,
  BASE_STEPS,
  BLOOD_PULL,
  BLOOD_TURNS,
  BOOST_STEPS,
  BOOST_ROUNDS,
  CHUM_CAPACITY,
  CHUM_RADIUS,
  CHUM_SHARKS,
  CHUM_TURNS,
  CIRCLE_MAX,
  CIRCLE_MIN,
  COIN_POINTS,
  CROWD_BONUS,
  CROWD_PLAYERS,
  DESPAWN_CELLS,
  ELROY_LUNGE,
  ELROY_TIER,
  GRID,
  HARBOR_MAX,
  HARBOR_MIN,
  HUNT_LEASH,
  HUNT_RADIUS,
  HUNTERS_BY_TIER,
  JACKET_CAPACITY,
  LANES_BLOCK_PATHS,
  LIFE_DROP_CHANCE,
  LUNGE_CELLS,
  MAX_CHUM,
  MAX_HUNTERS,
  MAX_MINES,
  MAX_PICKUPS,
  MAX_SHARKS,
  MINE_CAPACITY,
  MINE_ROUNDS,
  PICKUPS_NEAR,
  PLAYERS_TIME,
  RAFT_GRACE,
  ROLE_SWAP_TURNS,
  S_PARK,
  S_PINCER,
  SAFE_FLOOR_BY_TIER,
  SHARK_BOUNTY,
  SHARK_ENDING_TIME,
  SHARKS_NEAR_BASE,
  SHARKS_NEAR_MAX,
  SHARKS_PER_TIER,
  SHARKS_TIME,
  SPAWN_MAX,
  SPAWN_MIN,
  SURVIVAL_BONUS,
  W_AHEAD,
  W_PICKUP,
  WANDER_BITE_TIER,
  WANDER_TURN_CHANCE,
  blastCells,
  inBoard,
  inHarbor,
  pathCells,
  sharkCells,
  tierOf
} from '../shared/config'

// Server-authoritative game. Runs headless; owns all state in the synced
// components. Clients only send intent messages (plan/mine/harpoon/chum/
// respawn).
//
// Global turns: for PLAYERS_TIME everyone plans a path of up to maxSteps
// cells (or stays) while every shark shows its lunge lane. With
// LANES_BLOCK_PATHS the lanes are walls: paths swim around them. Then
// execution (SHARKS_TIME): all players swim their paths as the sharks dash,
// and whoever ends on a lane is bitten.

let enumIdSeq = 1
let gameStateEntity: Entity
let phase: 'players' | 'sharks' = 'players'
let phaseTimer = PLAYERS_TIME
let turn = 0
let now = 0 // server clock, seconds since start
let pingTimer = 0

const deathLockedUntil = new Map<string, number>()
// Server-run players (src/server/bots.ts). Their slots stay while listed here.
export const botAddresses = new Set<string>()
const sharkPool: Entity[] = []
const pickupPool: Entity[] = []
const minePool: Entity[] = []
const chumPool: Entity[] = []
let mineSerial = 0

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

// A random raft cell, preferring one no other player stands on.
function raftSpawnCell(): [number, number] {
  const taken = alivePlayers()
  let cell: [number, number] = [HARBOR_MIN, HARBOR_MIN]
  for (let attempt = 0; attempt < 12; attempt++) {
    cell = [randInt(HARBOR_MIN, HARBOR_MAX), randInt(HARBOR_MIN, HARBOR_MAX)]
    if (!taken.some((p) => p.i === cell[0] && p.j === cell[1])) break
  }
  return cell
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

// Where the turn clock is, for the bots' reaction timing.
export function turnClock(): { phase: 'players' | 'sharks'; turn: number; elapsed: number; now: number } {
  return { phase, turn, elapsed: (phase === 'players' ? PLAYERS_TIME : SHARKS_TIME) - phaseTimer, now }
}

export function findSlot(key: string) {
  for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.address.toLowerCase() === key.toLowerCase()) return { entity, slot: PlayerSlot.getMutable(entity) }
  }
  return null
}

// Resolve the sender's slot. Only an unidentified sender (review/guest mode)
// falls back to the single connected slot; a known address without a slot
// yet (still joining) must not act on someone else's.
function senderSlot(context: { from: string } | null | undefined) {
  if (context?.from) return findSlot(context.from)
  const all = [...engine.getEntitiesWith(PlayerSlot)].filter(([, slot]) => !botAddresses.has(slot.address))
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
  Mine.validateBeforeChange(serverOnly)
  Chum.validateBeforeChange(serverOnly)
  PlayerSlot.validateBeforeChange(serverOnly)
  GameState.validateBeforeChange(serverOnly)

  gameStateEntity = engine.addEntity()
  GameState.create(gameStateEntity, { phase, turn })
  syncEntity(gameStateEntity, [GameState.componentId], enumIdSeq++)

  // Fixed pools, created once: surfacing/sinking only toggles `active`.
  for (let n = 0; n < MAX_SHARKS; n++) {
    const shark = engine.addEntity()
    Shark.create(shark, {
      active: false, phase: 'plan', cellI: 0, cellJ: 0, dirX: 1, dirZ: 0, len: 0,
      hunting: false, role: 0, target: '', barrels: 0, tagUntilTurn: 0
    })
    syncEntity(shark, [Shark.componentId], enumIdSeq++)
    sharkPool.push(shark)
  }
  for (let n = 0; n < MAX_PICKUPS; n++) {
    const pickup = engine.addEntity()
    Pickup.create(pickup, { active: false, kind: 'coin', cellI: 0, cellJ: 0, value: 0 })
    syncEntity(pickup, [Pickup.componentId], enumIdSeq++)
    pickupPool.push(pickup)
  }
  for (let n = 0; n < MAX_MINES; n++) {
    const mine = engine.addEntity()
    Mine.create(mine, { active: false, cellI: 0, cellJ: 0, owner: '', detonateTurn: 0, exploded: false, serial: 0 })
    syncEntity(mine, [Mine.componentId], enumIdSeq++)
    minePool.push(mine)
  }
  for (let n = 0; n < MAX_CHUM; n++) {
    const chum = engine.addEntity()
    Chum.create(chum, { active: false, cellI: 0, cellJ: 0, untilTurn: 0 })
    syncEntity(chum, [Chum.componentId], enumIdSeq++)
    chumPool.push(chum)
  }

  // Every intent goes through the same action functions the bots use, so a
  // bot can do nothing a player can't.
  const act = (fn: (slot: Slot) => void) => (_data: unknown, context: { from: string } | null | undefined) => {
    const found = senderSlot(context)
    if (found) fn(found.slot)
  }
  room.onMessage('plantMine', act(plantMine))
  room.onMessage('plan', (data, context) => {
    const found = senderSlot(context)
    if (!found) {
      console.log('[server] plan REJECTED no-slot')
      return
    }
    planPath(found.slot, Array.from(data.steps as Iterable<number>))
  })
  room.onMessage('harpoon', act(harpoon))
  room.onMessage('dropChum', act(dropChum))
  room.onMessage('respawn', act(respawn))
  room.onMessage('saveScore', act(saveScore))

  engine.addSystem(serverTick)
}

type Slot = ReturnType<typeof PlayerSlot.getMutable>

// --- Player actions: shared by the message handlers and the bots ---

export function plantMine(slot: Slot): void {
  if (phase !== 'players' || slot.dead || slot.mines <= 0) return
  if (inHarbor(slot.cellI, slot.cellJ)) return
  if (minePool.some((e) => {
    const m = Mine.get(e)
    return m.active && !m.exploded && m.cellI === slot.cellI && m.cellJ === slot.cellJ
  })) return
  const free = minePool.find((e) => !Mine.get(e).active)
  if (free === undefined) return
  Object.assign(Mine.getMutable(free), {
    active: true, cellI: slot.cellI, cellJ: slot.cellJ, owner: slot.address,
    detonateTurn: turn + MINE_ROUNDS, exploded: false, serial: ++mineSerial
  })
  slot.mines--
  console.log('[server] mine planted', slot.cellI, slot.cellJ, 'detonates', turn + MINE_ROUNDS)
}

// Plans can change freely until the players' turn ends; the last one wins.
export function planPath(slot: Slot, steps: number[]): boolean {
  if (phase !== 'players') return false
  if (slot.dead) {
    console.log('[server] plan REJECTED dead')
    return false
  }
  if (steps.length > slot.maxSteps || steps.some((c) => !Number.isInteger(c) || !(c >= 0 && c <= 3))) return false
  // Every cell on the way must be on the board (the net at the world's edge).
  const cells = pathCells(slot.cellI, slot.cellJ, steps)
  if (cells.some(([i, j]) => !inBoard(i, j))) return false
  // Lanes are walls: no swimming through a shark or its lane.
  if (LANES_BLOCK_PATHS) {
    const walls = wallKeys()
    if (cells.some(([i, j]) => walls.has(cellKey(i, j)))) return false
  }
  slot.path = steps
  return true
}

// Yellow barrel: harpoon the nearest shark in reach. It lunges short and
// can't hunt for a while; enough barrels sink it for the bounty.
export function harpoon(slot: Slot): void {
  if (phase !== 'players' || slot.dead || slot.barrels <= 0) return
  if (inHarbor(slot.cellI, slot.cellJ)) return
  let prey: Entity | undefined
  let best = BARREL_RANGE + 1
  for (const e of sharkPool) {
    const s = Shark.get(e)
    if (!s.active) continue
    const d = chebyshev(s.cellI, s.cellJ, slot.cellI, slot.cellJ)
    if (d < best) {
      best = d
      prey = e
    }
  }
  if (prey === undefined) return
  slot.barrels--
  hunts.delete(prey)
  const mut = Shark.getMutable(prey)
  mut.barrels++
  mut.tagUntilTurn = turn + 1 + BARREL_TURNS
  mut.role = 0
  mut.target = ''
  mut.hunting = false
  if (mut.barrels >= BARRELS_TO_SINK) {
    mut.active = false
    mut.len = 0
    slot.sharksKilled++
    slot.score += SHARK_BOUNTY
  } else {
    // The lane shrinks at once: it only ever takes danger away.
    mut.len = Math.min(mut.len, BARREL_LUNGE)
  }
  console.log('[server] harpoon', mut.barrels, mut.active ? 'tagged' : 'sunk')
}

// Chum on your cell: nearby sharks go for it for a couple of turns.
export function dropChum(slot: Slot): void {
  if (phase !== 'players' || slot.dead || slot.chum <= 0) return
  if (tierOf(slot.cellI, slot.cellJ) < 1) return // never a trap at the raft's doorstep
  const free = chumPool.find((e) => !Chum.get(e).active)
  if (free === undefined) return
  Object.assign(Chum.getMutable(free), { active: true, cellI: slot.cellI, cellJ: slot.cellJ, untilTurn: turn + 1 + CHUM_TURNS })
  chumBy.set(free, slot.address.toLowerCase())
  slot.chum--
}

// Back to the raft once the ending has played.
export function respawn(slot: Slot): void {
  if (!slot.dead || now < (deathLockedUntil.get(slot.address) ?? 0)) return
  deathLockedUntil.delete(slot.address)
  slot.dead = false
  heading.delete(slot.address)
  const [si, sj] = raftSpawnCell()
  slot.cellI = si
  slot.cellJ = sj
  slot.path = []
  slot.mines = 0
  slot.extraLives = 0
  slot.boostUntilTurn = 0
  slot.maxSteps = BASE_STEPS
  slot.deathCause = ''
  slot.killedBy = ''
  slot.barrels = 0
  slot.chum = 0
  slot.bloodUntilTurn = 0
}

// Admin reset (src/server/admin.ts): a clean World. Every swimmer, players
// and bots alike, is back on the raft with a fresh slot (score, gear and
// contracts cleared); sharks, pickups, mines and chum sink and a new
// planning turn starts. The saved leaderboard is kept.
export function resetWorld(): void {
  for (const e of sharkPool) {
    Object.assign(Shark.getMutable(e), {
      active: false, phase: 'plan', len: 0, hunting: false, role: 0, target: '', barrels: 0, tagUntilTurn: 0
    })
  }
  for (const e of pickupPool) Pickup.getMutable(e).active = false
  for (const e of minePool) Object.assign(Mine.getMutable(e), { active: false, exploded: false })
  for (const e of chumPool) Chum.getMutable(e).active = false
  hunts.clear()
  bornTurn.clear()
  lastDir.clear()
  heading.clear()
  leftRaftTurn.clear()
  chumBy.clear()
  deathLockedUntil.clear()
  for (const [entity] of engine.getEntitiesWith(PlayerSlot)) {
    const slot = PlayerSlot.getMutable(entity)
    Object.assign(slot, {
      path: [], maxSteps: BASE_STEPS, score: 0, extraLives: 0, mines: 0, boostUntilTurn: 0, deathCause: '',
      coinsCollected: 0, sharksKilled: 0, equipmentCollected: 0, deepestTier: 0, objectiveLevel: 0, objectiveMask: 0,
      dead: false, barrels: 0, chum: 0, bloodUntilTurn: 0, killedBy: ''
    })
    // Off the board first so raftSpawnCell spreads everyone over free cells.
    slot.cellI = -1
    slot.cellJ = -1
  }
  for (const [entity] of engine.getEntitiesWith(PlayerSlot)) {
    const slot = PlayerSlot.getMutable(entity)
    const [si, sj] = raftSpawnCell()
    slot.cellI = si
    slot.cellJ = sj
  }
  phase = 'players'
  phaseTimer = PLAYERS_TIME
  turn += 1
  populateSharks()
  populatePickups()
  planLanes()
  const state = GameState.getMutable(gameStateEntity)
  state.phase = phase
  state.turn = turn
  console.log('[server] world reset, turn', turn)
}

// Leaderboard keeps each player's best saved score. Saves run one at a
// time so concurrent read-modify-writes don't drop each other's entries.
export function saveScore(slot: Slot): void {
  const name = slot.name || 'anon'
  const score = slot.score
  saveQueue = saveQueue.then(() => saveToBoard(name, score)).catch(() => {})
}

let saveQueue: Promise<void> = Promise.resolve()

async function saveToBoard(name: string, score: number) {
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

// Copy the player's verified profile (name, body shape, wearables, colors)
// into their slot so clients draw them as an AvatarShape. Runs on slot
// creation and whenever the base/equipped data changes.
function applyProfile(playerEntity: Entity, slotEntity: Entity) {
  const slot = PlayerSlot.getMutableOrNull(slotEntity)
  if (!slot) return
  const base = AvatarBase.getOrNull(playerEntity)
  const equipped = AvatarEquippedData.getOrNull(playerEntity)
  if (base) {
    slot.name = base.name || slot.name
    slot.bodyShape = base.bodyShapeUrn
    if (base.skinColor) slot.skinColor = { r: base.skinColor.r, g: base.skinColor.g, b: base.skinColor.b }
    if (base.hairColor) slot.hairColor = { r: base.hairColor.r, g: base.hairColor.g, b: base.hairColor.b }
    if (base.eyesColor) slot.eyesColor = { r: base.eyesColor.r, g: base.eyesColor.g, b: base.eyesColor.b }
  }
  if (equipped) slot.wearables = [...equipped.wearableUrns]
}

// One synced slot per connected player. Keyed by verified address; in
// review/guest mode the address can be empty, so fall back to the entity id.
function syncPlayerSlots() {
  const seen = new Set<string>()
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    // Ephemeral guest accounts can't play (no slot → no moves, no score).
    if (identity.isGuest) continue
    const key = identity.address.toLowerCase() || `entity-${entity}`
    seen.add(key)
    if (!findSlot(key)) {
      console.log('[server] new player slot:', key)
      const slot = createPlayerSlot(key, identity.address.slice(0, 8))
      applyProfile(entity, slot)
      // Keep the copy fresh if the player changes wearables.
      AvatarBase.onChange(entity, () => applyProfile(entity, slot))
      AvatarEquippedData.onChange(entity, () => applyProfile(entity, slot))
    }
  }
  // Drop slots of players who left, and duplicates from reconnect flickers
  // (keep the oldest per address).
  for (const address of botAddresses) seen.add(address)
  const firstByAddress = new Set<string>()
  for (const address of deathLockedUntil.keys()) {
    if (!seen.has(address)) deathLockedUntil.delete(address)
  }
  for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
    const key = slot.address.toLowerCase()
    if (!seen.has(key) || firstByAddress.has(key)) engine.removeEntity(entity)
    else firstByAddress.add(key)
  }
}

// A fresh synced slot on the raft. Real players get their profile copied in
// right after; bots pass their made-up look.
export function createPlayerSlot(key: string, name: string): Entity {
  const slot = engine.addEntity()
  const [si, sj] = raftSpawnCell()
  PlayerSlot.create(slot, {
    address: key,
    name,
    cellI: si,
    cellJ: sj,
    path: [],
    maxSteps: BASE_STEPS,
    score: 0,
    extraLives: 0,
    mines: 0,
    boostUntilTurn: 0,
    deathCause: '',
    coinsCollected: 0,
    sharksKilled: 0,
    equipmentCollected: 0,
    deepestTier: 0,
    objectiveLevel: 0,
    objectiveMask: 0,
    dead: false,
    barrels: 0,
    chum: 0,
    bloodUntilTurn: 0,
    killedBy: '',
    bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseFemale',
    wearables: [],
    skinColor: { r: 0.6, g: 0.462, b: 0.356 },
    hairColor: { r: 0.283, g: 0.142, b: 0 },
    eyesColor: { r: 0.6, g: 0.462, b: 0.356 }
  })
  // No explicit sync id: auto-allocation can't collide on reconnects.
  syncEntity(slot, [PlayerSlot.componentId])
  return slot
}

function turnTick(dt: number) {
  phaseTimer -= dt
  if (phaseTimer > 0) return
  if (phase === 'players') {
    // Execution: everyone swims to their pick while sharks dash the lanes
    // they showed. Bites are checked when the dash ends (resolveLunges).
    phase = 'sharks'
    phaseTimer = SHARKS_TIME
    // The path stays in the slot so clients can animate it.
    for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      const cells = pathCells(slot.cellI, slot.cellJ, Array.from(slot.path))
      if (!slot.dead) recordHeading(slot.address, slot.cellI, slot.cellJ, cells)
      if (slot.dead || cells.length === 0) continue
      const mut = PlayerSlot.getMutable(entity)
      for (const [i, j] of cells) {
        mut.cellI = i
        mut.cellJ = j
        collectPickups(mut) // coins on the way count too
        mut.deepestTier = Math.max(mut.deepestTier, tierOf(i, j))
      }
    }
    for (const shark of sharkPool) {
      const s = Shark.get(shark)
      if (s.active && s.len > 0) Shark.getMutable(shark).phase = 'lunge'
    }
  } else {
    resolveLunges()
    resolveMines(turn + 1)
    phase = 'players'
    phaseTimer = PLAYERS_TIME
    turn += 1
    for (const [entity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      const mut = PlayerSlot.getMutable(entity)
      mut.path = []
      mut.maxSteps = !mut.dead && mut.boostUntilTurn > turn ? BOOST_STEPS : BASE_STEPS
      awardObjectives(mut)
    }
    expireChum()
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
  // Slot → role of the shark that bit (a chaser's bite names Bruce).
  const bitten = new Map<Entity, number>()
  const rank = (role: number) => (role === 1 ? 2 : role === 2 ? 1 : 0)
  for (const shark of sharkPool) {
    const s = Shark.get(shark)
    if (!s.active || s.len <= 0) continue
    const lane = laneCells(s.cellI, s.cellJ, s.dirX, s.dirZ, s.len)
    for (const [slotEntity, slot] of engine.getEntitiesWith(PlayerSlot)) {
      if (slot.dead) continue
      if (!lane.some(([i, j]) => i === slot.cellI && j === slot.cellJ)) continue
      // Only a shark hunting this player gets a name on their death card.
      const role = s.target === slot.address ? s.role : 0
      const prev = bitten.get(slotEntity)
      if (prev === undefined || rank(role) > rank(prev)) bitten.set(slotEntity, role)
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
        // Blood in the water: the packs come for you first for a while.
        mut.bloodUntilTurn = turn + 1 + BLOOD_TURNS
      } else {
        const role = bitten.get(slotEntity)
        mut.dead = true
        mut.deathCause = 'shark'
        mut.killedBy = role === 1 ? 'bruce' : role === 2 ? 'tiger' : ''
        mut.path = []
        deathLockedUntil.set(mut.address, now + SHARK_ENDING_TIME)
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

function populatePickups() {
  const players = alivePlayers()
  for (const pickup of pickupPool) {
    const p = Pickup.get(pickup)
    if (p.active && !nearAnyPlayer(p.cellI, p.cellJ, players, DESPAWN_CELLS)) Pickup.getMutable(pickup).active = false
  }

  const occupied = (i: number, j: number) =>
    players.some((p) => p.i === i && p.j === j) ||
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
    const roll = Math.random()
    // Keep equipment in circulation: a nearby field includes a mine and boost.
    const nearbyKinds = pickupPool.map((e) => Pickup.get(e)).filter((p) =>
      p.active && chebyshev(p.cellI, p.cellJ, pl.i, pl.j) <= SPAWN_MAX).map((p) => p.kind)
    const deep = tierOf(pl.i, pl.j) >= 1
    const kind = !nearbyKinds.includes('mine') ? 'mine'
      : !nearbyKinds.includes('boost') ? 'boost'
      : deep && !nearbyKinds.includes('barrel') ? 'barrel'
      : deep && !nearbyKinds.includes('chum') ? 'chum'
      : roll < LIFE_DROP_CHANCE ? 'life' : 'coin'
    const mut = Pickup.getMutable(free)
    mut.active = true
    mut.kind = kind
    mut.cellI = cell[0]
    mut.cellJ = cell[1]
    mut.value = kind === 'coin' ? COIN_POINTS * (1 + tierOf(cell[0], cell[1])) : 0
  }
}

function collectPickups(slot: ReturnType<typeof PlayerSlot.getMutable>) {
  for (const pickup of pickupPool) {
    const p = Pickup.get(pickup)
    if (!p.active || p.cellI !== slot.cellI || p.cellJ !== slot.cellJ) continue
    if (
      (p.kind === 'mine' && slot.mines >= MINE_CAPACITY) ||
      (p.kind === 'life' && slot.extraLives >= JACKET_CAPACITY) ||
      (p.kind === 'barrel' && slot.barrels >= BARREL_CAPACITY) ||
      (p.kind === 'chum' && slot.chum >= CHUM_CAPACITY)
    ) continue
    Pickup.getMutable(pickup).active = false
    if (p.kind === 'coin') {
      slot.score += p.value
      slot.coinsCollected++
    } else {
      slot.equipmentCollected++
      if (p.kind === 'life') slot.extraLives++
      if (p.kind === 'mine') slot.mines++
      if (p.kind === 'barrel') slot.barrels++
      if (p.kind === 'chum') slot.chum++
      // Collection happens in execution, so all five subsequent plans get 4 steps.
      if (p.kind === 'boost') slot.boostUntilTurn = turn + 1 + BOOST_ROUNDS
    }
  }
}

function awardObjectives(slot: ReturnType<typeof PlayerSlot.getMutable>) {
  const progress = objectiveProgress(slot)
  objectives(slot.objectiveLevel).forEach((goal, k) => {
    if (!(slot.objectiveMask & goal.bit) && progress[k] >= goal.target) {
      slot.objectiveMask |= goal.bit
      slot.score += goal.reward
    }
  })
  if (slot.objectiveMask === 7) {
    slot.objectiveLevel++
    slot.objectiveMask = 0
    slot.coinsCollected = 0
    slot.sharksKilled = 0
  }
}

// Blasts resolve at the end of execution, after shark movement/bites. All
// due mines explode simultaneously; each shark can award a bounty only once.
// Other mines keep their full fuse (no surprise early chain detonation).
function resolveMines(resolvedTurn: number) {
  for (const entity of minePool) {
    const m = Mine.get(entity)
    if (!m.active) continue
    if (m.exploded) {
      if (resolvedTurn > m.detonateTurn) Mine.getMutable(entity).active = false
      continue
    }
    if (resolvedTurn < m.detonateTurn) continue
    Mine.getMutable(entity).exploded = true
    const cells = blastCells(m.cellI, m.cellJ)
    const hit = (i: number, j: number) => cells.some(([x, z]) => x === i && z === j)
    for (const [e, p] of engine.getEntitiesWith(PlayerSlot)) {
      if (p.dead || !hit(p.cellI, p.cellJ)) continue
      const mut = PlayerSlot.getMutable(e)
      mut.dead = true
      mut.deathCause = 'mine'
      mut.path = []
    }
    for (const shark of sharkPool) {
      const s = Shark.get(shark)
      if (!s.active || !hit(s.cellI, s.cellJ)) continue
      const mut = Shark.getMutable(shark)
      mut.active = false
      mut.len = 0
      hunts.delete(shark)
      const owner = findSlot(m.owner)
      if (owner) {
        owner.slot.sharksKilled++
        owner.slot.score += SHARK_BOUNTY
      }
    }
    console.log('[server] mine exploded', m.cellI, m.cellJ, 'round', resolvedTurn)
  }
}

// --- Smart sharks ---
// Each hunted player gets a small pack: a chaser ("Bruce") that runs its
// lane straight through you, and blockers ("the Tiger") that take the cells
// you're heading for. Every other shark ignores players and circles. A hard
// floor of safe end cells per player means a pack squeezes you but can
// never trap you. Memory below is server-only (not synced).

type Role = 0 | 1 | 2 // wanderer | chaser | blocker
type Lane = { dx: number; dz: number; len: number; cells: number[]; ei: number; ej: number }
type Prey = {
  address: string // player address, or 'chum:<entity>' for a decoy
  decoy: boolean
  i: number
  j: number
  steps: number
  tier: number
  huntable: boolean
  bleeding: boolean // jacket just saved them: blood in the water
  cap: number // hunters allowed on this target
  head: [number, number] // last turn's dominant move; [0, 0] = stayed
  reach: number[] // on-board cells within `steps` (Manhattan)
  reachSet: Set<number>
  safe: number // end cells that won't bite, given the lanes committed so far
  floor: number
}

const hunts = new Map<Entity, { target: string; role: Role }>()
const bornTurn = new Map<Entity, number>()
const lastDir = new Map<Entity, [number, number]>()
const heading = new Map<string, [number, number]>()
const leftRaftTurn = new Map<string, number>()
const chumBy = new Map<Entity, string>() // chum → who dropped it

export const cellKey = (i: number, j: number) => i * GRID + j
const RAFT_CORNERS: [number, number][] = [
  [HARBOR_MIN - 1, HARBOR_MIN - 1],
  [HARBOR_MIN - 1, HARBOR_MAX + 1],
  [HARBOR_MAX + 1, HARBOR_MIN - 1],
  [HARBOR_MAX + 1, HARBOR_MAX + 1]
]

// Every cell a shark or its shown lane occupies: walls for planned paths.
export function wallKeys(): Set<number> {
  const out = new Set<number>()
  for (const e of sharkPool) {
    const s = Shark.get(e)
    if (s.active) for (const [i, j] of sharkCells(s)) out.add(cellKey(i, j))
  }
  return out
}

function tagged(s: { tagUntilTurn: number }): boolean {
  return s.tagUntilTurn > turn
}

// Remember where each player went (the blocker reads it as their escape
// direction) and when they left the raft (grace turn).
function recordHeading(address: string, si: number, sj: number, cells: [number, number][]) {
  const addr = address.toLowerCase()
  const [ei, ej] = cells.length ? cells[cells.length - 1] : [si, sj]
  const di = ei - si
  const dj = ej - sj
  heading.set(addr, di === 0 && dj === 0 ? [0, 0] : Math.abs(di) >= Math.abs(dj) ? [Math.sign(di), 0] : [0, Math.sign(dj)])
  if (inHarbor(si, sj) && !inHarbor(ei, ej)) leftRaftTurn.set(addr, turn)
}

function expireChum() {
  for (const e of chumPool) {
    const c = Chum.get(e)
    if (c.active && c.untilTurn <= turn) {
      Chum.getMutable(e).active = false
      chumBy.delete(e)
    }
  }
}

function shuffled<T>(xs: T[]): T[] {
  const a = xs.slice()
  for (let n = a.length - 1; n > 0; n--) {
    const m = randInt(0, n)
    const t = a[n]
    a[n] = a[m]
    a[m] = t
  }
  return a
}

// Axis-aligned segment touches the raft.
function segHitsRaft(ai: number, aj: number, bi: number, bj: number): boolean {
  return Math.min(ai, bi) <= HARBOR_MAX && Math.max(ai, bi) >= HARBOR_MIN &&
    Math.min(aj, bj) <= HARBOR_MAX && Math.max(aj, bj) >= HARBOR_MIN
}

// Turns until a lane from (si, sj) could include (pi, pj), ignoring the raft.
function straightTurns(si: number, sj: number, pi: number, pj: number, reach: number): number {
  const a = Math.abs(pi - si)
  const b = Math.abs(pj - sj)
  if ((a === 0 && b <= reach) || (b === 0 && a <= reach)) return 0
  return Math.min(
    Math.ceil(b / LUNGE_CELLS) + Math.ceil(Math.max(0, a - reach) / LUNGE_CELLS),
    Math.ceil(a / LUNGE_CELLS) + Math.ceil(Math.max(0, b - reach) / LUNGE_CELLS)
  )
}

// Same, but around the raft's nearest outside corner when both L-shaped
// routes would cross it (no more pacing on the far side of the raft).
function turnsToCover(si: number, sj: number, pi: number, pj: number, reach = LUNGE_CELLS): number {
  const iFirst = segHitsRaft(si, sj, pi, sj) || segHitsRaft(pi, sj, pi, pj)
  const jFirst = segHitsRaft(si, sj, si, pj) || segHitsRaft(si, pj, pi, pj)
  if (!iFirst || !jFirst) return straightTurns(si, sj, pi, pj, reach)
  let best = Infinity
  for (const [ci, cj] of RAFT_CORNERS) {
    const leg = Math.ceil((Math.abs(ci - si) + Math.abs(cj - sj)) / LUNGE_CELLS)
    best = Math.min(best, leg + straightTurns(ci, cj, pi, pj, reach))
  }
  return best
}

// End cells a player can reach this execution that won't bite. `danger` =
// committed lanes + due blasts; `walls` = sharks and their lanes, which
// paths can't cross when LANES_BLOCK_PATHS. `extra` is a lane being tried.
function countSafe(p: Prey, danger: Set<number>, walls: Set<number>, extra: Set<number> | null): number {
  const bad = (k: number) => danger.has(k) || (extra !== null && extra.has(k))
  const wall = (k: number) => LANES_BLOCK_PATHS && (walls.has(k) || (extra !== null && extra.has(k)))
  const start = cellKey(p.i, p.j)
  const seen = new Set<number>([start])
  let frontier = [start]
  let safe = bad(start) ? 0 : 1
  for (let step = 0; step < p.steps; step++) {
    const next: number[] = []
    for (const k of frontier) {
      const i = Math.floor(k / GRID)
      const j = k % GRID
      for (const [dx, dz] of DIRS) {
        if (!inBoard(i + dx, j + dz)) continue
        const nk = cellKey(i + dx, j + dz)
        if (seen.has(nk) || wall(nk)) continue
        seen.add(nk)
        next.push(nk)
        if (!bad(nk)) safe++
      }
    }
    frontier = next
  }
  return safe
}

function buildPrey(): Prey[] {
  let crowd = 0
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (!slot.dead && !inHarbor(slot.cellI, slot.cellJ)) crowd++
  }
  const bonus = crowd >= CROWD_PLAYERS ? CROWD_BONUS : 0
  const out: Prey[] = []
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.dead) continue
    const address = slot.address.toLowerCase()
    const n = slot.maxSteps
    const tier = tierOf(slot.cellI, slot.cellJ)
    const reach: number[] = []
    for (let di = -n; di <= n; di++) {
      for (let dj = -n; dj <= n; dj++) {
        const i = slot.cellI + di
        const j = slot.cellJ + dj
        if (Math.abs(di) + Math.abs(dj) <= n && inBoard(i, j)) reach.push(cellKey(i, j))
      }
    }
    const bleeding = slot.bloodUntilTurn > turn
    const base = SAFE_FLOOR_BY_TIER[Math.min(tier, SAFE_FLOOR_BY_TIER.length - 1)]
    out.push({
      address,
      decoy: false,
      i: slot.cellI,
      j: slot.cellJ,
      steps: n,
      tier,
      huntable: !inHarbor(slot.cellI, slot.cellJ) && turn > (leftRaftTurn.get(address) ?? -99) + RAFT_GRACE,
      bleeding,
      cap: Math.min(MAX_HUNTERS, HUNTERS_BY_TIER[Math.min(tier, HUNTERS_BY_TIER.length - 1)] + bonus + (bleeding ? 1 : 0)),
      head: heading.get(address) ?? [0, 0],
      reach,
      reachSet: new Set(reach),
      safe: reach.length,
      floor: Math.max(1, Math.min(reach.length, Math.ceil((base * reach.length) / 13)))
    })
  }
  return out
}

// Chum in the water: a fake target with no floor of its own.
function buildDecoys(): Prey[] {
  const out: Prey[] = []
  for (const e of chumPool) {
    const c = Chum.get(e)
    if (!c.active) continue
    out.push({
      address: `chum:${e}`, decoy: true, i: c.cellI, j: c.cellJ, steps: 0, tier: tierOf(c.cellI, c.cellJ),
      huntable: true, bleeding: false, cap: CHUM_SHARKS, head: [0, 0], reach: [], reachSet: new Set(), safe: 0, floor: 0
    })
  }
  return out
}

export function dueBlastKeys(): number[] {
  const out: number[] = []
  for (const e of minePool) {
    const m = Mine.get(e)
    if (m.active && !m.exploded && m.detonateTurn <= turn + 1) {
      for (const [i, j] of blastCells(m.cellI, m.cellJ)) out.push(cellKey(i, j))
    }
  }
  return out
}

// Sharks sink when nobody is near and surface around players up to a
// depth-scaled count, one per player per pass so the pool is shared fairly.
// New sharks keep SPAWN_MIN from EVERY player and get one turn to be seen.
function populateSharks() {
  const players = alivePlayers()
  for (const shark of sharkPool) {
    const s = Shark.get(shark)
    if (s.active && !nearAnyPlayer(s.cellI, s.cellJ, players, DESPAWN_CELLS)) {
      const mut = Shark.getMutable(shark)
      mut.active = false
      mut.len = 0
      hunts.delete(shark)
    }
  }
  const taken = (i: number, j: number) =>
    players.some((p) => chebyshev(i, j, p.i, p.j) < SPAWN_MIN) ||
    sharkPool.some((e) => {
      const s = Shark.get(e)
      return s.active && s.cellI === i && s.cellJ === j
    })
  const missing = (p: { i: number; j: number }) => {
    const want = Math.min(SHARKS_NEAR_MAX, SHARKS_NEAR_BASE + SHARKS_PER_TIER * tierOf(p.i, p.j))
    let have = 0
    for (const shark of sharkPool) {
      const s = Shark.get(shark)
      if (s.active && chebyshev(s.cellI, s.cellJ, p.i, p.j) <= SPAWN_MAX) have++
    }
    return want - have
  }
  const stuck = new Set<number>()
  for (let added = true; added; ) {
    added = false
    for (let n = 0; n < players.length; n++) {
      if (stuck.has(n) || missing(players[n]) <= 0) continue
      const free = sharkPool.find((e) => !Shark.get(e).active)
      if (free === undefined) return // pool exhausted; round-robin already shared it
      const cell = ringCell(players[n].i, players[n].j, taken)
      if (!cell) {
        stuck.add(n)
        continue
      }
      Object.assign(Shark.getMutable(free), {
        active: true, phase: 'plan', cellI: cell[0], cellJ: cell[1], len: 0,
        hunting: false, role: 0, target: '', barrels: 0, tagUntilTurn: 0
      })
      bornTurn.set(free, turn)
      lastDir.delete(free)
      hunts.delete(free)
      added = true
    }
  }
}

// At most `cap` sharks hunt each player; assignments stick until the shark
// sinks or is tagged, the target leaves/dies/boards the raft, or the leash
// breaks. Chum steals the nearest sharks for as long as it lasts.
function assignHunters(prey: Prey[], decoys: Prey[]) {
  const byAddr = new Map<string, Prey>()
  for (const p of prey) if (p.huntable) byAddr.set(p.address, p)
  for (const d of decoys) byAddr.set(d.address, d)
  for (const [e, h] of hunts) {
    const s = Shark.get(e)
    const p = byAddr.get(h.target)
    if (!s.active || tagged(s) || bornTurn.get(e) === turn || !p || chebyshev(s.cellI, s.cellJ, p.i, p.j) > HUNT_LEASH) hunts.delete(e)
  }
  const free = (e: Entity) => {
    const s = Shark.get(e)
    return s.active && !tagged(s) && bornTurn.get(e) !== turn
  }

  for (const d of decoys) {
    const near = sharkPool
      .filter((e) => free(e) && chebyshev(Shark.get(e).cellI, Shark.get(e).cellJ, d.i, d.j) <= CHUM_RADIUS)
      .sort((a, b) => chebyshev(Shark.get(a).cellI, Shark.get(a).cellJ, d.i, d.j) - chebyshev(Shark.get(b).cellI, Shark.get(b).cellJ, d.i, d.j))
    for (const e of near.slice(0, d.cap)) {
      const h = hunts.get(e)
      if (!h || !h.target.startsWith('chum:')) hunts.set(e, { target: d.address, role: 1 })
    }
  }

  for (const d of decoys) {
    const owner = byAddr.get(chumBy.get(Number(d.address.slice('chum:'.length)) as Entity) ?? '')
    if (!owner || owner.decoy || chebyshev(owner.i, owner.j, d.i, d.j) > HUNT_LEASH) continue
    const lured = [...hunts.values()].filter((h) => h.target === d.address).length
    owner.cap = Math.max(0, owner.cap - lured)
  }

  const huntersOf = (addr: string) => [...hunts].filter(([, h]) => h.target === addr).map(([e]) => e)
  for (const p of byAddr.values()) {
    // Over the cap (e.g. swam back to shallow water): blockers let go first.
    const hs = huntersOf(p.address).sort((a, b) => hunts.get(a)!.role - hunts.get(b)!.role)
    for (const e of hs.slice(p.cap)) hunts.delete(e)
  }

  const count = new Map<string, number>()
  for (const h of hunts.values()) count.set(h.target, (count.get(h.target) ?? 0) + 1)
  const pairs: { e: Entity; p: Prey; cost: number }[] = []
  for (const e of sharkPool) {
    if (hunts.has(e) || !free(e)) continue
    const s = Shark.get(e)
    for (const p of prey) {
      if (!p.huntable) continue
      const d = chebyshev(s.cellI, s.cellJ, p.i, p.j)
      if (d > (p.bleeding ? HUNT_LEASH : HUNT_RADIUS)) continue
      pairs.push({ e, p, cost: 10 * turnsToCover(s.cellI, s.cellJ, p.i, p.j) + d - (p.bleeding ? BLOOD_PULL : 0) + Math.random() })
    }
  }
  pairs.sort((a, b) => a.cost - b.cost)
  for (const { e, p } of pairs) {
    const n = count.get(p.address) ?? 0
    if (hunts.has(e) || n >= p.cap) continue
    hunts.set(e, { target: p.address, role: 0 })
    count.set(p.address, n + 1)
  }

  // Roles: whoever can strike soonest chases; a sitting chaser keeps the
  // role unless another can strike ROLE_SWAP_TURNS sooner (no flicker).
  for (const p of prey) {
    if (!p.huntable) continue
    const hs = huntersOf(p.address)
    if (hs.length === 0) continue
    const ttc = (e: Entity) => {
      const s = Shark.get(e)
      return turnsToCover(s.cellI, s.cellJ, p.i, p.j)
    }
    hs.sort((a, b) => ttc(a) - ttc(b))
    const cur = hs.find((e) => hunts.get(e)!.role === 1)
    const chaser = cur !== undefined && ttc(cur) - ttc(hs[0]) < ROLE_SWAP_TURNS ? cur : hs[0]
    for (const e of hs) hunts.get(e)!.role = e === chaser ? 1 : 2
  }
}

function maxLunge(e: Entity, base: number): number {
  return tagged(Shark.get(e)) ? Math.min(base, BARREL_LUNGE) : base
}

// Hold (len 0, harmless) plus every straight run up to maxLen that stops at
// the raft, the board edge or a claimed cell.
function laneOptions(e: Entity, maxLen: number, claimed: Set<number>): Lane[] {
  const s = Shark.get(e)
  const out: Lane[] = [{ dx: s.dirX, dz: s.dirZ, len: 0, cells: [], ei: s.cellI, ej: s.cellJ }]
  for (const [dx, dz] of DIRS) {
    const cells = [cellKey(s.cellI, s.cellJ)]
    for (let n = 1; n <= maxLen; n++) {
      const i = s.cellI + dx * n
      const j = s.cellJ + dz * n
      const k = cellKey(i, j)
      if (!sharkCanEnter(i, j) || claimed.has(k)) break
      cells.push(k)
      out.push({ dx, dz, len: n, cells: cells.slice(), ei: i, ej: j })
    }
  }
  return out
}

// Bruce: the longest lane straight through you if he can (staying put or
// running along his line gets you bitten); otherwise the lane end that can
// strike where you're going soonest, closest end on ties.
function chaserLane(
  e: Entity, p: Prey, claimed: Set<number>, fair: (cells: number[]) => boolean, blocked: (k: number) => boolean = () => false
): Lane {
  const maxLen = maxLunge(e, p.tier >= ELROY_TIER ? ELROY_LUNGE : LUNGE_CELLS)
  const opts = laneOptions(e, maxLen, claimed).filter((o) => fair(o.cells) && !o.cells.some(blocked))
  const me = cellKey(p.i, p.j)
  let best: Lane | null = null
  for (const o of opts) if (o.len > 0 && o.cells.includes(me) && (!best || o.len > best.len)) best = o
  if (best) return best
  let qi = p.i + p.head[0]
  let qj = p.j + p.head[1]
  if (!sharkCanEnter(qi, qj)) {
    qi = p.i
    qj = p.j
  }
  let score = -Infinity
  for (const o of opts) {
    const sc = -10 * turnsToCover(o.ei, o.ej, qi, qj, maxLen) - (Math.abs(o.ei - qi) + Math.abs(o.ej - qj)) + 0.01 * o.len
    if (sc > score) {
      score = sc
      best = o
    }
  }
  return best ?? opts[0]
}

// The Tiger: takes away the most safe end cells, favouring the ones you're
// running toward (and pickups you want), from the far side of Bruce. With
// nothing in reach it swims into position for next turn.
function blockerLane(
  e: Entity, p: Prey, chaser: Lane | null, chaserCell: [number, number], claimed: Set<number>,
  danger: Set<number>, fair: (cells: number[]) => boolean, pickups: Set<number>
): Lane {
  let [ex, ez] = p.head
  if (!ex && !ez) {
    // Stayed last turn: assume you'll run away from Bruce.
    let ri = p.i - (chaser ? chaser.ei : chaserCell[0])
    let rj = p.j - (chaser ? chaser.ej : chaserCell[1])
    if (!ri && !rj) {
      ri = p.i - chaserCell[0]
      rj = p.j - chaserCell[1]
    }
    if (Math.abs(ri) >= Math.abs(rj)) ex = Math.sign(ri)
    else ez = Math.sign(rj)
  }
  const Xi = p.i + ex * p.steps
  const Xj = p.j + ez * p.steps
  const ci = (chaser ? chaser.ei : chaserCell[0]) - p.i
  const cj = (chaser ? chaser.ej : chaserCell[1]) - p.j
  let best: Lane | null = null
  let score = -Infinity
  for (const o of laneOptions(e, maxLunge(e, LUNGE_CELLS), claimed)) {
    if (!fair(o.cells)) continue
    const taken = o.cells.length ? p.safe - countSafe(p, danger, claimed, new Set(o.cells)) : 0
    let bonus = 0
    for (const k of o.cells) {
      if (!p.reachSet.has(k) || danger.has(k)) continue
      const i = Math.floor(k / GRID)
      const j = k % GRID
      if ((i - p.i) * ex + (j - p.j) * ez > 0) bonus += W_AHEAD
      if (pickups.has(k)) bonus += W_PICKUP
    }
    const bi = o.ei - p.i
    const bj = o.ej - p.j
    const dot = bi * ci + bj * cj
    const pincer = (ci || cj) && (bi || bj) ? (dot < 0 ? S_PINCER : dot === 0 ? S_PINCER / 2 : 0) : 0
    const sc = 10 * (taken + bonus) + pincer - S_PARK * (Math.abs(o.ei - Xi) + Math.abs(o.ej - Xj))
    if (sc > score) {
      score = sc
      best = o
    }
  }
  return best ?? laneOptions(e, 0, claimed)[0]
}

// Non-hunters circle the nearest player with momentum and never aim at
// anyone. Shallow water and fresh sharks keep out of everyone's reach.
function wanderLane(e: Entity, prey: Prey[], claimed: Set<number>, blocked: (k: number) => boolean, fair: (cells: number[]) => boolean): Lane {
  const s = Shark.get(e)
  const hold: Lane = { dx: s.dirX, dz: s.dirZ, len: 0, cells: [], ei: s.cellI, ej: s.cellJ }
  const own = cellKey(s.cellI, s.cellJ)
  if (blocked(own)) return hold
  let fwd: [number, number] = lastDir.get(e) ?? DIRS[randInt(0, 3)]
  let near: Prey | null = null
  let d = Infinity
  for (const p of prey) {
    const dd = chebyshev(s.cellI, s.cellJ, p.i, p.j)
    if (dd < d) {
      d = dd
      near = p
    }
  }
  if (near && (d < CIRCLE_MIN || d > CIRCLE_MAX)) {
    const sgn = d < CIRCLE_MIN ? -1 : 1
    const di = near.i - s.cellI
    const dj = near.j - s.cellJ
    fwd = Math.abs(di) >= Math.abs(dj) ? [sgn * Math.sign(di) || 1, 0] : [0, sgn * Math.sign(dj) || 1]
  } else if (Math.random() < WANDER_TURN_CHANCE) {
    fwd = Math.random() < 0.5 ? [-fwd[1], fwd[0]] : [fwd[1], -fwd[0]]
  }
  const side = Math.random() < 0.5 ? 1 : -1
  const order: [number, number][] = [fwd, [-fwd[1] * side, fwd[0] * side], [fwd[1] * side, -fwd[0] * side], [-fwd[0], -fwd[1]]]
  const want = Math.min(randInt(1, 2), maxLunge(e, 2))
  for (const [dx, dz] of order) {
    const cells = [own]
    for (let n = 1; n <= want; n++) {
      const i = s.cellI + dx * n
      const j = s.cellJ + dz * n
      const k = cellKey(i, j)
      if (!sharkCanEnter(i, j) || claimed.has(k) || blocked(k)) break
      cells.push(k)
    }
    while (cells.length > 1 && !fair(cells)) cells.pop()
    const len = cells.length - 1
    if (len > 0) return { dx, dz, len, cells, ei: s.cellI + dx * len, ej: s.cellJ + dz * len }
  }
  return hold
}

// Each shark commits to a straight lane. Packs plan first (Bruce, then the
// Tigers), chum-chasers next, wanderers last. Lanes never overlap
// (`claimed`), and no lane may leave any alive player with fewer than their
// floor of safe end cells (holding still is always allowed, so there is
// always a fair choice).
function planLanes() {
  const prey = buildPrey()
  const decoys = buildDecoys()
  assignHunters(prey, decoys)

  const owners = new Map<number, Prey[]>()
  for (const p of prey) {
    for (const k of p.reach) {
      const list = owners.get(k)
      if (list) list.push(p)
      else owners.set(k, [p])
    }
  }
  const claimed = new Set<number>()
  const danger = new Set<number>()
  for (const e of sharkPool) {
    const s = Shark.get(e)
    if (s.active) claimed.add(cellKey(s.cellI, s.cellJ))
  }
  for (const k of dueBlastKeys()) danger.add(k) // mines going off this execution
  for (const p of prey) p.safe = countSafe(p, danger, claimed, null)

  const affected = (cells: number[]) => {
    const out = new Set<Prey>()
    for (const k of cells) for (const p of owners.get(k) ?? []) out.add(p)
    return out
  }
  const fair = (cells: number[]) => {
    if (cells.length === 0) return true
    const extra = new Set(cells)
    for (const p of affected(cells)) {
      const after = countSafe(p, danger, claimed, extra)
      if (after < p.floor && after < p.safe) return false
    }
    return true
  }
  const pickups = new Set<number>()
  for (const e of pickupPool) {
    const pk = Pickup.get(e)
    if (pk.active) pickups.add(cellKey(pk.cellI, pk.cellJ))
  }
  const commit = (e: Entity, o: Lane, role: Role, target: string) => {
    for (const k of o.cells) {
      claimed.add(k)
      danger.add(k)
    }
    for (const p of affected(o.cells)) p.safe = countSafe(p, danger, claimed, null)
    if (o.len > 0) lastDir.set(e, [o.dx, o.dz])
    const m = Shark.getMutable(e)
    m.dirX = o.dx
    m.dirZ = o.dz
    m.len = o.len
    m.phase = 'plan'
    m.role = role
    m.target = target
    m.hunting = role > 0
  }

  const packOf = (addr: string) => {
    let chaser: Entity | undefined
    const blockers: Entity[] = []
    for (const [e, h] of hunts) {
      if (h.target !== addr) continue
      if (h.role === 1 && chaser === undefined) chaser = e
      else blockers.push(e)
    }
    return { chaser, blockers }
  }
  for (const p of shuffled(prey.filter((x) => x.huntable))) {
    const { chaser, blockers } = packOf(p.address)
    if (chaser === undefined) continue
    const lane = chaserLane(chaser, p, claimed, fair)
    commit(chaser, lane, 1, p.address)
    const c = Shark.get(chaser)
    for (const b of blockers) {
      commit(b, blockerLane(b, p, lane, [c.cellI, c.cellJ], claimed, danger, fair, pickups), 2, p.address)
    }
  }
  // Chum chasers keep out of tier 0 and away from raft-grace players.
  const shielded = (k: number) => (owners.get(k) ?? []).some((p) => !p.huntable || p.tier === 0)
  for (const d of decoys) {
    for (const [e, h] of hunts) {
      if (h.target === d.address) commit(e, chaserLane(e, d, claimed, fair, shielded), 1, 'chum')
    }
  }

  for (const e of sharkPool) {
    const s = Shark.get(e)
    if (!s.active || hunts.has(e)) continue
    const fresh = bornTurn.get(e) === turn
    const blocked = (k: number) => (owners.get(k) ?? []).some((p) => fresh || p.tier < WANDER_BITE_TIER)
    commit(e, wanderLane(e, prey, claimed, blocked, fair), 0, '')
  }
}
