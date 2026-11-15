import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {poiExtent} from '../dist/terrain-camera.js';
const layers=[],views=[],messages=[],listeners={},els={status:{},detail:{}};
class Config{constructor(c){Object.assign(this,c)}load(){return Promise.resolve()}}
class Layer extends Config{constructor(c){super(c);this.items=[];layers.push(this)}add(g){this.items.push(g)}removeAll(){this.items=[]}}
class Popup extends Config{on(k,f){this[k]=f}}
class View extends Config{constructor(c){super(c);this.targets=[];views.push(this)}when(){return Promise.resolve()}on(){}goTo(t,o){this.targets.push(t);return Promise.resolve()}hitTest(){return Promise.resolve({results:[]})}}
const parent={postMessage:m=>messages.push(m)},require=(_,cb)=>cb(Config,Config,View,Config,Config,Layer,Config,Popup,Config);
vm.runInNewContext(fs.readFileSync('dist/terrain.js','utf8').replace(/^import .*\n/,''),{poiExtent,document:{getElementById:id=>els[id]},window:{require},require,parent,location:{origin:'https://example.test'},addEventListener:(k,f)=>listeners[k]=f,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}),performance:{now:()=>500},console});
await new Promise(r=>setImmediate(r));assert.ok(messages.some(m=>m.type==='marswalk-terrain-ready'));assert.equal(views[0].map.basemap.baseLayers[1].visible,true);
const data={type:'marswalk-terrain',pois:[{id:9,name:'Martre',coord:[77.43,18.44],description:'Outcrop',sol:205}],route:[[77.41,18.45],[77.43,18.44]],base:{longitude:77.406,latitude:18.457}};
await listeners.message({origin:'https://wrong.test',source:parent,data});assert.equal(layers[1].items.length,0);
await listeners.message({origin:'https://example.test',source:parent,data});assert.equal(layers[0].items.length,1);assert.equal(layers[1].items.length,2);assert.equal(layers[1].elevationInfo.mode,'relative-to-ground');assert.equal(layers[1].items[0].symbol.type,'point-3d');
await listeners.message({origin:'https://example.test',source:parent,data:{type:'marswalk-flight',requestId:3,animate:true}});assert.equal(views[0].targets.at(-1).target.type,'extent');assert.ok(views[0].targets.at(-1).target.xmin<77.406);assert.ok(messages.some(m=>m.type==='marswalk-flight-done'&&m.requestId===3));
console.log('Terrain adapter: HiRISE default, visible POI layer, selected route, extent flight, message origin validation passed.');
