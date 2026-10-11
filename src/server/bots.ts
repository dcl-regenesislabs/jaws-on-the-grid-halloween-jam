import { engine, Entity } from '@dcl/sdk/ecs'
import { Storage } from '@dcl/sdk/server'

import { Pickup, PlayerSlot, Shark } from '../shared/components'
import {
  BARREL_CAPACITY,
  BARREL_RANGE,
  BOT_COUNT,
  BOT_LEAVE_CHANCE,
  BOT_MAX,
  BOT_MAX_DEPTH,
  BOT_PLAY_JITTER,
  BOT_PLAY_SECONDS,
  BOT_SAVE_SCORES,
  CENTER_CELL,
  CHUM_CAPACITY,
  GRID,
  HARBOR_MAX,
  HARBOR_MIN,
  HARBOR_SIZE,
  JACKET_CAPACITY,
  LANES_BLOCK_PATHS,
  MINE_CAPACITY,
  PLAYERS_TIME,
  SHARK_ENDING_TIME,
  STEP_DIRS,
  depthOf,
  inBoard,
  inHarbor,
  pathCells,
  sharkCells,
  tierOf
} from '../shared/config'
import {
  botAddresses,
  cellKey,
  createPlayerSlot,
  dropChum,
  dueBlastKeys,
  harpoon,
  planPath,
  plantMine,
  respawn,
  saveScore,
  turnClock,
  wallKeys
} from './game'
import { randomAddress, randomLook, randomName } from './bot-looks'

// Bots: server-run players. Each one owns an ordinary PlayerSlot with a
// made-up address, name and outfit, and acts only through the same action
// functions the players' messages use (planPath, plantMine, harpoon,
// dropChum, respawn, saveScore). Sharks hunt them, pickups spawn around
// them, clients draw them as AvatarShapes: nothing tells them apart.
//
// A bot hangs around the raft for a few turns, then swims out after coins,
// gear and other players, dodging every lane it can see, never farther than
// BOT_MAX_DEPTH from the raft so you can watch it play. After
// BOT_PLAY_SECONDS it stops dodging and lets a shark get it, watches its
// ending, then swims again or leaves (a new bot joins later).

interface Bot {
  address: string
  entity: Entity
  // Personality, rolled once per bot.
  reaction: [number, number] // seconds into the players' turn when it commits
  social: number // chance a new waypoint is near another swimmer
  idle: number // chance to just tread water for a turn
  sloppy: number // noise in its choices
  // This life.
  bornAt: number // server clock when this life started
  loseAt: number
  raftTurns: number // planning turns to hang around the raft first
  waypoint: [number, number] | null
  waypointTurn: number
  // This turn.
  turn: number
  decideAt: number
  decided: boolean
  revise: boolean // commits a first plan, then changes its mind once
  // Dead.
  deadSince: number // server clock, -1 while alive
  nextMove: number // when it presses SWIM AGAIN (or leaves)
  saveAt: number
}

const bots: Bot[] = []
const joins: number[] = [] // server clock times of bots still to join
// How many bots to keep. Starts at BOT_COUNT; an admin can change it in game
// (src/server/admin.ts) and the choice is stored so it survives restarts.
let target = BOT_COUNT
const BOT_COUNT_KEY = 'bot-count'
const targetListeners: ((n: number) => void)[] = []

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function manhattan(ai: number, aj: number, bi: number, bj: number): number {
  return Math.abs(ai - bi) + Math.abs(aj - bj)
}

function chebyshev(ai: number, aj: number, bi: number, bj: number): number {
  return Math.max(Math.abs(ai - bi), Math.abs(aj - bj))
}

export function initBots(): void {
  // Staggered, like people dropping in.
  for (let n = 0; n < target; n++) joins.push(rand(4, 25))
  engine.addSystem(botSystem)
  Storage.get<string>(BOT_COUNT_KEY)
    .then((raw) => {
      if (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw))) return
      applyTarget(Number(raw), turnClock().now)
      console.log('[bots] stored bot count', target)
    })
    .catch(() => {})
}

export function botTarget(): number {
  return target
}

export function onBotTarget(cb: (n: number) => void): void {
  targetListeners.push(cb)
}

// Admin: keep this many bots from now on (and after restarts).
export function setBotTarget(n: number): void {
  applyTarget(n, turnClock().now)
  Storage.set(BOT_COUNT_KEY, String(target)).catch(() => {})
}

// Extra bots disconnect at once; missing ones drop in over the next seconds.
function applyTarget(n: number, now: number): void {
  target = Math.max(0, Math.min(BOT_MAX, Math.round(n) || 0))
  while (bots.length > target) leave(bots[bots.length - 1], now, false)
  joins.length = Math.min(joins.length, target - bots.length)
  while (bots.length + joins.length < target) joins.push(now + rand(2, 12))
  for (const cb of targetListeners) cb(target)
}

// Admin reset: the slots were wiped with everyone else's; each bot starts a
// fresh life (and a fresh 5-minute clock) on the raft.
export function resetBots(): void {
  const now = turnClock().now
  for (const bot of bots) {
    newLife(bot, now)
    bot.turn = -1
    bot.decided = true
  }
}

function join(now: number): void {
  const address = randomAddress()
  const taken = new Set<string>()
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) taken.add(slot.name.toLowerCase())
  botAddresses.add(address)
  const entity = createPlayerSlot(address, randomName(taken))
  Object.assign(PlayerSlot.getMutable(entity), randomLook())
  const bot: Bot = {
    address,
    entity,
    reaction: [rand(0.5, 1.1), rand(1.4, 2.4)],
    social: rand(0.2, 0.6),
    idle: rand(0.03, 0.12),
    sloppy: rand(0.6, 1.8),
    bornAt: now,
    loseAt: 0,
    raftTurns: 0,
    waypoint: null,
    waypointTurn: 0,
    turn: -1,
    decideAt: 0,
    decided: true,
    revise: false,
    deadSince: -1,
    nextMove: 0,
    saveAt: 0
  }
  newLife(bot, now)
  bots.push(bot)
  console.log('[bots] joined', address, PlayerSlot.get(entity).name)
}

function newLife(bot: Bot, now: number): void {
  bot.bornAt = now
  bot.loseAt = now + BOT_PLAY_SECONDS + rand(-BOT_PLAY_JITTER, BOT_PLAY_JITTER)
  bot.raftTurns = randInt(2, 7)
  bot.waypoint = null
  bot.deadSince = -1
}

function leave(bot: Bot, now: number, replace = true): void {
  // Same as a player disconnecting: the slot goes on the next sync pass.
  botAddresses.delete(bot.address)
  bots.splice(bots.indexOf(bot), 1)
  if (replace) joins.push(now + rand(15, 60))
  console.log('[bots] left', bot.address)
}

function botSystem(): void {
  const clock = turnClock()
  for (let n = joins.length - 1; n >= 0; n--) {
    if (clock.now < joins[n]) continue
    joins.splice(n, 1)
    if (bots.length < target) join(clock.now)
  }

  for (const bot of bots.slice()) {
    const slot = PlayerSlot.getOrNull(bot.entity)
    if (!slot) continue

    if (slot.dead) {
      // Watch the ending, maybe save the score, then swim again or leave.
      if (bot.deadSince < 0) {
        bot.deadSince = clock.now
        bot.nextMove = clock.now + SHARK_ENDING_TIME + rand(2, 9)
        bot.saveAt = BOT_SAVE_SCORES && slot.score > 0 ? clock.now + SHARK_ENDING_TIME + rand(0.5, 2) : Infinity
        console.log('[bots] lost', bot.address, slot.deathCause, slot.killedBy, 'after', Math.round(clock.now - bot.bornAt), 's')
      }
      if (clock.now >= bot.saveAt) {
        bot.saveAt = Infinity
        saveScore(PlayerSlot.getMutable(bot.entity))
      }
      if (clock.now < bot.nextMove) continue
      if (Math.random() < BOT_LEAVE_CHANCE) {
        leave(bot, clock.now)
        continue
      }
      respawn(PlayerSlot.getMutable(bot.entity))
      if (!PlayerSlot.get(bot.entity).dead) newLife(bot, clock.now)
      else bot.nextMove = clock.now + 1
      continue
    }

    if (clock.phase !== 'players') continue
    if (bot.turn !== clock.turn) {
      bot.turn = clock.turn
      bot.decided = false
      bot.revise = Math.random() < 0.15
      // A full second of slack: a long server frame must not skip the decision.
      bot.decideAt = Math.min(rand(bot.reaction[0], bot.reaction[1]), PLAYERS_TIME - 1)
      if (bot.revise) bot.decideAt = Math.min(bot.decideAt, PLAYERS_TIME - 1.8)
    }
    if (bot.decided || clock.elapsed < bot.decideAt) continue

    const losing = clock.now >= bot.loseAt
    const mut = PlayerSlot.getMutable(bot.entity)
    if (!bot.revise) useGear(bot, mut, losing)
    const steps = choosePath(bot, mut, clock.turn, losing, bot.revise ? 3 : 1)
    if (!planPath(mut, steps)) console.log('[server] plan REJECTED bot', bot.address, mut.cellI, mut.cellJ, JSON.stringify(steps))
    if (bot.revise) {
      // Changes its mind once, like a thumb hovering over the d-pad.
      bot.revise = false
      bot.decideAt = Math.min(clock.elapsed + rand(0.4, 0.9), PLAYERS_TIME - 1)
    } else {
      bot.decided = true
      if (inHarbor(mut.cellI, mut.cellJ) && bot.raftTurns > 0) bot.raftTurns--
    }
  }
}

// --- Gear: the same buttons a player has ---

type MutSlot = ReturnType<typeof PlayerSlot.getMutable>

function huntersOn(address: string): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = []
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (s.active && s.role > 0 && s.target === address) out.push({ i: s.cellI, j: s.cellJ })
  }
  return out
}

function useGear(bot: Bot, slot: MutSlot, losing: boolean): void {
  if (losing || inHarbor(slot.cellI, slot.cellJ)) return
  const hunters = huntersOn(slot.address)
  const close = (r: number) => hunters.some((h) => chebyshev(h.i, h.j, slot.cellI, slot.cellJ) <= r)
  if (slot.barrels > 0 && close(BARREL_RANGE) && Math.random() < 0.6) harpoon(slot)
  if (slot.chum > 0 && tierOf(slot.cellI, slot.cellJ) >= 1 && hunters.length >= 2 && Math.random() < 0.5) dropChum(slot)
  if (slot.mines > 0 && ((close(3) && Math.random() < 0.3) || Math.random() < 0.04)) plantMine(slot)
}

// --- Moving ---

type Option = { steps: number[]; cells: [number, number][]; i: number; j: number }

// Every end cell reachable this turn, with the shortest legal path to it
// (on the board, never through a shark or its lane).
function options(slot: MutSlot, walls: Set<number>): Option[] {
  const out: Option[] = [{ steps: [], cells: [], i: slot.cellI, j: slot.cellJ }]
  const seen = new Set<number>([cellKey(slot.cellI, slot.cellJ)])
  let frontier = out.slice()
  for (let step = 0; step < slot.maxSteps; step++) {
    const next: Option[] = []
    for (const o of frontier) {
      STEP_DIRS.forEach(([dx, dz], code) => {
        const i = o.i + dx
        const j = o.j + dz
        const k = cellKey(i, j)
        if (!inBoard(i, j) || seen.has(k) || walls.has(k)) return
        seen.add(k)
        next.push({ steps: [...o.steps, code], cells: [...o.cells, [i, j]], i, j })
      })
    }
    out.push(...next)
    frontier = next
  }
  return out
}

// Cells that bite at the end of this execution: shown lanes and due blasts.
function dangerKeys(): Set<number> {
  const out = new Set<number>(dueBlastKeys())
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (s.active && s.len > 0) for (const [i, j] of sharkCells(s)) out.add(cellKey(i, j))
  }
  return out
}

// Everyone else out in the water, players and bots alike.
function othersInWater(self: string): { i: number; j: number }[] {
  const out: { i: number; j: number }[] = []
  for (const [_e, slot] of engine.getEntitiesWith(PlayerSlot)) {
    if (slot.dead || slot.address === self || inHarbor(slot.cellI, slot.cellJ)) continue
    out.push({ i: slot.cellI, j: slot.cellJ })
  }
  return out
}

// Cells other bots stand on or have planned to end on: a bot never picks one
// (players may still collide with anyone, bots keep out of each other's way).
function botClaims(self: Entity): Set<number> {
  const out = new Set<number>()
  for (const other of bots) {
    if (other.entity === self) continue
    const s = PlayerSlot.getOrNull(other.entity)
    if (!s || s.dead) continue
    out.add(cellKey(s.cellI, s.cellJ))
    const path = Array.from(s.path)
    const cells = pathCells(s.cellI, s.cellJ, path)
    if (cells.length) out.add(cellKey(cells[cells.length - 1][0], cells[cells.length - 1][1]))
  }
  return out
}

// Pulled back inside BOT_MAX_DEPTH (and the board).
function nearRaft(i: number, j: number): [number, number] {
  const c = (v: number) => Math.max(1, Math.min(GRID - 2, CENTER_CELL + Math.max(-BOT_MAX_DEPTH, Math.min(BOT_MAX_DEPTH, v - CENTER_CELL))))
  return [c(i), c(j)]
}

// Somewhere to head for: near another swimmer sometimes, otherwise a spot in
// the water around the raft, within BOT_MAX_DEPTH.
function pickWaypoint(bot: Bot, slot: MutSlot, turn: number): void {
  const people = othersInWater(slot.address)
  if (people.length && Math.random() < bot.social) {
    const p = people[randInt(0, people.length - 1)]
    bot.waypoint = nearRaft(p.i + randInt(-4, 4), p.j + randInt(-4, 4))
  } else {
    const d = randInt(Math.min(HARBOR_SIZE / 2 + 2, BOT_MAX_DEPTH), BOT_MAX_DEPTH)
    // A point on the square ring at that depth, biased toward where it is.
    const along = randInt(-d, d)
    const side = Math.random() < 0.6 ? nearestSide(slot) : randInt(0, 3)
    const [i, j] = side === 0 ? [d, along] : side === 1 ? [-d, along] : side === 2 ? [along, d] : [along, -d]
    bot.waypoint = nearRaft(CENTER_CELL + i, CENTER_CELL + j)
  }
  bot.waypointTurn = turn
}

// Cost of ending a move past BOT_MAX_DEPTH (only taken to escape a lane).
function tooDeep(i: number, j: number): number {
  return 4 * Math.max(0, depthOf(i, j) - BOT_MAX_DEPTH)
}

function nearestSide(slot: MutSlot): number {
  const di = slot.cellI - CENTER_CELL
  const dj = slot.cellJ - CENTER_CELL
  return Math.abs(di) >= Math.abs(dj) ? (di >= 0 ? 0 : 1) : dj >= 0 ? 2 : 3
}

function choosePath(bot: Bot, slot: MutSlot, turn: number, losing: boolean, noise: number): number[] {
  const walls = LANES_BLOCK_PATHS ? wallKeys() : new Set<number>()
  const danger = dangerKeys()
  const claimed = botClaims(bot.entity)
  const opts = options(slot, walls)
  const now = turnClock().now
  const sharks: { i: number; j: number; hunter: boolean; mine: boolean }[] = []
  for (const [_e, s] of engine.getEntitiesWith(Shark)) {
    if (!s.active) continue
    // Losing: line up with where it ends this execution (the far end of its
    // shown lane), which is where next turn's lunge starts.
    const [si, sj] = losing ? [s.cellI + s.dirX * s.len, s.cellJ + s.dirZ * s.len] : [s.cellI, s.cellJ]
    sharks.push({ i: si, j: sj, hunter: s.role > 0, mine: s.role > 0 && s.target === slot.address })
  }
  if (losing) return losingPath(bot, slot, opts, danger, sharks, now, claimed)

  const onRaft = inHarbor(slot.cellI, slot.cellJ)
  const lingering = onRaft && bot.raftTurns > 0
  if (lingering) {
    // Practising the rhythm on the raft: shuffle around or stand still.
    if (Math.random() < 0.4) return []
    bot.waypoint = [randInt(HARBOR_MIN, HARBOR_MAX), randInt(HARBOR_MIN, HARBOR_MAX)]
  } else if (
    !bot.waypoint ||
    inHarbor(bot.waypoint[0], bot.waypoint[1]) ||
    manhattan(slot.cellI, slot.cellJ, bot.waypoint[0], bot.waypoint[1]) <= 1 ||
    turn - bot.waypointTurn > 30
  ) {
    pickWaypoint(bot, slot, turn)
  }
  const [gi, gj] = bot.waypoint!

  const startSafe = !danger.has(cellKey(slot.cellI, slot.cellJ))
  if (!lingering && startSafe && Math.random() < bot.idle) return []

  const loot = new Map<number, number>()
  for (const [_e, p] of engine.getEntitiesWith(Pickup)) {
    if (!p.active) continue
    const want =
      p.kind === 'coin' ? 3 + p.value / 20
      : p.kind === 'life' ? (slot.extraLives < JACKET_CAPACITY ? 4 : 0)
      : p.kind === 'boost' ? (slot.boostUntilTurn <= turn + 1 ? 4 : 1)
      : p.kind === 'mine' ? (slot.mines < MINE_CAPACITY ? 2.5 : 0)
      : p.kind === 'barrel' ? (slot.barrels < BARREL_CAPACITY ? 3 : 0)
      : p.kind === 'chum' ? (slot.chum < CHUM_CAPACITY ? 2 : 0)
      : 0
    if (want > 0) loot.set(cellKey(p.cellI, p.cellJ), want)
  }

  let best = opts[0]
  let bestScore = -Infinity
  for (const o of opts) {
    let sc = -manhattan(o.i, o.j, gi, gj)
    if (danger.has(cellKey(o.i, o.j))) sc -= 1000
    if (claimed.has(cellKey(o.i, o.j))) sc -= 30
    sc -= tooDeep(o.i, o.j)
    if (!lingering && inHarbor(o.i, o.j) && !onRaft) sc -= 6 // no going back to the raft mid-run
    if (lingering && !inHarbor(o.i, o.j)) sc -= 50
    for (const [i, j] of o.cells) sc += loot.get(cellKey(i, j)) ?? 0
    // Don't park in line with a shark that could lunge next turn.
    for (const s of sharks) {
      const reach = s.hunter ? 4 : 2
      const inLine = (s.i === o.i && Math.abs(s.j - o.j) <= reach) || (s.j === o.j && Math.abs(s.i - o.i) <= reach)
      if (inLine) sc -= s.mine ? 3 : s.hunter ? 2 : 1
      if (s.mine && chebyshev(s.i, s.j, o.i, o.j) <= 1) sc -= 1
    }
    sc += Math.random() * bot.sloppy * noise
    if (sc > bestScore) {
      bestScore = sc
      best = o
    }
  }
  return best.steps
}

// Time's up: stop dodging. Hold still when a lane covers its own cell (that
// is how players get bitten: lanes are walls, so nobody can swim into one);
// otherwise get in line with a shark, preferring its own hunters, and wait.
// Late in the attempt a due blast will do too.
function losingPath(
  bot: Bot, slot: MutSlot, opts: Option[], danger: Set<number>,
  sharks: { i: number; j: number; hunter: boolean; mine: boolean }[], now: number, claimed: Set<number>
): number[] {
  if (danger.has(cellKey(slot.cellI, slot.cellJ))) return []
  const blasts = new Set(dueBlastKeys())
  const late = now - bot.loseAt > 45
  let best = opts[0]
  let bestScore = -Infinity
  for (const o of opts) {
    let sc = -tooDeep(o.i, o.j)
    if (claimed.has(cellKey(o.i, o.j))) sc -= 30
    if (inHarbor(o.i, o.j)) sc -= 50
    if (late && blasts.has(cellKey(o.i, o.j))) sc += 20
    if (sharks.length) {
      let near = Infinity
      for (const s of sharks) {
        const inLine = s.i === o.i || s.j === o.j
        const d = manhattan(s.i, s.j, o.i, o.j) + (inLine ? 0 : 3) + (s.mine ? 0 : s.hunter ? 2 : 3)
        near = Math.min(near, d)
      }
      sc -= near
    } else {
      sc += Math.min(depthOf(o.i, o.j), BOT_MAX_DEPTH) // nothing around: head out to the edge of its range
    }
    sc += Math.random() * 0.5
    if (sc > bestScore) {
      bestScore = sc
      best = o
    }
  }
  return best.steps
}
