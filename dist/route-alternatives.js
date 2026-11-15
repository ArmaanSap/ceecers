import {planMission} from './routing.js';
export function satisfies(plan,s){return !!(plan.stops.length||plan.baseTasks?.length)&&!(plan.missingIds||s.ids).length&&!(plan.unmetPins||[]).length}
// Small bounded search; never changes walking speed, region, blocked edges or reserve.
export function findAlternative(g,start,candidates,s,blocked=new Set(),pinned=new Set()){
 let best=null;
 for(const maxDistance of [...new Set([s.maxDistance,Math.max(s.maxDistance,20000)])])for(const budget of [...new Set([s.budget,Math.max(s.budget,480)])])for(const maxGrade of [...new Set([s.maxGrade,90])]){
  const options={...s,maxDistance,budget,maxGrade},plan=planMission(g,start,candidates,options,blocked,pinned);if(!plan.stops.length&&!plan.baseTasks?.length)continue;
  const missing=plan.missingIds||[],unmet=plan.unmetPins||[];const changes=[];
  // Report only limits actually exceeded by this candidate.
  const actualGrade=plan.grid?Math.max(0,...plan.legs.map(l=>l.maxSlopeDeg||0)):Math.max(0,...plan.edgeIds.map(id=>g.edges[id].grade));
  const accepted={...s};
  if(plan.distance>s.maxDistance){accepted.maxDistance=Math.ceil(plan.distance/500)*500;changes.push({kind:'distance',before:s.maxDistance,after:accepted.maxDistance})}
  if(plan.minutes>s.budget*.8){accepted.budget=Math.ceil(plan.minutes/.8/30)*30;changes.push({kind:'time',before:s.budget,after:accepted.budget})}
  if(actualGrade>s.maxGrade){accepted.maxGrade=[10,20,30,90].find(n=>n>=actualGrade)||90;changes.push({kind:'grade',before:s.maxGrade,after:accepted.maxGrade})}
  if(missing.length){accepted.ids=s.ids.filter(id=>!missing.includes(id));changes.push({kind:'experiments',ids:missing})}
  if(unmet.length)changes.push({kind:'stops',ids:unmet});
  if(!changes.length)continue;
  const score=(missing.length+unmet.length)*1000+changes.length*100+(accepted.maxDistance-s.maxDistance)/1000+(accepted.budget-s.budget)/60+(accepted.maxGrade-s.maxGrade)/10;
  if(!best||score<best.score)best={plan,settings:accepted,changes,score};
 }
 return best;
}
