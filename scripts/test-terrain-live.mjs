import assert from 'node:assert/strict';import {tileStarts,hann,softmax4,blendTile,argmaxMap,groupShares,toRGBA,hex} from '../dist/terrain-live.js';
assert.deepEqual(tileStarts(3000,833),[0,416,832,1248,1664,2080,2167],'same tiling as the Python run');assert.deepEqual(tileStarts(833,833),[0]);
const h=hann(5);assert.ok(Math.abs(h[2]-1)<1e-6&&h[0]>0&&Math.abs(h[0]-h[4])<1e-6,'np.hanning(n+2)[1:-1]');
const l=new Float32Array(4*2);l.set([5,0],0);l.set([0,0],2);l.set([0,5],4);l.set([0,0],6);const p=softmax4(l,0,2);assert.ok(Math.abs(p.reduce((a,b)=>a+b)-1)<1e-6&&p[0]>.9,'softmax');
// one tile that says "bedrock" everywhere, blended into a 40x20 grid at xa=10 (tw 20)
const w4=40,h4=20,n=96,lg=new Float32Array(4*n*n);for(let i=0;i<n*n;i++)lg[n*n+i]=6;const acc=new Float32Array(4*w4*h4),cnt=new Float32Array(w4*h4);blendTile(acc,cnt,w4,h4,lg,10,20);
const m=argmaxMap(acc,cnt,w4,h4);assert.equal(m[5*w4+15],1,'bedrock inside the tile');assert.equal(m[5*w4+2],255,'untouched pixels stay unanswered');
const ok=new Uint8Array(w4*h4).fill(1);const s=groupShares(m,ok);assert.equal(s.rock,100);assert.equal(s.loose,0);assert.equal(s.pixels,400);
// a sand + soil map is all "loose ground" (merged groups)
const m2=new Uint8Array([0,2,0,2,1,3]);assert.deepEqual(groupShares(m2,new Uint8Array(6).fill(1)),{loose:66.7,rock:33.3,pixels:6});
const px=toRGBA(new Uint8Array([0,1,255]),new Uint8Array([1,1,1]),[hex('#e0b050'),hex('#6ea8ff')]);assert.deepEqual([...px.slice(0,4)],[224,176,80,150]);assert.deepEqual([...px.slice(4,8)],[110,168,255,150]);assert.equal(px[11],0,'no answer = transparent');
console.log('Live terrain: same tiling and blending as the offline run; merged to loose ground vs rock.');
