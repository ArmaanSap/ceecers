// Explains why a planned route takes an odd-looking path or turn. Every reason is checked against the
// route graph, not guessed: for a detour we actually search for the shorter alternative and see what rules it out.
import {distance,shortest} from './routing.js';
import {bearing} from './walk-sim.js';

export const DETOUR_RATIO=1.35,MIN_DETOUR_M=120,SHARP_TURN_DEG=100,TURN_STEP_M=25,MAX_ITEMS=10;
const len=coords=>{let t=0;for(let i=1;i<coords.length;i++)t+=distance(coords[i-1],coords[i]);return t};
const turnAngle=(a,b)=>{let d=Math.abs(a-b)%360;return d>180?360-d:d};
const m=v=>`${Math.round(v)} m`;

function resample(coords,step){
 const out=[{c:coords[0],at:0}];let acc=0,next=step;
 for(let i=1;i<coords.length;i++){const d=distance(coords[i-1],coords[i]);while(acc+d>=next&&d>0){const t=(next-acc)/d;out.push({c:coords[i-1].map((v,k)=>v+(coords[i][k]-v)*t),at:next});next+=step}acc+=d}
 out.push({c:coords.at(-1),at:acc});return out;
}

export function explainRoute(graph,route,{settings={},blocked=new Set()}={}){
 const items=[];if(!route?.legs?.length)return items;
 const seenEdges=new Set();let meters=0,joinsShown=false;
 route.legs.forEach((leg0,li)=>{
  const leg={...leg0,toName:li===route.legs.length-1?'Martian Base':leg0.toName};
  const L=len(leg.coords),start=meters,first=leg.coords[0],last=leg.coords.at(-1),straight=distance(first,last);
  const add=(kind,title,text,off=0,extra={})=>items.push({kind,title,text,atMeters:start+Math.max(0,Math.min(L,off)),leg:li,coord:extra.coord||null});
  // 1. Detour: look for the shorter path and name what rules it out.
  if(straight>40&&L>=MIN_DETOUR_M&&L/straight>=DETOUR_RATIO&&!leg.spur){
   const a=graph.nearest(first),b=graph.nearest(last),free=shortest(graph,a,b,{maxGrade:90},new Set());
   let text;
   if(free&&free.distance<L*0.92){
    const peak=Math.max(0,...free.edgeIds.map(id=>graph.edges[id].grade)),saved=L-free.distance;
    const limited=shortest(graph,a,b,{maxGrade:settings.maxGrade??90},new Set());
    if(blocked.size&&limited&&limited.distance<L*0.92)text=`A shorter recorded path exists (${m(saved)} shorter) but it crosses ground you flagged as blocked, so the route goes around.`;
    else if(settings.maxGrade&&settings.maxGrade<90&&peak>settings.maxGrade)text=`A shorter recorded path exists (${m(saved)} shorter), but its steepest recorded grade is about ${Math.round(peak)}°, above your ${settings.maxGrade}° limit. The route takes the longer, gentler way.`;
    else if(settings.preference==='gentle')text=`You chose gentler recorded grades, so the route accepts about ${m(saved)} of extra walking to avoid steeper stretches.`;
    else text=`The planner joined this leg in a way that is ${m(saved)} longer than the shortest recorded path, to pick up stops or views on the way.`;
   }else text=`There is no recorded rover track running straight from here to ${leg.toName}. The route follows the track the rover actually drove, which bends: ${m(straight)} in a straight line, ${m(L)} on the track.`;
   add('detour',`Long way round to ${leg.toName}`,text,L*0.35);
  }
  // 2. Sharp turns that are not just turning at a stop.
  const pts=resample(leg.coords,TURN_STEP_M);let lastTurnAt=-1e9;
  for(let i=1;i<pts.length-1;i++){
   const h0=bearing(pts[i-1].c,pts[i].c),h1=bearing(pts[i].c,pts[i+1].c),ang=turnAngle(h0,h1);
   if(ang<SHARP_TURN_DEG||pts[i].at<40||L-pts[i].at<40||pts[i].at-lastTurnAt<100)continue;
   lastTurnAt=pts[i].at;
   const node=graph.nearest(pts[i].c),deg=graph.adj[node].length,joined=graph.adj[node].some(e=>e.inferred);
   const text=deg>2||joined?`A ${Math.round(ang)}° turn: two recorded rover drives meet here${joined?' (joined across a gap of 10 m or less, which is not verified as traversable ground)':''}, so this is where the route switches from one to the other.`:`A ${Math.round(ang)}° turn: the rover's own recorded track bends sharply here. The route can only follow recorded ground, so it bends with it.`;
   add('turn',`Sharp turn (${Math.round(ang)}°)`,text,pts[i].at);
  }
  // 3. Retracing earlier track.
  if(leg.edgeIds?.length){const shared=leg.edgeIds.filter(id=>seenEdges.has(id)).length;if(L>100&&shared/leg.edgeIds.length>=0.5)add('retrace',`Retracing track toward ${leg.toName}`,li===route.legs.length-1?'The way home follows the track you came out on. It is the shortest recorded way back within your grade limit.':`This leg reuses track you already walked: the recorded track to ${leg.toName} branches off it, and the planner found nothing shorter.`,L*0.2);leg.edgeIds.forEach(id=>seenEdges.add(id))}
  // 4. Off-corridor spurs
  const sp=route.spurs?.find(s=>s.stop===leg.toName);
  if(sp)add('spur',`Off-track spur to ${sp.stop}`,`${sp.stop} is ${m(sp.oneWayMeters)} from the nearest recorded rover track. A ${sp.slopeChecked?'DEM slope-checked':'straight'} spur is added there and back${sp.slopeChecked?'':'. Slope on this stretch is NOT modelled'}.`,Math.max(0,L-sp.oneWayMeters));
  if(!joinsShown&&leg.connectorMeters>100){joinsShown=true;add('joins','Short joins between track points',`${m(leg.connectorMeters)} of this leg crosses 10 m-or-less joins between neighbouring recorded points. These are inferred, not verified as traversable. More like this appears elsewhere on the route.`,L*0.5)}
  meters+=L;
 });
 // 5. Stop order
 const stops=route.stops||[],base=route.coords[0];
 if(stops.length>=3){const d=stops.map(s=>distance(base,s.coord));let outOfOrder=false;for(let i=1;i<d.length;i++)for(let j=0;j<i;j++)if(d[j]-d[i]>300)outOfOrder=true;
  if(outOfOrder)items.push({kind:'order',title:'Why this stop order',text:`The stops are not strictly nearest-first. The planner repeatedly picks the next stop with the best value for the walking it costs (${settings.preference==='panorama'?'rewarding photographed views along the way':'weighing science time against distance'}), then checks it can still get home with the reserve. It is a heuristic, not a guaranteed shortest tour.`,atMeters:0,leg:0,coord:null})}
 return items.sort((x,y)=>x.atMeters-y.atMeters).slice(0,MAX_ITEMS);
}
