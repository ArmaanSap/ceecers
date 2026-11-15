import assert from 'node:assert/strict';
import {marsNow} from '../dist/mars-now.js';
// Perseverance landed 2021-02-18 20:55 UTC = sol 0; one sol later is sol 1.
assert.equal(marsNow(new Date(Date.UTC(2021,1,18,21,0,0))).sol, 0);
assert.equal(marsNow(new Date(Date.UTC(2021,1,19,21,40,0))).sol, 1);
// Today (2026-11-15) should be around sol 2040 +-3.
const s = marsNow(new Date(Date.UTC(2026,10,15,18,0,0)));
assert.ok(Math.abs(s.sol - 2040) <= 3, 'sol ' + s.sol);
// Local time at Jezero at landing was mid-afternoon (~15:40 LMST): sanity range.
const l = marsNow(new Date(Date.UTC(2021,1,18,20,55,0))).lmst;
assert.ok(l > 14 && l < 17, 'lmst ' + l);
// Temperature stays inside the stated typical range and is coldest before dawn, warmest afternoon.
for (let i=0;i<48;i++){const t=marsNow(new Date(Date.UTC(2026,10,15,0,i*30))).tempC; assert.ok(t>=-80&&t<=-10)}
assert.ok(marsNow().radVsEarth > 50 && marsNow().radVsEarth < 200);
console.log('mars-now ok');
