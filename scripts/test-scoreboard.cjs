// Real leaderboard module with in-memory ECS/storage: persistence, concurrent
// saves, failed reads/writes, and recovery. No claim about client rendering.
const { build } = require('esbuild')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const mock = `
export const values = new Map();
let next = 0;
export const engine = { addEntity: () => ++next, defineComponent: name => ({
 componentId: name, validateBeforeChange() {}, create: (e,v) => values.set(e,v),
 getMutable: e => values.get(e)
}) };
export const Schemas = { String: 0, Int: 0, Boolean: 0, Color3: 0, Array: x => x, Map: x => x };
export const syncEntity = () => {};
export const AUTH_SERVER_PEER_ID = 'server';
export const storage = { raw: null, failRead: false, failWrite: false, writes: 0 };
export const Storage = {
 get: async () => { if(storage.failRead) throw Error('read failed'); return storage.raw },
 set: async (_,raw) => { storage.writes++; if(storage.failWrite) return false; storage.raw=raw; return true }
};
`
const flush = () => new Promise(resolve => setImmediate(resolve))
async function main() {
 const bundle = await build({stdin:{contents:"export * from './src/server/leaderboard'; export * from 'test-harness';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'memory-sdk',setup(b){
 b.onResolve({filter:/^(@dcl\/sdk|test-harness)/},()=>({path:'sdk',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'ts'}));
 }}]})
 const box={module:{exports:{}},console:{error(){}}};vm.runInNewContext(bundle.outputFiles[0].text,box)
 const w=box.module.exports;w.initLeaderboard(1);await flush()
 const state=()=>Array.from(w.values.values())[0]
 assert.equal(state().status,'ready');assert.equal(state().entries.length,0)
 w.saveLeaderboardScore('Alice',30);w.saveLeaderboardScore('Bob',60);w.saveLeaderboardScore('Alice',10);await flush()
 assert.equal(JSON.stringify(state().entries),JSON.stringify([{name:'Bob',score:60},{name:'Alice',score:30}]))
 for(let n=0;n<12;n++) w.saveLeaderboardScore('P'+n,n*10)
 await flush();assert.equal(state().entries.length,10);assert.equal(state().entries[0].score,110)
 const saved=w.storage.raw, writes=w.storage.writes
 w.storage.failRead=true;w.saveLeaderboardScore('Read failure',900);await flush()
 assert.equal(state().status,'error');assert.equal(w.storage.raw,saved);assert.equal(w.storage.writes,writes)
 w.storage.failRead=false;w.storage.failWrite=true;w.saveLeaderboardScore('Write failure',900);await flush()
 assert.equal(state().status,'error');assert.equal(w.storage.raw,saved)
 w.storage.failWrite=false;w.saveLeaderboardScore('Recovered',200);await flush()
 assert.equal(state().status,'ready');assert.equal(state().entries[0].name,'Recovered')
 const savedAgain=w.storage.raw;w.storage.raw='{broken';const before=w.storage.writes
 w.saveLeaderboardScore('Bad data',1000);await flush();assert.equal(w.storage.writes,before);assert.equal(state().status,'error')
 w.storage.raw=savedAgain
 console.log('PASS: empty/load, best-score ranking, concurrent saves, top ten, read/write failure safety, recovery, invalid stored data')
}
main().catch(e=>{console.error(e);process.exitCode=1})
