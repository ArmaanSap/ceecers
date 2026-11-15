// Regression: several chosen stops within 25 m of each other (or on the same track node) used to be dropped as duplicates,
// which reported "priority stops did not fit". They must merge into ONE stop that keeps every task and counts every pin as met.
import assert from 'node:assert/strict';
import {buildGraph,planMission} from '../dist/routing.js';import {satisfies} from '../dist/route-alternatives.js';
const g=buildGraph([{geometry:{coordinates:[[77.4,18.45,0],[77.401,18.45,10],[77.402,18.45,20],[77.403,18.45,30]]}}],[77.39,18.4,77.5,18.5]);
const base={id:0,node:0,coord:g.nodes[0],name:'Base'};
const near=(id,name,node,task)=>({id,node,coord:g.nodes[node],name,tasks:[{id:task,min:10}]});
const cands=[near(1,'A',2,'photo'),near(2,'B',2,'sample-rock'),near(3,'C',2,'dust'),near(4,'Far',3,'photo2')];
const s={maxDistance:5000,budget:600,maxGrade:90,speed:2,preference:'science',ids:['photo','sample-rock','dust','photo2']};
const pins=new Set([1,2,3,4]);
const r=planMission(g,base,cands,s,new Set(),pins);
assert.equal(r.stops.length,2,'three co-located picks become one stop plus the far one');
assert.deepEqual(r.unmetPins,[],'every picked point counts as reached');assert.deepEqual(r.missingIds,[],'every task is scheduled');
const merged=r.stops.find(x=>x.alsoHere?.length);assert.ok(merged&&merged.alsoHere.length===2&&merged.tasks.length===3,'merged stop keeps all tasks and names the others');
assert.ok(satisfies(r,s),'no false "did not fit" prompt');
// time includes every merged task
const solo=planMission(g,base,[cands[0],cands[3]],{...s,ids:['photo','photo2']},new Set(),new Set([1,4]));assert.ok(r.minutes>=solo.minutes+19.9,'merged tasks add their time');
console.log('Nearby stops merge into one stop, keep all tasks and pins, and no longer trigger a false alternative.');
