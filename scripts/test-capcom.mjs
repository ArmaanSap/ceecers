import assert from 'node:assert/strict';
import {briefStop,answer,debrief,ask,compactContext} from '../dist/capcom.js';
const ctx={hasRoute:true,name:'Wildcat Ridge',index:1,total:4,minute:42,plannedMinutes:203,budget:480,reserve:96,slopeDeg:7.4,slopeCheck:{maxDeg:12,overLimitMeters:0,limitDeg:20},sol:130,atStop:true,distanceM:500,baseMeters:640,
 explanations:[{title:'Sharp turn (134°)',text:'A 134° turn: two recorded rover drives meet here.',atMeters:400}],instructions:[{name:'Delta layer record',target:'a layer that sticks out',record:'Record: it.'}],stopNames:['Wildcat Ridge'],next:'Enchanted Lake',nextMeters:800};
const b=briefStop({name:'Wildcat Ridge',index:1,total:4,minute:42,sol:130,slopeDeg:7.4,tasks:['Delta layer record'],taskMinutes:25,reserveLeft:60,next:'Enchanted Lake',nextBearing:90,nextMeters:800});
assert.ok(/Wildcat Ridge/.test(b)&&/sol 130/.test(b)&&/7°/.test(b)&&/Enchanted Lake/.test(b)&&/east/.test(b));
assert.ok(!/sol/.test(briefStop({name:'X',minute:1,tasks:[],taskMinutes:0})),'no sol claimed when none known');
assert.ok(/No science task/.test(briefStop({name:'X',minute:1,tasks:[],taskMinutes:0})));
assert.equal(answer('Why this route?',ctx).intent,'why');assert.ok(/134°/.test(answer('why the turn',ctx).text));
assert.ok(/203 min/.test(answer('how much time is left',ctx).text)||/3 h 23 min/.test(answer('how much time is left',ctx).text));
assert.ok(/7\.4°/.test(answer('how steep is it',ctx).text)&&/12\.0°/.test(answer('slope',ctx).text));
assert.ok(/sol 130/.test(answer('where am I',ctx).text));assert.ok(/layer that sticks out/.test(answer('what do I look for',ctx).text));
assert.equal(answer('tell me about the weather on jupiter',ctx).intent,'unknown');
assert.equal(answer('why',{hasRoute:false}).intent,'none');
assert.ok(/no DEM slope/.test(answer('slope',{...ctx,slopeDeg:NaN}).text));
assert.ok(/outcome text/.test(debrief({outcome:'outcome text',walkedMeters:2400,elapsedMinutes:200,plannedMinutes:203,tasksCompleted:2,tasksPlanned:4,panoramasDiscovered:3})));
// live layer: used when it works, scripted when it does not
let r=await ask('why',ctx,{url:'http://x',fetchFn:async()=>({ok:true,json:async()=>({answer:'  live reply '})})});assert.equal(r.source,'LIVE AI');assert.equal(r.text,'live reply');
r=await ask('why',ctx,{url:'http://x',fetchFn:async()=>({ok:false,status:500})});assert.equal(r.source,'SCRIPTED');
r=await ask('why',ctx,{url:'http://x',fetchFn:async()=>{throw new Error('net')}});assert.equal(r.source,'SCRIPTED');
r=await ask('why',ctx,{url:'http://x',fetchFn:async()=>({ok:true,json:async()=>({answer:''})})});assert.equal(r.source,'SCRIPTED');
r=await ask('why',ctx);assert.equal(r.source,'SCRIPTED');
let sent;await ask('q',ctx,{url:'http://x',fetchFn:async(u,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({answer:'a'})}}});
assert.ok(sent.context.stops&&!('hasRoute' in sent.context)&&JSON.stringify(sent).length<4000);
console.log('CAPCOM: grounded briefings, scripted answers, debrief, live layer with safe fallback passed.');

import {liveStatus} from '../dist/capcom.js';
assert.equal(await liveStatus(async()=>({ok:true,json:async()=>({live:true})})),true);assert.equal(await liveStatus(async()=>({ok:true,json:async()=>({live:false})})),false);assert.equal(await liveStatus(async()=>({ok:false})),false);assert.equal(await liveStatus(async()=>{throw new Error('x')}),false);
{const r=await ask('why',ctx,{url:'/api/capcom',fetchFn:async(u,o)=>{assert.equal(u,'/api/capcom');assert.ok(!('x-api-key' in o.headers),'browser never sends a key');return {ok:true,json:async()=>({answer:'ok'})}}});assert.equal(r.source,'LIVE AI')}
console.log('CAPCOM client: key-free backend call, status probe, fallbacks passed.');

// Terrain AI question: answered from the nearest panorama's estimate, labelled as an estimate, also without a route
{const g={name:'Hidden Harbor',meters:120,dir:'NE',analysedPct:58.2,share:{loose:54,rock:46}};
 const r=answer("What's the ground like here?",{hasRoute:false,terrainNear:g});
 assert.equal(r.intent,'terrain');assert.match(r.text,/Hidden Harbor/);assert.match(r.text,/46% rock/);assert.match(r.text,/not a safety rating/);
 assert.equal(answer('How steep is it here?',{hasRoute:true,terrainNear:g,slopeDeg:4,slopeCheck:{maxDeg:8,overLimitMeters:0,limitDeg:20}}).intent,'slope','slope questions still go to slope');
 assert.match(answer('is it sandy?',{hasRoute:true}).text,/not loaded/);
 assert.deepEqual(compactContext({terrainNear:g}).terrainNear.share,g.share);
 console.log('CAPCOM terrain intent: estimate from nearest panorama, labelled, works without a route.')}
