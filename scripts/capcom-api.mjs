// CAPCOM backend. The Anthropic API key lives ONLY in the server environment (ANTHROPIC_API_KEY, or a local .env file).
// The browser sends a short question plus a compact, factual mission context to /api/capcom and never sees the key.
import fs from 'node:fs';import path from 'node:path';
import {TOOL_DEFS,TOOL_NAMES} from '../dist/capcom-tools.js';
export const SYSTEM=`You are CAPCOM, mission control for a simulated first human Mars walk in Jezero Crater. Reply in at most 2 short sentences, calm and clear.
Use ONLY the facts in the provided context. If the context does not contain the answer, say you do not have that data. Never invent measurements, mineral detections or live conditions.
All suit, weather and radiation events in this tool are simulations. Slope numbers come from a 20 m DEM and do not describe rocks or sand.
You also have tools that inspect or change the mission plan. Call a tool only when the astronaut asks for something it does, or you need its facts to answer. Never say a tool did something unless its result says so; if a result contains an error, say so plainly. Walking effort figures are an Earth-gravity estimate, not a consumables or oxygen figure. Terrain AI shares (terrainNear, describe_terrain) are estimates from a model the team trained on NASA AI4Mars images and run on Mastcam-Z panoramas, a different camera. Only two groups are reported: loose ground (soil or sand) and rock (bedrock or big rock); our own hand check gave about 81% right on rock vs loose and it tends to under-report rock. Never present them as a safety rating.`;
export const MAX_TURNS=3;
const blockOk=b=>b&&((b.type==='text'&&typeof b.text==='string')||(b.type==='tool_use'&&/^[A-Za-z0-9_-]{1,64}$/.test(b.id||'')&&TOOL_NAMES.has(b.name)&&b.input&&typeof b.input==='object'&&!Array.isArray(b.input)));
// Turns come back from the page: the model's own tool request (echoed) plus the page's results. Strictly checked before being sent upstream.
export function buildTurns(turns){
 if(turns==null)return [];if(!Array.isArray(turns)||turns.length>MAX_TURNS)throw new Error('bad turns');
 const msgs=[];
 for(const t of turns){
  if(!t||!Array.isArray(t.assistant)||!Array.isArray(t.results)||t.assistant.length>12||t.results.length>12||!t.assistant.every(blockOk))throw new Error('bad turn');
  const ids=t.assistant.filter(b=>b.type==='tool_use').map(b=>b.id);
  if(!ids.length||ids.length!==t.results.length||!t.results.every((r,i)=>r&&r.id===ids[i]&&typeof r.content==='string'))throw new Error('bad results');
  msgs.push({role:'assistant',content:t.assistant.map(b=>b.type==='text'?{type:'text',text:b.text.slice(0,2000)}:{type:'tool_use',id:b.id,name:b.name,input:b.input})});
  msgs.push({role:'user',content:t.results.map(r=>({type:'tool_result',tool_use_id:r.id,content:r.content.slice(0,3000)}))});
 }
 return msgs;
}
export function loadEnvFile(file,env=process.env){
 try{for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in env))env[m[1]]=m[2].replace(/^["']|["']$/g,'')}}catch{}
 return env;
}
export function makeCapcomApi({env=process.env,fetchFn=globalThis.fetch,now=()=>Date.now()}={}){
 const KEY=env.ANTHROPIC_API_KEY||'',MODEL=env.CAPCOM_MODEL||'claude-sonnet-5-5',hits=new Map();
 const limited=ip=>{const t=now(),h=(hits.get(ip)||[]).filter(x=>t-x<60000);h.push(t);hits.set(ip,h);return h.length>20};
 // Behind a proxy (Railway) every request arrives from the proxy, so use the last X-Forwarded-For hop the proxy itself added, only when TRUST_PROXY is set.
 const clientIp=req=>env.TRUST_PROXY&&req.headers?.['x-forwarded-for']?String(req.headers['x-forwarded-for']).split(',').pop().trim():(req.socket?.remoteAddress||'?');
 // Whole-server cap so a crowd cannot run up the API bill: CAPCOM_MAX_PER_MIN (default 120).
 const GMAX=+env.CAPCOM_MAX_PER_MIN||120,all=[];const globalLimited=()=>{const t=now();while(all.length&&t-all[0]>=60000)all.shift();all.push(t);return all.length>GMAX};
 const send=(res,code,obj)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(obj))};
 return {
  live:!!KEY,model:MODEL,
  async handle(req,res){
   const url=new URL(req.url,'http://x').pathname;
   if(url==='/api/capcom/status'&&req.method==='GET'){send(res,200,{live:!!KEY,model:KEY?MODEL:null});return true}
   if(url!=='/api/capcom')return false;
   if(req.method!=='POST'){send(res,405,{error:'POST only'});return true}
   if(!KEY){send(res,503,{error:'CAPCOM key not configured on the server'});return true}
   if(limited(clientIp(req))||globalLimited()){send(res,429,{error:'slow down'});return true}
   let body='';for await(const c of req){body+=c;if(body.length>20000){send(res,413,{error:'too large'});return true}}
   try{
    const {question,context,turns}=JSON.parse(body);if(typeof question!=='string'||!question.trim())throw new Error('question required');
    const prior=buildTurns(turns);
    const r=await fetchFn('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:MODEL,max_tokens:400,system:SYSTEM,...(prior.length/2<MAX_TURNS?{tools:TOOL_DEFS}:{}),messages:[{role:'user',content:`Mission context (JSON):\n${JSON.stringify(context??{}).slice(0,12000)}\n\nAstronaut asks: ${question.slice(0,300)}`},...prior]})});
    const j=await r.json();if(!r.ok)throw new Error('upstream '+(r.status||'error'));
    const blocks=(j.content||[]).filter(blockOk),text=blocks.filter(b=>b.type==='text').map(b=>b.text).join(' ').trim(),calls=blocks.filter(b=>b.type==='tool_use');
    if(calls.length&&prior.length/2<MAX_TURNS){send(res,200,{toolCalls:calls.map(({id,name,input})=>({id,name,input})),assistant:blocks,say:text||undefined});return true}
    if(!text)throw new Error('empty');
    send(res,200,{answer:text});
   }catch(e){send(res,502,{error:'CAPCOM unavailable'})}   // upstream detail is never forwarded
   return true;
  }
 };
}
