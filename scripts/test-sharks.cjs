// Smart-shark rules against the real server module (in-memory ECS, same
// harness idea as test-endgame.cjs). Checks invariants and prints a few
// model numbers; it does not say anything about how the game feels.
const { build } = require('esbuild')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const mock = `
export const components = new Map(); export const handlers = new Map(); export const systems = [];
let id = 1000;
function component(name) {
  const values = new Map();
  const c = { componentId: name, values, create(e,v) { values.set(e, v); return v },
    get(e) { if (!values.has(e)) throw Error(name + ':' + e); return values.get(e) },
    getMutable(e) { return c.get(e) }, getOrNull(e) { return values.get(e) || null },
    getMutableOrNull(e) { return values.get(e) || null }, validateBeforeChange() {}, onChange() {} };
  components.set(name,c); return c;
}
export const engine = { defineComponent: component, addEntity: () => ++id,
  addSystem: f => systems.push(f), removeEntity: e => { for (const c of components.values()) c.values.delete(e) },
  getEntitiesWith: c => c.values.entries() };
export const PlayerIdentityData = component('identity'), AvatarBase = component('avatar'), AvatarEquippedData = component('equipped');
export const Schemas = { String: 0, Int: 0, Boolean: 0, Color3: 0, Array: x => x, Map: x => x };
export const AUTH_SERVER_PEER_ID = 'server';
export const Storage = { get: async () => null, set: async () => true };
export const syncEntity = () => {};
export const registerMessages = () => ({ onMessage: (name, f) => handlers.set(name,f), send() {} });
`

const KEY = (i, j) => i * 1000 + j
const DIRS = [[0, 1], [0, -1], [-1, 0], [1, 0]] // STEP_DIRS order: up, down, left, right

async function main() {
  const result = await build({
    stdin: { contents: `export { initServer } from './src/server/game'; export * from './src/shared/config'; export * from './src/shared/components'; export * from 'test-harness';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'ecs-memory', setup(b) {
      b.onResolve({ filter: /^(@dcl\/sdk|test-harness)/ }, () => ({ path: 'sdk', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'ts' }))
    }}]
  })

  function world(seed = 73) {
    const box = { module: { exports: {} }, console: { log() {}, error: console.error }, Math: Object.create(Math) }
    box.Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    // LANES_OFF=1 runs the same checks with the old rule (only the final cell counts).
    let code = result.outputFiles[0].text
    if (process.env.LANES_OFF) code = code.replace(/LANES_BLOCK_PATHS = true/, 'LANES_BLOCK_PATHS = false')
    vm.runInNewContext(code, box)
    const w = box.module.exports
    w.rand = box.Math.random
    w.initServer()
    w.tick = (dt) => w.systems.forEach((f) => f(dt))
    w.player = (address = 'alice', i = 110, j = 110) => {
      const e = w.engine.addEntity()
      w.PlayerIdentityData.create(e, { address, isGuest: false })
      w.tick(0)
      const slot = [...w.PlayerSlot.values.values()].find((p) => p.address === address)
      Object.assign(slot, { cellI: i, cellJ: j })
      return slot
    }
    w.send = (name, data = {}, from = 'alice') => w.handlers.get(name)(data, { from })
    w.round = () => { w.tick(w.PLAYERS_TIME); w.tick(w.SHARKS_TIME) }
    w.sharks = () => [...w.Shark.values.values()].filter((s) => s.active)
    w.clearSharks = () => { for (const s of w.Shark.values.values()) Object.assign(s, { active: false, len: 0, role: 0, target: '' }) }
    w.turn = () => [...w.GameState.values.values()][0].turn
    w.shark = (i, j) => {
      const s = [...w.Shark.values.values()].find((s) => !s.active)
      Object.assign(s, { active: true, cellI: i, cellJ: j, dirX: 1, dirZ: 0, len: 0, role: 0, target: '', barrels: 0, tagUntilTurn: 0 })
      return s
    }
    return w
  }

  // Independent re-implementation of "safe end cells" for the checks.
  function safety(w, p) {
    const sharks = w.sharks()
    const bodies = new Set(sharks.map((s) => KEY(s.cellI, s.cellJ)))
    const walls = new Set()
    const danger = new Set()
    for (const s of sharks) {
      for (let k = 0; k <= s.len; k++) {
        const c = KEY(s.cellI + s.dirX * k, s.cellJ + s.dirZ * k)
        walls.add(c)
        if (s.len > 0) danger.add(c)
      }
    }
    const blasts = new Set()
    for (const m of w.Mine.values.values()) {
      if (m.active && !m.exploded && m.detonateTurn <= w.turn() + 1) for (const [i, j] of w.blastCells(m.cellI, m.cellJ)) blasts.add(KEY(i, j))
    }
    const bfs = (wallSet, bad) => {
      const ends = []
      const seen = new Set([KEY(p.cellI, p.cellJ)])
      let frontier = [[p.cellI, p.cellJ]]
      if (!bad(KEY(p.cellI, p.cellJ))) ends.push([p.cellI, p.cellJ])
      for (let n = 0; n < p.maxSteps; n++) {
        const next = []
        for (const [i, j] of frontier) for (const [dx, dz] of DIRS) {
          const a = i + dx, b = j + dz, k = KEY(a, b)
          if (!w.inBoard(a, b) || seen.has(k) || (w.LANES_BLOCK_PATHS && wallSet.has(k))) continue
          seen.add(k); next.push([a, b])
          if (!bad(k)) ends.push([a, b])
        }
        frontier = next
      }
      return ends
    }
    const before = bfs(bodies, (k) => blasts.has(k)).length
    const ends = bfs(walls, (k) => danger.has(k) || blasts.has(k))
    let reach = 0
    for (let di = -p.maxSteps; di <= p.maxSteps; di++) for (let dj = -p.maxSteps; dj <= p.maxSteps; dj++) {
      if (Math.abs(di) + Math.abs(dj) <= p.maxSteps && w.inBoard(p.cellI + di, p.cellJ + dj)) reach++
    }
    const tier = w.tierOf(p.cellI, p.cellJ)
    const base = w.SAFE_FLOOR_BY_TIER[Math.min(tier, w.SAFE_FLOOR_BY_TIER.length - 1)]
    const floor = Math.max(1, Math.min(reach, Math.ceil((base * reach) / 13)))
    return { before, after: ends.length, ends, floor, walls, danger }
  }

  // Shortest path (step codes) to a cell, avoiding walls.
  function pathTo(w, p, target, walls) {
    const prev = new Map([[KEY(p.cellI, p.cellJ), null]])
    let frontier = [[p.cellI, p.cellJ]]
    for (let n = 0; n < p.maxSteps && frontier.length; n++) {
      const next = []
      for (const [i, j] of frontier) DIRS.forEach(([dx, dz], code) => {
        const a = i + dx, b = j + dz, k = KEY(a, b)
        if (!w.inBoard(a, b) || prev.has(k) || (w.LANES_BLOCK_PATHS && walls.has(k))) return
        prev.set(k, { from: KEY(i, j), code }); next.push([a, b])
      })
      frontier = next
    }
    const steps = []
    for (let k = KEY(target[0], target[1]); prev.get(k); k = prev.get(k).from) steps.unshift(prev.get(k).code)
    return steps
  }

  function invariants(w) {
    const sharks = w.sharks()
    const cells = new Map()
    for (const s of sharks) {
      for (let k = 0; k <= s.len; k++) {
        const c = KEY(s.cellI + s.dirX * k, s.cellJ + s.dirZ * k)
        assert.ok(!cells.has(c), `lanes overlap at ${c}`)
        cells.set(c, s)
        assert.ok(!w.inHarbor(s.cellI + s.dirX * k, s.cellJ + s.dirZ * k), 'lane enters the raft')
      }
    }
    const players = [...w.PlayerSlot.values.values()].filter((p) => !p.dead)
    for (const p of players) {
      const hunters = sharks.filter((s) => s.role > 0 && s.target === p.address)
      assert.ok(hunters.length <= w.MAX_HUNTERS, 'too many hunters')
      assert.ok(hunters.filter((s) => s.role === 1).length <= 1, 'two chasers on one player')
      const sf = safety(w, p)
      assert.ok(sf.after >= Math.min(sf.floor, sf.before), `floor broken for ${p.address} at ${p.cellI},${p.cellJ}: ${sf.after} < min(${sf.floor}, ${sf.before})`)
    }
  }

  const checks = []
  function test(name, f) { f(); checks.push(name); console.log('PASS', name) }

  test('cap: 1 hunter near the raft, 2 deeper, +1 in a crowded sea; one chaser each', () => {
    const w = world()
    const shallow = w.player('alice', 108, 100) // tier 0
    const deep = w.player('bob', 140, 100) // tier 3
    w.clearSharks()
    for (const [i, j] of [[112, 100], [108, 104], [104, 96], [112, 104], [137, 100], [143, 100], [140, 104], [140, 96], [136, 104]]) w.shark(i, j)
    w.round(); w.clearSharks()
    for (const [i, j] of [[112, 100], [108, 104], [104, 96], [112, 104], [137, 100], [143, 100], [140, 104], [140, 96], [136, 104]]) w.shark(i, j)
    Object.assign(shallow, { cellI: 108, cellJ: 100 }); Object.assign(deep, { cellI: 140, cellJ: 100 })
    w.round()
    const of = (p) => w.sharks().filter((s) => s.role > 0 && s.target === p.address)
    assert.ok(of(shallow).length <= 1, 'shallow cap')
    assert.equal(of(deep).length, 2, 'deep pack of two')
    assert.equal(of(deep).filter((s) => s.role === 1).length, 1)
    invariants(w)
    // Crowd: 4 players out of the raft → +1 hunter each.
    const c = world(11)
    const home = [[140, 100], [60, 100], [100, 140], [100, 60]]
    const ps = ['a', 'b', 'c', 'd'].map((n, k) => c.player(n, ...home[k]))
    c.round(); c.clearSharks()
    for (const [i, j] of [[143, 100], [140, 104], [137, 100], [140, 96], [144, 104]]) c.shark(i, j)
    ps.forEach((p, k) => Object.assign(p, { dead: false, cellI: home[k][0], cellJ: home[k][1] }))
    c.round()
    assert.equal(c.sharks().filter((s) => s.role > 0 && s.target === 'a').length, 3, 'crowd bonus makes a pack of three')
    invariants(c)
  })

  test('Bruce runs his lane straight through you when he can line up', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    w.shark(143, 100)
    Object.assign(p, { cellI: 140, cellJ: 100 })
    w.round()
    const bruce = w.sharks().find((s) => s.role === 1 && s.target === 'alice')
    assert.ok(bruce, 'a chaser is assigned')
    const lane = []
    for (let k = 0; k <= bruce.len; k++) lane.push(KEY(bruce.cellI + bruce.dirX * k, bruce.cellJ + bruce.dirZ * k))
    assert.ok(lane.includes(KEY(140, 100)), 'lane covers the player')
    assert.equal(bruce.len, 3, 'overshoots: full lunge')
  })

  test('lanes are walls: paths through a lane are rejected, around it accepted', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    const s = w.shark(141, 99)
    Object.assign(s, { dirX: 0, dirZ: 1, len: 3 }) // lane (141,99)→(141,102)
    Object.assign(p, { cellI: 140, cellJ: 100 })
    w.send('plan', { steps: [3] }) // right into (141,100): lane cell
    assert.equal(p.path.length, w.LANES_BLOCK_PATHS ? 0 : 1)
    w.send('plan', { steps: [0, 0] }) // up twice, clear
    assert.equal(p.path.length, 2)
  })

  test('fresh sharks get a sighting turn: no hunting, never in anyone\'s reach', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round()
    const born = w.sharks()
    for (const s of born) {
      // all of these surfaced this round
      assert.ok(Math.max(Math.abs(s.cellI - p.cellI), Math.abs(s.cellJ - p.cellJ)) >= w.SPAWN_MIN, 'spawned too close')
      assert.equal(s.role, 0, 'fresh shark hunting')
      for (let k = 0; k <= s.len; k++) {
        const d = Math.abs(s.cellI + s.dirX * k - p.cellI) + Math.abs(s.cellJ + s.dirZ * k - p.cellJ)
        assert.ok(d > p.maxSteps, 'fresh lane in reach')
      }
    }
  })

  test('harpoon: tags the nearest shark, shortens its lane, three barrels sink it', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    const s = w.shark(142, 100)
    Object.assign(s, { dirX: 1, dirZ: 0, len: 3, role: 1, target: 'alice' })
    Object.assign(p, { cellI: 140, cellJ: 100, barrels: 3 })
    w.send('harpoon')
    assert.equal(p.barrels, 2); assert.equal(s.barrels, 1); assert.ok(s.len <= w.BARREL_LUNGE); assert.equal(s.role, 0)
    assert.ok(s.tagUntilTurn > w.turn())
    w.round(); assert.equal(s.role, 0, 'tagged shark does not hunt')
    Object.assign(p, { cellI: s.cellI - 1, cellJ: s.cellJ, dead: false })
    w.send('harpoon'); Object.assign(p, { cellI: s.cellI - 1, cellJ: s.cellJ })
    const score = p.score
    w.send('harpoon')
    assert.equal(s.active, false); assert.equal(p.sharksKilled, 1); assert.equal(p.score, score + w.SHARK_BOUNTY)
  })

  test('chum pulls nearby sharks off you for its turns, then lets go', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    w.shark(144, 100); w.shark(140, 104)
    Object.assign(p, { cellI: 140, cellJ: 100, chum: 1 })
    w.send('dropChum'); assert.equal(p.chum, 0)
    p.cellI = 136 // swim away
    w.round()
    const lured = w.sharks().filter((s) => s.target === 'chum')
    assert.ok(lured.length >= 1, 'sharks go for the chum')
    assert.equal(w.sharks().filter((s) => s.target === 'alice').length, 0)
    w.round(); w.round()
    assert.equal([...w.Chum.values.values()].filter((c) => c.active).length, 0, 'chum expired')
  })

  test('a blasted hunter that resurfaces at once is fresh: no hunt carried over', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    const s = w.shark(143, 100)
    Object.assign(p, { cellI: 140, cellJ: 100 })
    w.round()
    assert.equal(s.target, 'alice')
    // A mine takes it out; the same pool slot surfaces again this tick.
    Object.assign(p, { cellI: 140, cellJ: 100, mines: 0 })
    w.clearSharks(); Object.assign(s, { active: true, cellI: 143, cellJ: 100, len: 0 })
    const mine = [...w.Mine.values.values()].find((m) => !m.active)
    Object.assign(mine, { active: true, cellI: 143, cellJ: 99, owner: 'alice', detonateTurn: w.turn() + 1, exploded: false })
    p.cellI = 136
    w.round()
    assert.ok(w.sharks().every((f) => f.role === 0), 'no shark hunts on its first turn after (re)surfacing')
  })

  test('chum takes the lured sharks off the dropper (no instant refill)', () => {
    const w = world(5)
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    for (const [i, j] of [[143, 100], [140, 104], [137, 100], [140, 96], [144, 104], [136, 96]]) w.shark(i, j)
    Object.assign(p, { cellI: 140, cellJ: 100 })
    w.round()
    assert.equal(w.sharks().filter((s) => s.target === 'alice').length, 2)
    Object.assign(p, { chum: 1 })
    w.send('dropChum')
    const sf = safety(w, p)
    const away = sf.ends.find(([i, j]) => i !== p.cellI || j !== p.cellJ)
    w.send('plan', { steps: pathTo(w, p, away, sf.walls) })
    w.round()
    assert.equal(p.dead, false, 'swam to a safe cell')
    const lured = w.sharks().filter((s) => s.target === 'chum').length
    const pack = w.sharks().filter((s) => s.target === 'alice').length
    assert.ok(lured >= 1, 'chum lures')
    assert.ok(pack <= Math.max(0, 2 - lured), `dropper keeps ${pack} hunters with ${lured} lured`)
  })

  test('blood in the water and named deaths', () => {
    const w = world()
    const p = w.player('alice', 140, 100)
    w.round(); w.clearSharks()
    const s = w.shark(141, 100)
    Object.assign(s, { dirX: -1, dirZ: 0, len: 2, role: 1, target: 'alice' })
    Object.assign(p, { cellI: 140, cellJ: 100, extraLives: 1 })
    w.tick(w.PLAYERS_TIME); w.tick(w.SHARKS_TIME)
    assert.equal(p.dead, false); assert.ok(p.bloodUntilTurn > w.turn(), 'bleeding after a jacket save')
    w.clearSharks()
    const t = w.shark(p.cellI + 1, p.cellJ)
    Object.assign(t, { dirX: -1, dirZ: 0, len: 2, role: 2, target: 'alice' })
    w.tick(w.PLAYERS_TIME); w.tick(w.SHARKS_TIME)
    assert.equal(p.dead, true); assert.equal(p.deathCause, 'shark'); assert.equal(p.killedBy, 'tiger')
  })

  // Fuzz: many players at all depths (edges and corners too), a mix of
  // careful and careless swimmers, hundreds of rounds. Invariants every round.
  test('fuzz: floor, caps, no overlaps, server accepts every wall-aware plan', () => {
    const stats = { rounds: 0, playerRounds: 0, bites: 0, onChaserLine: 0, hunted: 0, safeSum: 0 }
    for (const seed of [3, 17, 29, 41, 53]) {
      const w = world(seed)
      const spots = [['p1', 120, 100], ['p2', 1, 1], ['p3', 199, 100], ['p4', 100, 150], ['p5', 160, 160], ['p6', 104, 104]]
      const ps = spots.map(([n, i, j]) => w.player(n, i, j))
      for (let r = 0; r < 120; r++) {
        invariants(w)
        stats.rounds++
        for (const p of ps) {
          if (p.dead) {
            stats.bites++
            const [, i, j] = spots[ps.indexOf(p)]
            Object.assign(p, { dead: false, cellI: i, cellJ: j, extraLives: 0 })
            continue
          }
          stats.playerRounds++
          const sf = safety(w, p)
          stats.safeSum += sf.after
          const hunters = w.sharks().filter((s) => s.role > 0 && s.target === p.address)
          if (hunters.length) stats.hunted++
          if (sf.danger.has(KEY(p.cellI, p.cellJ)) && hunters.some((s) => s.role === 1)) stats.onChaserLine++
          // 80% careful (pick a safe end), 20% careless (random reachable cell).
          const careful = w.rand() < 0.8
          const pool = careful ? sf.ends : [[p.cellI, p.cellJ], ...sf.ends]
          const target = pool[Math.floor(w.rand() * pool.length)] ?? [p.cellI, p.cellJ]
          const steps = pathTo(w, p, target, sf.walls)
          w.send('plan', { steps }, p.address)
          assert.equal(p.path.length, steps.length, 'server rejected a wall-aware plan')
        }
        w.round()
      }
    }
    console.log(`     model, not a playtest: ${stats.playerRounds} player-rounds, ` +
      `${(100 * stats.bites / stats.playerRounds).toFixed(1)} bites/100, ` +
      `hunted ${(100 * stats.hunted / stats.playerRounds).toFixed(0)}% of rounds, ` +
      `on Bruce's line ${(100 * stats.onChaserLine / stats.playerRounds).toFixed(0)}%, ` +
      `avg safe end cells ${(stats.safeSum / stats.playerRounds).toFixed(1)}`)
  })

  console.log(checks.length + ' shark scenarios passed.')
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
