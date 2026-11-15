// Multi-factor walking-route search over the whole DEM grid. It does NOT follow the rover's tracks: it finds the cheapest
// way a person could walk between two points, whatever the rover did, and explains the choice in numbers.
//
// Cost of one step (distance d, rise/run S, DEM cell slope G, local roughness r), in "flat-ground metres":
//   energy   eR = Minetti(2002) walking cost at grade S / cost on the flat   (J/kg/m polynomial, Earth gravity, no suit)
//   time     tR = 1 / Tobler hiking factor at S                              (slower on slopes = longer outside = more exposure)
//   margin   (max(|S|,G)/limit)^3     steep ground close to your slope limit is risky, so it is penalised before it is forbidden
//   cross    (lateral slope / limit)^2  side-hill walking (ankles, sliding) costs extra
//   rough    local slope variability    rugged ground costs extra
// step cost = d * (wE*eR + wT*tR + K*(wM*margin + wC*cross + wR*rough)) / (wE + wT)
// A step steeper than the limit, or onto no-data or a blocked cell, is not allowed at all.
//
// Honest limits: the DEM is 20 m CTX, so rocks, sand and anything under about 20 m are invisible to the search; walking cost is an
// Earth-gravity, unsuited baseline; the slope limit is a planning assumption, not a NASA suit specification.
import {decodeTerrain,cellSlopeDeg,lonLatToCell,cellToLonLat,toblerFactor} from './pathfinding.mjs';
import {walkCostJPerKgM} from './effort-model.js';
import {distance} from './routing.js';

const D2R=Math.PI/180,J_PER_KCAL=4184,K=3;
export const STYLES={
 balanced:{label:'Balanced',wE:1,wT:1,wM:1.5,wC:1,wR:.5},
 effort:{label:'Least effort',wE:2.5,wT:.4,wM:1.5,wC:1,wR:.5},
 fast:{label:'Least time outside',wE:.4,wT:2.5,wM:1.5,wC:1,wR:.5},
 safe:{label:'Widest slope margin',wE:1,wT:.7,wM:5,wC:3,wR:1.5},
};
const N16=(()=>{const o=[];for(const [a,b] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1],[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[1,-2],[-1,2],[1,2]]){
 const mids=Math.abs(a)===2?[[a/2,0],[a/2,b]]:Math.abs(b)===2?[[0,b/2],[a,b/2]]:null;o.push([a,b,mids])}return o})();

class Heap{ // binary min-heap on (key,value)
 constructor(){this.k=new Float64Array(1<<16);this.v=new Int32Array(1<<16);this.n=0}
 push(key,val){if(this.n===this.k.length){const k=new Float64Array(this.n*2),v=new Int32Array(this.n*2);k.set(this.k);v.set(this.v);this.k=k;this.v=v}
  let i=this.n++;const K_=this.k,V=this.v;while(i>0){const p=(i-1)>>1;if(K_[p]<=key)break;K_[i]=K_[p];V[i]=V[p];i=p}K_[i]=key;V[i]=val}
 pop(){const K_=this.k,V=this.v,top=V[0],lk=K_[--this.n],lv=V[this.n],n=this.n;if(n>0){let i=0;for(;;){let c=2*i+1;if(c>=n)break;if(c+1<n&&K_[c+1]<K_[c])c++;if(K_[c]>=lk)break;K_[i]=K_[c];V[i]=V[c];i=c}K_[i]=lk;V[i]=lv}return top}
}

export function createCostRouter(terrainJson,init={}){
 const T=decodeTerrain(terrainJson),N=T.W*T.H,Rm=T.R,dyM=T.dlat*D2R*Rm;
 const dxM=new Float64Array(T.H);for(let r=0;r<T.H;r++)dxM[r]=T.dlon*D2R*Rm*T.cosLat[r];
 let P={limitDeg:20,speedKmh:2,massKg:100,style:'balanced',weights:{...STYLES.balanced},...init};P.weights={...STYLES[P.style]||STYLES.balanced,...(init.weights||{})};
 const slope=new Float32Array(N),rough=new Float32Array(N),pass=new Uint8Array(N),block=new Uint8Array(N);
 for(let i=0;i<N;i++)slope[i]=cellSlopeDeg(T,i);
 for(let r=0;r<T.H;r++)for(let c=0;c<T.W;c++){const i=r*T.W+c,s=slope[i];if(!Number.isFinite(s)){rough[i]=NaN;continue}let n=0,m=0,q=0;
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=r+dr,cc=c+dc;if(rr<0||cc<0||rr>=T.H||cc>=T.W)continue;const v=slope[rr*T.W+cc];if(!Number.isFinite(v))continue;n++;m+=v;q+=v*v}
  rough[i]=n>1?Math.sqrt(Math.max(0,q/n-(m/n)**2)):0}
 const flatJ=walkCostJPerKgM(0),tg=new Float32Array(N),ER=new Float32Array(1400),TR=new Float32Array(1400);
 for(let i=0;i<N;i++)tg[i]=Math.tan(slope[i]*D2R);
 for(let q=0;q<1400;q++){const S=q/1000-0.7+0.0005;ER[q]=walkCostJPerKgM(S)/flatJ;TR[q]=1/toblerFactor(S)}   // look-up tables: the search evaluates millions of steps
 let tanLim=Math.tan(P.limitDeg*D2R);
 const rebuildPass=()=>{tanLim=Math.tan(P.limitDeg*D2R);for(let i=0;i<N;i++)pass[i]=Number.isFinite(slope[i])&&slope[i]<=P.limitDeg&&Number.isFinite(T.elev[i])?1:0};rebuildPass();
 const b=terrainJson.bounds,detrended=/detrend/i.test(String(terrainJson.source?.dem||terrainJson.source||'')),fit=terrainJson.elevFit;
 const absElev=(lon,lat,rel)=>{if(!detrended||!fit)return rel;const x=(lon-b.west)/(b.east-b.west)*((b.east-b.west)*Math.PI/180*Rm*Math.cos((b.south+b.north)/2*D2R))/1000,y=(b.north-lat)*Math.PI/180*Rm/1000;return rel+fit.a+fit.b*x+fit.c*y};
 const cellXY=i=>{const r=(i/T.W)|0;return [i-r*T.W,r]};
 const cellLL=i=>{const [c,r]=cellXY(i);return cellToLonLat(T,r,c)};
 const coordOfCell=i=>{const ll=cellLL(i);return [ll[0],ll[1],absElev(ll[0],ll[1],T.elev[i])]};

 // ---- one step ----
 const L={d:0,S:0,er:1,tr:1,margin:0,cross:0,rough:0,ct:0,cost:0};
 function step(i,j,dr,dc){ // from cell i to cell j; fills L, returns false if the step is not allowed
  if(!pass[j]||block[j])return false;
  const r=(i/T.W)|0,d=Math.hypot(dc*dxM[r],dr*dyM),S=(T.elev[j]-T.elev[i])/d,aS=S<0?-S:S;
  if(aS>tanLim)return false;
  const G=tg[i]>tg[j]?tg[i]:tg[j],c2=G*G-S*S,ct=c2>0?Math.sqrt(c2):0,w=P.weights,q=Math.max(0,Math.min(1399,((S+0.7)*1000)|0)),er=ER[q],tr=TR[q];
  const m=(aS>G?aS:G)/tanLim,margin=m*m*m,cr=ct/tanLim,cross=cr*cr,rv=Math.min(1,((rough[i]+rough[j])/2)/5);
  L.d=d;L.S=S;L.er=er;L.tr=tr;L.margin=margin;L.cross=cross;L.rough=rv;L.ct=ct;
  L.cost=d*(w.wE*er+w.wT*tr+K*(w.wM*margin+w.wC*cross+w.wR*rv))/(w.wE+w.wT);return true;
 }
 function snap(coord,maxRing=15){
  const i0=lonLatToCell(T,coord[0],coord[1]);if(i0<0)return -1;const [c0,r0]=cellXY(i0);
  for(let ring=0;ring<=maxRing;ring++){let best=-1,bd=Infinity;
   for(let r=r0-ring;r<=r0+ring;r++)for(let c=c0-ring;c<=c0+ring;c++){if(r<0||c<0||r>=T.H||c>=T.W||Math.max(Math.abs(r-r0),Math.abs(c-c0))!==ring)continue;const i=r*T.W+c;if(!pass[i]||block[i])continue;const dd=(r-r0)**2+(c-c0)**2;if(dd<bd){bd=dd;best=i}}
   if(best>=0)return best}
  return -1;
 }
 // ---- search: Dijkstra from one cell (forward: cost to reach x; reverse: cost for x to reach the cell) ----
 function run(src,reverse,targets){ // targets: Set of cells to stop at once all are settled (undefined = whole grid)
  const g=new Float64Array(N).fill(Infinity),prev=new Int32Array(N).fill(-1),done=new Uint8Array(N),heap=new Heap();let left=targets?targets.size:-1;
  g[src]=0;heap.push(0,src);
  while(heap.n){const u=heap.pop();if(done[u])continue;done[u]=1;if(targets&&targets.has(u)&&--left===0)break;
   const [c,r]=cellXY(u);
   for(const [dr,dc,mids] of N16){const rr=r+dr,cc=c+dc;if(rr<0||cc<0||rr>=T.H||cc>=T.W)continue;const v=rr*T.W+cc;if(done[v])continue;
    if(mids){let ok=true;for(const [mr,mc] of mids){const mi=(r+(Math.abs(dr)===2?mr:mr))*T.W+(c+mc);if(!pass[mi]||block[mi]){ok=false;break}}if(!ok)continue}
    else if(dr&&dc&&(!pass[r*T.W+cc]||!pass[rr*T.W+c]||block[r*T.W+cc]||block[rr*T.W+c]))continue;
    const ok=reverse?step(v,u,-dr,-dc):step(u,v,dr,dc);if(!ok)continue;
    const nc=g[u]+L.cost;if(nc<g[v]){g[v]=nc;prev[v]=u;heap.push(nc,v)}}}
  return {g,prev,done,full:!targets};
 }
 // ---- metrics of an ordered list of cells, with the exact endpoint coordinates ----
 function measure(cells,from,to){
  const parts={energy:0,time:0,margin:0,cross:0,rough:0},w=P.weights,den=w.wE+w.wT,v0=P.speedKmh/3.6;
  let dist=0,joules=0,sec=0,asc=0,desc=0,maxSlope=0,sumSlope=0,crossMax=0,cost=0;
  const coords=[];
  const snapIn=distance(from,coordOf(cells[0])),snapOut=distance(coordOf(cells.at(-1)),to);
  if(snapIn>2)coords.push(withZ(from));coords.push(...cells.map(coordOfCell));if(snapOut>2)coords.push(withZ(to));
  for(let k=1;k<cells.length;k++){const i=cells[k-1],j=cells[k],[c0,r0]=cellXY(i),[c1,r1]=cellXY(j);
   if(!step(i,j,r1-r0,c1-c0))continue;
   dist+=L.d;joules+=walkCostJPerKgM(L.S)*P.massKg*L.d;sec+=L.d/v0*L.tr;const dz=T.elev[j]-T.elev[i];if(dz>0)asc+=dz;else desc-=dz;
   maxSlope=Math.max(maxSlope,slope[j]);sumSlope+=slope[j]*L.d;crossMax=Math.max(crossMax,Math.atan(L.ct)/D2R);cost+=L.cost;
   parts.energy+=L.d*w.wE*L.er/den;parts.time+=L.d*w.wT*L.tr/den;parts.margin+=L.d*K*w.wM*L.margin/den;parts.cross+=L.d*K*w.wC*L.cross/den;parts.rough+=L.d*K*w.wR*L.rough/den}
  const flatSnap=snapIn>2?snapIn:0,flatOut=snapOut>2?snapOut:0,extra=flatSnap+flatOut;
  dist+=extra;joules+=flatJ*P.massKg*extra;sec+=extra/v0;cost+=extra;
  return {coords,distance:dist,minutes:sec/60,kcal:joules/J_PER_KCAL,ascent:asc,descent:desc,maxSlopeDeg:maxSlope,meanSlopeDeg:dist>0?sumSlope/Math.max(1,dist-extra):0,crossMaxDeg:crossMax,cost,parts,edgeIds:cells,connectorMeters:0,snapMeters:Math.round(extra),grid:true};
 }
 const coordOf=c=>Array.isArray(c)?c:coordOfCell(c);
 const withZ=c=>{const i=lonLatToCell(T,c[0],c[1]);return i<0?[c[0],c[1],c[2]??0]:[c[0],c[1],absElev(c[0],c[1],T.elev[i])]};
 // ---- trees (cached until blocking or parameters change) ----
 let cache=new Map(),version=0;
 const bump=()=>{cache=new Map();version++};
 function tree(coord,{reverse=false,targets=null}={}){
  const src=snap(coord);if(src<0)return {to:()=>null,from:()=>null,cost:()=>Infinity,cell:-1};
  const key=(reverse?'r':'f')+src,hit=cache.get(key);if(hit)return hit;
  const tset=targets?new Set(targets.map(snap).filter(c=>c>=0)):null;let res=run(src,reverse,tset&&tset.size?tset:undefined);
  const settled=cell=>{if(!res.full&&!res.done[cell])res=run(src,reverse);return res},   // asked for something beyond the early stop: finish the search
   pathTo=cell=>{const q=settled(cell);if(!Number.isFinite(q.g[cell]))return null;const cs=[];for(let i=cell;i!==-1;i=q.prev[i])cs.push(i);return reverse?cs:cs.reverse()};
  const t={cell:src,reverse,
   cost:c=>{const i=snap(c);return i<0?Infinity:settled(i).g[i]},
   to(c){const i=snap(c);if(i<0)return null;const cs=pathTo(i);return cs?measure(cs,coord,c):null},
   from(c){const i=snap(c);if(i<0)return null;const cs=pathTo(i);return cs?measure(cs,c,coord):null}};
  cache.set(key,t);return t;
 }
 // ---- evaluate a straight line (for "why not straight") ----
 const elevBilinear=(lon,lat)=>{const fx=(lon-T.west)/T.dlon-0.5,fy=(T.north-lat)/T.dlat-0.5,c0=Math.floor(fx),r0=Math.floor(fy);let sw=0,sv=0;
  for(let dr=0;dr<=1;dr++)for(let dc=0;dc<=1;dc++){const r=r0+dr,c=c0+dc;if(r<0||c<0||r>=T.H||c>=T.W)continue;const e=T.elev[r*T.W+c];if(!Number.isFinite(e))continue;const wt=(dc?fx-c0:1-(fx-c0))*(dr?fy-r0:1-(fy-r0));sw+=wt;sv+=wt*e}
  return sw>0?sv/sw:NaN};
 function straight(a,b){
  const total=distance(a,b),n=Math.max(1,Math.ceil(total/10)),d=total/n,w=P.weights,den=w.wE+w.wT,v0=P.speedKmh/3.6;
  let dist=0,joules=0,sec=0,asc=0,maxSlope=0,over=0,cost=0,blocked=false,outside=false,pe=NaN,pi=-1;
  for(let k=0;k<=n;k++){const t=k/n,lon=a[0]+(b[0]-a[0])*t,lat=a[1]+(b[1]-a[1])*t,i=lonLatToCell(T,lon,lat),e=elevBilinear(lon,lat);
   if(i<0||!Number.isFinite(e)){outside=true;pe=NaN;continue}
   if(block[i])blocked=true;const G=slope[i];if(Number.isFinite(G))maxSlope=Math.max(maxSlope,G);
   if(Number.isFinite(pe)){const S=(e-pe)/d,deg=Math.atan(Math.abs(S))/D2R,Gm=Math.max(G,Number.isFinite(slope[pi])?slope[pi]:0);if(deg>P.limitDeg||Gm>P.limitDeg)over+=d;
    const tgm=Math.tan(Gm*D2R),ct=Math.sqrt(Math.max(0,tgm*tgm-S*S)),er=walkCostJPerKgM(S)/flatJ,tr=1/toblerFactor(S),mg=(Math.max(deg,Gm)/P.limitDeg)**3,cr=(Math.atan(ct)/D2R/P.limitDeg)**2,rv=Math.min(1,((rough[i]+rough[pi])/2)/5);
    dist+=d;joules+=walkCostJPerKgM(S)*P.massKg*d;sec+=d/v0*tr;if(S>0)asc+=e-pe;cost+=d*(w.wE*er+w.wT*tr+K*(w.wM*mg+w.wC*cr+w.wR*rv))/den}
   pe=e;pi=i}
  return {distance:dist||total,minutes:sec/60,kcal:joules/J_PER_KCAL,ascent:asc,maxSlopeDeg:maxSlope,overLimitMeters:over,cost,blocked,outside};
 }
 let blockSig='',blockN=0;
 function setBlocked(ids,radiusM=60){const sig=[...(ids||[])].sort((x,y)=>x-y).join(',');if(sig===blockSig)return blockN;blockSig=sig;block.fill(0);let n=0;for(const id of ids||[]){if(!(id>=0&&id<N))continue;const [c0,r0]=cellXY(id),span=Math.ceil(radiusM/Math.min(dxM[r0]||20,dyM))+1;
   for(let r=Math.max(0,r0-span);r<=Math.min(T.H-1,r0+span);r++)for(let c=Math.max(0,c0-span);c<=Math.min(T.W-1,c0+span);c++){if(Math.hypot((c-c0)*dxM[r],(r-r0)*dyM)<=radiusM&&!block[r*T.W+c]){block[r*T.W+c]=1;n++}}}
  blockN=n;bump();return n}
 function configure(o={}){let rebuild=false,changed=false;
  if(o.limitDeg!=null&&o.limitDeg!==P.limitDeg){P.limitDeg=o.limitDeg;rebuild=true;changed=true}
  if(o.speedKmh!=null&&o.speedKmh!==P.speedKmh){P.speedKmh=o.speedKmh;changed=true}
  if(o.massKg!=null&&o.massKg!==P.massKg){P.massKg=o.massKg;changed=true}
  if(o.style!=null&&(o.style!==P.style||o.weights)){P.style=STYLES[o.style]?o.style:'balanced';P.weights={...STYLES[P.style],...(o.weights||{})};changed=true}
  if(rebuild)rebuildPass();if(changed)bump();return P}
 return {T,configure,params:()=>({...P,weights:{...P.weights}}),cellOf:c=>snap(c),tree,straight,setBlocked,get version(){return version},blockedCount:()=>block.reduce((a,v)=>a+v,0),
  slopeAt:(lon,lat)=>{const i=lonLatToCell(T,lon,lat);return i<0?NaN:slope[i]},measure,coordOfCell};
}
