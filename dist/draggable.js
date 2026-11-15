// Makes an absolutely-positioned element draggable inside its parent (mouse, touch, pen and arrow keys).
// Position is stored as fractions of the free space so it survives window resizes. Double-click or Home resets it.
export function makeDraggable(el,{key='marswalk-pos',storage=globalThis.localStorage}={}){
 let fx=null,fy=null,drag=null;
 const read=()=>{try{const v=JSON.parse(storage.getItem(key));if(v&&Number.isFinite(v.fx)&&Number.isFinite(v.fy)){fx=v.fx;fy=v.fy}}catch{}};
 const save=()=>{try{storage.setItem(key,JSON.stringify({fx,fy}))}catch{}};
 const free=()=>{const p=el.parentElement,pr=p.getBoundingClientRect(),er=el.getBoundingClientRect();return {w:Math.max(1,pr.width-er.width),h:Math.max(1,pr.height-er.height),pr}};
 function apply(){
  if(fx==null){el.style.left='';el.style.top='';el.style.right='';el.style.bottom='';return}
  const f=free();el.style.right='auto';el.style.bottom='auto';el.style.left=Math.round(Math.min(1,Math.max(0,fx))*f.w)+'px';el.style.top=Math.round(Math.min(1,Math.max(0,fy))*f.h)+'px';
 }
 function moveTo(clientX,clientY,off){const f=free();fx=Math.min(1,Math.max(0,(clientX-f.pr.left-off.x)/f.w));fy=Math.min(1,Math.max(0,(clientY-f.pr.top-off.y)/f.h));apply()}
 el.style.touchAction='none';el.style.cursor='grab';el.tabIndex=0;el.title='Drag to move · double-click to reset · arrow keys nudge';
 el.addEventListener('pointerdown',e=>{if(e.button>0)return;const r=el.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};try{el.setPointerCapture(e.pointerId)}catch{}el.style.cursor='grabbing';e.preventDefault()});
 el.addEventListener('pointermove',e=>{if(drag)moveTo(e.clientX,e.clientY,drag)});
 const end=()=>{if(!drag)return;drag=null;el.style.cursor='grab';save()};
 el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 el.addEventListener('dblclick',()=>{fx=fy=null;apply();try{storage.removeItem(key)}catch{}});
 el.addEventListener('keydown',e=>{
  if(e.key==='Home'){fx=fy=null;apply();try{storage.removeItem(key)}catch{}return}
  const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();
  const f=free(),r=el.getBoundingClientRect();if(fx==null){fx=(r.left-f.pr.left)/f.w;fy=(r.top-f.pr.top)/f.h}
  fx=Math.min(1,Math.max(0,fx+d[0]*12/f.w));fy=Math.min(1,Math.max(0,fy+d[1]*12/f.h));apply();save();
 });
 addEventListener('resize',apply);read();apply();
 return {reset(){fx=fy=null;apply()},get position(){return {fx,fy}}};
}
