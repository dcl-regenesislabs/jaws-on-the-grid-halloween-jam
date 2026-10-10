// Bots against the real server module (in-memory ECS, same harness idea as
// test-sharks.cjs). Simulates several worlds for a while and checks that
// bots join, look like players, only act through legal plans, survive until
// their time is up, then lose and swim again or get replaced. Says nothing
// about whether people take them for players.
//
//   node scripts/test-bots.cjs [minutes=16] [worlds=6]
//   BOTS=8 node scripts/test-bots.cjs   (overrides BOT_COUNT for this run)
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

const MINUTES = Number(process.argv[2] ?? 16)
const WORLDS = Number(process.argv[3] ?? 6)
const DT = 0.05

async function main() {
  const result = await build({
    stdin: {
      contents: `export { initServer } from './src/server/game'; export { initBots } from './src/server/bots'; export * from './src/shared/config'; export * from './src/shared/components'; export * from 'test-harness';`,
      resolveDir: process.cwd()
    },
    bundle: true, write: false, format: 'cjs', platform: 'node',
    plugins: [{ name: 'ecs-memory', setup(b) {
      b.onResolve({ filter: /^(@dcl\/sdk|test-harness)/ }, () => ({ path: 'sdk', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock, loader: 'ts' }))
    }}]
  })

  const lives = [] // { world, address, name, born, died, cause, killedBy, score, tier }
  const totals = { rejected: 0, joins: 0, leaves: 0, maxBots: 0, minBotsAfterJoin: Infinity, gear: 0 }

  for (let wn = 0; wn < WORLDS; wn++) {
    let seed = 1000 + wn * 7919
    const logs = []
    const box = { module: { exports: {} }, console: { log: (...a) => logs.push(a.join(' ')), error: console.error }, Math: Object.create(Math) }
    box.Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    let code = result.outputFiles[0].text
    if (process.env.BOTS) code = code.replace(/BOT_COUNT = \d+/, `BOT_COUNT = ${Number(process.env.BOTS)}`)
    vm.runInNewContext(code, box)
    const w = box.module.exports
    w.initServer()
    w.initBots()
    const tick = (dt) => w.systems.forEach((f) => f(dt))

    // One real player who stays on the raft (the harness has no client).
    const me = w.engine.addEntity()
    w.PlayerIdentityData.create(me, { address: 'alice', isGuest: false })

    const bots = () => [...w.PlayerSlot.values.entries()].filter(([, s]) => s.address !== 'alice')
    const alive = new Map() // address -> { born, life }
    let clock = 0
    let prevTurn = -1
    for (let t = 0; t < MINUTES * 60; t += DT) {
      tick(DT)
      clock += DT
      const now = bots()
      totals.maxBots = Math.max(totals.maxBots, now.length)
      if (clock > 30) totals.minBotsAfterJoin = Math.min(totals.minBotsAfterJoin, now.length)
      for (const [, s] of now) {
        let life = alive.get(s.address)
        if (!life && !s.dead) {
          // New bot or a respawn: a fresh life on the raft with a full look.
          assert.match(s.address, /^0x[0-9a-f]{40}$/)
          assert.ok(s.wearables.length >= 7, 'wearables')
          assert.ok(s.wearables.every((u) => u.startsWith('urn:decentraland:off-chain:base-avatars:')))
          assert.ok(/Base(Male|Female)$/.test(s.bodyShape))
          assert.ok(w.inHarbor(s.cellI, s.cellJ), 'spawns on the raft')
          life = { world: wn, address: s.address, name: s.name, born: clock, died: -1, depths: [] }
          alive.set(s.address, life)
          lives.push(life)
        }
        if (life && !s.dead && Math.round(clock / DT) % 20 === 0) life.depths.push(w.depthOf(s.cellI, s.cellJ))
        if (life && s.dead && life.died < 0) {
          Object.assign(life, { died: clock, cause: s.deathCause, killedBy: s.killedBy, score: s.score, tier: s.deepestTier })
          alive.delete(s.address)
        }
      }
      // Every bot plan in the slot must be legal (validated server-side).
      const state = [...w.GameState.values.values()][0]
      if (state.turn !== prevTurn) prevTurn = state.turn
    }
    totals.rejected += logs.filter((l) => l.includes('plan REJECTED')).length
    totals.joins += logs.filter((l) => l.startsWith('[bots] joined')).length
    totals.leaves += logs.filter((l) => l.startsWith('[bots] left')).length
    totals.gear += logs.filter((l) => l.includes('mine planted') || l.includes('harpoon')).length
  }

  const done = lives.filter((l) => l.died >= 0)
  const ages = done.map((l) => l.died - l.born)
  const early = done.filter((l) => l.died - l.born < w0().BOT_PLAY_SECONDS - w0().BOT_PLAY_JITTER)
  console.log(`worlds ${WORLDS} × ${MINUTES} min · bot joins ${totals.joins} · leaves ${totals.leaves} · bots max ${totals.maxBots}, min after 30 s ${totals.minBotsAfterJoin}`)
  console.log(`lives ended ${done.length} · age at loss min ${Math.min(...ages).toFixed(0)} s, median ${median(ages).toFixed(0)} s, max ${Math.max(...ages).toFixed(0)} s`)
  console.log(`causes ${JSON.stringify(count(done.map((l) => l.cause + (l.killedBy ? ':' + l.killedBy : ''))))} · deepest tier ${JSON.stringify(count(done.map((l) => l.tier)))}`)
  console.log(`scores at loss median ${median(done.map((l) => l.score)).toFixed(0)} · gear uses ${totals.gear} · plans rejected ${totals.rejected}`)
  const depths = lives.flatMap((l) => l.depths)
  const maxDepth = depths.reduce((a, b) => Math.max(a, b), -Infinity)
  console.log(`depth from raft centre (BOT_MAX_DEPTH ${w0().BOT_MAX_DEPTH}): median ${median(depths)}, max ${maxDepth}, share beyond limit ${(depths.filter((d) => d > w0().BOT_MAX_DEPTH).length / depths.length * 100).toFixed(1)}%`)
  for (const l of early) console.log(`  early loss: world ${l.world} ${l.name} at ${(l.died - l.born).toFixed(0)} s (${l.cause}${l.killedBy ? ':' + l.killedBy : ''})`)

  assert.ok(totals.joins >= WORLDS * 2, 'bots joined')
  assert.equal(totals.rejected, 0, 'a bot plan was rejected')
  assert.ok(totals.maxBots <= w0().BOT_COUNT, 'never more bots than BOT_COUNT')
  assert.ok(done.length >= WORLDS, 'bots lose once their time is up')
  assert.ok(Math.max(...ages) < w0().BOT_PLAY_SECONDS + w0().BOT_PLAY_JITTER + 120, 'a bot took too long to lose')
  console.log(early.length ? `WARN ${early.length} early losses` : 'ok')
}

let cfg
function w0() {
  if (!cfg) {
    const src = require('node:fs').readFileSync('src/shared/config.ts', 'utf8')
    cfg = {}
    for (const k of ['BOT_PLAY_SECONDS', 'BOT_PLAY_JITTER', 'BOT_COUNT', 'BOT_MAX_DEPTH']) cfg[k] = Number(src.match(new RegExp(`${k} = (\\d+)`))[1])
    if (process.env.BOTS) cfg.BOT_COUNT = Number(process.env.BOTS)
  }
  return cfg
}
function median(xs) {
  const a = xs.slice().sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : NaN
}
function count(xs) {
  const o = {}
  for (const x of xs) o[x] = (o[x] ?? 0) + 1
  return o
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
