import assert from 'node:assert/strict';
import {buildGraph,planMission} from '../dist/routing.js';import {findAlternative,satisfies} from '../dist/route-alternatives.js';
const g=buildGraph([{geometry:{coordinates:[[77.4,18.45,0],[77.401,18.45,10],[77.402,18.45,20]]}}],[77.39,18.4,77.5,18.5]);
const base={id:0,node:0,coord:g.nodes[0],name:'Base'},candidates=[{id:1,node:2,coord:g.nodes[2],name:'Stop',tasks:[{id:'photo',min:12}]}];
const s={maxDistance:1,budget:1,maxGrade:0,speed:2,preference:'science',ids:['photo']};assert.ok(!satisfies(planMission(g,base,candidates,s),s));const a=findAlternative(g,base,candidates,s);assert.ok(a);assert.deepEqual(a.changes.map(c=>c.kind).sort(),['distance','grade','time']);assert.equal(a.settings.speed,s.speed);assert.ok(a.plan.minutes<=a.settings.budget*.8);assert.ok(a.plan.distance<=a.settings.maxDistance);assert.equal(s.maxDistance,1);
const generous={...s,maxDistance:1000,budget:240,maxGrade:90};assert.ok(satisfies(planMission(g,base,candidates,generous),generous));assert.equal(findAlternative(g,base,candidates,generous),null);
const missing=findAlternative(g,base,candidates,{...generous,ids:['photo','water']});assert.ok(missing.changes.some(c=>c.kind==='experiments'&&c.ids.includes('water')));assert.deepEqual(missing.settings.ids,['photo']);
assert.equal(findAlternative(g,base,candidates,s,new Set(g.edges.map(e=>e.id))),null);
console.log('Alternative routes: exact exceeded limits, preserved reserve/speed, explicit omitted tasks, blocked paths and no mutation passed.');
