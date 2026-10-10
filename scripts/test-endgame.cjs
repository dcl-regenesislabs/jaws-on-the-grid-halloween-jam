// Run the real server module against an in-memory ECS/transport, no live wallet.
// This checks game rules; it does not replace the phone/rendering smoke pass.
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

async function main() {
  const result = await build({
    stdin: { contents: `export { initServer } from './src/server/game'; export * from './src/shared/config'; export * from './src/shared/components'; export * from 'test-harness';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'ecs-memory', setup(b) {
      b.onResolve({ filter: /^(@dcl\/sdk|test-harness)/ }, () => ({ path: 'sdk', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'ts' }))
    }}]
  })
  // Cells are written as offsets from the board centre so the scenarios follow GRID.
  let C
  function world() {
    const box = { module: { exports: {} }, console: { log() {}, error: console.error }, Math: Object.create(Math) }
    let seed = 73
    box.Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    vm.runInNewContext(result.outputFiles[0].text, box)
    const w = box.module.exports
    C = w.CENTER_CELL
    // The raft scenario puts a swimmer on the first raft row (C - 3) and mines just west of it.
    assert.equal(w.HARBOR_MIN, C - 3); assert.equal(w.HARBOR_MAX, C + 2)
    w.initServer()
    w.tick = dt => w.systems.forEach(f => f(dt))
    w.player = (address = 'alice', i = C + 10, j = C + 10) => {
      const e = w.engine.addEntity()
      w.PlayerIdentityData.create(e, { address, isGuest: false })
      w.tick(0)
      const slot = [...w.PlayerSlot.values.values()].find(p => p.address === address)
      Object.assign(slot, { cellI: i, cellJ: j })
      return slot
    }
    w.send = (name, data = {}, from = 'alice') => w.handlers.get(name)(data, { from })
    w.round = () => { w.tick(w.PLAYERS_TIME); w.tick(w.SHARKS_TIME) }
    w.pickup = (kind, i, j) => {
      const p = [...w.Pickup.values.values()].find(p => !p.active)
      Object.assign(p, { kind, cellI: i, cellJ: j, value: 10, active: true })
      return p
    }
    w.clearSharks = () => { for (const s of w.Shark.values.values()) s.active = false }
    w.activeMines = () => [...w.Mine.values.values()].filter(m => m.active && !m.exploded)
    return w
  }
  const checks = []
  function test(name, f) { f(world()); checks.push(name); console.log('PASS', name) }

  test('shark ending locks actions and early respawn while survivors keep playing', w => {
    const p = w.player(); p.mines = 2
    const survivor = w.player('bob', C + 15, C + 15)
    w.clearSharks()
    const shark = [...w.Shark.values.values()][0]
    Object.assign(shark, { active: true, cellI: C + 9, cellJ: C + 10, dirX: 1, dirZ: 0, len: 1 })
    w.round()
    assert.equal(p.dead, true); assert.equal(p.deathCause, 'shark')
    const score = p.score
    w.send('respawn'); assert.equal(p.dead, true)
    w.send('plan', { steps: [0] }); assert.equal(p.path.length, 0)
    w.send('plantMine'); assert.equal(p.mines, 2)
    w.clearSharks(); w.send('plan', { steps: [0] }, 'bob'); w.round()
    assert.equal(survivor.cellJ, C + 16); assert.equal(p.cellJ, C + 10); assert.equal(p.score, score)
    w.tick(w.SHARK_ENDING_TIME - 4 - 0.05)
    w.send('respawn'); assert.equal(p.dead, true)
    w.tick(0.1); w.send('respawn'); assert.equal(p.dead, false)
    assert.equal(w.inHarbor(p.cellI, p.cellJ), true)
  })

  test('planning lasts 3 seconds and rejects invalid/fractional paths', w => {
    const p = w.player()
    w.send('plan', { steps: [0.5] }); assert.equal(p.path.length, 0)
    w.send('plan', { steps: [0, 0, 0] }); assert.equal(p.path.length, 0)
    w.send('plan', { steps: [0, 3] }); assert.equal(p.path.length, 2)
    w.tick(2.1); assert.equal(p.cellI, C + 10)
    w.tick(0.9); assert.equal(p.cellI, C + 11); assert.equal(p.cellJ, C + 11)
  })
  test('mine requires inventory, open water, verified living owner and planning phase', w => {
    const p = w.player()
    w.send('plantMine'); assert.equal(w.activeMines().length, 0)
    p.mines = 3; p.dead = true; w.send('plantMine'); assert.equal(p.mines, 3)
    p.dead = false; p.cellI = C; p.cellJ = C; w.send('plantMine'); assert.equal(p.mines, 3)
    p.cellI = C + 10; p.cellJ = C + 10; w.send('plantMine', {}, 'intruder'); assert.equal(p.mines, 3)
    w.send('plantMine'); assert.equal(p.mines, 2)
    w.send('plantMine'); assert.equal(p.mines, 2); assert.equal(w.activeMines().length, 1)
    p.cellI++; w.tick(3); w.send('plantMine'); assert.equal(p.mines, 2)
  })
  test('fuse survives first round, kills center/cardinals on second, leaves diagonal and distance 2 alive', w => {
    const p = w.player(); p.mines = 1; p.extraLives = 2
    const cardinal = w.player('bob', C + 11, C + 10)
    const diagonal = w.player('cara', C + 11, C + 11)
    const distant = w.player('dan', C + 12, C + 10)
    w.send('plantMine')
    w.round(); assert.equal(p.dead, false); assert.equal(w.activeMines().length, 1)
    w.clearSharks(); w.round()
    assert.equal(p.dead, true); assert.equal(p.deathCause, 'mine'); assert.equal(p.extraLives, 2)
    assert.equal(cardinal.dead, true); assert.equal(diagonal.dead, false); assert.equal(distant.dead, false)
    assert.equal(w.activeMines().length, 0)
  })
  test('mine hits shark final cell, awards bounty once, and cannot blast the raft', w => {
    const p = w.player('alice', C - 4, C); p.mines = 2
    const safe = w.player('bob', C - 3, C)
    w.send('plantMine'); p.cellJ = C + 1; w.send('plantMine')
    w.round(); w.clearSharks()
    const shark = [...w.Shark.values.values()][0]
    Object.assign(shark, { active: true, cellI: C - 6, cellJ: C, dirX: 1, dirZ: 0, len: 2 })
    p.cellI = C - 10; p.cellJ = C - 10
    w.round()
    assert.equal(p.sharksKilled, 1); assert.ok(p.score >= 75); assert.equal(safe.dead, false)
    assert.equal(shark.active && shark.cellI === C - 4 && shark.cellJ === C, false)
  })
  test('boost gives exactly five future four-step plans and refreshes on collection', w => {
    const p = w.player()
    w.pickup('boost', C + 10, C + 11); w.send('plan', { steps: [0] }); w.round()
    for (let n = 0; n < 5; n++) {
      assert.equal(p.maxSteps, 4, 'boost round ' + n)
      w.clearSharks(); w.round()
    }
    assert.equal(p.maxSteps, 2)
    w.pickup('boost', p.cellI, p.cellJ + 1); w.send('plan', { steps: [0] }); w.round()
    assert.equal(p.maxSteps, 4)
  })
  test('inventory caps leave excess pickups, jackets save one bite, death clears gear on respawn', w => {
    const p = w.player(); p.mines = w.MINE_CAPACITY; p.extraLives = w.JACKET_CAPACITY
    const mine = w.pickup('mine', C + 10, C + 11); const life = w.pickup('life', C + 10, C + 12)
    w.send('plan', { steps: [0, 0] }); w.round()
    assert.equal(mine.active, true); assert.equal(life.active, true)
    w.clearSharks()
    const shark = [...w.Shark.values.values()][0]
    Object.assign(shark, { active: true, cellI: C + 9, cellJ: C + 12, dirX: 1, dirZ: 0, len: 1 })
    w.round(); assert.equal(p.dead, false); assert.equal(p.extraLives, 1)
    p.dead = true; p.boostUntilTurn = 99; p.maxSteps = 4
    const score = p.score; w.send('respawn')
    assert.equal(p.mines, 0); assert.equal(p.extraLives, 0); assert.equal(p.maxSteps, 2); assert.equal(p.score, score)
    assert.equal(w.inHarbor(p.cellI, p.cellJ), true)
  })
  test('contract rewards are one-time and full completion advances expedition', w => {
    const p = w.player('alice', C, C)
    p.coinsCollected = 5; w.round(); assert.equal(p.score, 100)
    w.round(); assert.equal(p.score, 100)
    p.sharksKilled = 1; p.deepestTier = 1; w.round()
    assert.equal(p.score, 375); assert.equal(p.objectiveLevel, 1); assert.equal(p.objectiveMask, 0)
    assert.equal(p.coinsCollected, 0); assert.equal(p.sharksKilled, 0)
  })
  console.log(checks.length + ' server scenarios passed.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
