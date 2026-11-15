// Self-contained 3D Jezero: the project's own 20 m CTX DEM as a mesh, with the route, stops and walker on it.
// Heights are RELATIVE (the DEM is detrended), so relief is true but absolute elevation is not shown.
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {routeEffort} from './effort-model.js';
import {decodeTerrain,toLocal,heightAtLocal,hillshade,classColorAt,densify,bearingVec,inside,vrMove,yawToFace,bearingTo,nextStopIndex,slopeUnder} from './dem3d-math.js';

export function createDem3D({container,terrain,imagery=null,imageBounds=[77.36,18.4,77.48,18.52]}){
 const D=decodeTerrain(terrain),W=D.sizeX,H=D.sizeZ;
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.xr.enabled=true;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
 container.appendChild(renderer.domElement);renderer.domElement.className='dem3d-canvas';renderer.domElement.setAttribute('aria-label','3D terrain of Jezero crater from the CTX DEM');
 const scene=new THREE.Scene(),SKY=0xc99a74;scene.background=new THREE.Color(SKY);scene.fog=new THREE.Fog(SKY,9000,26000);
 const cam=new THREE.PerspectiveCamera(50,1,2,60000);
 const ctl=new OrbitControls(cam,renderer.domElement);ctl.enableDamping=true;ctl.maxPolarAngle=Math.PI*.495;ctl.minDistance=20;ctl.maxDistance=22000;
 const rig=new THREE.Group();scene.add(rig);rig.add(cam);
 scene.add(new THREE.HemisphereLight(0xffe7cc,0x6b4a35,1.0));
 const sun=new THREE.DirectionalLight(0xfff0dd,.6);sun.position.set(-1,1.2,-.8);scene.add(sun);
 let exag=1,layer='imagery',mesh=null,tex=null,routeObj=null,stopObjs=[],walker=null,view='orbit',baseObj=null;
 let routeCoords=[],stops=[],walkerState=null,altObj=null,altCoords=null,panoPins=[],onPick=null;
 const ZERO=D.min,h=(x,z)=>(heightAtLocal(D,x,z)-ZERO)*exag;   // scene y=0 is the lowest ground; real elevation is added back in readouts
 // ---- terrain mesh
 const geo=new THREE.PlaneGeometry(W,H,D.w-1,D.h-1);geo.rotateX(-Math.PI/2);geo.translate(W/2,0,H/2);   // x east, z south, origin at the NW corner
 const uv=geo.attributes.uv;for(let j=0;j<D.h;j++)for(let i=0;i<D.w;i++)uv.setXY(j*D.w+i,i/(D.w-1),1-j/(D.h-1));
 function applyHeights(){const p=geo.attributes.position;for(let j=0;j<D.h;j++)for(let i=0;i<D.w;i++)p.setY(j*D.w+i,(D.elev[j*D.w+i]-ZERO)*exag);p.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere()}
 function paint(){
  const cw=D.w*3,ch=D.h*3,c=document.createElement('canvas');c.width=cw;c.height=ch;const g=c.getContext('2d',{willReadFrequently:true});
  const shade=hillshade(D,315,38,Math.max(1,exag)),shadeAt=(u,v)=>{const x=Math.min(D.w-1,Math.max(0,u*(D.w-1))),y=Math.min(D.h-1,Math.max(0,v*(D.h-1))),i=Math.floor(x),j=Math.floor(y);return shade[j*D.w+i]};
  g.fillStyle='#b88b66';g.fillRect(0,0,cw,ch);
  if(layer==='imagery'&&imagery){const b=D.bounds,[w0,s0,e0,n0]=imageBounds,x0=(w0-b.west)/(b.east-b.west)*cw,x1=(e0-b.west)/(b.east-b.west)*cw,y0=(b.north-n0)/(b.north-b.south)*ch,y1=(b.north-s0)/(b.north-b.south)*ch;g.drawImage(imagery,x0,y0,x1-x0,y1-y0)}
  const id=g.getImageData(0,0,cw,ch),d=id.data;
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
   const k=(y*cw+x)*4,u=x/(cw-1),v=y/(ch-1),s=.5+.75*shadeAt(u,v);
   if(layer==='class'){const col=classColorAt(D,Math.min(D.h-1,Math.round(v*(D.h-1)))*D.w+Math.min(D.w-1,Math.round(u*(D.w-1))));d[k]=col[0]*(.55+.45*s);d[k+1]=col[1]*(.55+.45*s);d[k+2]=col[2]*(.55+.45*s)}
   else if(layer==='hillshade'){const t=Math.min(1,shadeAt(u,v)*1.25);d[k]=70+170*t;d[k+1]=48+120*t;d[k+2]=36+84*t}
   else{d[k]=Math.min(255,d[k]*s);d[k+1]=Math.min(255,d[k+1]*s);d[k+2]=Math.min(255,d[k+2]*s)}
   d[k+3]=255;
  }
  g.putImageData(id,0,0);
  if(tex)tex.dispose();tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;if(mesh)mesh.material.map=tex,mesh.material.needsUpdate=true;return tex;
 }
 applyHeights();paint();
 mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex}));scene.add(mesh);
 // ---- overlays
 const amber=new THREE.MeshBasicMaterial({color:0xffc247}),white=new THREE.MeshBasicMaterial({color:0xffffff});
 const disposeObj=o=>{o?.traverse?.(c=>{c.geometry?.dispose();c.material?.map?.dispose?.();c.material?.dispose?.()});o&&scene.remove(o)};
 function label(text,color='#ffc247'){const c=document.createElement('canvas');c.width=512;c.height=72;const g=c.getContext('2d');g.fillStyle='rgba(16,24,21,.88)';g.fillRect(0,0,512,72);g.strokeStyle=color;g.lineWidth=4;g.strokeRect(2,2,508,68);g.fillStyle=color;g.font='bold 34px monospace';g.textBaseline='middle';g.fillText(String(text).slice(0,24),16,38);const t=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(420,59,1);s.renderOrder=10;return s}
 function pole(x,z,color,name,picked){
  const gp=new THREE.Group(),y=h(x,z),hh=picked?170:110,m=new THREE.MeshBasicMaterial({color});
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(3,3,hh,8),m);stick.position.y=hh/2;const head=new THREE.Mesh(new THREE.ConeGeometry(16,38,10),m);head.rotation.x=Math.PI;head.position.y=hh+19;
  const ring=new THREE.Mesh(new THREE.RingGeometry(18,26,24),m);ring.rotation.x=-Math.PI/2;ring.position.y=2;
  gp.add(stick,head,ring);if(name){const l=label(name,'#'+color.toString(16).padStart(6,'0'));l.position.y=hh+78;gp.add(l)}gp.position.set(x,y,z);return gp;
 }
 function buildRoute(){
  disposeObj(routeObj);routeObj=null;
  if(routeCoords.length>1){const vrOn=xr.on,pts=densify(D,routeCoords,vrOn?6:18).map(p=>new THREE.Vector3(p.x,h(p.x,p.z)+(vrOn?.25:7),p.z));
   const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal',.2);routeObj=new THREE.Group();
   routeObj.add(new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(4000,pts.length*2),vrOn?.35:7,6,false),amber));
   const glow=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(4000,pts.length*2),vrOn?.9:13,6,false),new THREE.MeshBasicMaterial({color:0xffc247,transparent:true,opacity:.28,depthWrite:false}));routeObj.add(glow);scene.add(routeObj)}
  stopObjs.forEach(disposeObj);stopObjs=[];
  stops.forEach(s=>{if(!inside(D,s.lon,s.lat))return;const p=toLocal(D,s.lon,s.lat),o=pole(p.x,p.z,s.base?0x7dff9a:s.custom?0x7fd6ff:0xffc247,s.name,s.picked);scene.add(o);stopObjs.push(o)});
 }
 let marker=null,astro=null,limbs=null,phase=0,lastPos=null;
 function buildAstronaut(){
  const g=new THREE.Group(),suit=new THREE.MeshLambertMaterial({color:0xf2f2ee}),dark=new THREE.MeshLambertMaterial({color:0x4a4a52}),gold=new THREE.MeshLambertMaterial({color:0xd9a441,emissive:0x3a2a08}),orange=new THREE.MeshLambertMaterial({color:0xe8661c});
  const box=(w,h,d,m,x,y,z)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o};
  g.add(box(.62,.78,.36,suit,0,1.28,0));                       // torso
  g.add(box(.5,.62,.28,dark,0,1.3,-.34));                      // life-support backpack
  g.add(box(.64,.1,.38,orange,0,1.0,0));                       // belt stripe
  const head=new THREE.Mesh(new THREE.SphereGeometry(.31,16,12),suit);head.position.set(0,1.88,0);g.add(head);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.24,16,12,0,Math.PI*2,0,Math.PI*.62),gold);visor.position.set(0,1.88,.1);visor.rotation.x=Math.PI/2-.1;g.add(visor);
  const limb=(w,h,m,x,y)=>{const p=new THREE.Group(),o=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),m);o.position.y=-h/2;p.add(o);p.position.set(x,y,0);g.add(p);return p};
  limbs={armL:limb(.2,.7,suit,-.44,1.6),armR:limb(.2,.7,suit,.44,1.6),legL:limb(.26,.9,suit,-.17,.92),legR:limb(.26,.9,suit,.17,.92)};
  g.add(box(.3,.14,.42,dark,-.17,.05,.06),box(.3,.14,.42,dark,.17,.05,.06));  // boots (static)
  g.scale.setScalar(9);   // ~17 m tall at map scale so it reads from the chase camera
  return g;
 }
 function buildWalker(){
  disposeObj(walker);walker=new THREE.Group();marker=new THREE.Group();
  const body=new THREE.Mesh(new THREE.ConeGeometry(14,48,4),new THREE.MeshBasicMaterial({color:0x6cffb0}));body.rotation.x=Math.PI/2;body.position.y=26;marker.add(body);
  const ring=new THREE.Mesh(new THREE.RingGeometry(22,30,24),new THREE.MeshBasicMaterial({color:0x6cffb0,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=3;marker.add(ring);
  astro=buildAstronaut();walker.add(marker,astro);walker.visible=false;scene.add(walker);lastPos=null;
 }
 function swing(moved){
  if(!limbs)return;if(moved>.01)phase+=moved/9*1.9;const a=moved>.01?Math.sin(phase)*.65:0;
  limbs.legL.rotation.x=a;limbs.legR.rotation.x=-a;limbs.armL.rotation.x=-a*.8;limbs.armR.rotation.x=a*.8;
 }
 function buildAlt(){disposeObj(altObj);altObj=null;if(altCoords&&altCoords.length>1){const pts=densify(D,altCoords,18).map(p=>new THREE.Vector3(p.x,h(p.x,p.z)+9,p.z));altObj=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,false,'centripetal',.2),Math.min(4000,pts.length*2),6,6,false),new THREE.MeshBasicMaterial({color:0x7fd6ff}));scene.add(altObj)}}
 buildWalker();
 // ---- camera
 function frameAll(){const t=new THREE.Vector3(W*.5,0,H*.5);cam.position.set(W*.5,W*.55,H*1.25);ctl.target.copy(t);ctl.update()}
 function frameRoute(){
  if(routeCoords.length<2)return frameAll();
  const pts=routeCoords.filter(c=>inside(D,c[0],c[1])).map(c=>toLocal(D,c[0],c[1]));if(pts.length<2)return frameAll();
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;pts.forEach(p=>{x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z)});
  const cx=(x0+x1)/2,cz=(z0+z1)/2,r=Math.max(600,Math.hypot(x1-x0,z1-z0)/2);ctl.target.set(cx,h(cx,cz),cz);cam.position.set(cx+r*.2,h(cx,cz)+r*1.1,cz+r*1.5);ctl.update();
 }
 frameAll();
 function placeWalker(){
  if(!walkerState||!walkerState.coord||!inside(D,walkerState.coord[0],walkerState.coord[1])){walker.visible=false;return}
  const p=toLocal(D,walkerState.coord[0],walkerState.coord[1]),y=h(p.x,p.z),v=bearingVec(walkerState.heading||0);
  const moved=lastPos?Math.hypot(p.x-lastPos.x,p.z-lastPos.z):0;lastPos=p;
  walker.visible=view!=='eye'||xr.on;astro.visible=true;marker.visible=view==='orbit'&&!xr.on;
  walker.position.set(p.x,y,p.z);walker.rotation.y=Math.atan2(v.x,v.z);swing(Math.min(moved,40));
  astro.scale.setScalar(xr.on?1:9);
  if(xr.on){walker.scale.setScalar(1)}
  else if(view==='eye'){cam.fov=72;cam.updateProjectionMatrix();const eyeY=y+3*Math.max(1,exag*.5)+2;cam.position.set(p.x,eyeY,p.z);const lx=p.x+v.x*200,lz=p.z+v.z*200;cam.lookAt(lx,Math.max(y,h(lx,lz))-6,lz);ctl.target.set(lx,y,lz)}
  else if(view==='follow'){cam.fov=55;cam.updateProjectionMatrix();const bx=p.x-v.x*62,bz=p.z-v.z*62;cam.position.set(bx,Math.max(y,h(bx,bz))+34,bz);cam.lookAt(p.x+v.x*10,y+14,p.z+v.z*10);ctl.target.set(p.x,y+14,p.z)}
 }
 function scaleWalker(){if(!walker||!walker.visible)return;if(view==='orbit'){const d=cam.position.distanceTo(walker.position);walker.scale.setScalar(Math.max(1,Math.min(40,d/420)))}else walker.scale.setScalar(1)}

 // ---- picking: click the terrain (or a panorama pin) to choose a stop, same as clicking the 2D map
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function setPanos(list){panoPins.forEach(o=>scene.remove(o));panoPins=[];
  for(const q of list||[]){if(!inside(D,q.lon,q.lat))continue;const p=toLocal(D,q.lon,q.lat),y=h(p.x,p.z),g=new THREE.Group();
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(2,2,60,6),new THREE.MeshBasicMaterial({color:0x7fd6ff}));pole.position.y=30;
   const head=new THREE.Mesh(new THREE.ConeGeometry(11,22,4),new THREE.MeshBasicMaterial({color:0x7fd6ff}));head.position.y=70;head.rotation.x=Math.PI;
   g.add(pole,head);g.position.set(p.x,y,p.z);g.userData={pano:q.id,lon:q.lon,lat:q.lat};scene.add(g);panoPins.push(g)}}
 function scalePins(){for(const g of panoPins){const d=cam.position.distanceTo(g.position);g.scale.setScalar(Math.max(1,Math.min(7,d/700)))}}
 let down=null;const el=renderer.domElement;
 el.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY}});
 el.addEventListener('pointerup',e=>{
  if(!down||!onPick)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>5)return;
  const r=el.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;ndc.set(sx/r.width*2-1,-(sy/r.height)*2+1);
  let best=null,bd=26;for(const g of panoPins){const v=g.position.clone();v.y+=40*g.scale.x;v.project(cam);if(v.z>1)continue;const d=Math.hypot((v.x*.5+.5)*r.width-sx,(-v.y*.5+.5)*r.height-sy);if(d<bd){bd=d;best=g}}
  if(best){onPick({lon:best.userData.lon,lat:best.userData.lat,pano:best.userData.pano,sx,sy});return}
  if(!mesh)return;ray.setFromCamera(ndc,cam);const hit=ray.intersectObject(mesh,false)[0];if(!hit)return;
  const b=D.bounds,lon=b.west+hit.point.x/D.sizeX*(b.east-b.west),lat=b.north-hit.point.z/D.sizeZ*(b.north-b.south);
  onPick({lon,lat,pano:null,sx,sy})});
 // ---- WebXR: stand on the DEM at eye height. The page's own panels cannot be shown inside a headset, so the in-world HUD carries what matters.
 const ray2=new THREE.Raycaster();
 const xr={on:false,session:null,follow:true,target:-1,hud:null,hudCtx:null,hudTex:null,hudT:0,last:0,notes:{},saved:null,turnCool:0,reticle:null,pad:new Map(),panels:[],data:[],ring:null,ringOn:true,lift:3,exitBtn:null,squeeze:0};
 const vrTargets=()=>{const pick=stops.filter(s=>!s.base&&inside(D,s.lon,s.lat)),base=stops.filter(s=>s.base&&inside(D,s.lon,s.lat));return [...pick,...base].map(s=>({name:s.base?'Martian Base':s.name,...toLocal(D,s.lon,s.lat)}))};
 function vrPlace(x,z){rig.position.set(Math.max(0,Math.min(W,x)),0,Math.max(0,Math.min(H,z)));rig.position.y=h(rig.position.x,rig.position.z)+xr.lift}
 function vrFace(x,z){rig.rotation.y=yawToFace(x,z)}
 function vrSpawn(){
  const T=vrTargets();let p=null;
  if(walkerState?.coord&&inside(D,walkerState.coord[0],walkerState.coord[1]))p=toLocal(D,walkerState.coord[0],walkerState.coord[1]);
  else if(routeCoords.length&&inside(D,routeCoords[0][0],routeCoords[0][1]))p=toLocal(D,routeCoords[0][0],routeCoords[0][1]);
  else if(stops.find(s=>s.base))p=toLocal(D,stops.find(s=>s.base).lon,stops.find(s=>s.base).lat);
  else p={x:W/2,z:H/2};
  vrPlace(p.x,p.z);xr.target=T.length?0:-1;
  if(walkerState?.heading!=null){const v=bearingVec(walkerState.heading);vrFace(v.x,v.z)}else if(T.length)vrFace(T[0].x-p.x,T[0].z-p.z);
  xr.follow=!!walkerState?.coord;
 }
 function vrWrap(g,text,w,maxLines){const words=String(text||'').split(/\s+/),lines=[];let cur='';for(const t of words){const n=cur?cur+' '+t:t;if(g.measureText(n).width>w&&cur){lines.push(cur);cur=t}else cur=n}if(cur)lines.push(cur);if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=lines[maxLines-1].replace(/.{0,3}$/,'…')}return lines}
 function vrHud(){
  const g=xr.hudCtx,T=vrTargets(),w=512,hh=320;g.fillStyle='rgba(10,22,20,.92)';g.fillRect(0,0,w,hh);g.strokeStyle='#7dffc6';g.lineWidth=4;g.strokeRect(2,2,w-4,hh-4);
  g.fillStyle='#ffc247';g.font='bold 22px monospace';g.fillText('MARVIN · JEZERO',16,32);
  const x=rig.position.x,z=rig.position.z,sl=slopeUnder(D,x,z);let tgt=T[xr.target];
  g.fillStyle='#e9eddc';g.font='20px monospace';
  if(tgt){const dx=tgt.x-x,dz=tgt.z-z,b=bearingTo(dx,dz);g.fillStyle='#7dffc6';g.fillText('NEXT: '+tgt.name.slice(0,26),16,66);g.fillStyle='#e9eddc';g.fillText(`${Math.round(Math.hypot(dx,dz))} m to the ${b.name} (${Math.round(b.deg)}°)`,16,92);
   g.font='17px monospace';g.fillStyle='#c9d4c4';vrWrap(g,xr.notes[tgt.name]||'',480,5).forEach((l,i)=>g.fillText(l,16,126+i*22))}
  else{g.fillText('No route yet. Build one on the map.',16,66)}
  g.font='16px monospace';g.fillStyle='#ffc247';g.fillText(`Slope here ${sl.toFixed(0)}°  ·  ${xr.follow?'riding the walk':'free'}`,16,258);
  g.font='15px monospace';g.fillStyle='#9fb3a8';g.fillText('Trig: teleport A: next stop B: follow astronaut',16,272);g.fillText('Sticks: walk/turn  R-click: start walk',16,291);g.fillText('X: panels  Y: height   ',16,310);
  xr.hudTex.needsUpdate=true;
 }
 // ---- 360 degree ring of panels: the site's pages (plan, route reasons, CAPCOM, terrain, destinations, data, about) read from the page itself
 function vrWrapAll(g,text,w){const out=[];for(const para of String(text||'').split(/\n+/)){const words=para.trim().split(/\s+/);let cur='';for(const t of words){const n=cur?cur+' '+t:t;if(g.measureText(n).width>w&&cur){out.push(cur);cur=t}else cur=n}if(cur)out.push(cur)}return out}
 function vrPanelDraw(p){
  const g=p.ctx,w=1024,hh=680,per=17;g.fillStyle='rgba(10,22,20,.94)';g.fillRect(0,0,w,hh);g.strokeStyle='#7dffc6';g.lineWidth=6;g.strokeRect(3,3,w-6,hh-6);
  g.fillStyle='#ffc247';g.font='bold 34px monospace';g.fillText(p.title.toUpperCase(),28,56);g.fillStyle='#e9eddc';g.font='24px monospace';
  p.lines.slice(p.page*per,p.page*per+per).forEach((l,i)=>g.fillText(l,28,102+i*30));
  g.font='20px monospace';g.fillStyle='#9fb3a8';g.fillText(p.pages>1?`Aim + trigger: next page  (${p.page+1}/${p.pages})`:'',28,hh-20);
  p.tex.needsUpdate=true;
 }
 function vrPanelsBuild(){
  if(!xr.ring){xr.ring=new THREE.Group();scene.add(xr.ring)}
  xr.panels.forEach(m=>{xr.ring.remove(m);m.material.map.dispose();m.material.dispose();m.geometry.dispose()});xr.panels=[];
  const n=xr.data.length,R=2.6;
  xr.data.forEach((d,i)=>{const cv=document.createElement('canvas');cv.width=1024;cv.height=680;const ctx=cv.getContext('2d');ctx.font='24px monospace';
   const lines=vrWrapAll(ctx,d.text,968),tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
   const p={title:d.title,lines,page:0,pages:Math.max(1,Math.ceil(lines.length/17)),ctx,tex},m=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.0),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide}));
   const a=i/Math.max(1,n)*Math.PI*2;m.position.set(Math.sin(a)*R,1.5,-Math.cos(a)*R);m.lookAt(0,1.5,0);m.userData.p=p;xr.ring.add(m);xr.panels.push(m);vrPanelDraw(p)});
  xr.ring.visible=xr.ringOn;
 }
 function vrSelect(c){if(c.userData.aim?.userData.exit){vrApi.exit();return}if(c.userData.aim){const p=c.userData.aim.userData.p;p.page=(p.page+1)%p.pages;vrPanelDraw(p);return}if(!xr.on||!xr.reticle.visible)return;const p=xr.reticle.position;xr.follow=false;vrPlace(p.x,p.z)}
 function vrBuild(){
  if(xr.hud)return;const cv=document.createElement('canvas');cv.width=512;cv.height=320;xr.hudCtx=cv.getContext('2d');xr.hudTex=new THREE.CanvasTexture(cv);xr.hudTex.colorSpace=THREE.SRGBColorSpace;
  xr.hud=new THREE.Mesh(new THREE.PlaneGeometry(.26,.1625),new THREE.MeshBasicMaterial({map:xr.hudTex,transparent:true}));xr.hud.position.set(0,.05,.02);xr.hud.rotation.x=-1.0;
  {const cv=document.createElement('canvas');cv.width=512;cv.height=96;const g=cv.getContext('2d');g.fillStyle='#b3261e';g.fillRect(0,0,512,96);g.strokeStyle='#fff';g.lineWidth=6;g.strokeRect(3,3,506,90);g.fillStyle='#fff';g.font='bold 40px monospace';g.textAlign='center';g.fillText('EXIT VR (or grip)',256,62);const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;
  xr.exitBtn=new THREE.Mesh(new THREE.PlaneGeometry(.26,.049),new THREE.MeshBasicMaterial({map:t}));xr.exitBtn.position.set(0,-.1125,.001);xr.exitBtn.userData.exit=true;xr.hud.add(xr.exitBtn)}
  xr.reticle=new THREE.Mesh(new THREE.RingGeometry(2.2,3,28).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x7dffc6,side:THREE.DoubleSide,depthTest:false}));xr.reticle.visible=false;xr.reticle.renderOrder=9;scene.add(xr.reticle);
  for(let i=0;i<2;i++){const c=renderer.xr.getController(i);c.userData.i=i;
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),new THREE.LineBasicMaterial({color:0xffc247}));line.scale.z=4;c.add(line);c.userData.line=line;
   c.addEventListener('connected',e=>{c.userData.hand=e.data.handedness;if(e.data.handedness==='left')c.add(xr.hud)});c.addEventListener('selectstart',()=>vrSelect(c));c.addEventListener('squeezestart',()=>{vrApi.exit()});rig.add(c)}
 }
 function vrTick(){
  const now=performance.now(),dt=Math.min(.1,(now-(xr.last||now))/1000);xr.last=now;xr.turnCool-=dt;
  // head direction in WORLD space (cam is a child of the rig, so rig turns are included); flatten to the ground
  cam.updateMatrixWorld(true);const fw=new THREE.Vector3();cam.getWorldDirection(fw);let yaw;if(Math.hypot(fw.x,fw.z)>.2)yaw=Math.atan2(-fw.x,-fw.z);else{const q=new THREE.Quaternion();cam.getWorldQuaternion(q);yaw=new THREE.Euler().setFromQuaternion(q,'YXZ').y}
  const T=vrTargets();
  let anySq=false;for(const src of xr.session?.inputSources||[]){const gp=src.gamepad;if(!gp)continue;const a=gp.axes,b=gp.buttons,st=xr.pad.get(src)||{};
   if(src.handedness==='left'){const X=!!b[4]?.pressed;if(X&&!st.X){xr.ringOn=!xr.ringOn;if(xr.ring)xr.ring.visible=xr.ringOn}st.X=X;const Yb=!!b[5]?.pressed;if(Yb&&!st.Y){xr.lift=xr.lift<1?3:xr.lift<5?12:0}st.Y=Yb;const fast=b[3]?.pressed?4:1,m=vrMove(a[2]??0,a[3]??0,yaw,dt,6*fast);if(m.dx||m.dz){xr.follow=false;rig.position.x=Math.max(0,Math.min(W,rig.position.x+m.dx));rig.position.z=Math.max(0,Math.min(H,rig.position.z+m.dz))}}
   if(src.handedness==='right'){const tx=a[2]??0;if(Math.abs(tx)>.7&&xr.turnCool<=0){rig.rotation.y-=Math.sign(tx)*Math.PI/6;xr.turnCool=.3}
    const A=!!b[4]?.pressed,B=!!b[5]?.pressed;
    if(A&&!st.A&&T.length){xr.target=nextStopIndex(T,xr.target);const t=T[xr.target],n=T[(xr.target+1)%T.length];xr.follow=false;vrPlace(t.x,t.z);if(n&&n!==t)vrFace(n.x-t.x,n.z-t.z)}
    if(B&&!st.B)xr.follow=!xr.follow;const Sc=!!b[3]?.pressed;if(Sc&&!st.S)vrApi.onWalk?.();st.A=A;st.B=B;st.S=Sc}
   if((b[1]?.value||0)>.6||b[1]?.pressed)anySq=true;xr.pad.set(src,st)}
  xr.squeeze=anySq?xr.squeeze+dt:0;if(xr.squeeze>.25){xr.squeeze=0;vrApi.exit();return}
  if(xr.follow&&walkerState?.coord&&inside(D,walkerState.coord[0],walkerState.coord[1])){const p=toLocal(D,walkerState.coord[0],walkerState.coord[1]),k=Math.min(1,dt*4),v=bearingVec(walkerState.heading||0),tx=p.x-v.x*4,tz=p.z-v.z*4;rig.position.x+=(tx-rig.position.x)*k;rig.position.z+=(tz-rig.position.z)*k;let d=yawToFace(v.x,v.z)-rig.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));rig.rotation.y+=d*Math.min(1,dt*1.5);if(xr.ring)xr.ring.rotation.y=rig.rotation.y}
  rig.position.y=h(rig.position.x,rig.position.z)+xr.lift;if(xr.ring)xr.ring.position.copy(rig.position);
  // teleport reticle from whichever controller points at the ground
  xr.reticle.visible=false;
  for(const c of [renderer.xr.getController(0),renderer.xr.getController(1)]){if(!c.visible)continue;const o=new THREE.Vector3().setFromMatrixPosition(c.matrixWorld),d=new THREE.Vector3(0,0,-1).transformDirection(c.matrixWorld);ray2.set(o,d);const ph=ray2.intersectObjects([...(xr.ringOn?xr.panels:[]),...(xr.exitBtn&&xr.exitBtn.parent?[xr.exitBtn]:[])],false)[0]||null;c.userData.aim=ph?ph.object:null;if(ph){c.userData.line.scale.z=ph.distance;continue}
   const hit=ray2.intersectObject(mesh,false)[0];
   if(hit){c.userData.line.scale.z=hit.distance;if(c.userData.hand!=='left'||!xr.reticle.visible){xr.reticle.position.copy(hit.point);xr.reticle.position.y+=.5;xr.reticle.visible=true}}else c.userData.line.scale.z=4}
  if(now-xr.hudT>300){xr.hudT=now;vrHud()}
  renderer.render(scene,cam);
 }
 async function vrSupport(){
  if(!globalThis.isSecureContext)return {ok:false,message:'VR needs the https website. Open MARVIN in your headset browser.'};
  if(!navigator.xr)return {ok:false,message:'No WebXR here. Open this page in Meta Quest Browser (or another WebXR browser) to enter VR.'};
  try{return await navigator.xr.isSessionSupported('immersive-vr')?{ok:true,message:'Headset ready. Enter VR to stand on Jezero.'}:{ok:false,message:'This browser has no immersive VR session.'}}catch{return {ok:false,message:'VR support could not be checked.'}}
 }
 async function vrEnter(){
  if(xr.session)return;if(!running)throw Error('Open the DEM 3D view first.');
  const s=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','bounded-floor']});
  vrBuild();renderer.xr.setReferenceSpaceType('local-floor');await renderer.xr.setSession(s);
  xr.session=s;xr.on=true;xr.saved={near:cam.near,fov:cam.fov,fogN:scene.fog.near,fogF:scene.fog.far,ctl:ctl.enabled,pos:cam.position.clone(),quat:cam.quaternion.clone()};
  cam.near=.3;cam.updateProjectionMatrix();scene.fog.near=3500;scene.fog.far=16000;ctl.enabled=false;xr.lift=3;buildRoute();if(walkerState)placeWalker();vrSpawn();vrPanelsBuild();if(xr.ring)xr.ring.rotation.y=rig.rotation.y;vrHud();
  s.addEventListener('end',()=>{const v=xr.saved;xr.on=false;xr.session=null;xr.pad.clear();if(xr.ring)xr.ring.visible=false;rig.position.set(0,0,0);rig.rotation.set(0,0,0);if(xr.reticle)xr.reticle.visible=false;
   if(v){cam.near=v.near;cam.fov=v.fov;cam.position.copy(v.pos);cam.quaternion.copy(v.quat);cam.updateProjectionMatrix();scene.fog.near=v.fogN;scene.fog.far=v.fogF;ctl.enabled=view==='orbit'}
   buildRoute();if(walkerState)placeWalker();vrApi.onEnd?.()},{once:true});
 }
 const vrApi={support:vrSupport,enter:vrEnter,exit:()=>xr.session?.end(),active:()=>xr.on,onWalk:null,setNotes(m){xr.notes=m||{}},setPanels(list){xr.data=(list||[]).filter(x=>x&&x.title);if(xr.on)vrPanelsBuild()},panelCount:()=>xr.panels.length,panelImage:i=>xr.panels[i]?.userData.p.ctx.canvas.toDataURL(),hudImage:()=>xr.hudCtx?.canvas.toDataURL(),state:()=>({yaw:rig.rotation.y,lift:xr.lift,walker:!!walker.visible,wx:walkerState?.coord?toLocal(D,walkerState.coord[0],walkerState.coord[1]).x:null,wz:walkerState?.coord?toLocal(D,walkerState.coord[0],walkerState.coord[1]).z:null,inputs:xr.session?.inputSources?.length||0,on:xr.on,follow:xr.follow,target:xr.target,x:rig.position.x,z:rig.position.z}),onEnd:null};
 let running=false,t0=performance.now();
 function frame(){if(!running)return;if(xr.on)vrTick();else if(view==='orbit'){ctl.update();scaleWalker();scalePins()}
  const k=1+.08*Math.sin((performance.now()-t0)/260);stopObjs.forEach(o=>o.children[2]?.scale.setScalar(k));renderer.render(scene,cam)}
 function resize(){const w=container.clientWidth||600,hh=container.clientHeight||400;renderer.setSize(w,hh,false);cam.aspect=w/hh;cam.updateProjectionMatrix()}
 new ResizeObserver(resize).observe(container);resize();
 return {
  start(){if(running)return;running=true;resize();renderer.setAnimationLoop(frame)},stop(){running=false;renderer.setAnimationLoop(null);xr.session?.end().catch(()=>{})},
  setRoute(coords,stopList){routeCoords=coords||[];stops=stopList||[];buildRoute()},
  setWalker(st){walkerState=st;if(view!=='orbit'&&st)placeWalker();else if(st){placeWalker()}else walker.visible=false},
  setView(v){view=v;scaleWalker();ctl.enabled=v==='orbit';if(v==='orbit'){cam.fov=50;cam.updateProjectionMatrix();if(walkerState)placeWalker();ctl.update()}else placeWalker()},
  setAlt(c){altCoords=c;buildAlt()},effort:(coords,o)=>routeEffort(D,coords,o),setPanos,setOnPick(fn){onPick=fn},
  introFly(animate=true){
   const end={p:new THREE.Vector3(W*.5,W*.38,H*1.02),t:new THREE.Vector3(W*.5,0,H*.5)},start={p:new THREE.Vector3(W*.5,W*2.4,H*2.3),t:end.t.clone()};
   const set=(k)=>{cam.position.lerpVectors(start.p,end.p,k);ctl.target.copy(end.t);cam.lookAt(end.t);ctl.update()};
   if(!animate){set(1);ctl.enabled=view==='orbit';return Promise.resolve()}
   ctl.enabled=false;const t0=performance.now(),dur=3600;
   return new Promise(res=>{const step=()=>{const k=Math.min(1,(performance.now()-t0)/dur),e=k*k*(3-2*k);set(e);if(k<1)requestAnimationFrame(step);else{ctl.enabled=view==='orbit';res()}};step()});
  },
  setLayer(l){layer=l;paint()},
  elevationAt(lon,lat){return inside(D,lon,lat)?heightAtLocal(D,...Object.values(toLocal(D,lon,lat))):NaN},
  frame:frameRoute,frameAll,resize,
  render(){renderer.render(scene,cam)},
  info(){return {elevationAbsolute:D.absolute,w:D.w,h:D.h,sizeX:D.sizeX,sizeZ:D.sizeZ,reliefM:D.max-D.min,exag,layer,view,routePoints:routeCoords.length,stops:stopObjs.length,astronaut:!!(astro&&walker&&walker.visible&&astro.visible),alt:!!altObj}},
  canvas:renderer.domElement,
  dispose(){running=false;renderer.setAnimationLoop(null);renderer.dispose()},vr:vrApi
 };
}
