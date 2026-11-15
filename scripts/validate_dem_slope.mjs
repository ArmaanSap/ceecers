// Does the 20 m DEM slope agree with what the rover actually climbed? Compare DEM slope against the along-track grade implied by the
// rover's own recorded elevations (traverse.json z). Along-track grade can only be <= the DEM's steepest-direction slope, so we report
// correlation and the share of stretches where the rover's grade stays within the DEM slope (+ a noise allowance).
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {decodeTerrain,inside} from '../dist/dem3d-math.js';
const A=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','dist','assets');
const D=decodeTerrain(JSON.parse(fs.readFileSync(path.join(A,'terrain.json')))),tr=JSON.parse(fs.readFileSync(path.join(A,'traverse.json')));
const R=3396190,RAD=Math.PI/180,cell=(lon,lat)=>{const b=D.bounds,i=Math.round((lon-b.west)/(b.east-b.west)*(D.w-1)),j=Math.round((b.north-lat)/(b.north-b.south)*(D.h-1));return i>=0&&j>=0&&i<D.w&&j<D.h?j*D.w+i:-1};
const pts=[];for(const f of tr.features)for(const c of f.geometry?.coordinates||[])if(Number.isFinite(c[2])&&c[2]<-2000&&c[2]>-3200&&inside(D,c[0],c[1]))pts.push(c);
const out=[];let a=pts[0];
for(const c of pts.slice(1)){const dx=(c[0]-a[0])*RAD*R*Math.cos(a[1]*RAD),dy=(c[1]-a[1])*RAD*R,d=Math.hypot(dx,dy);if(d<40)continue;if(d<120){
 const g=Math.atan(Math.abs(c[2]-a[2])/d)/RAD,k1=cell(a[0],a[1]),k2=cell(c[0],c[1]);if(k1>=0&&k2>=0&&Number.isFinite(D.slope[k1])&&Number.isFinite(D.slope[k2]))out.push({g,s:(D.slope[k1]+D.slope[k2])/2})}a=c}
const n=out.length,mx=out.reduce((s,r)=>s+r.s,0)/n,my=out.reduce((s,r)=>s+r.g,0)/n;
let sxy=0,sxx=0,syy=0;for(const r of out){sxy+=(r.s-mx)*(r.g-my);sxx+=(r.s-mx)**2;syy+=(r.g-my)**2}
const r=sxy/Math.sqrt(sxx*syy),within=out.filter(o=>o.g<=o.s+3).length/n;
const res={stretches:n,pearsonR:+r.toFixed(3),meanDemSlopeDeg:+mx.toFixed(2),meanRoverGradeDeg:+my.toFixed(2),roverGradeWithinDemSlopePlus3deg:+within.toFixed(3)};
console.log(res);
if(process.argv.includes('--write')){const tf=path.join(A,'terrain.json'),T=JSON.parse(fs.readFileSync(tf));T.slopeCheck={...res,method:'DEM slope vs along-track grade from rover-recorded elevations, 40-120 m stretches, in-sample'};fs.writeFileSync(tf,JSON.stringify(T))}
