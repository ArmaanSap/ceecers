// DOM glue for the walking simulator, notification feed, science log, site panel and summary.
// Logic lives in walk-sim.js / notifications.js / mission-log.js / site-info.js / poi-store.js.
import {WalkSim,buildTimeline,planReturn,PLAYBACK_RATES,CAMERA_MODES,bearing} from './walk-sim.js';
import {composeInstructions,buildDirections,VISIT_TASK} from './region-tasks.js';
import {sfx} from './hardware.js';
import {makeDraggable} from './draggable.js';
import {briefStop,ask as askCapcom,debrief,liveStatus,CAPCOM_URL} from './capcom.js';
import {distance} from './routing.js';
import {nearestViews} from './live-views.js';
import {checkRouteSlope} from './slope-router.js';
import {NotificationFeed,SIMULATED_EVENTS} from './notifications.js';
import {MissionLog} from './mission-log.js';
import {describeSite} from './site-info.js';
import {drawMinimap} from './minimap.js';

const $=s=>document.querySelector(s)||document.createElement('div'),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SEV_LABEL={info:'INFO',caution:'CAUTION',warning:'WARNING',critical:'CRITICAL'};
const PROV_LABEL={historical:'REAL · HISTORICAL',modeled:'MODELED',simulated:'SIMULATED DRILL',derived:'DERIVED FROM PLAN'};
const fmtT=m=>{m=Math.max(0,Math.round(m));return `T+${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`};

export function createSimulatorUI(deps){
 const {plan,graph,panos,base,bounds,store,getRoute,getSettings,getBlocked,postToScene,openPano,toast,onPosition,onPoisChanged,getSlope,setPin,experiments}=deps;
 let lastNext=null,explained=new Set(),instrCache=new Map(),route=null,settings=null,sim=null,feed=null,log=null,raf=0,lastFrame=0,lastSend=0,resumeAfterPano=false,site=null,summaryShown=false;
 $('#simRate').innerHTML=PLAYBACK_RATES.map(r=>`<option value="${r}"${r===5?' selected':''}>${r}x</option>`).join('');
 {const mm=$('#minimap');if(mm)makeDraggable(mm,{key:'marswalk-minimap-pos',storage:globalThis.localStorage})}
 // Latching rate keys in place of a dropdown: one is always down.
 const rk=document.createElement('span');rk.id='rateKeys';rk.setAttribute('role','group');rk.setAttribute('aria-label','Playback rate');
 rk.innerHTML=PLAYBACK_RATES.map(r=>`<button type="button" class="keycap${r===5?' on':''}" data-rate="${r}" aria-pressed="${r===5}">${r}x</button>`).join('');$('#simRate').after(rk);
 rk.addEventListener('click',e=>{const b=e.target.closest('[data-rate]');if(!b)return;$('#simRate').value=b.dataset.rate;$('#simRate').dispatchEvent(new Event('change'));rk.querySelectorAll('button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});sfx('latch')});
 const cameraLabels={overhead:'Top-down map (whole route)',topfollow:'Top-down follow',follow:'Chase',free:'Free (my camera)',first:'First person',third:'Third person'};
 $('#simCamera').innerHTML=CAMERA_MODES.map(m=>`<option value="${m}">${cameraLabels[m]}</option>`).join('');

 function newLog(){const l=new MissionLog(),o=l.add.bind(l);l.add=(...a)=>{const e=o(...a);renderLog();return e};if(route)l.planTasks([...(route.baseTasks||[]).map(t=>({key:`base-${t.id}`,stop:'Martian Base',name:t.name,minutes:t.min})),...route.stops.flatMap(p=>p.tasks.map(t=>({key:`${p.id}-${t.id}`,stop:p.name,name:t.name,minutes:t.min})))]);return l}
 function newFeed(){const f=new NotificationFeed({panos,slopeLimitDeg:Math.min(settings.maxGrade,20),reserveMinutes:Math.ceil(settings.budget*.2),missionMinutes:settings.budget});f.onChange=()=>renderFeed();return f}
 log=newLog();
 // ---------- feed ----------
 function renderFeed(){
  const items=feed?[...feed.items].reverse():[],min=$('#feedFilter').value;
  const rank={info:0,caution:1,warning:2,critical:3},shown=items.filter(i=>rank[i.severity]>=rank[min]);
  $('#feedList').innerHTML=shown.length?shown.map(i=>`<li class="feeditem sev-${i.severity}" data-id="${i.id}"><div class="feedmeta"><span class="sev">${SEV_LABEL[i.severity]}</span><span class="prov prov-${i.provenance}">${PROV_LABEL[i.provenance]}</span><span>${fmtT(i.minute)}</span></div><strong>${esc(i.title)}</strong><p>${esc(i.body)}</p><small>Source: ${esc(i.source)}</small>${i.actions?.length?`<div class="feedactions">${i.actions.map(a=>`<button data-act="${a}" data-id="${i.id}">${{open:'Open panorama',vr:'Enter in VR',return:'Keep walking',abort:'Abort · return to base'}[a]}</button>`).join('')}</div>`:''}</li>`).join(''):'<li class="feedempty">No notifications yet. Start MARVIN to receive terrain, science, atmosphere and discovery alerts.</li>';
  const c=feed?.counts()||{info:0,caution:0,warning:0,critical:0};$('#feedCounts').textContent=`${c.critical} critical · ${c.warning} warning · ${c.caution} caution · ${c.info} info`;const sc=$('#feedCountsShort');if(sc)sc.textContent=`${(c.critical||0)+(c.warning||0)+(c.caution||0)+(c.info||0)} items`;
 }
 function raise(items){for(const i of items||[]){if(voiceable(i)){showAlert(i);if(i.severity==='critical'||i.severity==='warning')glitch()}log.add('notice',i.title,{minute:i.minute,detail:`${SEV_LABEL[i.severity]} · ${i.source}`,provenance:i.provenance})}renderFeed()}
 $('#feedFilter').onchange=renderFeed;
 function doAction(act,item){
  if(act==='abort')abort();
  else if(act==='return'){resumeAfterPano=false;if(sim?.state==='paused')play()}
  else if(item.panoramaId!=null){const p=panos.find(p=>p.id===item.panoramaId);if(p){if(sim?.state==='playing'){sim.pause();resumeAfterPano=true;syncControls()}openPano(p);if(act==='vr'){toast('Panorama open. Choose “Enter VR” if your headset is connected.');$('#enterVR')?.focus()}}}
 }
 $('#feedList').addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(!b)return;const item=feed.items.find(i=>i.id===+b.dataset.id);if(item)doAction(b.dataset.act,item)});
 // Alerts appear at the top of the screen like a teletype slip: they warm up on a CRT, then fade. Warnings stay until dismissed.
 const ACT_LABEL={open:'Open panorama',vr:'Enter in VR',return:'Keep walking',abort:'Abort · return to base'};
 // Alerts are merged into CAPCOM: they arrive as messages in the CAPCOM log (no popups). Only warnings and criticals
 // are voiced, at most one per 4 mission minutes (criticals always), and the ALERTS toggle silences the rest.
 const alertsOn=()=>{try{return localStorage.getItem('marswalk-alerts')!=='off'}catch{return true}};
 let lastVoiced=-1e9;
 function capToast(title,text,sev='info',ms){
  let box=document.getElementById('capToasts');if(!box){box=document.createElement('div');box.id='capToasts';box.setAttribute('aria-live','polite');document.body.append(box)}
  const el=document.createElement('div');el.className='captoast sev-'+sev;el.innerHTML=`<img src="assets/media/capcom.svg" alt=""><div><b>${esc(title)}</b><span>${esc(text)}</span></div><button type="button" aria-label="Dismiss">✕</button>`;
  const close=()=>{el.classList.add('out');setTimeout(()=>el.remove(),260)};el.querySelector('button').onclick=close;box.append(el);while(box.children.length>3)box.firstChild.remove();
  setTimeout(close,ms||(sev==='critical'?12000:sev==='warning'?9000:7000));
 }
 function showAlert(i){
  const log=$('#capLog');if(!log)return;const el=document.createElement('div');el.className=`capmsg alertmsg sev-${i.severity}`;el.setAttribute('role',i.severity==='critical'?'alert':'status');
  el.innerHTML=`<b>CAPCOM</b> <em>${SEV_LABEL[i.severity]} · ${PROV_LABEL[i.provenance]||''} · ${fmtT(i.minute)}</em><span><strong>${esc(i.title)}.</strong> ${esc(i.body||'')}</span>${i.actions?.length?`<div class="feedactions">${i.actions.map(a=>`<button data-act="${a}">${ACT_LABEL[a]}</button>`).join('')}</div>`:''}`;
  el.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{doAction(b.dataset.act,i);b.disabled=true});
  log.append(el);while(log.children.length>14)log.firstChild.remove();log.scrollTop=log.scrollHeight;
  capToast(`CAPCOM · ${SEV_LABEL[i.severity]}`,`${i.title}. ${i.body||''}`.trim(),i.severity);
  const d=$('#capcom');if(d&&!d.open)d.open=true;sfx('alert');
 }
 function voiceable(i){
  if(/drill/i.test(i.source||''))return true;   // drills are explicit user actions
  if(!alertsOn())return false;
  if(i.severity==='critical')return true;
  if(i.severity!=='warning')return false;
  if((i.minute??0)-lastVoiced<4)return false;lastVoiced=i.minute??0;return true;
 }
 function notify(text){toast(String(text))}
 // VHS tracking glitch: a short band of noise sweeps the map, like a tape hiccup.
 function glitch(){const g=$('#vhsGlitch');if(!g)return;g.classList.remove('on');void g.offsetWidth;g.classList.add('on')}
 $('#panoDialog').addEventListener('close',()=>{if(resumeAfterPano&&sim?.state==='paused'){resumeAfterPano=false;play()}});

 // ---------- simulator ----------
 function readout(pos){
  if(!sim)return;const where=pos?.kind==='science'?`Science at ${pos.toName}`:sim.returning?'Returning to Martian Base':`Walking to ${pos?.toName||'next stop'}`;
  $('#simClock').textContent=`${fmtT(sim.missionMinute)} · ${Math.round(sim.walkedMeters)} m walked`;
  $('#simReadout').textContent=`${sim.state.toUpperCase()} · ${where}${pos&&pos.kind==='walk'?` · grade ${pos.gradeDeg.toFixed(0)}°`:''}`;
  $('#simScrub').value=String(Math.round(sim.minute/Math.max(1e-9,sim.total)*1000));osd();plan?.progress({state:sim.state,toName:pos?.toName,kind:pos?.kind,returning:sim.returning,minute:sim.missionMinute});
 }
 // Camcorder-style on-screen display and a cassette whose reels turn at the playback rate.
 function osd(){
  const st=sim?.state||'idle',mode=sim?.returning&&st==='playing'?'◀◀ RETURN':{playing:'▶ PLAY',paused:'❚❚ PAUSE',complete:'■ END',idle:'■ STOP',aborted:'■ ABORT'}[st];
  $('#vhsOsd').hidden=st==='idle';const o=$('#osdMode');if(o&&o.textContent!==mode){o.textContent=mode;glitch()}$('#osdCode').textContent=sim?fmtT(sim.missionMinute):'T+0h 00m';
  const dk=$('#simDeck');if(dk)dk.dataset.state=st;const c=$('#cassette');if(c){c.classList.toggle('turning',st==='playing');c.style.setProperty('--reel',`${(3/Math.sqrt(sim?.rate||1)).toFixed(2)}s`)}
 }
 function paintMinimap(pos){const c=$('#minimap');if(!c||!route)return;const r=c.getBoundingClientRect(),d=window.devicePixelRatio||1;if(r.width&&(c.width!==Math.round(r.width*d))){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d)}const g=c.getContext('2d');g.setTransform(d,0,0,d,0,0);drawMinimap(g,c.width/d,c.height/d,{route:route.coords,stops:route.stops.map(p=>p.coord),base:base.coord,pos:pos?.coord,heading:pos?.heading||0,trail,discovered:[...(feed?.discovered||[])].map(id=>panos.find(p=>p.id===id)?.coord).filter(Boolean)});c.hidden=false}
 function sendWalker(pos,force){
  if(!pos)return;const now=performance.now();if(!force&&now-lastSend<60)return;lastSend=now;
  postToScene({type:'marswalk-walker',coord:pos.coord,heading:pos.heading,mode:$('#simCamera').value,trail:trailCoords()});onPosition(pos.coord);paintMinimap(pos);
 }
 let trail=[];function trailCoords(){return trail}
 function syncControls(){
  const has=!!route&&!!route.legs?.length;$('#simPlay').disabled=!has||sim?.state==='complete';$('#simRestart').disabled=!has||!sim||sim.state==='idle';
  $('#simAbort').disabled=!sim||sim.returning||!['playing','paused'].includes(sim.state);$('#simScrub').disabled=!sim||sim.returning||sim.state==='idle';
  $('#simPlay').textContent=!sim||sim.state==='idle'?'▶ Start':sim.state==='playing'?'Ⅱ Pause':sim.state==='complete'?'Complete':'▶ Resume';
  osd();$('#simulate').disabled=!has;$('#simulate').textContent=sim?.state==='playing'?'Ⅱ Pause walk':'▶ Start walk';$$('[data-drill]').forEach(b=>b.disabled=!sim||!['playing','paused'].includes(sim.state));
 }
 function build(){
  stopLoop();closeTask();sim=null;trail=[];explained=new Set();instrCache=new Map();postToScene({type:'marswalk-walker',clear:true});onPosition(null);summaryShown=false;
  if(!route?.legs?.length){const mm=$('#minimap');if(mm)mm.hidden=true;feed=null;log=newLog();renderFeed();renderLog();syncControls();$('#simReadout').textContent='Generate a mission to enable the simulator.';$('#simClock').textContent='T+0h 00m';return}
  $('#deckSpeed').textContent=settings.speed;
  feed=newFeed();log=newLog();
  renderFeed();renderLog();syncControls();$('#simReadout').textContent='Ready. Press Start to walk the route.';paintMinimap(null);$('#simClock').textContent='T+0h 00m';$('#simScrub').value='0';
 }
 function ensureSim(){
  if(sim)return;sim=new WalkSim(buildTimeline(route.legs,settings.speed),{rate:+$('#simRate').value});
  sim.on(e=>{
   if(e.type==='start'){feed.start();feed.push({key:'slope-model',severity:'info',category:'terrain',title:'Slope model status',provenance:'derived',source:'MARVIN pathfinding',body:getSlope().status});log.add('start','MARVIN started',{minute:0,coord:route.coords[0],detail:`Walking speed ${settings.speed} km/h`});raise([])}
   if(e.type==='segment'){const s=e.segment;if(s.kind==='science'){
     const stop=route.stops.find(p=>p.name===s.name),isBase=s.name==='Martian Base'||!stop,names=(isBase?(route.baseTasks||[]):(stop?.tasks||[])).map(t=>t.name);
     log.add('arrive',isBase?'Arrived at Martian Base':`Arrived at ${s.name}`,{minute:e.missionMinute,coord:s.coord,detail:isBase?'Base tasks / handoff window':names.join('; ')});
     const it=isBase?null:feed.science(s.name,names,e.missionMinute);if(it)renderFeed();
     openTask(e,s,isBase?null:stop)}   // pauses the walk and shows the full instructions
    else if(!sim.returning)log.add('depart',`Heading to ${s.toName}`,{minute:e.missionMinute})}
   if(e.type==='abort'){log.add('abort','Aborted: returning to Martian Base',{minute:e.missionMinute,coord:e.coord,detail:`Return estimate ${Math.ceil(e.returnMinutes)} min`});feed.push({key:'abort-'+e.missionMinute,minute:e.missionMinute,severity:'warning',category:'safety',title:'Abort: returning to base',provenance:'derived',source:'MARVIN planner',body:`Return path along the recorded rover network. About ${Math.ceil(e.returnMinutes)} min at ${settings.speed} km/h.`});renderFeed()}
   if(e.type==='complete'){log.add('complete',e.aborted?'Returned to base after abort':'Returned to Martian Base',{minute:e.missionMinute});stopLoop();syncControls();showSummary()}
   if(e.type==='restart'){closeTask();explained=new Set();instrCache=new Map();trail=[];postToScene({type:'marswalk-walker',clear:true});feed=newFeed();log=newLog();summaryShown=false;renderFeed();renderLog()}
  });
 }
 function frame(t){
  if(!sim||sim.state!=='playing'){raf=0;return}
  const dt=Math.min(.25,(t-lastFrame)/1000);lastFrame=t;
  const pos=sim.tick(dt);if(pos){if(pos.kind==='walk'&&(!trail.length||Math.abs(trail.at(-1)[0]-pos.coord[0])+Math.abs(trail.at(-1)[1]-pos.coord[1])>1e-6))trail.push([pos.coord[0],pos.coord[1]]);
   raise(feed.update(pos,{minute:sim.missionMinute}));explain(pos);sendWalker(pos);readout(pos)}
  syncControls();if(sim.state==='playing')raf=requestAnimationFrame(frame);else raf=0;
 }
 // Route explanations: when the astronaut reaches an odd-looking bend or detour, say why the planner chose it.
 function explain(pos){
  if(!route?.explanations?.length||sim.returning||pos.kind!=='walk')return;
  for(const [k,x] of route.explanations.entries()){
   if(explained.has(k)||pos.distanceM<x.atMeters)continue;explained.add(k);
   const it=feed.push({key:'why-'+k,minute:sim.missionMinute,severity:'info',category:'terrain',title:'Why this path? '+x.title,provenance:'derived',source:'MARVIN route planner',body:x.text});if(it)raise([it]);
  }
 }
 function skipExplained(pos){if(route?.explanations)route.explanations.forEach((x,k)=>{if(pos.distanceM>=x.atMeters)explained.add(k)})}
 // ---------- arrival popup ----------
 function openTask(e,seg,stop){
  sim.pause();stopLoop();sim.seek(seg.start);const pos=sim.position();sendWalker(pos,true);readout(pos);syncControls();
  const isBase=!stop,tasks=isBase?(route.baseTasks||[]):stop.tasks;
  const keyOf=t=>isBase?`base-${t.id}`:`${stop.id}-${t.id}`,rng=Math.random;
  const cards=tasks.map(t=>{const k=keyOf(t);if(!instrCache.has(k))instrCache.set(k,composeInstructions(t.id,rng)||{id:t.id,name:t.name,summary:t.task||'',target:'',steps:[],record:'',note:'',minutes:t.min,gear:t.gear||''});return {k,t,c:instrCache.get(k)}});
  cards.forEach(({c,t})=>{if(c.target)log.add('task',`${c.name}: look for ${c.target}`,{minute:e.missionMinute,detail:c.record,provenance:'simulated'})});
  const segs=sim.tl.segments,nextWalk=segs.slice(e.index+1).find(x=>x.kind==='walk');
  const next=nextWalk?nextWalk.toName:null,nb=nextWalk?bearing(nextWalk.coords[0],nextWalk.coords[Math.min(nextWalk.coords.length-1,Math.max(1,Math.floor(nextWalk.coords.length/3)))]):null;
  const dirs=buildDirections({stop:stop||{name:'Martian Base'},arrivalHeading:pos?.heading??null,next,nextBearing:nb,nextMeters:nextWalk?.total??null,custom:!!stop?.custom,returning:!next||next==='Martian Base'});
  const idx=stop?route.stops.indexOf(stop)+1:0;
  $('#taskEyebrow').textContent=isBase?'BASE OPERATION · '+fmtT(e.missionMinute):`STOP ${String(idx).padStart(2,'0')} OF ${route.stops.length} · ${fmtT(e.missionMinute)}`;
  $('#taskTitle').textContent=isBase?'Martian Base':seg.name;
  $('#taskBody').innerHTML=cards.length?cards.map(({k,t,c})=>`<section class="taskcard"><h3><span class="ticon">${esc(t.icon||'◇')}</span> ${esc(c.name)} <small>${c.minutes} min · ${esc(c.gear)}</small></h3><p>${esc(c.summary)}</p>${c.target?`<p class="target"><span>LOOK FOR</span> <strong>${esc(c.target)}</strong></p>`:''}${c.steps.length?`<ol>${c.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}${c.record?`<p class="record">${esc(c.record)}</p>`:''}${c.note?`<small class="notice">${esc(c.note)}</small>`:''}<label class="switch"><input type="checkbox" data-dtask="${esc(k)}" ${log.tasks.get(k)?.done?'checked':''}><i></i> Mark done</label></section>`).join(''):'<p>No planned task here. Look around, take a photo and compare it with the panorama.</p>';
  lastNext={name:next,meters:nextWalk?.total??null};
  const slackMin=Math.max(0,settings.budget*.8-route.minutes),slopeHere=getSlope()?.sample?.slopeDeg(seg.coord[0],seg.coord[1]);
  const brief=briefStop({name:isBase?'Martian Base':seg.name,index:isBase?null:idx,total:route.stops.length,minute:e.missionMinute,sol:stop?.sol??null,slopeDeg:slopeHere,tasks:cards.map(x=>x.c.name),taskMinutes:cards.reduce((n,x)=>n+x.c.minutes,0),reserveLeft:slackMin,next,nextBearing:nb,nextMeters:nextWalk?.total??null});
  $('#taskCapcom').textContent=brief;capSay('CAPCOM',brief,'SCRIPTED');
  $('#taskDirections').innerHTML=`<h3>Directions</h3><ul>${dirs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  const pano=stop&&!stop.custom?panos.find(p=>p.id===stop.id):null;$('#taskPano').hidden=!pano;$('#taskPano').onclick=()=>pano&&openPano(pano);
  $('#taskGo').onclick=()=>{const d=$('#taskDialog');if(d.open)d.close();sim.seek(seg.start+seg.dur-1e-6);if(sim.state==='paused'){sim.setRate(+$('#simRate').value);sim.play();startLoop()}syncControls()};
  const d=$('#taskDialog');if(!d.open)d.showModal();sfx('relay');glitch();
 }
 // ---------- CAPCOM ----------
 function capSay(who,text,src){const l=$('#capLog');if(!l)return;const d=document.createElement('div');d.className='capmsg '+(who==='YOU'?'you':'cap');d.innerHTML=`<b>${who}</b>${src?` <em>${esc(src)}</em>`:''}<span>${esc(text)}</span>`;l.append(d);while(l.children.length>14)l.firstChild.remove();l.scrollTop=l.scrollHeight}
 let toolApi=null,capLive=false;liveStatus().then(v=>{capLive=v;const m=$('#capMode');if(m)m.textContent=v?'live Claude · facts only':'scripted · from mission data'});
 function nearTerrain(pos){
  const ai=deps.getTerrainAI?.();if(!ai?.panoramas)return null;const from=pos?.coord||base?.coord;if(!from)return null;
  const v=nearestViews(panos,from,distance,1)[0],t=v&&ai.panoramas[String(v.pano.id)];if(!t)return null;
  return {name:v.pano.name,meters:Math.round(v.meters/5)*5,dir:v.dir,share:t.share,analysedPct:t.analysedPct};
 }
 function capContext(){
  const terrainNear=nearTerrain(sim?.position());
  if(!route?.legs?.length)return {hasRoute:false,terrainNear};const pos=sim?.position(),stop=pos?route.stops.find(p=>p.name===pos.toName):null,sample=getSlope()?.sample;
  return {hasRoute:true,terrainNear,name:pos?.toName||'the first stop',index:stop?route.stops.indexOf(stop)+1:null,total:route.stops.length,minute:sim?.missionMinute||0,plannedMinutes:Math.ceil(route.minutes),budget:settings.budget,reserve:Math.ceil(settings.budget*.2),slopeDeg:pos&&sample?sample.slopeDeg(pos.coord[0],pos.coord[1]):NaN,slopeCheck:route.slopeCheck,sol:stop?.sol??null,atStop:pos?.kind==='science',explanations:route.explanations,distanceM:pos?.distanceM,baseMeters:pos?distance(pos.coord,base.coord):null,instructions:stop?stop.tasks.map(t=>instrCache.get(`${stop.id}-${t.id}`)).filter(Boolean):[],stopNames:route.stops.map(s=>s.name),next:lastNext?.name,nextMeters:lastNext?.meters}
 }
 // A route-note popup asks CAPCOM to explain one point. Live Claude answers when the backend is up; otherwise the popup keeps the
 // measured route facts and says so. Either way the answer is added to the CAPCOM history.
 async function explainPoint(title,question,fallback){
  if(capLive){try{const r=await askCapcom(question,capContext(),{url:CAPCOM_URL,api:null,timeoutMs:20000});if(r.source==='LIVE AI'&&r.text){capSay('CAPCOM',`${title}: ${r.text}`,'LIVE AI · route point');return {text:r.text,source:'LIVE AI'}}}catch{}}
  capSay('CAPCOM',`${title}: ${fallback}`,'ROUTE DATA');return {text:'Live CAPCOM is offline, so these are the measured facts for this point (shown above).',source:'ROUTE DATA'};
 }
 async function capAsk(q){q=String(q||'').trim();if(!q)return;capSay('YOU',q);const r=await askCapcom(q,capContext(),{url:capLive?CAPCOM_URL:null,api:deps.getTools?.()||toolApi,timeoutMs:20000});capSay('CAPCOM',r.text,r.actions?.length?`${r.source} · ${[...new Set(r.actions)].join(', ')}`:r.source);$('#capMode').textContent=r.source==='LIVE AI'?'live Claude · facts only':capLive?'scripted fallback · live call failed':'scripted · from mission data';sfx('blip')}
 const syncAlertBtn=()=>{const b=$('#alertsToggle');if(!b)return;const on=alertsOn();b.setAttribute('aria-pressed',String(on));b.textContent='Alerts: '+(on?'ON':'OFF')};
 $('#alertsToggle')?.addEventListener('click',()=>{try{localStorage.setItem('marswalk-alerts',alertsOn()?'off':'on')}catch{}syncAlertBtn();capSay('CAPCOM',alertsOn()?'Alerts on: I will call out warnings and critical events.':'Alerts off: I will stay quiet unless you ask. Everything is still logged.','SYSTEM')});syncAlertBtn();
 const WELCOME='Welcome to M.A.R.V.I.N. at Jezero Crater. I am CAPCOM: I explain your route, warn about steep ground and point out real panoramas. Click a map point, pick a task, then Make route.';
 $('#capInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#capForm').requestSubmit()}});
 $('#capForm')?.addEventListener('submit',e=>{e.preventDefault();const i=$('#capInput');const q=i.value;i.value='';capAsk(q)});
 $$('#capcom [data-q]').forEach(b=>b.onclick=()=>capAsk(b.dataset.q));
 function closeTask(){const d=$('#taskDialog');if(d?.open)d.close()}
 document.addEventListener('change',e=>{
  const k=e.target.dataset?.dtask||e.target.dataset?.task;if(!k||!log)return;
  log.setTask(k,e.target.checked);
  $$(`[data-task="${CSS.escape(k)}"],[data-dtask="${CSS.escape(k)}"]`).forEach(x=>{if(x!==e.target)x.checked=e.target.checked});
  if(e.target.checked)log.add('task',`Task done: ${log.tasks.get(k)?.name||k}`,{minute:sim?.missionMinute||0,detail:log.tasks.get(k)?.stop||'',provenance:'simulated'});
 });
 function startLoop(){if(raf)return;lastFrame=performance.now();raf=requestAnimationFrame(frame)}
 function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0}
 function play(){if(!route?.legs?.length)return;ensureSim();if(sim.state==='complete')return;if(sim.state==='playing'){sim.pause();stopLoop()}else{sim.setRate(+$('#simRate').value);sim.play();startLoop()}syncControls();readout(sim.position())}
 function abort(){
  if(!sim)return;const pos=sim.position();const sl=getSlope();const direct=sl&&sl.mode==='dem'?{check:c=>{try{const r=checkRouteSlope(sl,c,20);return {ok:r.totalMeters>0&&r.outsideMeters===0&&r.overLimitMeters===0&&Number.isFinite(r.maxDeg),maxDeg:r.maxDeg}}catch{return {ok:false}}}}:null;const legs=planReturn(graph,pos.coord,base.node,{blocked:getBlocked(),direct});
  if(!legs){toast('No return path found along the recorded network.');return}
  const ri=legs.info;if(sim.abort(legs)){if(ri)capSay('CAPCOM',ri.mode==='direct'?`Abort: taking the FASTEST way home, a direct line of ${Math.round(ri.meters)} m${ri.networkMeters?` instead of ${Math.round(ri.networkMeters)} m by the recorded track`:''}. DEM check: steepest ground ${ri.directMaxDeg.toFixed(1)}° (modelled, not measured; rocks are not modelled).`:`Abort: fastest available way home is the recorded track, ${Math.round(ri.meters)} m${ri.directMeters?'':' (a direct line was not DEM-verified)'}.`,'SYSTEM');if(!raf&&sim.state==='playing')startLoop();syncControls()}
 }
 function showSummary(){
  if(summaryShown)return;summaryShown=true;const ctx=logContext();const s=log.summary(ctx);
  $('#summaryBody').innerHTML=`<p class="outcome">${esc(s.outcome)}</p><dl class="summarygrid"><div><dt>Mission time</dt><dd>${s.elapsedMinutes} / ${s.plannedMinutes} min planned</dd></div><div><dt>Distance walked</dt><dd>${(s.walkedMeters/1000).toFixed(2)} km</dd></div><div><dt>Tasks completed</dt><dd>${s.tasksCompleted} of ${s.tasksPlanned}</dd></div><div><dt>Panoramas discovered</dt><dd>${s.panoramasDiscovered}</dd></div><div><dt>Custom points</dt><dd>${s.customPoints}</dd></div><div><dt>Alerts</dt><dd>${s.notifications.critical||0} critical · ${s.notifications.warning||0} warning</dd></div></dl><p><span class="prov prov-modeled">MODELED</span> Estimated radiation about ${s.radiationEstimate.mSv} mSv. ${esc(s.radiationEstimate.basis)}</p><p class="caveat">Simulation on historical rover corridors. Not EVA-certified. Tick off tasks in the itinerary to record what you completed.</p>`;
  {const d=debrief(s);if(d){$('#summaryBody').insertAdjacentHTML('beforeend',`<p class="capcomline">${esc(d)}</p>`);capSay('CAPCOM',d,'SCRIPTED')}}
  if(!$('#summaryDialog').open)$('#summaryDialog').showModal();
 }
 function logContext(){return {route,settings,sim,discovered:[...(feed?.discovered||[])].map(id=>({id,name:panos.find(p=>p.id===id)?.name})),counts:feed?.counts()||{},aborted:!!sim?.aborted,customPois:store.list().map(({id,name,coord,note})=>({id,name,coord,note}))}}
 function renderLog(){
  $('#logList').innerHTML=log.entries.length?[...log.entries].reverse().map(e=>`<li><span>#${e.n} · ${fmtT(e.minute)}</span> <strong>${esc(e.title)}</strong>${e.detail?`<small>${esc(e.detail)} · ${esc(e.provenance)}</small>`:''}</li>`).join(''):'<li class="feedempty">The log fills in as you walk. Task check-boxes in the itinerary are recorded here.</li>';
 }
  $('#simPlay').onclick=play;$('#simulate').onclick=play;
 $('#simRestart').onclick=()=>{if(sim){sim.restart();stopLoop();syncControls();$('#simReadout').textContent='Restarted. Press Start.';$('#simScrub').value='0';$('#simClock').textContent='T+0h 00m'}};
 $('#simAbort').onclick=abort;
 $('#simRate').onchange=()=>{if(sim)sim.setRate(+$('#simRate').value)};
 $('#simCamera').onchange=()=>{if(sim){const p=sim.position();sendWalker(p,true)}};
 $('#simScrub').oninput=()=>{if(!sim||sim.returning)return;const p=sim.seek(+$('#simScrub').value/1000*sim.total);skipExplained(p);sendWalker(p,true);readout(p);onPosition(p.coord)};
 $$('[data-drill]').forEach(b=>b.onclick=()=>{if(!feed)return;const i=feed.simulate(b.dataset.drill,sim?.missionMinute||0);raise([i]);if(SIMULATED_EVENTS[b.dataset.drill].abort)toast('Drill: abort and return is recommended. Use the Abort button.')});
 $('#showSummary').onclick=()=>{summaryShown=false;showSummary()};$('#closeSummary').onclick=()=>$('#summaryDialog').close();
 const download=(name,type,text)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
 $('#exportLog').onclick=()=>{if(!route){toast('Generate a mission first.');return}download('marvin-science-log.json','application/json',JSON.stringify(log.toJSON(logContext()),null,2));toast('Science log exported')};
 $('#printLog').onclick=()=>{if(!route){toast('Generate a mission first.');return}const w=window.open('','_blank');if(!w){toast('Allow pop-ups to print the log.');return}w.document.write(log.toPrintableHTML(logContext()));w.document.close();w.focus();w.print()};
 $('#exportSummaryJson').onclick=$('#exportLog').onclick;$('#printSummary').onclick=$('#printLog').onclick;

 // ---------- site panel & custom POIs ----------
 function renderPoiList(){
  const list=store.list();$('#poiList').innerHTML=list.length?list.map(p=>`<li data-id="${p.id}"><div><strong>${esc(p.name)}</strong><small>${p.coord[1].toFixed(4)}° N · ${p.coord[0].toFixed(4)}° E${p.useInMission?' · mission waypoint':''}</small></div><div class="poiops"><label><input type="checkbox" data-use="${p.id}" ${p.useInMission?'checked':''}> Waypoint</label><button data-rename="${p.id}">Rename</button><button data-del="${p.id}">Delete</button></div></li>`).join(''):'<li class="feedempty">No saved points. Click anywhere on the 3D terrain to pin one.</li>';
 }
 function nearestCustom(lon,lat){let best=null,d=60;for(const c of store.list()){const k=distance([lon,lat],c.coord);if(k<d){d=k;best=c}}return best}
 function renderRecs(){
  if(!site)return;const poi=site.poi!=null?panos.find(p=>p.id===site.poi):null,cust=poi?null:nearestCustom(site.lon,site.lat);
  const on=id=>poi?deps.getPick(poi.id).has(id):!!cust&&(cust.useInMission&&(cust.experimentIds||[]).includes(id));
  $('#siteRecs').innerHTML=site.recommendations.length?site.recommendations.map(r=>`<li><button type="button" class="taskadd${on(r.id)?' on':''}" data-rec="${esc(r.id)}" aria-pressed="${on(r.id)}"><span class="plus">${on(r.id)?'✓':'+'}</span><span class="tname">${esc(r.name)}</span><em>${r.min?r.min+' min':''}</em></button><small>${esc(r.why.join(' '))}</small></li>`).join(''):'<li class="feedempty">No tasks here: outside the Jezero data area.</li>';
 }
 function showSite(s){
  site=s;const poi=s.poi!=null?panos.find(p=>p.id===s.poi):null;$('#pinBubble').hidden=false;
  $('#pinTitle').textContent=poi?(poi.id===base.id?'Martian Base':poi.name):s.nearestPano&&s.panoDist<150?`Near ${s.nearestPano.name}`:'Selected point';
  const t=s.traversability;
  $('#siteClass').innerHTML=t?`<span class="clsbadge" style="--c:${t.color}">CLASS ${t.class}</span><div><strong>${esc(t.label)}</strong><small>${esc(t.range)} slope · ${esc(t.source)}</small></div>`:`<span class="clsbadge none">NO CLASS</span><div><strong>No DEM here</strong><small>Outside the slope model</small></div>`;
  $('#siteExplain').textContent=s.explanation||'';
  $('#siteFields').innerHTML=s.fields.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}<small>${esc(f.source||'')}${f.provenance?` · ${esc(f.provenance)}`:''}</small></dd></div>`).join('');
  $('#siteCautions').innerHTML=s.cautions.map(c=>`<p class="notice">${esc(c)}</p>`).join('');
  renderRecs();
  $('#sitePoiName').value='';$('#sitePoiName').placeholder=s.nearestPano&&s.panoDist<400?`Near ${s.nearestPano.name}`:`Point ${store.list().length+1}`;
  $('#savePoi').hidden=!!poi;$('#sitePoiName').hidden=!!poi;$('#savePoi').disabled=!s.covered;
  const pano=poi?panos.find(p=>p.id===poi.id):null;$('#sitePano').hidden=!pano;$('#sitePano').onclick=()=>pano&&openPano(pano);
 }
 $('#siteRecs').addEventListener('click',e=>{
  const b=e.target.closest('button[data-rec]');if(!b||!site)return;const id=b.dataset.rec;sfx('latch');
  if(site.poi!=null){deps.togglePick(site.poi,id);renderRecs();return}
  // any other point on the map: save it as your own point and add or remove the task
  try{
   let c=nearestCustom(site.lon,site.lat),ids;
   if(!c){c=store.add({lon:site.lon,lat:site.lat,elev:site.elevation,name:$('#sitePoiName').value||$('#sitePoiName').placeholder.replace(/^Near /,'Point near ')||'',experimentIds:[],site:{region:site.regionName,nodeDist:Math.round(site.nodeDist)}})}
   ids=new Set(c.experimentIds||[]);if(ids.has(id))ids.delete(id);else ids.add(id);
   store.update(c.id,{experimentIds:[...ids],useInMission:ids.size>0});renderPoiList();onPoisChanged(true);renderRecs();
  }catch(err){toast(err.message)}
 });
 function handleMapClick({lon,lat,sx,sy}){
  if(!Number.isFinite(lon)||!Number.isFinite(lat))return;
  const s=describeSite(lon,lat,{graph,panos,base,bounds,terrain:getSlope().sample});showSite(s);setPin({lon,lat});placeBubble(sx,sy);
 }
 // Anchor the bubble beside the clicked spot, like a map popup: right of it when there is room, else left; kept inside the stage.
 function placeBubble(sx,sy){
  const b=$('#pinBubble'),stage=$('#mapstage');if(!b||!stage)return;const W=stage.clientWidth,H=stage.clientHeight;
  b.classList.remove('crt-on');void b.offsetWidth;b.classList.add('crt-on');
  const bw=Math.min(340,W-16),bh=Math.min(b.offsetHeight||340,H-16);
  if(!Number.isFinite(sx)||!Number.isFinite(sy)){sx=W/2;sy=H/2}
  const right=sx+20+bw<=W-8;let left=right?sx+20:Math.max(8,sx-20-bw),top=Math.max(8,Math.min(H-bh-8,sy-40));
  b.style.width=bw+'px';b.style.left=left+'px';b.style.top=top+'px';b.style.setProperty('--ty',Math.max(14,Math.min(bh-14,sy-top))+'px');b.classList.toggle('tail-left',right);b.classList.toggle('tail-right',!right);
 }
 $('#savePoi').onclick=()=>{
  if(!site)return;const ids=$$('#siteRecs input:checked').map(i=>i.dataset.rec);
  try{const poi=store.add({lon:site.lon,lat:site.lat,elev:site.elevation,name:$('#sitePoiName').value||$('#sitePoiName').placeholder.replace(/^Near /,'Point near ')||'',experimentIds:ids,site:{region:site.regionName,nodeDist:Math.round(site.nodeDist)}});
   renderPoiList();onPoisChanged();toast(`Saved “${poi.name}”. Tick “Waypoint” to include it in the mission.`)}catch(e){toast(e.message)}
 };
 $('#dismissSite').onclick=()=>{$('#pinBubble').hidden=true;site=null;setPin(null)};
 $('#poiList').addEventListener('click',e=>{
  const del=e.target.closest('[data-del]'),ren=e.target.closest('[data-rename]');
  if(del){const p=store.get(del.dataset.del);if(p&&confirm(`Delete “${p.name}”?`)){store.remove(p.id);renderPoiList();onPoisChanged()}}
  if(ren){const p=store.get(ren.dataset.rename);const n=p&&prompt('Rename point',p.name);if(n&&store.rename(p.id,n)){renderPoiList();onPoisChanged()}}
 });
 $('#poiList').addEventListener('change',e=>{const u=e.target.closest('[data-use]');if(!u)return;const p=store.get(u.dataset.use);if(!p)return;store.update?.(p.id,{useInMission:u.checked});onPoisChanged(true)});
 renderPoiList();renderFeed();renderLog();syncControls();

 return {explainPoint,setTools(a){toolApi=a},say:(t,src,o)=>{capSay('CAPCOM',t,src||'SYSTEM');if(o?.toast!==false&&(o?.force||alertsOn()))capToast('CAPCOM',t,'info')},welcome(){const t=WELCOME;capSay('CAPCOM',t,'WELCOME');capToast('Welcome to M.A.R.V.I.N.','Click the map to start.','info',6000);const d=$('#capcom');if(d&&!d.open)d.open=true},notify,handleMapClick,renderPoiList,reset(){route=null;settings=null;build()},routeChanged(r,s){route=r;settings=s;build()},position:()=>sim?.position()||null,get sim(){return sim},resetSim(){build()},log:()=>log,feed:()=>feed};
}
