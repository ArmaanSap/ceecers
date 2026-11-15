export function distance(a,b){const r=Math.PI/180,la=a[1]*r,lb=b[1]*r;let v=Math.sin((lb-la)/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin((b[0]-a[0])*r/2)**2;return 3396190*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)))}
export function buildGraph(features,bounds){let nodes=[],edges=[],adj=[],bins=new Map(),exact=new Map();const xy=c=>[(c[0]-bounds[0])*56200,(c[1]-bounds[1])*59274],inside=c=>c[0]>=bounds[0]&&c[0]<=bounds[2]&&c[1]>=bounds[1]&&c[1]<=bounds[3];function node(c){let k=c[0].toFixed(7)+','+c[1].toFixed(7);if(exact.has(k))return exact.get(k);let i=nodes.length;nodes.push(c);adj.push([]);exact.set(k,i);return i}const seen=new Set();function edge(a,b,inferred=false){if(a===b)return;let key=Math.min(a,b)+':'+Math.max(a,b);if(seen.has(key))return;let d=distance(nodes[a],nodes[b]);if(d<.05)return;let grade=Math.atan2(Math.abs(nodes[a][2]-nodes[b][2]),d)*180/Math.PI;let e={id:edges.length,a,b,d,grade,inferred};edges.push(e);adj[a].push(e);adj[b].push(e);seen.add(key)}for(let f of features){let prev=null,prevC=null,cs=f.geometry.coordinates;for(let i=0;i<cs.length;i++){let c=cs[i];if(!inside(c)||!Number.isFinite(c[2])){prev=null;prevC=null;continue}if(prevC&&distance(prevC,c)<5&&i<cs.length-1)continue;let n=node(c);if(prev!==null&&distance(prevC,c)<500)edge(prev,n);prev=n;prevC=c}}
// Short spatial joins resolve repeated drives and small localization offsets.
for(let i=0;i<nodes.length;i++){let [x,y]=xy(nodes[i]),bx=Math.floor(x/10),by=Math.floor(y/10);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let j of bins.get(`${bx+dx},${by+dy}`)||[])if(distance(nodes[i],nodes[j])<=10)edge(i,j,true);let key=`${bx},${by}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i)}
return {nodes,edges,adj,nearest(c){let best=0,min=Infinity;nodes.forEach((p,i)=>{let d=distance(c,p);if(d<min){min=d;best=i}});return best}}}
class Heap{constructor(){this.a=[]}push(x){let a=this.a,i=a.length;a.push(x);while(i){let p=(i-1)>>1;if(a[p][0]<=x[0])break;a[i]=a[p];i=p}a[i]=x}pop(){let a=this.a,top=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=v[0])break;a[i]=a[j];i=j}a[i]=v}return top}}
export function shortest(g,start,end,opt={},blocked=new Set()){if(start===end)return {coords:[g.nodes[start]],distance:0,edgeIds:[],connectorMeters:0,ascent:0};let costs=new Float64Array(g.nodes.length).fill(Infinity),prev=new Int32Array(g.nodes.length).fill(-1),via=new Int32Array(g.nodes.length).fill(-1),heap=new Heap();costs[start]=0;heap.push([0,start]);while(heap.a.length){let [cost,u]=heap.pop();if(cost>costs[u])continue;if(u===end)break;for(let e of g.adj[u]){if(blocked.has(e.id)||e.grade>(opt.maxGrade??90))continue;let v=e.a===u?e.b:e.a;let c=cost+e.d*(1+(opt.preference==='gentle'?e.grade/8:0));if(c<costs[v]){costs[v]=c;prev[v]=u;via[v]=e.id;heap.push([c,v])}}}if(!Number.isFinite(costs[end]))return null;let ids=[],ns=[end],u=end;while(u!==start){ids.push(via[u]);u=prev[u];ns.push(u)}ns.reverse();ids.reverse();let coords=ns.map(i=>g.nodes[i]);return {coords,distance:ids.reduce((s,i)=>s+g.edges[i].d,0),edgeIds:ids,connectorMeters:ids.reduce((s,i)=>s+(g.edges[i].inferred?g.edges[i].d:0),0),ascent:coords.slice(1).reduce((s,c,i)=>s+Math.max(0,c[2]-coords[i][2]),0)}}
// A cost-based router (route-cost.js) can be installed with setPathRouter(). When present, legs are found over the whole DEM grid by
// effort, time, slope margin and side-slope, ignoring where the rover drove; without it the planner falls back to the rover-track graph.
let PATH_ROUTER=null;export function setPathRouter(r){PATH_ROUTER=r||null}export const getPathRouter=()=>PATH_ROUTER;
function planFieldMission(g,start,candidates,s,blocked=new Set(),pinned=new Set()){
 const R=PATH_ROUTER;
 if(R){R.configure({limitDeg:s.maxGrade<90?s.maxGrade:35,speedKmh:s.speed,style:s.preference==='gentle'?'safe':(s.routeStyle||'balanced'),massKg:s.massKg||100});R.setBlocked([...blocked]);}
 const cache=new Map(),path=(a,b)=>{let k=a+':'+b;if(!cache.has(k))cache.set(k,shortest(g,a,b,s,blocked));return cache.get(k)};
 const key=p=>R?R.cellOf(p.coord):p.node,mins=o=>o.minutes??o.distance/(s.speed*1000)*60;
 const targets=candidates.map(p=>p.coord),fwdT=new Map(),revT=R?R.tree(start.coord,{reverse:true,targets}):null;
 const outOf=(from,p)=>{if(!R)return path(from.node,p.node);const k=R.cellOf(from.coord);if(!fwdT.has(k))fwdT.set(k,R.tree(from.coord,{targets}));return fwdT.get(k).to(p.coord)};
 const backOf=p=>R?revT.from(p.coord):path(p.node,start.node);
 let selected=[],current=start,dist=0,walkMin=0,science=0,legs=[],available=candidates.filter(p=>p.tasks.length&&key(p)!==key(start)),usedNodes=new Set([key(start)]);
 let viewed=new Set([start.id]);
 const viewMemo=new WeakMap(),viewsOn=pth=>{if(R){if(!viewMemo.has(pth))viewMemo.set(pth,candidates.filter(p=>pth.coords.some(c=>distance(c,p.coord)<=30)).map(p=>p.id));return viewMemo.get(pth)}
  let cs=new Set(pth.coords);return candidates.filter(p=>cs.has(g.nodes[p.node])).map(p=>p.id)};
 let usable=s.budget*.8;
 for(let count=0;count<(s.preference==='panorama'?29:6);count++){let best=null;
  for(let p of available){if(usedNodes.has(key(p)))continue;let out=outOf(current,p),back=backOf(p);if(!out||!back)continue;
   const tw=available.filter(q=>q!==p&&(key(q)===key(p)||distance(q.coord,p.coord)<=25)),tk=[...new Map([...p.tasks,...tw.flatMap(q=>q.tasks)].map(e=>[e.id,e])).values()];
   let t=tk.reduce((v,e)=>v+e.min,0),total=dist+out.distance+back.distance,min=walkMin+mins(out)+mins(back)+science+t;
   if(total>s.maxDistance||min>usable)continue;
   let value=(pinned.has(p.id)||tw.some(q=>pinned.has(q.id))?100:0)+tk.length*4+(s.preference==='science'&&p.tasks.some(e=>e.id==='water')?6:0);
   if(s.preference==='panorama')value=(pinned.has(p.id)||tw.some(q=>pinned.has(q.id))?100:0)+20*new Set([...viewsOn(out),...viewsOn(back),p.id,...tw.map(q=>q.id)].filter(id=>!viewed.has(id))).size;
   // value per unit of walking cost: cost-aware when the router reports it (flat-ground-equivalent metres), plain distance otherwise
   const walkCost=R?(out.cost||out.distance):out.distance,score=value/(1+walkCost/(s.preference==='short'?100:500)+t/30);
   if(!best||score>best.score)best={p,out,t,score,tw,tk}}
  if(!best)break;
  let {p:p0,out,t,tw,tk}=best;const p={...p0,tasks:tk,alsoHere:tw.map(q=>q.name),mergedIds:tw.map(q=>q.id)};
  viewsOn(out).forEach(id=>viewed.add(id));viewed.add(p.id);p.mergedIds.forEach(id=>viewed.add(id));
  dist+=out.distance;walkMin+=mins(out);let arrival=walkMin+science;science+=t;selected.push({...p,arrival});legs.push({...out,toName:p.name,scienceMinutes:t});usedNodes.add(key(p));
  available=available.filter(q=>q.id!==p.id&&!p.mergedIds.includes(q.id)&&key(q)!==key(p)&&distance(q.coord,p.coord)>25);current=p}
 if(!selected.length)return {stops:[],coords:[],edgeIds:[],distance:0,minutes:0};
 let back=backOf(current);legs.push({...back,toName:start.name,scienceMinutes:0});
 let coords=[],edgeIds=[];for(let l of legs){coords.push(...l.coords.slice(coords.length?1:0));edgeIds.push(...l.edgeIds)}
 let covered=new Set(selected.flatMap(p=>p.tasks.map(t=>t.id)));
 return {stops:selected,legs,coords,edgeIds,grid:!!R,distance:legs.reduce((v,l)=>v+l.distance,0),minutes:legs.reduce((v,l)=>v+mins(l)+l.scienceMinutes,0),
  kcal:R?legs.reduce((v,l)=>v+(l.kcal||0),0):null,ascent:legs.reduce((v,l)=>v+l.ascent,0),connectorMeters:legs.reduce((v,l)=>v+l.connectorMeters,0),
  missingIds:s.ids.filter(id=>!covered.has(id)),unmetPins:[...pinned].filter(id=>!selected.some(p=>p.id===id||p.mergedIds?.includes(id)))}}

// Ordered historical views encountered near a proposed route; gaps stay explicit.
export function panoramaSequence(coords,panos,maxOffset=35){let cumulative=0,distances=coords.map((c,i)=>{if(i)cumulative+=distance(coords[i-1],c);return cumulative});return panos.map(p=>{let best=Infinity,index=-1;coords.forEach((c,i)=>{let d=distance(c,p.coord);if(d<best){best=d;index=i}});return {...p,routeMeters:distances[index],offsetMeters:best}}).filter(p=>p.offsetMeters<=maxOffset).sort((a,b)=>a.routeMeters-b.routeMeters||a.sol-b.sol)}

// Base handoff is a one-time, explicitly hypothetical operation after the field walk.
export function planMission(g,start,candidates,s,blocked=new Set(),pinned=new Set()){
 const baseTasks=(s.baseTasks||[]).filter(t=>s.ids.includes(t.id)),baseMinutes=baseTasks.reduce((n,t)=>n+t.min,0),fieldIds=s.ids.filter(id=>!baseTasks.some(t=>t.id===id));
 const empty=()=>({stops:[],coords:[],edgeIds:[],distance:0,minutes:0,baseTasks:[],missingIds:[...s.ids],unmetPins:[...pinned]});
 if(baseMinutes>s.budget*.8)return empty();
 const result=planFieldMission(g,start,candidates,{...s,ids:fieldIds,budget:(s.budget*.8-baseMinutes)/.8},blocked,pinned);
 if(!result.stops.length){if(!baseTasks.length)return result;return {stops:[],coords:[g.nodes[start.node]],edgeIds:[],legs:[],distance:0,minutes:baseMinutes,ascent:0,connectorMeters:0,baseTasks,missingIds:fieldIds,unmetPins:[...pinned]}}
 result.baseTasks=baseTasks;result.minutes+=baseMinutes;if(baseMinutes)result.legs.at(-1).scienceMinutes+=baseMinutes;return result;
}
