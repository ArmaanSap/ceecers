// Right-hand mission plan: one row per stop with ETA and task switches, and live progress while the walk runs.
// Pure DOM glue over the same route object the planner and simulator use.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmtT=m=>{m=Math.max(0,Math.round(m));return `T+${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`};
// Which row is current, from the simulator's position. Returns {active, phase} where active is a stop index, 'base' or -1.
export function progressIndex(route,info){
 if(!route||!info||info.state==='idle')return {active:-1,phase:'idle'};
 if(info.state==='complete')return {active:'done',phase:'done'};
 if(info.returning||info.toName==='Martian Base')return {active:'base',phase:info.kind==='science'?'station':'enroute'};
 const i=route.stops.findIndex(s=>s.name===info.toName);
 return i<0?{active:-1,phase:'enroute'}:{active:i,phase:info.kind==='science'?'station':'enroute'};
}
export function createPlanPanel({root,onFocus=()=>{}}){
 let route=null,settings=null,marks={pinned:new Set(),visit:new Set()},info=null;
 function paint(){
  if(!route||(!route.stops.length&&!route.baseTasks?.length)){root.innerHTML='<p class="planempty">No plan yet.<br>Click a point on the map or a panorama pin, choose a task, then Make route.</p>';return}
  
  const tasksHtml=(tasks,keyOf)=>tasks.map(t=>`<label class="switch plantask"><input type="checkbox" data-task="${esc(keyOf(t))}"><i></i><span>${esc(t.name)} <em>${t.min} min</em></span></label>`).join('');
  root.innerHTML=`<div class="plansummary"><strong>${route.stops.length} stop${route.stops.length===1?'':'s'}</strong> · ${(route.distance/1000).toFixed(2)} km · ${Math.ceil(route.minutes)} min · ascent ${Math.round(route.ascent||0)} m</div>
  <ol class="planlist">
   <li class="planrow base" data-row="start"><span class="idx">⌂</span><div><strong>Martian Base</strong><small>${fmtT(0)} · depart</small></div></li>
   ${route.stops.map((p,i)=>`<li class="planrow" data-row="${i}" data-pano="${esc(p.id)}" tabindex="0" title="Show this stop on the map"><span class="idx">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(p.name)}${marks.pinned.has(p.id)?' <b class="mk" title="Priority">★</b>':''}${marks.visit.has(p.id)?' <b class="mk" title="Chosen visit">➜</b>':''}</strong><small>ETA ${fmtT(p.arrival)}${p.custom?' · your point':''}${p.alsoHere?.length?' · also here: '+esc(p.alsoHere.join(', ')):''}</small><span class="rowstate"></span>${tasksHtml(p.tasks,t=>`${p.id}-${t.id}`)}</div></li>`).join('')}
   <li class="planrow base" data-row="base"><span class="idx">⌂</span><div><strong>Return to Martian Base</strong><small>${fmtT(route.minutes)}</small><span class="rowstate"></span>${tasksHtml(route.baseTasks||[],t=>`base-${t.id}`)}</div></li>
  </ol>`;
  mark();
 }
 function mark(){
  if(!route)return;const {active,phase}=progressIndex(route,info);
  root.querySelectorAll('.planrow').forEach(li=>{
   const r=li.dataset.row,idx=/^\d+$/.test(r)?+r:null;let st='';
   const done=active==='done'||(active==='base'&&idx!=null)||(typeof active==='number'&&idx!=null&&idx<active)||(r==='start'&&active!==-1);
   const here=active===r||(idx!=null&&active===idx);
   li.classList.toggle('done',!!done&&!here);li.classList.toggle('active',!!here);
   const rs=li.querySelector('.rowstate');if(rs)rs.textContent=here?(phase==='station'?'● ON STATION':'▸ EN ROUTE'):(done?'✓ DONE':'');
  });
 }
 root.addEventListener('click',e=>{if(e.target.closest('input,label'))return;const li=e.target.closest('.planrow[data-pano]');if(!li||!route)onFocus(null);else{const p=route.stops.find(s=>String(s.id)===li.dataset.pano);if(p)onFocus(p)}});
 root.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const li=e.target.closest('.planrow[data-pano]');if(li)li.click()});
 paint();
 return {render(r,s,m){route=r;settings=s;marks=m||marks;info=null;root.classList.remove('stale');paint()},clear(){route=null;settings=null;info=null;root.classList.remove('stale');paint()},stale(){if(route)root.classList.add('stale')},progress(i){info=i;mark()}};
}
