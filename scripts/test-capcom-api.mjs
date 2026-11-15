import assert from 'node:assert/strict';import http from 'node:http';
import {makeCapcomApi,loadEnvFile,SYSTEM} from './capcom-api.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const serve=async api=>{const s=http.createServer(async(q,r)=>{if(!(await api.handle(q,r))){r.writeHead(404).end()}});await new Promise(r=>s.listen(0,'127.0.0.1',r));return {s,u:'http://127.0.0.1:'+s.address().port}};
const post=(u,b)=>fetch(u+'/api/capcom',{method:'POST',body:typeof b==='string'?b:JSON.stringify(b)});
// no key: status says not live, ask is 503, nothing leaks
{const {s,u}=await serve(makeCapcomApi({env:{}}));assert.deepEqual(await (await fetch(u+'/api/capcom/status')).json(),{live:false,model:null});assert.equal((await post(u,{question:'x'})).status,503);s.close()}
// with key: upstream gets the key + a facts-only system prompt; browser response has only the answer
{let up;const api=makeCapcomApi({env:{ANTHROPIC_API_KEY:'sk-ant-secret'},fetchFn:async(url,o)=>{up={url,o,b:JSON.parse(o.body)};return {ok:true,status:200,json:async()=>({content:[{type:'text',text:' Steep ahead. '}]})}}});
 const {s,u}=await serve(api);const st=await (await fetch(u+'/api/capcom/status')).json();assert.equal(st.live,true);assert.ok(!JSON.stringify(st).includes('secret'));
 const r=await post(u,{question:'How steep?',context:{slopeDeg:7}});const j=await r.json();assert.equal(r.status,200);assert.deepEqual(j,{answer:'Steep ahead.'});
 assert.equal(up.url,'https://api.anthropic.com/v1/messages');assert.equal(up.o.headers['x-api-key'],'sk-ant-secret');assert.equal(up.b.model,'claude-sonnet-5-5');assert.equal(up.b.system,SYSTEM);assert.ok(up.b.messages[0].content.includes('"slopeDeg":7'));
 assert.equal((await post(u,'not json')).status,502);assert.equal((await post(u,{question:''})).status,502);
 assert.equal((await fetch(u+'/api/capcom')).status,405);assert.equal((await post(u,'x'.repeat(30000))).status,413);s.close()}
// upstream failure never leaks details
{const api=makeCapcomApi({env:{ANTHROPIC_API_KEY:'k'},fetchFn:async()=>({ok:false,status:401,json:async()=>({error:{message:'invalid x-api-key sk-ant-leak'}})})});const {s,u}=await serve(api);const r=await post(u,{question:'q'});const t=await r.text();assert.equal(r.status,502);assert.ok(!t.includes('leak')&&!t.includes('401'));s.close()}
// rate limit: 21st request in a minute is refused
{const api=makeCapcomApi({env:{ANTHROPIC_API_KEY:'k'},fetchFn:async()=>({ok:true,json:async()=>({content:[{type:'text',text:'a'}]})})});const {s,u}=await serve(api);let last;for(let i=0;i<21;i++)last=(await post(u,{question:'q'})).status;assert.equal(last,429);s.close()}
// behind a proxy: separate visitors by X-Forwarded-For; whole-server cap protects the bill
{const mk=env=>makeCapcomApi({env:{ANTHROPIC_API_KEY:'k',...env},fetchFn:async()=>({ok:true,json:async()=>({content:[{type:'text',text:'a'}]})})});
 const {s,u}=await serve(mk({TRUST_PROXY:'1'}));const go=ip=>fetch(u+'/api/capcom',{method:'POST',headers:{'x-forwarded-for':'1.2.3.4, '+ip},body:JSON.stringify({question:'q'})}).then(r=>r.status);
 for(let i=0;i<21;i++)await go('9.9.9.9');assert.equal(await go('9.9.9.9'),429);assert.equal(await go('8.8.8.8'),200,'another visitor is not limited');s.close();
 const g=await serve(mk({CAPCOM_MAX_PER_MIN:'3'}));let c=[];for(let i=0;i<5;i++)c.push((await post(g.u,{question:'q'})).status);assert.deepEqual(c,[200,200,200,429,429]);g.s.close()}
// .env loader
{const f=path.join(os.tmpdir(),'mw-env-'+process.pid);fs.writeFileSync(f,'# c\nANTHROPIC_API_KEY="sk-ant-x"\nCAPCOM_MODEL=claude-test\n');const e={};loadEnvFile(f,e);assert.equal(e.ANTHROPIC_API_KEY,'sk-ant-x');assert.equal(e.CAPCOM_MODEL,'claude-test');const keep={ANTHROPIC_API_KEY:'real'};loadEnvFile(f,keep);assert.equal(keep.ANTHROPIC_API_KEY,'real','real environment wins');fs.unlinkSync(f)}
console.log('CAPCOM backend: key stays server-side, errors do not leak, size/rate limits, .env loading passed.');

// ---- tool use: model asks for a tool, page runs it, model answers
{const {TOOL_DEFS}=await import('../dist/capcom-tools.js');const calls=[];
 const api=makeCapcomApi({env:{ANTHROPIC_API_KEY:'k'},fetchFn:async(url,o)=>{const b=JSON.parse(o.body);calls.push(b);const n=b.messages.length;
  return {ok:true,status:200,json:async()=>n===1?{content:[{type:'text',text:'Checking.'},{type:'tool_use',id:'toolu_1',name:'assess_route',input:{}}]}:{content:[{type:'text',text:'Max slope 8 degrees.'}]}}}});
 const {s,u}=await serve(api);
 const r1=await (await post(u,{question:'How hard is this route?',context:{}})).json();
 assert.equal(r1.toolCalls[0].name,'assess_route');assert.equal(r1.assistant.length,2);assert.equal(calls[0].tools.length,TOOL_DEFS.length,'tool definitions are sent upstream');
 const r2=await (await post(u,{question:'How hard is this route?',context:{},turns:[{assistant:r1.assistant,results:[{id:'toolu_1',content:'{"maxSlopeDeg":8}'}]}]})).json();
 assert.deepEqual(r2,{answer:'Max slope 8 degrees.'});const m=calls[1].messages;assert.equal(m[1].role,'assistant');assert.equal(m[2].content[0].type,'tool_result');assert.equal(m[2].content[0].tool_use_id,'toolu_1');
 // forged / malformed turns are refused before reaching the model
 const n0=calls.length;
 for(const bad of [{assistant:[{type:'tool_use',id:'toolu_1',name:'rm_rf',input:{}}],results:[{id:'toolu_1',content:'x'}]},{assistant:[{type:'tool_use',id:'toolu_1',name:'replan',input:{}}],results:[{id:'other',content:'x'}]},{assistant:[{type:'tool_use',id:'toolu_1',name:'replan',input:{}}],results:[]}])
  assert.equal((await post(u,{question:'q',turns:[bad]})).status,502);
 assert.equal((await post(u,{question:'q',turns:[1,2,3,4].map(()=>({assistant:[],results:[]}))})).status,502);assert.equal(calls.length,n0);
 s.close()}
console.log('CAPCOM tool use: round trip, strict turn validation.');
