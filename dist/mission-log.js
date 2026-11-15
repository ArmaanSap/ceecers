// Science log, completion summary and exports. Plain data in, plain data out (no DOM).
import {GALE_RAD_MSV_DAY} from './notifications.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export class MissionLog{
 constructor(){this.entries=[];this.tasks=new Map()}
 add(kind,title,{minute=0,coord=null,detail='',provenance='simulated'}={}){const e={n:this.entries.length+1,minute:Math.round(minute*10)/10,kind,title,detail,coord:coord&&[coord[0],coord[1]],provenance};this.entries.push(e);return e}
 // tasks: [{key,stop,name,minutes}] planned; completion toggled by the user.
 planTasks(tasks){this.tasks=new Map(tasks.map(t=>[t.key,{...t,done:false,note:''}]))}
 setTask(key,done,note){const t=this.tasks.get(key);if(!t)return false;t.done=!!done;if(note!=null)t.note=String(note).slice(0,500);return true}
 summary({route,settings,sim,discovered=[],counts={},aborted=false,customPois=[]}){
  const tasks=[...this.tasks.values()],done=tasks.filter(t=>t.done);
  const minutes=sim?.missionMinute??0,days=minutes/1440;
  return {
   outcome:aborted?'Aborted and returned to base':(sim?.state==='complete'?'Completed and returned to base':'In progress'),
   plannedMinutes:Math.ceil(route?.minutes||0),elapsedMinutes:Math.round(minutes),
   plannedMeters:Math.round(route?.distance||0),walkedMeters:Math.round(sim?.walkedMeters||0),
   stopsPlanned:route?.stops?.length||0,tasksPlanned:tasks.length,tasksCompleted:done.length,
   panoramasDiscovered:discovered.length,customPoints:customPois.length,notifications:counts,
   radiationEstimate:{mSv:Math.round(GALE_RAD_MSV_DAY*days*1000)/1000,provenance:'modeled',basis:`Scaled from Curiosity's Gale Crater average of ${GALE_RAD_MSV_DAY} mSv/day over the simulated duration. Different site, not a suit-dose or Jezero prediction.`},
   walkingSpeedKmh:settings?.speed
  };
 }
 toJSON(ctx){return {schema:'marswalk.science-log.v1',created:new Date().toISOString(),simulation:true,summary:this.summary(ctx),entries:this.entries,tasks:[...this.tasks.values()],discoveredPanoramas:ctx.discovered,customPois:ctx.customPois,limitations:'Simulated mission on historical rover corridors. Not EVA-certified. Task completion is user-entered. Radiation figure is a labelled model scaled from another site.'}}
 toPrintableHTML(ctx){
  const s=this.summary(ctx);
  return `<!doctype html><meta charset="utf-8"><title>MARVIN science log</title><style>body{font:14px Arial,sans-serif;max-width:780px;margin:30px auto;color:#111}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5px 8px;text-align:left;vertical-align:top}small{color:#444}</style>
<h1>MARVIN mission science log</h1><p><strong>${esc(s.outcome)}</strong> · ${s.elapsedMinutes} of ${s.plannedMinutes} planned minutes · ${s.walkedMeters} m walked · ${s.panoramasDiscovered} panoramas discovered</p>
<p>Tasks completed: ${s.tasksCompleted} of ${s.tasksPlanned}. Estimated radiation (<em>modeled</em>): ${s.radiationEstimate.mSv} mSv. <small>${esc(s.radiationEstimate.basis)}</small></p>
<table><tr><th>#</th><th>Mission min</th><th>Event</th><th>Detail</th><th>Basis</th></tr>${this.entries.map(e=>`<tr><td>${e.n}</td><td>${e.minute}</td><td>${esc(e.title)}</td><td>${esc(e.detail)}</td><td>${esc(e.provenance)}</td></tr>`).join('')}</table>
<h2>Tasks</h2><table><tr><th>Stop</th><th>Task</th><th>Done</th><th>Note</th></tr>${[...this.tasks.values()].map(t=>`<tr><td>${esc(t.stop)}</td><td>${esc(t.name)}</td><td>${t.done?'Yes':'No'}</td><td>${esc(t.note)}</td></tr>`).join('')}</table>
<p><small>Simulation on historical rover corridors. Not EVA-certified. Generated ${esc(new Date().toISOString())}.</small></p>`;
 }
}
