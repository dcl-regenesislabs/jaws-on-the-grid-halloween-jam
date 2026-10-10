// Admin commands against the real server modules (in-memory ECS, same
// harness as test-bots.cjs): only ADMINS are obeyed, the bot count follows
// the admin within BOT_MAX, and a reset puts every swimmer back on a clean
// raft without breaking the bots.
//
//   node scripts/test-admin.cjs
const { build } = require('esbuild')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const mock = `
export const components = new Map(); export const handlers = new Map(); export const systems = [];
export const stored = new Map();
let id = 1000;
function component(name) {
  const values = new Map();
  const c = { componentId: name, values, create(e,v) { values.set(e, v); return v },
    createOrReplace(e,v) { values.set(e, v); return v },
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
export const Storage = { get: async (k) => stored.get(k) ?? null, set: async (k, v) => { stored.set(k, v); return true } };
export const syncEntity = () => {};
export const registerMessages = () => ({ onMessage: (name, f) => handlers.set(name,f), send() {} });
`

const ADMIN = '0x481bed8645804714efd1de3f25467f78e7ba07d6'

async function main() {
  const result = await build({
    stdin: {
      contents: `export { initServer } from './src/server/game'; export { initBots } from './src/server/bots'; export { initAdmin } from './src/server/admin'; export { AdminState } from './src/shared/admin'; export * from './src/shared/config'; export * from './src/shared/components'; export * from 'test-harness';`,
      resolveDir: process.cwd()
    },
    bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'ecs-memory', setup(b) {
      b.onResolve({ filter: /^(@dcl\/sdk|test-harness)/ }, () => ({ path: 'sdk', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'ts' }))
    }}]
  })

  let seed = 4242
  const logs = []
  const box = { module: { exports: {} }, console: { log: (...a) => logs.push(a.join(' ')), error: console.error }, Math: Object.create(Math) }
  box.Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  vm.runInNewContext(result.outputFiles[0].text, box)
  const w = box.module.exports
  w.initServer()
  w.initBots()
  w.initAdmin()
  const run = async (seconds) => {
    for (let t = 0; t < seconds; t += 0.05) w.systems.forEach((f) => f(0.05))
    await new Promise((r) => setImmediate(r)) // let Storage promises settle
  }
  const send = (name, data, from) => w.handlers.get(name)(data, { from })
  const slots = () => [...w.PlayerSlot.values.values()]
  const bots = () => slots().filter((s) => s.address !== 'alice' && s.address !== ADMIN)
  const admin = () => [...w.AdminState.values.values()][0]

  for (const address of ['alice', ADMIN]) w.PlayerIdentityData.create(w.engine.addEntity(), { address, isGuest: false })
  await run(30)
  assert.equal(bots().length, w.BOT_COUNT, 'BOT_COUNT bots after 30 s')
  assert.equal(admin().bots, w.BOT_COUNT)
  console.log(`PASS starts with BOT_COUNT (${w.BOT_COUNT}) bots`)

  send('adminBots', { count: 3 }, 'alice')
  send('adminReset', {}, 'alice')
  await run(20)
  assert.equal(bots().length, w.BOT_COUNT, 'a non-admin cannot change the bot count')
  assert.equal(admin().resets, 0, 'a non-admin cannot reset')
  assert.ok(logs.some((l) => l.includes('[admin] REJECTED')))
  console.log('PASS non-admin commands are ignored')

  send('adminBots', { count: 3 }, ADMIN.toUpperCase().replace('0X', '0x')) // mixed case still counts
  await run(0.1)
  assert.equal(bots().length, 3, 'down to 3 at once')
  assert.equal(admin().bots, 3)
  send('adminBots', { count: 6 }, ADMIN)
  await run(15)
  assert.equal(bots().length, 6, 'up to 6 within 15 s')
  send('adminBots', { count: 99 }, ADMIN)
  await run(15)
  assert.equal(bots().length, w.BOT_MAX, 'capped at BOT_MAX')
  send('adminBots', { count: -5 }, ADMIN)
  await run(0.1)
  assert.equal(bots().length, 0, 'floored at 0')
  await run(60)
  assert.equal(bots().length, 0, 'stays at 0')
  console.log(`PASS admin sets the bot count (0..${w.BOT_MAX}), applied at once or within seconds`)

  // The choice survives a server restart (stored), read on boot.
  const stored = w.stored.get('bot-count')
  assert.equal(stored, '0')
  send('adminBots', { count: 4 }, ADMIN)
  await run(15)
  assert.equal(w.stored.get('bot-count'), '4')
  console.log('PASS bot count stored for restarts')

  // Play a while so there is something to wipe.
  await run(120)
  const alice = slots().find((s) => s.address === 'alice')
  Object.assign(alice, { cellI: 112, cellJ: 112, score: 500, mines: 2, extraLives: 1, objectiveLevel: 2, deepestTier: 3 })
  while ([...w.GameState.values.values()][0].phase !== 'players') await run(0.05)
  w.handlers.get('plantMine')({}, { from: 'alice' })
  const before = [...w.Mine.values.values()].filter((m) => m.active).length
  assert.ok(before >= 1, 'a mine is out before the reset')
  send('adminReset', {}, ADMIN)
  for (const s of slots()) {
    assert.ok(w.inHarbor(s.cellI, s.cellJ), `${s.address} on the raft`)
    assert.equal(s.score, 0)
    assert.equal(s.dead, false)
    assert.equal(s.mines + s.extraLives + s.barrels + s.chum + s.objectiveLevel + s.deepestTier, 0)
  }
  const cells = new Set(slots().map((s) => `${s.cellI},${s.cellJ}`))
  assert.equal(cells.size, slots().length, 'everyone on a different raft cell')
  assert.equal([...w.Mine.values.values()].filter((m) => m.active).length, 0, 'mines cleared')
  assert.equal([...w.GameState.values.values()][0].phase, 'players')
  assert.equal(admin().resets, 1)
  console.log('PASS reset: everyone on the raft, scores/gear/contracts cleared, mines gone')

  const rejectedBefore = logs.filter((l) => l.includes('plan REJECTED')).length
  await run(90)
  assert.equal(bots().length, 4, 'bots keep playing after a reset')
  assert.ok(bots().some((s) => !w.inHarbor(s.cellI, s.cellJ)), 'bots swim off the raft again')
  assert.equal(logs.filter((l) => l.includes('plan REJECTED')).length, rejectedBefore, 'no rejected plans after the reset')
  console.log('PASS bots play on after a reset')
  console.log('6 admin scenarios passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
