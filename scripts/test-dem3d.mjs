import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeTerrain,toLocal,heightAt,hillshade,densify,bearingVec,inside} from '../dist/dem3d-math.js';
const T=JSON.parse(fs.readFileSync(new URL('../dist/assets/terrain.json',import.meta.url)));
const D=decodeTerrain(T);
assert.equal(D.elev.length,D.w*D.h);assert.ok(D.max>D.min&&Number.isFinite(D.min));assert.ok(D.sizeX>8000&&D.sizeX<11000,'about 9 km wide: '+D.sizeX);
const nw=toLocal(D,D.bounds.west,D.bounds.north),se=toLocal(D,D.bounds.east,D.bounds.south);
assert.ok(Math.abs(nw.x)<1e-6&&Math.abs(nw.z)<1e-6);assert.ok(Math.abs(se.x-D.sizeX)<1e-6&&Math.abs(se.z-D.sizeZ)<1e-6);
assert.ok(Math.abs(heightAt(D,D.bounds.west,D.bounds.north)-D.elev[0])<1e-3,'corner height matches cell 0');
const mid=heightAt(D,77.42,18.46);assert.ok(mid>=D.min&&mid<=D.max);
assert.ok(inside(D,77.42,18.46)&&!inside(D,70,10));
const hs=hillshade(D);assert.ok(hs.every(v=>v>=0&&v<=1.0001));
const flat={...D,elev:new Float32Array(D.w*D.h)};const f=hillshade(flat,315,40);assert.ok(Math.abs(f[1000]-Math.sin(40*Math.PI/180))<1e-4,'flat ground shade = sin(alt)');
const dp=densify(D,[[77.40,18.45],[77.41,18.45]],20);assert.ok(dp.length>25);for(let i=1;i<dp.length;i++)assert.ok(Math.hypot(dp[i].x-dp[i-1].x,dp[i].z-dp[i-1].z)<=20.001);
const n=bearingVec(0),e=bearingVec(90);assert.ok(Math.abs(n.z+1)<1e-9&&Math.abs(e.x-1)<1e-9,'north = -z, east = +x');
// absolute elevation: fitted DEM agrees with the rover's recorded elevations
assert.ok(T.elevFit&&T.elevFit.points>1000&&T.elevFit.rmsM<5,'elevFit stored with small residual');assert.ok(D.absolute&&D.min<-2300&&D.max>-2700,'DEM is absolute after fit: '+D.min+'..'+D.max);
{const tr=JSON.parse(fs.readFileSync(new URL('../dist/assets/traverse.json',import.meta.url)));let k=0,m=0,e2=0;for(const f of tr.features)for(const c of f.geometry?.coordinates||[])if(c[2]<-2000&&c[2]>-3200&&inside(D,c[0],c[1])&&(k++%7===0)){m++;e2+=(heightAt(D,c[0],c[1])-c[2])**2}assert.ok(Math.sqrt(e2/m)<5,'fitted DEM within 5 m RMS of recorded rover elevation')}
console.log('dem3d math ok');
// VR helpers
{const m=await import('../dist/dem3d-math.js');
 const f=m.vrMove(0,-1,0,1,6);assert.ok(Math.abs(f.dx)<1e-9&&Math.abs(f.dz+6)<1e-9,'stick forward at yaw 0 walks north (-z)');
 const r=m.vrMove(1,0,0,1,6);assert.ok(Math.abs(r.dx-6)<1e-9,'stick right at yaw 0 walks east');
 const y=m.vrMove(0,-1,Math.PI/2,1,6);assert.ok(Math.abs(y.dx+6)<1e-9&&Math.abs(y.dz)<1e-9,'turned left 90 degrees, forward walks west');
 assert.deepEqual(m.vrMove(.05,.05,0,1,6),{dx:0,dz:0},'dead zone');
 const yf=m.yawToFace(1,0);assert.ok(Math.abs(m.vrMove(0,-1,yf,1,1).dx-1)<1e-9,'yawToFace makes forward point at the target');
 assert.equal(m.bearingTo(0,-10).name,'N');assert.equal(m.bearingTo(10,0).name,'E');assert.equal(m.nextStopIndex([1,2,3],2),0);assert.equal(m.nextStopIndex([],0),-1);
 assert.ok(m.slopeUnder(D,D.sizeX/2,D.sizeZ/2)>=0&&m.slopeUnder(D,D.sizeX/2,D.sizeZ/2)<90,'slope underfoot is a sane angle');
 console.log('VR math passed');}
