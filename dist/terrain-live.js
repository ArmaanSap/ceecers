// Runs our fine-tuned SegFormer-B0 (dist/assets/models/marswalk_terrain.onnx) IN THE BROWSER on a real panorama.
// Same recipe as scripts/run_terrain_model.py: square tiles of panorama height, stride half a tile, softmax,
// Hanning-weighted blending at 1/4 scale, then argmax; the ground mask comes from the precomputed overlay's alpha.
// Classes are merged to two groups for display: loose ground (soil+sand) and rock (bedrock+big rock).
export const SIZE=384,SCALE=4,CLASSES=['soil','bedrock','sand','big_rock'],GROUP=[0,1,0,1]; // class -> 0 loose, 1 rock
const MEAN=[0.485,0.456,0.406],STD=[0.229,0.224,0.225];
export const tileStarts=(W,tile)=>{const step=Math.max(1,tile>>1),xs=[];for(let x=0;x<=Math.max(0,W-tile);x+=step)xs.push(x);if(xs.at(-1)+tile<W)xs.push(W-tile);return xs};
export const hann=n=>{const M=n+2,o=new Float32Array(n);for(let i=0;i<n;i++)o[i]=.5-.5*Math.cos(2*Math.PI*(i+1)/(M-1));return o}; // np.hanning(n+2)[1:-1]
export function softmax4(l,i,n){ // logits laid out [4][n]; returns probabilities for pixel i
 const a=l[i],b=l[n+i],c=l[2*n+i],d=l[3*n+i],m=Math.max(a,b,c,d),ea=Math.exp(a-m),eb=Math.exp(b-m),ec=Math.exp(c-m),ed=Math.exp(d-m),s=ea+eb+ec+ed;return [ea/s,eb/s,ec/s,ed/s];
}
// Add one tile's logits (4 x 96 x 96) into the blend buffers (acc: 4 x h4 x w4, cnt: h4 x w4), tile covering x from xa, size tw.
export function blendTile(acc,cnt,w4,h4,logits,xa,tw,n=96){
 const g=hann(tw),P=new Float32Array(4*n*n);
 for(let i=0;i<n*n;i++){const p=softmax4(logits,i,n*n);for(let k=0;k<4;k++)P[k*n*n+i]=p[k]}
 const r=n/tw;
 for(let y=0;y<tw&&y<h4;y++){const sy=Math.min(n-1,Math.max(0,(y+.5)*r-.5)),y0=Math.floor(sy),y1=Math.min(n-1,y0+1),fy=sy-y0;
  for(let x=0;x<tw&&xa+x<w4;x++){const sx=Math.min(n-1,Math.max(0,(x+.5)*r-.5)),x0=Math.floor(sx),x1=Math.min(n-1,x0+1),fx=sx-x0,w=g[y]*g[x]+1e-3,o=y*w4+xa+x;
   for(let k=0;k<4;k++){const b=k*n*n,v=(P[b+y0*n+x0]*(1-fx)+P[b+y0*n+x1]*fx)*(1-fy)+(P[b+y1*n+x0]*(1-fx)+P[b+y1*n+x1]*fx)*fy;acc[k*w4*h4+o]+=v*w}
   cnt[o]+=w}}
}
// class index per pixel (255 where nothing has been blended yet)
export function argmaxMap(acc,cnt,w4,h4){const m=new Uint8Array(w4*h4).fill(255),n=w4*h4;for(let i=0;i<n;i++){if(cnt[i]<=0)continue;let b=0,bv=acc[i];for(let k=1;k<4;k++){const v=acc[k*n+i];if(v>bv){bv=v;b=k}}m[i]=b}return m}
// two-group shares (percent) over pixels where ok[i] is true and the model has an answer
export function groupShares(m,ok){let l=0,r=0;for(let i=0;i<m.length;i++){if(!ok[i]||m[i]===255)continue;GROUP[m[i]]?r++:l++}const t=l+r||1;return {loose:+(100*l/t).toFixed(1),rock:+(100*r/t).toFixed(1),pixels:l+r}}
export function toRGBA(m,ok,colors,alpha=150){const o=new Uint8ClampedArray(m.length*4);for(let i=0;i<m.length;i++){if(!ok[i]||m[i]===255)continue;const c=colors[GROUP[m[i]]];o[i*4]=c[0];o[i*4+1]=c[1];o[i*4+2]=c[2];o[i*4+3]=alpha}return o}
export const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));

// ---- onnxruntime-web (vendored in dist/vendor/ort, loaded only when the button is pressed) ----
let sessionP=null;
const here=p=>new URL(p,import.meta.url).href;
export function loadModel(base='',onStatus=()=>{}){
 if(!sessionP)sessionP=(async()=>{
  onStatus('Loading the inference engine…');const ort=await import(here(base+'vendor/ort/ort.wasm.min.mjs'));
  ort.env.wasm.wasmPaths=here(base+'vendor/ort/');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  onStatus('Loading our model (15 MB)…');const buf=await (await fetch(here(base+'assets/models/marswalk_terrain.onnx'))).arrayBuffer();
  const session=await ort.InferenceSession.create(buf,{executionProviders:['wasm']});return {ort,session};
 })().catch(e=>{sessionP=null;throw e});
 return sessionP;
}
function tensorFromTile(ctx){const d=ctx.getImageData(0,0,SIZE,SIZE).data,n=SIZE*SIZE,f=new Float32Array(3*n);for(let i=0;i<n;i++)for(let c=0;c<3;c++)f[c*n+i]=(d[i*4+c]/255-MEAN[c])/STD[c];return f}
// img: loaded HTMLImageElement of the full panorama; okMask: Uint8Array(w4*h4) of ground pixels.
// onProgress({done,total,map,shares,ms}) fires after every tile so the overlay fills in as the model works.
export async function scanPanorama(img,okMask,{base='',onStatus=()=>{},onProgress=()=>{}}={}){
 const {ort,session}=await loadModel(base,onStatus),W=img.naturalWidth,H=img.naturalHeight,tile=Math.min(W,H),w4=Math.floor(W/SCALE),h4=Math.floor(H/SCALE),tw=Math.floor(tile/SCALE);
 const acc=new Float32Array(4*w4*h4),cnt=new Float32Array(w4*h4),xs=tileStarts(W,tile),cv=document.createElement('canvas');cv.width=cv.height=SIZE;
 const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';const t0=performance.now();let map=null,shares=null;
 for(let k=0;k<xs.length;k++){
  onStatus(`Scanning tile ${k+1} of ${xs.length}…`);await new Promise(r=>setTimeout(r,0));
  ctx.drawImage(img,xs[k],0,tile,tile,0,0,SIZE,SIZE);
  const out=await session.run({image:new ort.Tensor('float32',tensorFromTile(ctx),[1,3,SIZE,SIZE])});
  blendTile(acc,cnt,w4,h4,out[Object.keys(out)[0]].data,Math.floor(xs[k]/SCALE),tw);
  map=argmaxMap(acc,cnt,w4,h4);shares=groupShares(map,okMask);onProgress({done:k+1,total:xs.length,map,shares,ms:performance.now()-t0,w4,h4});
 }
 return {map,shares,ms:performance.now()-t0,w4,h4};
}
