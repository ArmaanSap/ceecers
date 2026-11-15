// CAPCOM: the in-character mission-control voice. Two layers:
//  1. Scripted: briefings, answers and the debrief are built from the real mission data (route, DEM slope, panorama sol, time budget).
//     No model is involved, nothing is invented, and every line says so ("SCRIPTED").
//  2. Optional live AI: if a proxy URL is configured, free-form questions go there with a compact, factual context.
//     If the proxy is missing, slow or errors, the scripted layer answers instead. The proxy holds the API key, never this page.
import {runTool} from './capcom-tools.js';
const pick=(a,n=0)=>a[(n+Math.floor(Math.random()*a.length))%a.length];
const fmtMin=m=>{m=Math.max(0,Math.round(m));return m>=60?`${Math.floor(m/60)} h ${m%60} min`:`${m} min`};
const compass=b=>['north','north-east','east','south-east','south','south-west','west','north-west'][Math.round(((b%360)+360)%360/45)%8];

// What CAPCOM says as the astronaut reaches a stop. `c` is a plain object (see simulator-ui capContext).
export function briefStop(c){
 const parts=[];
 const n=c.index!=null?`stop ${c.index} of ${c.total}`:'the base';
 parts.push(`${pick(['MARVIN, CAPCOM.','EVA-01, CAPCOM.','MARVIN, this is CAPCOM.'])} You are at ${c.name}, ${n}, ${fmtMin(c.minute)} into the EVA.`);
 if(c.sol!=null)parts.push(`Mastcam-Z imaged this area on sol ${c.sol}, so you can compare what you see with the real panorama.`);
 if(Number.isFinite(c.slopeDeg))parts.push(`The DEM puts the ground here at about ${c.slopeDeg.toFixed(0)}° (20 m cells, so rocks and small slopes are not shown).`);
 if(c.tasks?.length)parts.push(`Work plan: ${c.tasks.join(' and ')}, about ${c.taskMinutes} min.`);
 else parts.push('No science task is planned here. Look around and log what you see.');
 if(c.reserveLeft!=null)parts.push(`You have ${fmtMin(c.reserveLeft)} of margin before your return reserve starts.`);
 if(c.next)parts.push(`After this, head ${c.nextBearing!=null?compass(c.nextBearing)+' ':''}to ${c.next}${c.nextMeters?`, about ${Math.round(c.nextMeters)} m`:''}.`);
 return parts.join(' ');
}

// Rule-based answers. Returns {text, intent}. Only states things present in the context.
export function answer(q,c){
 const t=String(q||'').toLowerCase().trim();
 if(!t)return {text:'CAPCOM here. Ask about the route, time left, slope, tasks or this place.',intent:'empty'};
 if(/terrain|ground|surface|sand|bedrock|soil|\brocks?\b|boulder|what.*(like|made of)|drivable|safe to walk/.test(t)&&!/steep|slope|grade|time|left/.test(t)){
  const g=c?.terrainNear;if(!g)return {text:'Terrain AI results are not loaded, so I cannot describe the ground here. The DEM slope question still works.',intent:'terrain'};
  const s=g.share;return {text:`Nearest real panorama: ${g.name}, about ${g.meters} m ${g.dir} of you. Terrain AI estimate for that view: ${s.loose}% loose ground (soil or sand) and ${s.rock}% rock, of the ${Math.round(g.analysedPct)}% of the image it can judge (sky, rover and no-data are skipped). It is our model's estimate, about 81% right on rock vs loose in our own hand check, and it tends to under-report rock. This is not a safety rating.`,intent:'terrain'};
 }
 if(!c?.hasRoute)return {text:'No mission is loaded yet. Build a mission and I can brief you on it.',intent:'none'};
 if(/why|reason|detour|turn|path|route|bend/.test(t)&&!/time|long/.test(t)){
  const ex=c.explanations||[];if(!ex.length)return {text:'The route follows the recorded rover track the whole way with no sharp turns or detours that need explaining.',intent:'why'};
  const near=c.distanceM!=null?ex.find(e=>e.atMeters>=c.distanceM-40)||ex.at(-1):ex[0];
  return {text:`${near.title}: ${near.text}`,intent:'why'};
 }
 if(/time|left|long|remain|eta|when/.test(t)){
  const left=c.plannedMinutes-c.minute;
  return {text:`Planned EVA is ${fmtMin(c.plannedMinutes)} of your ${fmtMin(c.budget)} budget; ${fmtMin(Math.max(0,left))} of plan remain. The last ${fmtMin(c.reserve)} of the budget is held as return reserve.`,intent:'time'};
 }
 if(/steep|slope|grade|incline|hill|tilt/.test(t)){
  if(!Number.isFinite(c.slopeDeg))return {text:'I have no DEM slope for this exact spot. The route itself stays on recorded rover track.',intent:'slope'};
  const rc=c.slopeCheck;return {text:`Ground here is about ${c.slopeDeg.toFixed(1)}° in the 20 m DEM.${rc?` Across the whole route the steepest cell is ${rc.maxDeg.toFixed(1)}°, with ${Math.round(rc.overLimitMeters)} m above the ${rc.limitDeg}° planning limit.`:''} That is a planning number, not a rock or sand check.`,intent:'slope'};
 }
 if(/where|place|here|what is this|location|panorama/.test(t)){
  return {text:`You are ${c.atStop?`at ${c.name}`:`on the way to ${c.name}`}${c.sol!=null?`. The Mastcam-Z panorama for it is from sol ${c.sol}`:''}. Base is ${c.baseMeters!=null?Math.round(c.baseMeters)+' m':'back along the route'} away in a straight line.`,intent:'where'};
 }
 if(/task|do|look|find|instruction|what now|next/.test(t)){
  if(c.instructions?.length)return {text:`${c.instructions[0].name}: look for ${c.instructions[0].target}. ${c.instructions[0].record}`,intent:'task'};
  if(c.next)return {text:`Next is ${c.next}${c.nextMeters?`, about ${Math.round(c.nextMeters)} m`:''}. I will brief you when you arrive.`,intent:'task'};
  return {text:'No task is active right now.',intent:'task'};
 }
 if(/safe|abort|reserve|return|home|danger|emergency|oxygen|suit/.test(t)){
  return {text:`You have a ${fmtMin(c.reserve)} return reserve built into the plan. Abort sends you back along the recorded rover track to base. All suit and weather events in this tool are simulated drills, not live data.`,intent:'safety'};
 }
 return {text:'I can speak to the route and why it bends, time left, slope, this place, your current task, and safety. For anything else I have no data.',intent:'unknown'};
}

// End-of-mission debrief from the log summary (see mission-log.js summary()).
export function debrief(s){
 if(!s)return '';
 const parts=[`CAPCOM debrief: ${s.outcome||'EVA complete.'}`];
 parts.push(`You walked ${(s.walkedMeters/1000).toFixed(2)} km in ${s.elapsedMinutes} of ${s.plannedMinutes} planned minutes and completed ${s.tasksCompleted} of ${s.tasksPlanned} tasks.`);
 if(s.panoramasDiscovered!=null)parts.push(`${s.panoramasDiscovered} real Mastcam-Z panorama sites came into range along the way.`);
 if(s.tasksCompleted<s.tasksPlanned)parts.push(`${s.tasksPlanned-s.tasksCompleted} planned task${s.tasksPlanned-s.tasksCompleted===1?' was':'s were'} left open; log them for the next EVA.`);
 parts.push('Radiation figure in the summary is a modeled estimate, not a measurement.');
 return parts.join(' ');
}

// Optional live layer. The endpoint must accept {question, context} and return {answer}. Falls back silently to scripted.
export const CAPCOM_URL='/api/capcom';
// Live layer: the SERVER holds the API key. The browser posts {question, context} to the same-origin backend and gets {answer}.
// Any failure (no backend, no key, timeout, empty reply) falls back silently to the scripted answer.
export async function ask(q,c,{url=null,timeoutMs=9000,fetchFn=globalThis.fetch,api=null}={}){
 const scripted=answer(q,c);
 if(!url||typeof fetchFn!=='function')return {...scripted,source:'SCRIPTED'};
 const acted=[];
 const post=async turns=>{
  const ctl=typeof AbortController==='function'?new AbortController():null,timer=ctl?setTimeout(()=>ctl.abort(),timeoutMs):null;
  try{const r=await fetchFn(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:String(q).slice(0,300),context:compactContext(c),...(turns.length?{turns}:{})}),signal:ctl?.signal});
   if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
  finally{if(timer)clearTimeout(timer)}
 };
 try{
  const turns=[];let j=await post(turns);
  // Live Claude may ask the page to run tools (replan, preview an alternate, open a panorama...). Each call is validated and run by capcom-tools.
  for(let n=0;n<3&&Array.isArray(j.toolCalls)&&j.toolCalls.length&&api;n++){
   const results=[];
   for(const call of j.toolCalls.slice(0,6)){const out=await runTool(call?.name,call?.input,api);acted.push(call?.name);results.push({id:call.id,content:JSON.stringify(out).slice(0,3000)})}
   turns.push({assistant:j.assistant,results});j=await post(turns);
  }
  if(typeof j.answer!=='string'||!j.answer.trim())throw new Error('empty');
  return {text:j.answer.trim().slice(0,900),intent:'live',source:'LIVE AI',actions:acted};
 }catch{
  return acted.length?{text:`Done: ${[...new Set(acted)].join(', ').replace(/_/g,' ')}. The live reply did not finish, so check the plan panel.`,intent:'live',source:'SCRIPTED',actions:acted}:{...scripted,source:'SCRIPTED'};
 }
}
// Is the backend configured with a key? (never throws)
export async function liveStatus(fetchFn=globalThis.fetch,url='/api/capcom/status'){try{const r=await fetchFn(url);if(!r.ok)return false;const j=await r.json();return !!j.live}catch{return false}}
// Only facts, no free text from the page, bounded size.
export function compactContext(c){
 const o={};for(const k of ['name','index','total','minute','plannedMinutes','budget','reserve','slopeDeg','sol','atStop','next','nextMeters','distanceM','baseMeters'])if(c?.[k]!=null)o[k]=c[k];
 o.slopeCheck=c?.slopeCheck?{maxDeg:c.slopeCheck.maxDeg,overLimitMeters:c.slopeCheck.overLimitMeters,limitDeg:c.slopeCheck.limitDeg}:null;
 o.explanations=(c?.explanations||[]).slice(0,6).map(e=>({title:e.title,text:e.text,atMeters:e.atMeters}));
 o.terrainNear=c?.terrainNear?{name:c.terrainNear.name,meters:c.terrainNear.meters,dir:c.terrainNear.dir,share:c.terrainNear.share,analysedPct:c.terrainNear.analysedPct}:null;
 o.stops=(c?.stopNames||[]).slice(0,20);o.instructions=(c?.instructions||[]).slice(0,3).map(i=>({name:i.name,target:i.target,record:i.record}));
 return o;
}
