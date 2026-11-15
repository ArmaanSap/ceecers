// The CTX DEM we ship is DETRENDED (regional tilt removed), so its heights are relative. This script recovers absolute elevation by fitting
// a plane  z = a + b*x + c*y  (x east, y south, km) between the DEM and the rover's own RECORDED elevations (traverse.json),
// and stores it as terrain.json -> elevFit. Slope is untouched. Re-run after regenerating terrain.json:  node scripts/fit_elevation.mjs
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {decodeTerrain,heightAt,inside} from '../dist/dem3d-math.js';
const A=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','dist','assets'),tf=path.join(A,'terrain.json');
const T=JSON.parse(fs.readFileSync(tf)),D=decodeTerrain({...T,elevFit:undefined}),tr=JSON.parse(fs.readFileSync(path.join(A,'traverse.json')));
const rows=[];for(const f of tr.features)for(const c of f.geometry?.coordinates||[])if(Number.isFinite(c[2])&&c[2]<-2000&&c[2]>-3200&&inside(D,c[0],c[1])){   // recorded z of 0 is a no-data marker
 rows.push({x:(c[0]-D.bounds.west)/(D.bounds.east-D.bounds.west)*D.sizeX/1000,y:(D.bounds.north-c[1])/(D.bounds.north-D.bounds.south)*D.sizeZ/1000,dz:c[2]-heightAt(D,c[0],c[1])})}
const n=rows.length;if(n<500)throw new Error('too few rover elevation points: '+n);
const S=f=>rows.reduce((s,r)=>s+f(r),0),M=[[n,S(r=>r.x),S(r=>r.y)],[S(r=>r.x),S(r=>r.x*r.x),S(r=>r.x*r.y)],[S(r=>r.y),S(r=>r.x*r.y),S(r=>r.y*r.y)]],B=[S(r=>r.dz),S(r=>r.dz*r.x),S(r=>r.dz*r.y)];
const det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
const d=det(M),[a,b,c]=[0,1,2].map(i=>det(M.map((row,r)=>row.map((v,k)=>k===i?B[r]:v)))/d);
const rms=Math.sqrt(S(r=>(r.dz-(a+b*r.x+c*r.y))**2)/n),mean=S(r=>r.dz)/n,rms0=Math.sqrt(S(r=>(r.dz-mean)**2)/n);
T.elevFit={a,b,c,unitsKm:true,rmsM:+rms.toFixed(2),constantOnlyRmsM:+rms0.toFixed(2),points:n,method:'least-squares plane between detrended CTX DEM and recorded rover elevations (traverse.json), in-sample',note:'Absolute elevation = DEM + a + b*x_km_east + c*y_km_south. Slope unaffected.'};
fs.writeFileSync(tf,JSON.stringify(T));console.log('elevFit',T.elevFit);
