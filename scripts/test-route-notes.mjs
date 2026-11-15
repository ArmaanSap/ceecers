import assert from 'node:assert/strict';import {buildRouteNotes,noteQuestion,coordAt,RAD_MSV_PER_DAY,groundAlongRoute} from '../dist/route-notes.js';import {distance} from '../dist/routing.js';
const leg=(pts,toName,sci=0,extra={})=>({coords:pts,toName,scienceMinutes:sci,...extra});
const A=[77.40,18.45],B=[77.41,18.45],C=[77.41,18.46];
const route={legs:[leg([A,B],'Stop',20),leg([B,C],'Mid'),leg([C,A],'Base')],stops:[{name:'Stop',tasks:[{name:'Photo'}],alsoHere:['Twin']},{name:'Mid',tasks:[]}],
 explanations:[{kind:'turn',title:'Sharp turn (120°)',text:'Verified turn text',atMeters:1050,leg:1},{kind:'order',title:'Why this stop order',text:'x',atMeters:0,leg:0}]};
const notes=buildRouteNotes(route,{slopeAt:(lon,lat)=>lon>77.405?12:3,limitDeg:20,panos:[{name:'Pano',coord:[77.4101,18.4501]}],speedKmh:2,base:A});
assert.ok(notes.length>=4);assert.ok(notes.every((n,i)=>n.n===i+1&&n.id==='rn-'+(i+1)&&n.coord&&n.why.length>=3),'numbered, located, with tags');
assert.ok(notes.some(n=>n.kind==='turn'&&/Verified turn text/.test(n.why[0].text)),'turn notes carry the verified explanation');
assert.ok(!notes.some(n=>n.kind==='order'),'stop-order note is not a map marker');
const tags=new Set(notes.flatMap(n=>n.why.map(w=>w.tag)));for(const t of ['Traversability','Radiation','Distance & time'])assert.ok(tags.has(t),t);
const stop=notes.find(n=>n.kind==='stop'&&/Stop/.test(n.title));assert.ok(stop.why.some(w=>/Twin/.test(w.text)),'merged twin named in why-this-stop');
assert.ok(stop.why.find(w=>w.tag==='Radiation').text.includes(String(RAD_MSV_PER_DAY))&&/not a Jezero measurement/.test(stop.why.find(w=>w.tag==='Radiation').text),'radiation is labelled a reference');
// minutes include science time already done
const ret=notes.find(n=>n.kind==='return'),walk=ret.atMeters/2000*60;assert.ok(ret.minute>=Math.round(walk+20)-1,'return minute counts science time');
assert.ok(notes.some(n=>n.kind==='slope'&&n.slopeDeg>=12),'steepest point found');
assert.ok(notes.at(-1).remainingMeters<1,'last note has nothing left');
assert.ok(distance(coordAt(route.legs,0),A)<1);assert.equal(buildRouteNotes({legs:[]}).length,0);assert.equal(buildRouteNotes(null).length,0);
assert.ok(noteQuestion(notes[0]).length<=300);
// capped
const many={legs:[leg([A,[77.5,18.45]],'S'),leg([[77.5,18.45],A],'Base')],stops:[{name:'S',tasks:[]}],explanations:Array.from({length:30},(_, i)=>({kind:'turn',title:'T'+i,text:'t',atMeters:100+i*500,leg:0}))};
assert.ok(buildRouteNotes(many,{speedKmh:2}).length<=14,'capped');
const tr=buildRouteNotes(route,{slopeAt:()=>3,panos:[{id:7,name:'Pano',coord:[77.4101,18.4501]}],speedKmh:2,base:A,terrainAt:p=>p.id===7?{loose:70,rock:30}:null});
assert.ok(tr.some(n=>n.why.some(w=>w.tag==='Terrain AI'&&/70% loose ground and 30% rock/.test(w.text)&&/81%/.test(w.text))),'Terrain AI tag cites the model reading and its measured accuracy');
const ga=groundAlongRoute(route,{panos:[{id:7,name:'Pano',coord:[77.4101,18.4501]}],terrainAt:p=>({loose:70,rock:30}),step:50,reach:400});assert.ok(ga&&ga.loose===70&&ga.rock===30&&ga.panoramas[0]==='Pano','ground along route');
assert.equal(groundAlongRoute(route,{panos:[],terrainAt:()=>null}),null);assert.equal(groundAlongRoute(route,{}),null);
console.log('Route notes: located, numbered, tagged (traversability, radiation reference, distance/time, views), capped.');
