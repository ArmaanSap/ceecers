import assert from 'node:assert/strict';import {createCostRouter} from '../dist/route-cost.js';import {explainGridRoute,costSummary,legReason,driversOf} from '../dist/route-reasons.js';import {planMission,setPathRouter} from '../dist/routing.js';import {synthTerrain} from './fixtures-synth-terrain.mjs';
const ridge=(x,y)=>{const sad=Math.exp(-(((y-900)/160)**2));return 30*Math.exp(-(((x-1000)/30)**2))*(1-.95*sad)};
const T=synthTerrain(100,60,ridge),A=T.at(200,300),B=T.at(1800,300),R=createCostRouter(T,{limitDeg:20});setPathRouter(R);
const mk=(id,name,c)=>({id,node:id,name,coord:c,tasks:[{id:'visit',name:'Visit',min:10}]});
const plan=planMission(null,{id:0,node:0,name:'Martian Base',coord:A},[mk(1,'Behind ridge',B)],{maxDistance:20000,budget:600,speed:2,maxGrade:20,preference:'science',ids:['visit'],routeStyle:'balanced'},new Set(),new Set([1]));setPathRouter(null);
const ex=explainGridRoute(plan,R,{settings:{budget:600}});
const leg1=ex.find(x=>x.kind==='detour'||x.kind==='direct');assert.ok(leg1&&/Leg 1: Martian Base → Behind ridge/.test(leg1.title),leg1?.title);
assert.ok(/not allowed/.test(leg1.text)&&/steeper than your 20° limit/.test(leg1.text),'says why a straight line is not allowed: '+leg1.text);
assert.ok(/kcal/.test(leg1.text)&&/min walking/.test(leg1.text),'numbers included');assert.ok(ex.some(x=>x.kind==='cost'&&/Minetti/.test(x.text)&&/not the rover/.test(x.text)),'method note does not lean on the rover');
assert.ok(ex.every(x=>x.title&&x.text&&Number.isFinite(x.atMeters)&&x.leg>=0),'compatible with the notes UI');
const S=costSummary(plan,R);assert.ok(S&&S.directOverLimitMeters>20&&S.maxSlopeDeg<=20&&S.kcal>50&&S.drivers[0].share>0,'summary');
// flat ground: "close to a straight line"
{const F=synthTerrain(100,60,()=>0),RF=createCostRouter(F,{limitDeg:20}),p=RF.tree(F.at(100,100)).to(F.at(1900,100)),r=legReason(p,RF.straight(F.at(100,100),F.at(1900,100)),20);assert.ok(/Close to a straight line/.test(r.why),r.why)}
// a hill between: longer-on-purpose wording shows savings
{const H=synthTerrain(100,60,(x,y)=>x>800&&x<1200&&y>200&&y<1000?14*Math.sin((x-800)/400*Math.PI):0),RH=createCostRouter(H,{limitDeg:30,style:'effort'}),a=H.at(300,600),b=H.at(1700,600),p=RH.tree(a).to(b),r=legReason(p,RH.straight(a,b),30);assert.ok(/longer than a straight line on purpose|Close to a straight line/.test(r.why),r.why);if(/on purpose/.test(r.why))assert.ok(/saving about \d+ kcal/.test(r.why))}
assert.equal(driversOf({energy:3,time:1,margin:0,cross:0,rough:0})[0].key,'energy');
console.log('Route reasons: each leg says why it is not straight (limit, savings) with numbers; method note; summary.');
