// Media slots: drop-in places for Lottie animations or custom pictures. Nothing is required: an empty slot shows a small labelled placeholder.
// To fill a slot, copy your file into dist/assets/media/ and list it in dist/assets/media/manifest.json, e.g.
//   {"capcom":"capcom.svg","empty":"explore.json"}
// .json = Lottie animation (lottie-web, loaded only when needed); .png .jpg .webp .svg .gif = picture.
export const SLOT_HINTS={capcom:'CAPCOM avatar',empty:'empty-state animation'};
export function resolveSlot(name,file,base='assets/media/'){
 if(!file||typeof file!=='string'||/[\\]|\.\.|^\/|:/.test(file))return {kind:'placeholder',name};
 const ext=file.split('.').pop().toLowerCase(),src=base+file;
 if(ext==='json')return {kind:'lottie',name,src};
 if(['png','jpg','jpeg','webp','svg','gif'].includes(ext))return {kind:'image',name,src};
 return {kind:'placeholder',name};
}
let lottiePromise=null;
function loadLottie(src='vendor/lottie_light.min.js'){
 if(globalThis.lottie)return Promise.resolve(globalThis.lottie);
 return lottiePromise??=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=()=>res(globalThis.lottie);s.onerror=()=>{lottiePromise=null;rej(new Error('lottie failed'))};document.head.append(s)});
}
export async function mountSlots(root=document,{fetchFn=globalThis.fetch,base='assets/media/'}={}){
 let manifest={};try{const r=await fetchFn(base+'manifest.json',{cache:'no-cache'});if(r.ok)manifest=await r.json()}catch{}
 for(const el of root.querySelectorAll('[data-slot]')){
  const name=el.dataset.slot,spec=resolveSlot(name,manifest?.[name],base);el.classList.add('slot');el.textContent='';
  if(spec.kind==='image'){const im=document.createElement('img');im.src=spec.src;im.alt='';im.decoding='async';el.append(im);el.dataset.filled='image'}
  else if(spec.kind==='lottie'){try{const L=await loadLottie();L.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:true,path:spec.src});el.dataset.filled='lottie'}catch{spec.kind='placeholder'}}
  if(spec.kind==='placeholder'){const s=document.createElement('span');s.className='slotph';s.textContent=SLOT_HINTS[name]||name;el.append(s);el.dataset.filled='placeholder'}
 }
}
