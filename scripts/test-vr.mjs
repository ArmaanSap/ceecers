import assert from 'node:assert/strict';
import {PanoramaVR,cylinderUV,controllerStep,vrSupport} from '../dist/vr.js';
assert.deepEqual(cylinderUV([0,0,-1],8),[.5,.5]);
assert.equal(cylinderUV([1,0,0],8)[0],.75);
assert.equal(cylinderUV([-1,0,0],8)[0],.25);
assert(cylinderUV([0,1,-1],8)[1]<0); // No invented zenith coverage.
assert(cylinderUV([0,-1,-1],8)[1]>1);
assert.equal(controllerStep('left'),-1);assert.equal(controllerStep('right'),1);
assert(!(await vrSupport({},true)).ok);assert(!(await vrSupport({},false)).ok);
assert((await vrSupport({xr:{isSessionSupported:async()=>true}},true)).ok);
assert(!(await vrSupport({xr:{isSessionSupported:async()=>{throw Error()}}},true)).ok);
// Mock the WebXR lifecycle, not a claim of headset/GPU validation.
let ended=0,draws=0,uploads=0,deleted=0;
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>4096,makeXRCompatible:async()=>{},drawArrays:()=>draws++,texImage2D:()=>uploads++},{get:(o,k)=>k in o?o[k]:k.startsWith('delete')?()=>deleted++:k===k.toUpperCase()?1:()=>({})});
const ctx=new Proxy({},{get:()=>()=>{}});
globalThis.document={createElement:()=>({width:0,height:0,getContext:t=>t==='2d'?ctx:gl})};
globalThis.Image=class{naturalWidth=3200;naturalHeight=400;set src(v){queueMicrotask(()=>v==='bad'?this.onerror():this.onload())}};
function session(){const handlers={};return {handlers,addEventListener:(k,f)=>handlers[k]=f,requestReferenceSpace:async()=>({addEventListener:()=>{}}),updateRenderState:()=>{},requestAnimationFrame:()=>{},end:async()=>{ended++;handlers.end?.()}}}
let current=session();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{xr:{requestSession:async()=>current}}});
globalThis.XRWebGLLayer=class{framebuffer={};getViewport(){return {x:0,y:0,width:500,height:500}}};
const changed=[];const viewer=new PanoramaVR({onChange:p=>changed.push(p.id)});
const views=[{id:1,name:'First',image:'ok',sol:1,routeMeters:0},{id:2,name:'Missing',image:'bad',sol:2,routeMeters:10},{id:3,name:'Last',image:'ok',sol:3,routeMeters:20}];
await viewer.enter(views);assert.equal(viewer.session,current);assert.equal(viewer.busy,false);assert.deepEqual(changed,[1]);
await viewer.step(1);assert.deepEqual(changed,[1,3]);assert(viewer.failed.has(2));assert.equal(viewer.index,2);
await viewer.step(1);assert.equal(viewer.index,2);
await viewer.step(-1);assert.equal(viewer.index,0);assert.deepEqual(changed,[1,3,1]);
const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
viewer.frame(0,{session:current,getViewerPose:()=>({transform:{matrix:identity},views:[{projectionMatrix:identity,transform:{matrix:identity}},{projectionMatrix:identity,transform:{matrix:identity}}]})});assert.equal(draws,2);
await viewer.exit();assert.equal(viewer.session,null);assert.equal(ended,1);assert(deleted>0);assert(uploads>2);
current=session();await viewer.enter(views,2);assert.equal(viewer.index,2);await viewer.exit();assert.equal(ended,2);
navigator.xr.requestSession=async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'})};
await assert.rejects(viewer.enter(views),{name:'NotAllowedError'});assert.equal(viewer.session,null);assert.equal(viewer.starting,false);
console.log('VR checks passed: projection, support detection, stereo draw calls, next/previous, missing images, cleanup, re-entry, permission denial.');
