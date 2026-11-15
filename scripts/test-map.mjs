import assert from 'node:assert/strict';
import {worldZoom,projectPoint,unprojectPoint,zoomAt} from '../dist/map-camera.js';
for(const [w,h] of [[1200,700],[390,500],[1800,800]]){
 let v={lon:0,lat:0,zoom:worldZoom(w,h)};let nw=projectPoint([-180,90],v,w,h),se=projectPoint([180,-90],v,w,h);assert(nw[0]>=0&&nw[1]>=0&&se[0]<=w&&se[1]<=h);
 v={lon:77.42,lat:18.46,zoom:1};let pt=[w*.6,h*.4],a=unprojectPoint(pt,v,w,h);zoomAt(v,1.8,pt,w,h);let b=unprojectPoint(pt,v,w,h);assert(Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9);
 for(let i=0;i<30;i++)zoomAt(v,.5,[w/2,h/2],w,h);assert.equal(v.lon,0);assert.equal(v.lat,0);assert.equal(v.zoom,worldZoom(w,h));
}
console.log('Global/local map camera tests passed.');
