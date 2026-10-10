// Exercise the real cinematic state machine without claiming renderer coverage.
const { build } = require('esbuild')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const mock = `
export const components = new Map(), systems = []; let id = 100;
function component(name) {
 const values = new Map();
 const c = { values, create(e, v) { values.set(e, name === 'Transform' ? {position:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},rotation:{x:0,y:0,z:0,w:1},...v} : v); },
 get(e) { if(!values.has(e)) throw Error(name+':'+e); return values.get(e); },
 getMutable(e) { return c.get(e); }, deleteFrom(e) { values.delete(e); } };
 c.createOrReplace=c.create; components.set(name,c); return c;
}
export const engine={CameraEntity:2,addEntity:()=>++id,addSystem:f=>systems.push(f)};
export const Transform=component('Transform'), Animator=component('Animator'), AudioSource=component('AudioSource'), AvatarModifierArea=component('AvatarModifierArea'), GltfContainer=component('GltfContainer'), MainCamera=component('MainCamera'), MeshRenderer=component('MeshRenderer'), VirtualCamera=component('VirtualCamera'), VideoPlayer=component('VideoPlayer'), ParticleSystem=component('ParticleSystem');
export const PBParticleSystem_PlaybackState={PS_STOPPED:0,PS_PLAYING:1};
ParticleSystem.Shape={Cone:v=>v};
export const VideoState={VS_PLAYING:4,VS_ERROR:7};
export const videoEventsSystem={callbacks:new Map(),registerVideoEventsEntity(e,cb){this.callbacks.set(e,cb)}};
Animator.playSingleAnimation=(e,clip)=>{const a=Animator.get(e); a.plays=(a.plays||0)+1; a.states[0].playing=true};
AudioSource.playSound=e=>{const a=AudioSource.get(e); a.plays=(a.plays||0)+1};
MeshRenderer.setPlane=()=>{};
export const materials=new Map(); export const Material={setBasicMaterial(e,v){materials.set(e,v)},Texture:{Common:v=>v,Video:v=>v}};
export const AvatarModifierType={AMT_HIDE_AVATARS:0};
VirtualCamera.Transition={Time:t=>({time:t})};
`
const state = `export const slot={dead:false,deathCause:'',cellI:110,cellJ:110}; export const pendingPlan={active:true}; export function mySlot(){return slot}`
async function main() {
 const result=await build({stdin:{contents:"export * from './src/client/cinematic'; export * from 'test-ecs'; export * from 'test-state';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'cinema-harness',setup(b){
  b.onResolve({filter:/^(@dcl\/sdk\/ecs|test-ecs)$/},()=>({path:'ecs',namespace:'mock'}))
  b.onResolve({filter:/^(\.\/state|test-state)$/},()=>({path:'state',namespace:'mock'}))
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='ecs'?mock:state,loader:'ts'}))
 }}]})
 const box={module:{exports:{}},console:{log(){}}}; vm.runInNewContext(result.outputFiles[0].text,box)
 const w=box.module.exports
 const cam=w.engine.addEntity(); w.VirtualCamera.create(cam,{})
 w.MainCamera.create(2,{virtualCameraEntity:cam}); w.initCinematic(cam)
 const tick=dt=>w.systems.forEach(f=>f(dt))
 const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)tick(1/60)}
 tick(0); assert.equal(w.cinema.active,false)
 w.slot.dead=true; w.slot.deathCause='mine'; advance(10)
 assert.equal(w.cinema.active,false,'mine keeps its existing ending')
 w.slot.dead=false; tick(0)
 w.slot.dead=true; w.slot.deathCause='shark'; tick(0)
 assert.equal(w.cinema.active,true); assert.equal(w.pendingPlan.active,false)
 assert.equal(w.MainCamera.get(2).virtualCameraEntity,cam,'opening fade uses game camera')
 advance(.6)
 assert.notEqual(w.MainCamera.get(2).virtualCameraEntity,cam)
 assert.equal(w.AvatarModifierArea.values.size,1)
 const video=[...w.VideoPlayer.values.entries()][0]; assert.equal(video[1].playing,true)
 assert.equal(video[1].loop,true)
 w.videoEventsSystem.callbacks.get(video[0])({state:w.VideoState.VS_PLAYING})
 assert.equal(w.materials.get(video[0]).texture.videoPlayerEntity,video[0])
 w.videoEventsSystem.callbacks.get(video[0])({state:w.VideoState.VS_ERROR})
 assert.ok(w.materials.get(video[0]).texture.src.endsWith('.png'),'failed video retains ocean still')
 assert.ok([...w.ParticleSystem.values.values()].every(p=>p.playbackState===1))
 advance(5.8); assert.equal(w.cinema.swallowed,false); assert.equal(w.cinema.ready,false)
 advance(.25); assert.equal(w.cinema.swallowed,true); assert.equal(w.cinema.ready,false)
 const sound=[...w.AudioSource.values.values()][0]; assert.equal(sound.plays,1)
 advance(3); assert.equal(w.cinema.ready,true); assert.equal(w.cinema.black,1)
 assert.equal(w.VideoPlayer.get(video[0]).playing,false)
 assert.ok([...w.ParticleSystem.values.values()].every(p=>p.playbackState===0),'effects stop at results')
 advance(5); assert.equal(sound.plays,1,'bite does not repeat on later global turns')
 w.slot.dead=false; tick(0)
 assert.equal(w.cinema.active,false); assert.equal(w.cinema.ready,false)
 assert.equal(w.AvatarModifierArea.values.size,0)
 assert.equal(w.MainCamera.get(2).virtualCameraEntity,cam)
 advance(.7); assert.equal(w.cinema.black,0)
 w.slot.dead=true; tick(0)
 assert.equal(w.cinema.swallowed,false); assert.equal(w.cinema.elapsed,0)
 assert.equal([...w.Animator.values.values()][0].plays,2,'second death restarts animation')
 tick(12); assert.equal(w.cinema.ready,true,'large frame gap still completes safely')
 console.log('PASS cinematic: shark/mine routing, fade/camera, avatar hide, one bite, delayed results, respawn cleanup, repeat death, long frame')
}
main().catch(e=>{console.error(e);process.exitCode=1})
