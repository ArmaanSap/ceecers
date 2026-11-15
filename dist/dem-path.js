// Cross-country path search on the 20 m DEM slope grid (8-neighbour A*). Pure: no DOM, no WebGL.
// This is a MODEL: slope only. Rocks, sand and dust are not in the data, and the result is not rover-verified.
import {distance} from './routing.js';

class Heap{constructor(){this.k=[];this.v=[]}get size(){return this.k.length}
 push(key,val){const k=this.k,v=this.v;let i=k.length;k.push(key);v.push(val);while(i){const p=(i-1)>>1;if(k[p]<=key)break;k[i]=k[p];v[i]=v[p];i=p}k[i]=key;v[i]=val}
 pop(){const k=this.k,v=this.v,top=v[0],lk=k.pop(),lv=v.pop();if(k.length){let i=0;for(;;){let j=i*2+1;if(j>=k.length)break;if(j+1<k.length&&k[j+1]<k[j])j++;if(k[j]>=lk)break;k[i]=k[j];v[i]=v[j];i=j}k[i]=lk;v[i]=lv}return top}}

export function cellOf(D,lon,lat){const b=D.bounds,i=Math.round((lon-b.west)/(b.east-b.west)*(D.w-1)),j=Math.round((b.north-lat)/(b.north-b.south)*(D.h-1));return i<0||j<0||i>=D.w||j>=D.h?-1:j*D.w+i}
export function lonLatOf(D,idx){const b=D.bounds,i=idx%D.w,j=(idx/D.w)|0;return [b.west+i/(D.w-1)*(b.east-b.west),b.north-j/(D.h-1)*(b.north-b.south)]}
function simplify(pts,tol){ // Douglas-Peucker in local metres
 if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];
 const dist=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],L=dx*dx+dz*dz;let t=L?((p[0]-a[0])*dx+(p[1]-a[1])*dz)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)};
 while(st.length){const [a,b]=st.pop();let m=-1,mi=-1;for(let i=a+1;i<b;i++){const d=dist(pts[i],pts[a],pts[b]);if(d>m){m=d;mi=i}}if(m>tol){keep[mi]=1;st.push([a,mi],[mi,b])}}
 return pts.filter((_,i)=>keep[i]);
}
// opts: {limitDeg: hard slope limit, penalty: weight of (slope/refDeg)^2 added to step cost, refDeg, padM}
export function gridRoute(D,from,to,{limitDeg=20,penalty=0,refDeg=10,padM=2500}={}){
 const a=cellOf(D,from[0],from[1]),z=cellOf(D,to[0],to[1]);if(a<0||z<0)return null;
 const W=D.w,H=D.h,pi=Math.ceil(padM/D.cellX),pj=Math.ceil(padM/D.cellZ),ai=a%W,aj=(a/W)|0,zi=z%W,zj=(z/W)|0;
 const i0=Math.max(0,Math.min(ai,zi)-pi),i1=Math.min(W-1,Math.max(ai,zi)+pi),j0=Math.max(0,Math.min(aj,zj)-pj),j1=Math.min(H-1,Math.max(aj,zj)+pj);
 const g=new Float64Array(W*H).fill(Infinity),prev=new Int32Array(W*H).fill(-1),heap=new Heap(),sl=D.slope;
 const ok=idx=>idx===a||idx===z||(sl[idx]<=limitDeg); // NaN fails the comparison: nodata is impassable
 const h=idx=>Math.hypot(((idx%W)-zi)*D.cellX,(((idx/W)|0)-zj)*D.cellZ);
 g[a]=0;heap.push(h(a),a);
 while(heap.size){const u=heap.pop();if(u===z)break;const ui=u%W,uj=(u/W)|0,gu=g[u];
  for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const vi=ui+di,vj=uj+dj;if(vi<i0||vi>i1||vj<j0||vj>j1)continue;const v=vj*W+vi;if(!ok(v))continue;
   const len=Math.hypot(di*D.cellX,dj*D.cellZ),sv=Number.isFinite(sl[v])?sl[v]:0,su=Number.isFinite(sl[u])?sl[u]:0,s=(sv+su)/2,c=gu+len*(1+penalty*(s/refDeg)*(s/refDeg));
   if(c<g[v]){g[v]=c;prev[v]=u;heap.push(c+h(v),v)}}}
 if(!Number.isFinite(g[z]))return null;
 const cells=[];for(let u=z;u!==-1;u=prev[u])cells.push(u);cells.reverse();
 const loc=cells.map(c=>[(c%W)*D.cellX,((c/W)|0)*D.cellZ]),simp=simplify(loc,12);
 const keepSet=new Set(simp.map(p=>p[0]+','+p[1])),coords=[];cells.forEach((c,k)=>{if(keepSet.has(loc[k][0]+','+loc[k][1]))coords.push(lonLatOf(D,c))});
 coords[0]=[from[0],from[1]];coords[coords.length-1]=[to[0],to[1]];
 let dist=0;for(let k=1;k<coords.length;k++)dist+=distance(coords[k-1],coords[k]);
 return {coords,distance:dist};
}
// Chain legs base -> stops(order) -> base. Returns null if any leg has no path under the limit.
export function chainRoute(D,base,stopCoords,opts){
 const pts=[base,...stopCoords,base],coords=[];let dist=0;
 for(let k=0;k<pts.length-1;k++){const r=gridRoute(D,pts[k],pts[k+1],opts);if(!r)return null;coords.push(...r.coords.slice(k?1:0));dist+=r.distance}
 return {coords,distance:dist};
}
