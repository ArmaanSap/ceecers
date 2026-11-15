// Pure helpers for the DEM 3D view (no WebGL): decoding, geometry and shading. Tested in Node.
import {classIndex,CLASSES} from './traversability.js';
const R=3396190,RAD=Math.PI/180;
export function b64Bytes(s){if(typeof atob==='function'){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}return new Uint8Array(Buffer.from(s,'base64'))}
export function decodeTerrain(t){
 const {width:w,height:h,bounds:b}=t,eb=b64Bytes(t.elev_b64),elev=new Float32Array(eb.buffer.slice(eb.byteOffset,eb.byteOffset+w*h*4));
 const sb=b64Bytes(t.slope_b64),slope=new Float32Array(w*h);for(let i=0;i<w*h;i++)slope[i]=sb[i]===t.nodataCode?NaN:sb[i]*t.slopeScaleDeg;
 const bk=b;let rel=null;if(t.elevFit&&t.elevFit.a!=null){rel=elev.slice();const f=t.elevFit,lat1=(b.south+b.north)/2,sx=(b.east-b.west)*RAD*R*Math.cos(lat1*RAD)/1000,sz=(b.north-b.south)*RAD*R/1000;for(let j=0;j<h;j++)for(let i=0;i<w;i++)elev[j*w+i]+=f.a+f.b*(i/(w-1)*sx)+f.c*(j/(h-1)*sz)}   // absolute (fitted) elevation; elevRel keeps the detrended values
 const lat0=(b.south+b.north)/2,mx=R*RAD*Math.cos(lat0*RAD),my=R*RAD;
 const sizeX=(b.east-b.west)*mx,sizeZ=(b.north-b.south)*my;
 let min=Infinity,max=-Infinity;for(const v of elev){if(v<min)min=v;if(v>max)max=v}
 return {w,h,elev,elevRel:rel,absolute:!!rel,slope,bounds:b,sizeX,sizeZ,cellX:sizeX/(w-1),cellZ:sizeZ/(h-1),min,max};
}
// Local metres east (x) and south (z) of the north-west corner; y is height.
export function toLocal(D,lon,lat){return {x:(lon-D.bounds.west)/(D.bounds.east-D.bounds.west)*D.sizeX,z:(D.bounds.north-lat)/(D.bounds.north-D.bounds.south)*D.sizeZ}}
export function inside(D,lon,lat){const b=D.bounds;return lon>=b.west&&lon<=b.east&&lat>=b.south&&lat<=b.north}
export function heightAtLocal(D,x,z){
 const fx=Math.min(D.w-1.001,Math.max(0,x/D.cellX)),fz=Math.min(D.h-1.001,Math.max(0,z/D.cellZ)),i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,e=D.elev,w=D.w;
 return e[j*w+i]*(1-u)*(1-v)+e[j*w+i+1]*u*(1-v)+e[(j+1)*w+i]*(1-u)*v+e[(j+1)*w+i+1]*u*v;
}
export function heightAt(D,lon,lat){const p=toLocal(D,lon,lat);return heightAtLocal(D,p.x,p.z)}
// Lambert shade 0..1 from the DEM itself (sun azimuth clockwise from north, altitude above horizon).
export function hillshade(D,az=315,alt=40,exag=1){
 const {w,h,elev,cellX,cellZ}=D,out=new Float32Array(w*h),a=az*RAD,z=alt*RAD,lx=Math.sin(a)*Math.cos(z),ly=Math.sin(z),lz=-Math.cos(a)*Math.cos(z);
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const i0=Math.max(0,i-1),i1=Math.min(w-1,i+1),j0=Math.max(0,j-1),j1=Math.min(h-1,j+1);
  const dx=(elev[j*w+i1]-elev[j*w+i0])*exag/((i1-i0)*cellX),dz=(elev[j1*w+i]-elev[j0*w+i])*exag/((j1-j0)*cellZ);
  const nx=-dx,ny=1,nz=-dz,n=Math.hypot(nx,ny,nz);out[j*w+i]=Math.max(0,(nx*lx+ny*ly+nz*lz)/n);
 }
 return out;
}
export function classColorAt(D,i){const s=D.slope[i];if(!(s>=0))return [90,90,90];const c=CLASSES[classIndex(s)].color;return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]}
// Densify a lon/lat polyline so a draped path follows the ground: a point at least every stepM metres.
export function densify(D,coords,stepM=20){
 const out=[];for(let k=0;k<coords.length;k++){
  const p=toLocal(D,coords[k][0],coords[k][1]);if(k===0){out.push(p);continue}
  const q=out[out.length-1],d=Math.hypot(p.x-q.x,p.z-q.z),n=Math.max(1,Math.ceil(d/stepM));
  for(let s=1;s<=n;s++)out.push({x:q.x+(p.x-q.x)*s/n,z:q.z+(p.z-q.z)*s/n});
 }
 return out;
}
// Compass bearing (deg, clockwise from north) -> unit vector in local x(east)/z(south) space.
export function bearingVec(deg){const a=deg*RAD;return {x:Math.sin(a),z:-Math.cos(a)}}

// ---- VR helpers (pure, tested without a headset) ----
// Thumbstick move: axes [x,y] (y<0 = push forward), head yaw in radians about +y (camera looks down -z at yaw 0).
export function vrMove(ax,ay,yaw,dt,speed){
 if(Math.hypot(ax,ay)<.15)return {dx:0,dz:0};
 const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw),f=-ay,s=speed*dt;
 return {dx:(fx*f+rx*ax)*s,dz:(fz*f+rz*ax)*s};
}
// Rig yaw that makes the headset face map-direction (x,z).
export const yawToFace=(x,z)=>Math.atan2(-x,-z);
// Compass bearing in degrees (0 = north = -z, 90 = east = +x) and 8-point name.
export function bearingTo(dx,dz){const d=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;return {deg:d,name:['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8]}}
// Index of the stop to head for next: the first one more than 40 m away after `cur`, wrapping.
export function nextStopIndex(list,cur){return list.length?(cur+1)%list.length:-1}
// Slope underfoot in degrees from the DEM, sampled 20 m either side.
export function slopeUnder(D,x,z){const e=20,dzx=(heightAtLocal(D,x+e,z)-heightAtLocal(D,x-e,z))/(2*e),dzz=(heightAtLocal(D,x,z+e)-heightAtLocal(D,x,z-e))/(2*e);return Math.atan(Math.hypot(dzx,dzz))*180/Math.PI}
