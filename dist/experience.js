export const easeArrival=p=>p*p*(3-2*p);
export function startExperience({onSurface,mapReady=Promise.resolve(true),terrainReady=Promise.resolve(false),flyToJezero=async()=>{},sceneReady=Promise.resolve(false),landScene=async()=>{},finishScene=()=>{},paneId='#terrainPane'}){
 const $=s=>document.querySelector(s),pane=$(paneId),audio=$('#spaceMusic'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const ui=[...document.querySelectorAll('body>header,body>main,body>footer,body>.musicbar')];
 const animate=(duration,update)=>new Promise(resolve=>{let start;function frame(t){start??=t;let p=Math.min(1,(t-start)/duration);update(easeArrival(p));p<1?requestAnimationFrame(frame):resolve()}requestAnimationFrame(frame)});
 const waitBounded=(promise,ms)=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v)},()=>{clearTimeout(timer);resolve(false)})});
 {let v=1;try{const s=parseFloat(localStorage.getItem('marswalk-music-vol'));if(s>=0&&s<=1)v=s}catch{}audio.volume=v;const sl=$('#musicVol');if(sl){sl.value=String(v);sl.oninput=()=>{audio.volume=+sl.value;try{localStorage.setItem('marswalk-music-vol',sl.value)}catch{}}}}const playMusic=()=>audio.play().then(()=>{$('#musicStatus').textContent='Playing';document.removeEventListener('pointerdown',playMusic);document.removeEventListener('keydown',playMusic)}).catch(()=>$('#musicStatus').textContent='Sound starts on interaction');
 document.addEventListener('pointerdown',playMusic);document.addEventListener('keydown',playMusic);playMusic();
 document.body.classList.add('intro-active','scene-arrival');ui.forEach(e=>e.inert=true);pane.hidden=false;pane.classList.add('cinematic');
 const ready=(async()=>{
  const beam=document.createElement('div');beam.id='crtBeam';document.body.append(beam);await animate(reduced?150:1400,()=>{});beam.remove();
  const [mapOK,terrainOK,sceneOK]=await Promise.all([waitBounded(mapReady,25000),waitBounded(terrainReady,25000),waitBounded(sceneReady,25000)]);
  // Act 1: full-globe zoom into Jezero (Esri scene). Skipped cleanly when that scene is unavailable.
  if(terrainOK)await waitBounded(flyToJezero(!reduced),15000);
  onSurface();
  if(sceneOK){
   // Act 2: no second flight. The globe pane zooms in and pans out (fades away), revealing the 3D crater view already in place, then the interface slides in.
   const landing=landScene(false);
   await animate(reduced?100:900,p=>{pane.style.opacity=String(1-p)});
   pane.hidden=true;pane.classList.remove('cinematic');pane.style.opacity='';
   await landing;finishScene();
   document.body.classList.remove('scene-arrival');
  }else{
   // Landing on the 2D map: the globe pane glides (resizes) down into the map frame, then dissolves to reveal the 2D map at Jezero.
   const r=$('#mapstage').getBoundingClientRect(),w=innerWidth,h=innerHeight;
   await animate(reduced?100:1100,p=>{pane.style.left=r.left*p+'px';pane.style.top=r.top*p+'px';pane.style.width=w+(r.width-w)*p+'px';pane.style.height=h+(r.height-h)*p+'px'});
   await animate(reduced?50:450,p=>{pane.style.opacity=String(1-p)});
   pane.hidden=true;pane.classList.remove('cinematic');for(const k of ['left','top','width','height','opacity'])pane.style[k]='';
   document.body.classList.remove('scene-arrival');
  }
  document.body.classList.add('panels-arriving');await animate(reduced?100:800,()=>{});
  document.body.classList.remove('intro-active','panels-arriving');ui.forEach(e=>e.inert=false);$('#allMars').focus();
 })();return {ready};
}
