import assert from 'node:assert/strict';
import {basis} from '../dist/globe.js';
for(const lon of [-180,-90,0,77.42,180])for(const lat of [-85,0,18.46,85]){const b=basis(lon,lat);for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(b[i].reduce((s,v,k)=>s+v*b[j][k],0)-(i===j?1:0))<1e-12);const n=b[2];assert.ok(Math.abs(Math.asin(n[1])*180/Math.PI-lat)<1e-10);if(Math.abs(lon)<180)assert.ok(Math.abs(Math.atan2(n[0],n[2])*180/Math.PI-lon)<1e-10)}
const j=basis(77.42,18.46)[2];assert.ok(j[0]>.92&&j[1]>.31&&j[2]>.20);
console.log('Globe geographic projection and orthonormal camera tests passed.');
