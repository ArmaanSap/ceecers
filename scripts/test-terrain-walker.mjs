import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {poiExtent,walkerCamera,walkerMessageValid,offsetCoord,EYE_HEIGHT_M} from '../dist/terrain-camera.js';
// ---- pure camera maths ----
const c=[77.42,18.46,-2500];
assert.equal(walkerCamera('free',c,0),null,'free camera is never overridden');
const first=walkerCamera('first',c,90);assert.equal(first.position.z,-2500+EYE_HEIGHT_M);assert.equal(first.heading,90);assert.ok(first.tilt>80);assert.equal(first.position.x,c[0]);
const third=walkerCamera('third',c,90);assert.ok(third.position.x<c[0],'third person sits behind a walker heading east');assert.ok(third.position.z>first.position.z);
const follow=walkerCamera('follow',c,0);assert.ok(follow.position.y<c[1],'follow sits behind a walker heading north');assert.ok(follow.position.z>third.position.z);
assert.equal(walkerCamera('overhead',c,123),null,'overhead is a fixed top-down framing, not a per-frame camera');
const top=walkerCamera('topfollow',c,123);assert.equal(top.tilt,0);assert.equal(top.heading,0);assert.equal(top.position.x,c[0]);
assert.equal(walkerCamera('first',[1,2],0,-100).position.z,-100+EYE_HEIGHT_M,'ground elevation override');
const o=offsetCoord([0,0],0,59274);assert.ok(Math.abs(o[1]-1)<1e-9&&Math.abs(o[0])<1e-12);
assert.ok(walkerMessageValid({coord:[1,2],heading:5,mode:'first'}));
for(const bad of [null,{coord:[NaN,1],heading:0,mode:'first'},{coord:[1,2],heading:0,mode:'fly'},{coord:[1,2],mode:'first'},{coord:'x',heading:0,mode:'first'}])assert.ok(!walkerMessageValid(bad));
// ---- scene adapter: walker layer, click -> parent, origin validation ----
const layers=[],views=[],messages=[],listeners={},viewHandlers={},els={status:{},detail:{}};
class Config{constructor(c){Object.assign(this,c)}load(){return Promise.resolve()}}
class Layer extends Config{constructor(c){super(c);this.items=[];layers.push(this)}add(g){this.items.push(g)}remove(g){this.items=this.items.filter(x=>x!==g)}removeAll(){this.items=[]}}
class Popup extends Config{on(k,f){this[k]=f}}
class View extends Config{constructor(c){super(c);this.targets=[];views.push(this)}when(){return Promise.resolve()}on(k,f){viewHandlers[k]=f}goTo(t,o){this.targets.push({t,o});return Promise.resolve()}hitTest(){return Promise.resolve({results:[]})}toMap(){return {x:77.5,y:18.5,z:-2400}}}
const parent={postMessage:m=>messages.push(m)},require=(_,cb)=>cb(Config,Config,View,Config,Config,Layer,Config,Popup,Config);
vm.runInNewContext(fs.readFileSync('dist/terrain.js','utf8').replace(/^import .*\n/,''),{poiExtent,walkerCamera,walkerMessageValid,document:{getElementById:id=>els[id]},window:{require},require,parent,location:{origin:'https://example.test'},addEventListener:(k,f)=>listeners[k]=f,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}),performance:{now:()=>500},console});
await new Promise(r=>setImmediate(r));
assert.equal(layers.length,4,'scene, route/POI, walker and steep-ground layers');const walkLayer=layers[2];
const ev=(data,origin='https://example.test',source=parent)=>listeners.message({origin,source,data});
const msg={type:'marswalk-walker',coord:[77.41,18.45,-2550],heading:45,mode:'first',trail:[[77.4,18.44],[77.41,18.45]]};
await ev(msg,'https://evil.test');assert.equal(walkLayer.items.length,0,'foreign origin ignored');
await ev(msg,'https://example.test',{});assert.equal(walkLayer.items.length,0,'foreign source ignored');
await ev(msg);assert.equal(walkLayer.items.length,2,'trail and walker drawn');assert.equal(views[0].targets.at(-1).t.position.z,-2550+EYE_HEIGHT_M);assert.equal(views[0].targets.at(-1).o.animate,false);
await ev({...msg,coord:[77.411,18.451,-2549]});assert.equal(walkLayer.items.length,2,'walker replaced, not duplicated');
const n=views[0].targets.length;await ev({...msg,mode:'free'});assert.equal(views[0].targets.length,n,'free mode leaves camera alone');
await ev({...msg,coord:['x',1]});assert.equal(walkLayer.items.length,2,'invalid payload ignored');
await ev({type:'marswalk-walker',clear:true});assert.equal(walkLayer.items.length,0,'clear removes walker and trail');
// overhead: framed once to the whole route (north up, tilt 0), then the camera is left alone while the walker moves
await ev({type:'marswalk-walker',clear:true});await ev({type:'marswalk-terrain',pois:[],route:[[77.40,18.44],[77.44,18.47]],base:{longitude:77.4,latitude:18.45}});
const before=views[0].targets.length;await ev({...msg,mode:'overhead'});assert.equal(views[0].targets.length,before+1,'one top-down framing');const fit=views[0].targets.at(-1).t;assert.equal(fit.tilt,0);assert.equal(fit.heading,0);assert.ok(fit.target.xmin<77.40&&fit.target.xmax>77.44);
await ev({...msg,mode:'overhead',coord:[77.42,18.46,-2500]});assert.equal(views[0].targets.length,before+1,'no camera movement per frame in overhead');
await ev({type:'marswalk-walker',clear:true});
// custom POIs and the temporary pin are drawn on the POI layer
await ev({type:'marswalk-terrain',pois:[],route:[],base:{longitude:77.4,latitude:18.45},custom:[{id:'custom-1',name:'Camp',coord:[77.43,18.44]}],pin:{lon:77.44,lat:18.43}});
assert.equal(layers[1].items.length,3,'base + custom + pin');assert.ok(layers[1].items.some(g=>g.attributes?.customId==='custom-1'));
// click on bare terrain -> parent gets coordinates
await viewHandlers.click({x:1,y:1});assert.ok(messages.some(m=>m.type==='marswalk-map-click'&&m.lon===77.5&&m.lat===18.5),'map click forwarded to the planner');
console.log('Terrain walker: camera modes, walker/trail layer, origin validation, custom POIs, pin and map click passed.');
