import assert from 'node:assert/strict';
import {TOOL_DEFS,validateInput,runTool} from '../dist/capcom-tools.js';
import {ask} from '../dist/capcom.js';
assert.equal(TOOL_DEFS.length,8);assert.ok(TOOL_DEFS.every(t=>t.input_schema?.type==='object'&&t.description.length>20));
assert.deepEqual(validateInput('replan',{preference:'gentle',max_slope_deg:10}),{ok:true,input:{preference:'gentle',max_slope_deg:10}});
for(const [n,i] of [['replan',{preference:'x'}],['replan',{max_slope_deg:15}],['replan',{evil:1}],['preview_alternate',{}],['preview_alternate',{number:9}],['set_view',{view:'sky'}],['nope',{}]])assert.equal(validateInput(n,i).ok,false,n+JSON.stringify(i));
assert.equal(validateInput('open_panorama',{stop:'Rose\nRiver'}).input.stop,'Rose River');
// runTool: validates, never throws
const api={assess_route:async()=>({ok:1}),replan:async()=>{throw new Error('boom')}};
assert.deepEqual(await runTool('assess_route',{},api),{ok:1});assert.deepEqual(await runTool('replan',{},api),{error:'boom'});assert.deepEqual(await runTool('abort_to_base',{},api),{error:'not available right now'});assert.equal((await runTool('replan',{preference:'x'},api)).error,'preference invalid');
// ask(): full loop against a fake backend
{const seen=[];const f=async(u,o)=>{const b=JSON.parse(o.body);seen.push(b);return {ok:true,json:async()=>b.turns?{answer:'Replanned: 4.1 km.'}:{toolCalls:[{id:'toolu_9',name:'replan',input:{preference:'gentle'}}],assistant:[{type:'tool_use',id:'toolu_9',name:'replan',input:{preference:'gentle'}}]}}};
 let got;const r=await ask('safer route please',{hasRoute:true},{url:'/x',fetchFn:f,api:{replan:async i=>(got=i,{replanned:true})}});
 assert.deepEqual(got,{preference:'gentle'});assert.equal(r.source,'LIVE AI');assert.deepEqual(r.actions,['replan']);assert.equal(seen[1].turns[0].results[0].id,'toolu_9');assert.match(seen[1].turns[0].results[0].content,/replanned/)}
// tool ran but the follow-up failed: honest message, no invented answer
{let n=0;const f=async()=>{n++;if(n===1)return {ok:true,json:async()=>({toolCalls:[{id:'t',name:'replan',input:{}}],assistant:[{type:'tool_use',id:'t',name:'replan',input:{}}]})};return {ok:false,status:502,json:async()=>({})}};
 const r=await ask('q',{hasRoute:true},{url:'/x',fetchFn:f,api:{replan:async()=>({replanned:true})}});assert.equal(r.source,'SCRIPTED');assert.match(r.text,/Done: replan/)}
// no api passed: tool calls are not executed, falls back to scripted
{const f=async()=>({ok:true,json:async()=>({toolCalls:[{id:'t',name:'replan',input:{}}],assistant:[]})});const r=await ask('where am I',{hasRoute:true},{url:'/x',fetchFn:f});assert.equal(r.source,'SCRIPTED')}
console.log('CAPCOM tools: schema validation, safe execution, full ask() loop, honest failure.');
