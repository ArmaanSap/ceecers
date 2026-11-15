// Walking simulation: a pure, DOM-free state machine over a planned route.
// "Walking speed" (km/h) sets the mission timeline. "Playback rate" only changes how fast
// that timeline is shown. 1x = 1 mission minute per real second. The two are independent.
import {distance,shortest} from './routing.js';

export const PLAYBACK_RATES=Object.freeze([1,2,5,10,20,50]);
export const CAMERA_MODES=Object.freeze(['overhead','topfollow','follow','free','first','third']);
export const MISSION_MIN_PER_SECOND=1;
const R2D=180/Math.PI,D2R=Math.PI/180;

export function bearing(a,b){
 const la=a[1]*D2R,lb=b[1]*D2R,dl=(b[0]-a[0])*D2R;
 return (Math.atan2(Math.sin(dl)*Math.cos(lb),Math.cos(la)*Math.sin(lb)-Math.sin(la)*Math.cos(lb)*Math.cos(dl))*R2D+360)%360;
}
function cumulative(coords){const c=[0];for(let i=1;i<coords.length;i++)c.push(c[i-1]+distance(coords[i-1],coords[i]));return c}
// Interpolated coordinate (with elevation when both ends have it) at metres d along coords.
function along(coords,cum,d){
 const total=cum.at(-1);if(coords.length===1||total<=0)return coords[0].slice();
 d=Math.max(0,Math.min(total,d));let i=1;while(i<cum.length-1&&cum[i]<d)i++;
 const span=cum[i]-cum[i-1],t=span>0?(d-cum[i-1])/span:0,a=coords[i-1],b=coords[i];
 return a.map((v,k)=>Number.isFinite(v)&&Number.isFinite(b[k])?v+(b[k]-v)*t:v);
}
export function buildTimeline(legs,speedKmh){
 if(!(speedKmh>0))throw new Error('walking speed must be positive');
 const segments=[];let t=0,walked=0;
 legs.forEach((leg,li)=>{
  if(leg.coords.length>1){
   const cum=cumulative(leg.coords),total=cum.at(-1),dur=total/(speedKmh*1000)*60;
   if(total>0){segments.push({kind:'walk',leg:li,toName:leg.toName,start:t,dur,coords:leg.coords,cum,total,distBefore:walked,spur:!!leg.spur});t+=dur;walked+=total}
  }
  if(leg.scienceMinutes>0){segments.push({kind:'science',leg:li,toName:leg.toName,name:leg.toName,start:t,dur:leg.scienceMinutes,coord:leg.coords.at(-1),distBefore:walked});t+=leg.scienceMinutes}
 });
 return {segments,totalMinutes:t,totalMeters:walked,speedKmh};
}
export function positionAt(tl,minute){
 const segs=tl.segments;if(!segs.length)return null;
 const m=Math.max(0,Math.min(tl.totalMinutes,minute));let idx=segs.findIndex(s=>m<s.start+s.dur);if(idx<0)idx=segs.length-1;
 const s=segs[idx],f=s.dur>0?Math.min(1,Math.max(0,(m-s.start)/s.dur)):1;
 if(s.kind==='science'){
  let heading=0;for(let k=idx-1;k>=0;k--)if(segs[k].kind==='walk'){const c=segs[k].coords;heading=bearing(c.at(-2),c.at(-1));break}
  return {coord:s.coord.slice(),heading,kind:'science',segIndex:idx,leg:s.leg,toName:s.toName,minute:m,distanceM:s.distBefore,gradeDeg:0,progress:f};
 }
 const d=f*s.total,coord=along(s.coords,s.cum,d),ahead=along(s.coords,s.cum,Math.min(s.total,d+3)),behind=along(s.coords,s.cum,Math.max(0,d-3));
 let heading=bearing(behind,ahead);if(distance(behind,ahead)<.01&&s.coords.length>1)heading=bearing(s.coords[0],s.coords.at(-1));
 // Grade from recorded elevations over about +/-15 m, so single noisy vertices do not dominate.
 const p0=along(s.coords,s.cum,Math.max(0,d-15)),p1=along(s.coords,s.cum,Math.min(s.total,d+15)),run=distance(p0,p1);
 const gradeDeg=run>1&&Number.isFinite(p0[2])&&Number.isFinite(p1[2])?Math.atan2(p1[2]-p0[2],run)*R2D:0;
 return {coord,heading,kind:'walk',segIndex:idx,leg:s.leg,toName:s.toName,minute:m,distanceM:s.distBefore+d,gradeDeg,progress:f,spur:s.spur};
}

// Return legs from an arbitrary position to base, FASTEST first (walking time = distance / speed, so fastest = shortest).
// Candidates: (1) the recorded rover network (first hop is a straight, unmodelled spur), and
// (2) a direct cross-country line, allowed only when `direct.check(coords)` confirms it from the DEM.
// The shorter wins; `info` reports both so the UI can explain the choice.
export function planReturn(graph,coord,baseNode,{blocked=new Set(),baseName='Martian Base',direct=null}={}){
 const node=graph.nearest(coord),path=shortest(graph,node,baseNode,{maxGrade:90},blocked);
 let network=null;
 if(path){const hop=distance(coord,graph.nodes[node]),legs=[];
  if(hop>1)legs.push({coords:[coord,graph.nodes[node]],distance:hop,toName:'Recorded rover path',scienceMinutes:0,spur:true});
  legs.push({coords:path.coords,distance:path.distance,toName:baseName,scienceMinutes:0});
  network={legs,meters:hop+path.distance}}
 let shortcut=null;
 if(direct&&typeof direct.check==='function'){
  const target=graph.nodes[baseNode],coords=[coord,target],m=distance(coord,target);
  if(m>1){const verdict=direct.check(coords);if(verdict&&verdict.ok)shortcut={legs:[{coords,distance:m,toName:baseName,scienceMinutes:0,shortcut:true}],meters:m,maxDeg:verdict.maxDeg}}
 }
 if(!network&&!shortcut)return null;
 const useShortcut=shortcut&&(!network||shortcut.meters<network.meters*.95),chosen=useShortcut?shortcut:network,legs=chosen.legs;
 legs.info={mode:useShortcut?'direct':'network',meters:chosen.meters,networkMeters:network?.meters??null,directMeters:shortcut?.meters??null,directMaxDeg:shortcut?.maxDeg??null};
 return legs;
}

export class WalkSim{
 constructor(timeline,{rate=5}={}){this.tl=timeline;this.state='idle';this.minute=0;this.rate=rate;this.listeners=[];this.aborted=null;this.returning=false;this._seg=-1;this.setRate(rate)}
 on(fn){this.listeners.push(fn);return()=>{this.listeners=this.listeners.filter(f=>f!==fn)}}
 emit(type,extra={}){const e={type,minute:this.minute,missionMinute:this.missionMinute,...extra};for(const f of this.listeners)f(e)}
 get missionMinute(){return (this.aborted?.atMinute||0)+this.minute}
 get total(){return this.tl.totalMinutes}
 get walkedMeters(){const cur=this.position()?.distanceM??0;return this.aborted?(positionAt(this.aborted.original,this.aborted.atMinute)?.distanceM||0)+cur:cur}
 setRate(r){if(!PLAYBACK_RATES.includes(r))throw new Error('unsupported playback rate '+r);this.rate=r;return r}
 position(){return positionAt(this.tl,this.minute)}
 play(){
  if(this.state==='playing'||this.state==='complete'||this.state==='aborted')return false;
  const fresh=this.state==='idle';this.state='playing';this.emit(fresh?'start':'resume');
  if(fresh)this._enter(0);return true;
 }
 pause(){if(this.state!=='playing')return false;this.state='paused';this.emit('pause');return true}
 restart(){this.tl=this.aborted?.original||this.tl;this.aborted=null;this.returning=false;this.minute=0;this._seg=-1;this.state='idle';this.emit('restart');return true}
 _enter(idx){
  const segs=this.tl.segments;
  for(let i=this._seg+1;i<=idx&&i<segs.length;i++){this._seg=i;this.emit('segment',{index:i,segment:segs[i]});if(this.state!=='playing')break}   // a listener may pause (e.g. at a stop)
 }
 tick(dtSeconds){
  if(this.state!=='playing')return this.position();
  const prev=this._seg;this.minute=Math.min(this.total,this.minute+dtSeconds*this.rate*MISSION_MIN_PER_SECOND);
  const pos=this.position();if(pos&&pos.segIndex>prev)this._enter(pos.segIndex);
  if(this.minute>=this.total&&this.state==='playing'){this.state='complete';this.emit('complete',{returned:true,aborted:!!this.aborted})}
  return this.position();
 }
 // Abort the walk and head home along `returnLegs` (see planReturn). Position is kept continuous.
 abort(returnLegs){
  if(this.returning||(this.state!=='playing'&&this.state!=='paused')||!returnLegs?.length)return false;
  const at=this.position();
  this.aborted={atMinute:this.minute,atCoord:at.coord,original:this.tl};
  this.tl=buildTimeline(returnLegs,this.tl.speedKmh);this.minute=0;this._seg=-1;this.returning=true;this.state='playing';
  this.emit('abort',{coord:at.coord,returnMinutes:this.tl.totalMinutes});this._enter(0);return true;
 }
 // Scrub to a mission minute (resets segment tracking so events are not replayed).
 seek(minute){this.minute=Math.max(0,Math.min(this.total,minute));const p=this.position();this._seg=p?p.segIndex:-1;return p}
}
