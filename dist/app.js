import {decodeTerrain} from './dem3d-math.js';
import {alternativeRoutes} from './route-options.js';
import {SAMPLE_HANDOFF} from './sample-mission.js';
import {TASKS,VISIT_TASK,taskAvailable,regionHasTask} from './region-tasks.js';
import {explainRoute} from './route-explain.js';
import {wireButtons,setMuted,isMuted,sfx} from './hardware.js';
import {createPlanPanel} from './plan-panel.js';
import {satisfies,findAlternative} from './route-alternatives.js';
import {REGIONS,regionStops,poiDescription} from './mission-flow.js';
import {MISSION_BASE} from './mission-base.js';
import {startExperience} from './experience.js';
import {mountSlots} from './media-slots.js';
import {COS,scaleFor,worldZoom,projectPoint,unprojectPoint,clampView,zoomAt} from './map-camera.js';
import {PanoramaVR,vrSupport} from './vr.js';
import {buildGraph,shortest,distance,planMission,panoramaSequence} from './routing.js';
import {nearestViews} from './live-views.js';
import {createSimulatorUI} from './simulator-ui.js';
import {createPoiStore} from './poi-store.js';
import {createCostRouter} from './route-cost.js';import {explainGridRoute,costSummary} from './route-reasons.js';import {setPathRouter} from './routing.js';
import {buildRouteNotes,noteQuestion,noteText,groundAlongRoute} from './route-notes.js';import {scanPanorama,toRGBA,hex} from './terrain-live.js';import {createNotesUI} from './route-notes-ui.js';
import {loadTerrain,addSpurs,checkRouteSlope} from './slope-router.js';
const safeStorage=(()=>{try{localStorage.getItem('x');return localStorage}catch{return null}})(),poiStore=createPoiStore(safeStorage);
let altRoutes=[],altPreview=null,altSel=-1,demData=null,altToken=0;let slope=null,costRouter=null,simUI=null,pinCoord=null,hazards=[],regionAreas=[];
const hullOf=pts=>{const p=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];for(const q of p){while(lo.length>1&&cr(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q)}for(const q of [...p].reverse()){while(up.length>1&&cr(up.at(-2),up.at(-1),q)<=0)up.pop();up.push(q)}return lo.slice(0,-1).concat(up.slice(0,-1))};
const padRing=(ring,m=.0018)=>{const cx=ring.reduce((n,c)=>n+c[0],0)/ring.length,cy=ring.reduce((n,c)=>n+c[1],0)/ring.length;return ring.map(c=>{const dx=c[0]-cx,dy=c[1]-cy,d=Math.hypot(dx,dy)||1;return [c[0]+dx/d*m,c[1]+dy/d*m]})};
const $=s=>document.querySelector(s)||document.createElement('div'),$$=s=>[...document.querySelectorAll(s)], esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let resolveMapReady;const mapReady=new Promise(resolve=>resolveMapReady=resolve);
let data,panos,graph,route=null,selected=null,pinned=new Set(),blocked=new Set(),images={},layer='color',view={lon:77.42,lat:18.46,zoom:1},sim=null,products={},lastSettings=null;
const experiments=[...TASKS,VISIT_TASK].map(t=>({...t,task:t.id==='sample'?SAMPLE_HANDOFF.task:t.summary}));   // region-specific tasks; 'visit' is only for user-chosen stops
const picks=new Map();   // major point of interest (panorama id) -> Set of chosen task ids
const regionName=p=>REGIONS.find(r=>r.accept(p))?.name||'';
let planPanel=null;
wireButtons();{const b=document.querySelector('#sfxToggle');if(b){const paint=()=>{b.textContent='Key clicks: '+(isMuted()?'off':'on');b.setAttribute('aria-pressed',String(!isMuted()))};paint();b.onclick=()=>{setMuted(!isMuted());paint();sfx('click')}}}
const sourceList=[
['Sapphire Canyon sample','NASA sample record','Sample 25 remains aboard Perseverance. Potential biosignatures require further study; the base handoff is a hypothetical mission.','https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/'],
['3D terrain','Rendered DEM','MOLA / HRSC elevation through Esri. Regional context; not obstacle-scale route validation.','https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer'],
['Jezero color mosaic','Bundled imagery','HiRISE / CTX detail pan-sharpened with HRSC color. ESA / DLR / FU Berlin / NASA / JPL-Caltech / UArizona / USGS.','https://maps.planet.fu-berlin.de/jezero/'],
['Global Mars context','Bundled imagery','NASA Viking color mosaic. Mission POIs remain in Jezero.','https://pds-geosciences.wustl.edu/missions/mgs/mola.html'],
['HiRISE orbital mosaic','Bundled imagery','Controlled Jezero mosaic via Mars Trek WMTS. Prepared view is about 5 m/pixel; original mosaic is finer. No individual-rock clearance guarantee.','https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars'],
['CTX context mosaic','Bundled imagery','Controlled Jezero CTX mosaic. Prepared view sampled at about 10 m/pixel.','https://astrogeology.usgs.gov/search/map/mars-2020-jezero-crater-landing-site-products'],
['MOLA laser altimetry','Bundled color relief','Regional color-shaded elevation context, nominal source scale about 463 m. Display resampling adds no detail. Numeric lidar points are available through ODE GDS.','https://pds-geosciences.wustl.edu/missions/mgs/mola.html'],
['THEMIS daytime infrared','Bundled imagery','Historical thermal infrared mosaic, nominal source resolution 100 m. Image brightness is not a temperature reading.','https://pds-geosciences.wustl.edu/missions/odyssey/themis.html'],
['Perseverance traverse','Bundled geometry','NASA MMGIS recorded route and elevations. Snapshot retrieved 13 November 2026. Used for distance and profile calculations.','https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json'],
['Mastcam-Z panoramas','29 bundled previews','Cylindrical panoramas from ASU’s collection. Credits: NASA/JPL-Caltech/ASU/MSSS. Approximate positions matched to prior rover waypoints.','https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/'],
['CRISM spectral observations','API + cached catalog','Discover overlapping spectral products and their footprints. Mineral abundance maps are not decoded or inferred from coverage.','https://pds-geosciences.wustl.edu/missions/mro/crism.htm'],
['CTX DEM (20 m) · slope model','Ingested','Slope grid and steep-ground polygons derived from the detrended Mars 2020 CTX DEM (Mangold et al. 2021, Science; CC BY 4.0). Used for route slope checks, off-track spurs and the steep-ground overlay. Slope only: the detrended heights are not absolute elevations, and rocks and sand are not modelled.','https://data.caltech.edu/records/h2xd4-zbd29'],
['HiRISE numeric terrain','Archive access','Detailed DEMs for deriving surface slopes and 3D meshes. Not yet ingested; current route profile uses rover-recorded elevation.','https://www.usgs.gov/data/mars-2020-terrain-relative-navigation-hirise-dtm-mosaic'],
['RIMFAX subsurface radar','Archive access','Calibrated radar products and documentation. No underground profile is fabricated where data has not been decoded.','https://pds-geosciences.wustl.edu/missions/mars2020/rimfax.htm'],
['MEDA weather','Archive access','Historical temperature, wind, pressure and dust observations; not a live forecast for our hypothetical mission.','https://atmos.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html'],
['PIXL chemistry','Archive access','Fine-scale elemental measurements at specific investigated targets.','https://pds-geosciences.wustl.edu/missions/mars2020/pixl.htm'],
['SHERLOC observations','Archive access','Mineral and organic-compound observations at measured rock targets.','https://pds-geosciences.wustl.edu/missions/mars2020/sherloc.htm'],
['SuperCam spectroscopy','Archive access','Chemical and mineral investigations with instrument documentation and product downloads.','https://pds-geosciences.wustl.edu/missions/mars2020/supercam.htm'],
['Geological units','Archive access','USGS regional geological map for Jezero and Nili Planum.','https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars'],
['Rover PLACES & SPICE','Archive access','Localization and observation geometry for deeper scientific integration.','https://pds-geosciences.wustl.edu/missions/mars2020/places.htm'],
['PDS Search API','API documentation','Search product metadata and resolve archive identifiers. Scientific data files require their instrument-specific readers.','https://nasa-pds.github.io/pds-api/'],
['ODE REST & GDS APIs','API + documentation','Orbital-product search, file links and laser-altimetry subsets.','https://oderest.rsl.wustl.edu/']];
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500)}
function page(name){$$('.page').forEach(p=>p.classList.toggle('active',p.id===name));$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));if(name==='planner')requestAnimationFrame(draw);window.scrollTo(0,0)}
$$('nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));
$('#sources').innerHTML=sourceList.map(([name,status,description,url])=>`<article class="source"><span class="tag ${status.includes('Archive')?'archiveTag':''}">${status}</span><h3>${name}</h3><p>${description}</p><a href="${url}" target="_blank" rel="noopener">Explore source ↗</a></article>`).join('');
function tasks(p,ids){return experiments.filter(e=>e.id!=='visit'&&ids.includes(e.id)&&taskAvailable(e,p))}
const customPicks=()=>poiStore.list().filter(c=>c.useInMission);
const must=()=>new Set([...[...picks.keys()].filter(id=>id!==MISSION_BASE.panoramaId),...customPicks().map(c=>c.id)]);
const pickedTaskIds=()=>[...new Set([...[...picks.values()].flatMap(t=>[...t]),...customPicks().flatMap(c=>c.experimentIds||[])])].filter(id=>id!=='visit');
const canBuild=()=>picks.size>0||customPicks().length>0;
function settings(){const ids=pickedTaskIds();return {baseTasks:picks.get(MISSION_BASE.panoramaId)?.has('sample')?[SAMPLE_HANDOFF]:[],start:MISSION_BASE.panoramaId,maxDistance:+$('#distance').value*1000,budget:+$('#budget').value,speed:+$('#speed').value,maxGrade:+$('#slope').value,routeStyle:$('#routeStyle')?.value||'balanced',preference:$('#preference').value,ids}}
function updateEquipment(){let ids=settings().ids;$('#equipment').innerHTML=['Navigation display & offline map','Suit systems & communications',...experiments.filter(e=>ids.includes(e.id)).map(e=>e.gear)].map(g=>`<div class="equip">${g}</div>`).join('')}
function changed(){updateEquipment();if(route){clearAlts();planPanel?.stale();$('#plannerStatus').textContent='Changed · regenerate to apply.';$('#generate').textContent='Regenerate mission ↗';$('#buildMission').textContent='Update mission →';stopSimulation()}}
$$('.controls input,.controls select').forEach(e=>e.addEventListener('change',changed));$('#distance').oninput=()=>$('#distanceVal').textContent=$('#distance').value+' km';
function togglePick(id,taskId){
 let set=picks.get(id);if(!set){set=new Set();picks.set(id,set)}
 if(set.has(taskId))set.delete(taskId);else{if(taskId!=='visit')set.delete('visit');set.add(taskId)}
 if(!set.size)picks.delete(id);changed();renderMissionList();draw();return picks.get(id)||new Set();
}
function choose(p){selected=p;$('#detailName').textContent=p.name;$('#detailPreview').style.backgroundImage=`url('${p.image}')`;$('#detailDescription').textContent=p.sol>430&&p.sol<800?'Delta layers and rock textures.':'Rock textures and surface views.';$('#detailMeta').innerHTML=`<div class="metarow"><span>Captured</span><span>Sol ${p.sol}</span></div><div class="metarow"><span>Position</span><span>Waypoint sol ${p.positionSol}</span></div><div class="metarow"><span>Latitude</span><span>${p.coord[1].toFixed(5)}° N</span></div><div class="metarow"><span>Longitude</span><span>${p.coord[0].toFixed(5)}° E</span></div><div class="metarow"><span>Elevation</span><span>${p.coord[2].toFixed(1)} m</span></div><small>Historical image · approximate position.</small>`;$('#pinStop').textContent=pinned.has(p.id)?'★ Remove priority':'☆ Prioritize this stop';draw()}
function openPano(p){setTour(p);showPano(p)}
// Terrain AI overlay in the panorama viewer: our SegFormer model's per-pixel classes, drawn over the real image
let aiOn=false;
function setPanoAI(p){
 const t=terrainAI?.panoramas?.[String(p.id)],bar=$('#panoAIBar'),img=$('#panoAI');if(!bar||!img)return;
 bar.hidden=!t;img.hidden=!(t&&aiOn);if(!t)return;img.src=`assets/terrain-ai/pano-${p.id}.png`;
 const m=terrainAI.metrics;
 $('#panoAILegend').innerHTML=AI_ORDER.map(c=>`<span class="aichip"><i style="background:${terrainAI.colors[c]}"></i>${AI_LABEL[c]} ${t.share[c]}%</span>`).join('');
 $('#panoAINote').textContent=`Terrain AI: a SegFormer-B0 we fine-tuned on NASA AI4Mars images${m?` (AI4Mars held-out test: mIoU ${m.mIoU})`:''}. Shares cover the ${Math.round(t.analysedPct)}% of this image it can judge; sky, rover and no-data are skipped. Our own hand check on these Mastcam-Z panoramas (${terrainAI.handCheck.points} points, one labeller): about ${Math.round(terrainAI.handCheck.looseVsRockAccuracy*100)}% right on rock vs loose ground, and it tends to under-report rock. The 4-way split (soil/sand, bedrock/big rock) was unreliable, so we show two groups. An estimate, not a safety rating.`;
}
$('#panoAIToggle')?.addEventListener('change',e=>{aiOn=e.target.checked;$('#panoAI').hidden=!aiOn||$('#panoAIBar').hidden});
// Live scan: our ONNX model runs here in the browser on the open panorama (terrain-live.js), the overlay fills in tile by tile,
// and the result is compared with the offline Python run so the claim "it really runs in your browser" is checkable.
let liveRun=0;
async function runLiveScan(p){
 const run=++liveRun,btn=$('#panoAILive'),st=$('#panoAILiveStatus'),img=$('#panoAI'),say=t=>{if(run===liveRun)st.textContent=t};
 btn.disabled=true;try{
  const ref=new Image();ref.src=`assets/terrain-ai/pano-${p.id}.png`;await ref.decode();
  const cv=document.createElement('canvas');cv.width=ref.width;cv.height=ref.height;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(ref,0,0);const R=cx.getImageData(0,0,ref.width,ref.height).data,ok=new Uint8Array(ref.width*ref.height),refRock=new Uint8Array(ok.length);
  for(let i=0;i<ok.length;i++){ok[i]=R[i*4+3]>0?1:0;refRock[i]=R[i*4]<160?1:0}   // rock colour #6ea8ff has a low red channel
  const pano=new Image();pano.src=p.image;await pano.decode();const colors=[hex(terrainAI.colors.loose),hex(terrainAI.colors.rock)];
  const out=document.createElement('canvas');out.width=ref.width;out.height=ref.height;const ox=out.getContext('2d');
  const paint=m=>{ox.putImageData(new ImageData(toRGBA(m,ok,colors),ref.width,ref.height),0,0);if(run===liveRun){img.src=out.toDataURL();aiOn=true;$('#panoAIToggle').checked=true;img.hidden=false}};
  const legend=(s,t)=>{$('#panoAILegend').innerHTML=`<span class="aichip"><i style="background:${terrainAI.colors.loose}"></i>loose ground ${s.loose}%</span><span class="aichip"><i style="background:${terrainAI.colors.rock}"></i>rock ${s.rock}%</span><span class="aichip"><b>LIVE · ${t}</b></span>`};
  const r=await scanPanorama(pano,ok,{onStatus:say,onProgress:e=>{if(run!==liveRun)return;paint(e.map);legend(e.shares,`tile ${e.done}/${e.total}`);say(`Scanning in your browser: tile ${e.done} of ${e.total}…`)}});
  if(run!==liveRun)return;
  let agree=0,n=0;for(let i=0;i<ok.length;i++){if(!ok[i]||r.map[i]===255)continue;n++;if((GROUP_ROCK[r.map[i]]?1:0)===refRock[i])agree++}
  legend(r.shares,`done in ${(r.ms/1000).toFixed(1)} s`);
  say(`Done: our model ran on this panorama in ${(r.ms/1000).toFixed(1)} s, in your browser, no server. It agrees with the offline run on ${Math.round(100*agree/Math.max(1,n))}% of pixels (the offline run blends the same tiles).`);
 }catch(e){console.error(e);say('The live scan could not run here ('+(e.message||e).toString().slice(0,80)+'). The precomputed overlay above is still correct.')}
 finally{if(run===liveRun)btn.disabled=false}
}
const GROUP_ROCK=[0,1,0,1];
$('#panoAILive')?.addEventListener('click',()=>selected&&runLiveScan(selected));
function showPano(p){liveRun++;const ls=$('#panoAILiveStatus');if(ls)ls.textContent='';const lb=$('#panoAILive');if(lb)lb.disabled=false;choose(p);setPanoAI(p);$('#panoTitle').textContent=p.name;$('#panoImage').src=p.image;$('#panoZoom').value=1;$('#panoImage').style.height='100%';$('#panoAI').style.height='100%';$('#panoCaption').textContent=`Mastcam-Z · Sol ${p.sol} · NASA/JPL-Caltech/ASU/MSSS. Position: rover waypoint sol ${p.positionSol}. Historical image; not a live view.`;$('#panoSource').href=p.source;if(!$('#panoDialog').open)$('#panoDialog').showModal();renderTour(p);$('#panoImage').onload=()=>$('#panoViewer').scrollLeft=($('#panoImage').width-$('#panoViewer').clientWidth)/2}
$('#openPano').onclick=()=>selected&&openPano(selected);$('#closePano').onclick=()=>$('#panoDialog').close();$('#panoZoom').oninput=()=>{const h=(+$('#panoZoom').value*100)+'%';$('#panoImage').style.height=h;$('#panoAI').style.height=h};let panoDrag;$('#panoViewer').onpointerdown=e=>{panoDrag={x:e.clientX,scroll:$('#panoViewer').scrollLeft};$('#panoViewer').setPointerCapture(e.pointerId)};$('#panoViewer').onpointermove=e=>{if(panoDrag)$('#panoViewer').scrollLeft=panoDrag.scroll+ panoDrag.x-e.clientX};$('#panoViewer').onpointerup=()=>panoDrag=null;
const canvas=$('#map'),ctx=canvas.getContext('2d');let cw=1,ch=1,baseScale=1,ox=0,oy=0;
function project(c){return projectPoint(c,view,cw,ch)}
function line(coords,color,width=1,dash=[]){if(!coords.length)return;ctx.beginPath();coords.forEach((c,i)=>{const [x,y]=project(c);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([])}
let traverseFeatures=[];
function draw(){if(!data||!$('#planner').classList.contains('active'))return;let r=canvas.getBoundingClientRect();cw=r.width;ch=r.height;if(!cw)return;let dpr=window.devicePixelRatio||1;canvas.width=cw*dpr;canvas.height=ch*dpr;ctx.scale(dpr,dpr);let b=data.bounds;clampView(view,cw,ch);baseScale=scaleFor(cw,ch,view.zoom)/view.zoom;let sc=baseScale*view.zoom;ctx.fillStyle='#17221f';ctx.fillRect(0,0,cw,ch);let nw=project([-180,90]);if(images.global)ctx.drawImage(images.global,nw[0],nw[1],360*COS*sc,180*sc);let p=project([b[0],b[3]]),w=(b[2]-b[0])*COS*sc,h=(b[3]-b[1])*sc;let local=view.zoom>.12&&p[0]+w>0&&p[0]<cw&&p[1]+h>0&&p[1]<ch;if(images[layer]&&view.zoom>.015)ctx.drawImage(images[layer],p[0],p[1],w,h);if(local&&$('#showSlope')?.checked&&hazards.length){ctx.lineWidth=1;for(const h of hazards){const steep=h.gt>=20;ctx.fillStyle=steep?'rgba(255,59,59,.45)':'rgba(255,191,31,.28)';ctx.strokeStyle=steep?'rgba(255,90,60,.95)':'rgba(255,200,60,.7)';ctx.beginPath();h.ring.forEach((c,i)=>{const q=project(c);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.closePath();ctx.fill();ctx.stroke()}}
if(local&&$('#showRegions')?.checked&&regionAreas.length){ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeStyle='rgba(61,255,122,.8)';ctx.fillStyle='rgba(61,255,122,.07)';ctx.font='12px monospace';for(const r of regionAreas){ctx.beginPath();r.ring.forEach((c,i)=>{const q=project(c);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1])});ctx.closePath();ctx.fill();ctx.stroke();const q=project(r.ring[0]);ctx.fillStyle='#3dff7a';ctx.fillText(r.name.toUpperCase(),q[0]+6,q[1]-6);ctx.fillStyle='rgba(61,255,122,.07)'}ctx.setLineDash([])}$('#layerTitle').textContent=local?layerNames[layer][0]:'Mars · global context';$('#layerNote').textContent=local?layerNames[layer][1]:'NASA Viking · color mosaic';$('#mapRegion').textContent=local?'JEZERO / WESTERN FLOOR & DELTA':'GLOBAL CONTEXT · POIs IN JEZERO ONLY';if(!local){let j=project([77.42,18.46]);ctx.strokeStyle='#f1c68b';ctx.lineWidth=2;ctx.strokeRect(j[0]-7,j[1]-7,14,14);ctx.fillStyle='#17221f';ctx.fillRect(j[0]+12,j[1]-14,164,28);ctx.fillStyle='#fff2d6';ctx.font='bold 13px Arial';ctx.fillText('Jezero · zoom to explore',j[0]+18,j[1]+4);}
if(local&&route)line(route.coords,'#c8eea5',3);if(local&&altPreview)line(altPreview,'#7fd6ff',3,[8,6]);
for(const key of (local?blocked:[])){let e=graph.edges.find(e=>e.id===key);if(e){const p=project(graph.nodes[e.a]);ctx.fillStyle='#ff906b';ctx.font='bold 20px sans-serif';ctx.fillText('×',p[0]-6,p[1]+7)}}
updatePOIMarkers(local);notesUI?.update(local,cw,ch);
let start=panos.find(p=>p.id===MISSION_BASE.panoramaId);if(local&&start){let [x,y]=project(start.coord);ctx.fillStyle='#c8eea5';ctx.fillRect(x-6,y-6,12,12);ctx.strokeStyle='#12221a';ctx.strokeRect(x-6,y-6,12,12);ctx.fillStyle='#142019';ctx.fillRect(x+12,y-12,116,24);ctx.fillStyle='#e8d5a2';ctx.font='bold 12px monospace';ctx.fillText('MARTIAN BASE',x+18,y+4)}
if(sim&&route){let c=sim.coord||route.coords[0];let [x,y]=project(c);ctx.beginPath();ctx.arc(x,y,8,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#14352d';ctx.lineWidth=3;ctx.stroke()}
let pxPerKm=sc*COS/(3396.19*Math.PI/180*Math.cos(view.lat*Math.PI/180)),target=cw/(pxPerKm*5),power=10**Math.floor(Math.log10(target)),scaleKm=[1,2,5].map(n=>n*power).filter(n=>n<=target).at(-1)||power;$('#mapScale').style.width=scaleKm*pxPerKm+'px';$('#mapScale').textContent=(scaleKm<1?Math.round(scaleKm*1000)+' m':Math.round(scaleKm).toLocaleString()+' km')+' · at center';drawProfile()}
function focusStop(p){
 if(!p)return;const pano=panos.find(q=>q.id===p.id),c=p.coord;
 if(pano)choose(pano);view.lon=c[0];view.lat=c[1];draw();
 if(!$('#terrainPane').hidden&&terrainReady)$('#terrainFrame').contentWindow?.postMessage({type:'marswalk-flight',focus:[c[0],c[1]],animate:true,requestId:++flightNumber},location.origin);
}
function drawProfile(){let c=$('#profile'),r=c.getBoundingClientRect(),d=window.devicePixelRatio||1,H=56;c.width=r.width*d;c.height=H*d;let g=c.getContext('2d');g.scale(d,d);if(!route?.coords.length||route.distance===0){g.fillStyle='#b58a2e';g.font='15px monospace';g.fillText(route?.baseTasks?.length?'Base operation · no traverse':'Elevation profile appears when a route is built.',8,H/2+4);return}
 let zs=route.coords.map(c=>c[2]),min=Math.min(...zs),max=Math.max(...zs),span=Math.max(1,max-min),X0=44,W=r.width-X0-8,pos=[];
 g.beginPath();let cum=0;route.coords.forEach((p,i)=>{if(i)cum+=distance(route.coords[i-1],p);pos.push(cum);let x=X0+cum/route.distance*W,y=H-8-(p[2]-min)/span*(H-18);i?g.lineTo(x,y):g.moveTo(x,y)});g.strokeStyle='#3dff7a';g.lineWidth=1.5;g.stroke();
 g.fillStyle='#b58a2e';g.font='12px monospace';g.fillText(Math.round(max)+' m',0,12);g.fillText(Math.round(min)+' m',0,H-4);g.fillText((route.distance/1000).toFixed(2)+' km',r.width-60,12);
 if(sim?.coord){let bi=0,bd=1e9;route.coords.forEach((p,i)=>{const dd=Math.abs(p[0]-sim.coord[0])+Math.abs(p[1]-sim.coord[1]);if(dd<bd){bd=dd;bi=i}});const x=X0+pos[bi]/route.distance*W;g.strokeStyle='#ffb000';g.lineWidth=2;g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();g.fillStyle='#ffb000';g.beginPath();g.arc(x,H-8-(route.coords[bi][2]-min)/span*(H-18),3.5,0,7);g.fill()}}
let drag;function resetJezero(){view={lon:77.42,lat:18.46,zoom:1};draw()}
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,lon:view.lon,lat:view.lat};canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{if(!data)return;if(drag){let sc=scaleFor(cw,ch,view.zoom);view.lon=drag.lon-(e.clientX-drag.x)/(sc*COS);view.lat=drag.lat+(e.clientY-drag.y)/sc;clampView(view,cw,ch);draw()}let r=canvas.getBoundingClientRect(),c=unprojectPoint([e.clientX-r.left,e.clientY-r.top],view,cw,ch);$('#coords').textContent=Math.abs(c[1])<=90&&Math.abs(c[0])<=180?`${Math.abs(c[1]).toFixed(4)}° ${c[1]>=0?'N':'S'} · ${Math.abs(c[0]).toFixed(4)}° ${c[0]>=0?'E':'W'}`:'Outside map'};
canvas.onpointerup=e=>{if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){let r=canvas.getBoundingClientRect(),pt=[e.clientX-r.left,e.clientY-r.top];if(view.zoom<=.12){let j=project([77.42,18.46]);if(Math.hypot(j[0]-pt[0],j[1]-pt[1])<45)resetJezero()}else{let best=null,dist=22;for(let p of panos){let xy=project(p.coord),d=Math.hypot(xy[0]-pt[0],xy[1]-pt[1]);if(d<dist){dist=d;best=p}}if(best){choose(best);simUI?.handleMapClick({lon:best.coord[0],lat:best.coord[1],sx:pt[0],sy:pt[1]})}else{const c=unprojectPoint(pt,view,cw,ch);simUI?.handleMapClick({lon:c[0],lat:c[1],sx:pt[0],sy:pt[1]})}}}drag=null};canvas.onpointercancel=()=>drag=null;
canvas.onwheel=e=>{e.preventDefault();let r=canvas.getBoundingClientRect();zoomAt(view,e.deltaY<0?1.35:1/1.35,[e.clientX-r.left,e.clientY-r.top],cw,ch);if(view.zoom<.12)openTerrain(true);draw()};$('#zoomIn').onclick=()=>{zoomAt(view,1.8,[cw/2,ch/2],cw,ch);draw()};$('#zoomOut').onclick=()=>{zoomAt(view,1/1.8,[cw/2,ch/2],cw,ch);if(view.zoom<.12)openTerrain(true);draw()};$('#resetMap').onclick=resetJezero;$('#allMars').onclick=()=>openTerrain(true);$('#expandMap').onclick=()=>{let expanded=$('.workspace').classList.toggle('mapExpanded');$('#expandMap').textContent=expanded?'Restore layout':'Expand map';$('#expandMap').setAttribute('aria-pressed',String(expanded));requestAnimationFrame(draw)};
$('#layersBtn').onclick=()=>$('#overlayMenu').classList.toggle('hidden');$$('#overlayMenu input').forEach(i=>i.onchange=draw);
const layerNames={color:['Jezero · color','HRSC color + HiRISE detail · ESA / NASA / FU Berlin']};$('#layerTitle').textContent=layerNames.color[0];$('#layerNote').textContent=layerNames.color[1];
function generate(){
 stopSimulation();let s=settings();if(!canBuild()){toast('Click a point of interest on the map and choose a task first.');return}
 $('#generate').disabled=true;$('#buildMission').disabled=true;$('#plannerStatus').textContent='Finding a route…';
 setTimeout(()=>{try{
 const start=panos.find(p=>p.id===s.start),customs=customPicks().map(c=>{const node=graph.nearest(c.coord);return {...c,node,sol:null,snapDistance:distance(c.coord,graph.nodes[node]),tasks:(t=>t.length?t:[VISIT_TASK])(experiments.filter(e=>(c.experimentIds||[]).includes(e.id)&&e.id!=='sample'&&e.id!=='visit'))}}),candidates=[...[...picks.entries()].filter(([id])=>id!==start.id).map(([id,set])=>{const p=panos.find(q=>q.id===id),t=experiments.filter(e=>e.id!=='visit'&&set.has(e.id)&&taskAvailable(e,p));return {...p,tasks:t.length?t:[VISIT_TASK]}}),...customs];[...pinned].filter(id=>String(id).startsWith('custom-')).forEach(id=>pinned.delete(id));customs.forEach(c=>pinned.add(c.id));
 const strict=planMission(graph,start,candidates,s,blocked,must());
 const apply=(plan,options)=>{route=plan.grid?plan:addSpurs(plan,{speedKmh:options.speed,router:slope,graph});try{route.explanations=plan.grid?explainGridRoute(route,costRouter,{settings:options}):explainRoute(graph,route,{settings:options,blocked});if(plan.grid)route.costSummary=costSummary(route,costRouter)}catch(e){console.error(e);route.explanations=[]}try{route.slopeCheck=checkRouteSlope(slope,route.coords)}catch{route.slopeCheck=null}lastSettings=options;renderMission();planPanel?.render(route,options,{pinned:new Set(),visit:new Set()});if(route.spurs?.length)$('#plannerStatus').textContent+=` · +${Math.round(route.spurMeters)} m off-corridor (${slope.mode==='dem'?'DEM slope-checked':'slope NOT modelled'})`+(route.minutes>options.budget*.8?' · over 80% time budget: shorten the plan':'');simUI?.routeChanged(route,options);briefRoute(options);scheduleAlts(options);syncTerrain();localStorage.setItem('marswalk-settings',JSON.stringify({...options,uiVersion:2}));};
 if(satisfies(strict,s)){apply(strict,s);return}
 const alternative=findAlternative(graph,start,candidates,s,blocked,must());
 if(!alternative){$('#plannerStatus').textContent='No connected route found. Try another region or tasks.';askMission('NO ROUTE','No route found','No alternative was found within 20 km and 8 hours, keeping your region and blocked paths. Try another region or experiment.','Back to plan',()=>{});return}
 const names=ids=>ids.map(id=>experiments.find(e=>e.id===id)?.name||panos.find(p=>p.id===id)?.name||id).join(', ');
 const lines=alternative.changes.map(c=>c.kind==='distance'?`Distance limit: ${(c.before/1000).toFixed(1)} → ${(c.after/1000).toFixed(1)} km`:c.kind==='time'?`Time budget: ${c.before} → ${c.after} min (20% reserve retained)`:c.kind==='grade'?`Slope limit: ${c.before}° → ${c.after===90?'no grade filter':c.after+'°'}`:c.kind==='experiments'?`Not included: ${names(c.ids)}`:`Priority stops not reached: ${names(c.ids)}`);
 $('#alternativeSummary').textContent=`Your full request did not fit. This alternative has ${alternative.plan.stops.length} stops, ${(alternative.plan.distance/1000).toFixed(2)} km and ${Math.ceil(alternative.plan.minutes)} min.`;
 $('#alternativeChanges').innerHTML=lines.map(t=>`<li>${esc(t)}</li>`).join('');
 $('#declineAlternative').onclick=()=>{$('#alternativePrompt').close();$('#plannerStatus').textContent='Settings kept. Adjust your plan to try again.'};
 $('#acceptAlternative').onclick=()=>{const o=alternative.settings;$('#distance').max=Math.max(20,o.maxDistance/1000);$('#distance').value=o.maxDistance/1000;$('#distance').oninput();for(const [id,v] of [['budget',o.budget],['slope',o.maxGrade]]){const select=$('#'+id);if(![...select.options].some(x=>+x.value===v))select.add(new Option(id==='budget'?`${v} minutes`:`${v}°`,v));select.value=v}for(const [id,set] of picks)for(const t of [...set])if(t!=='visit'&&!o.ids.includes(t)&&!(id===MISSION_BASE.panoramaId&&t==='sample'))set.delete(t);for(const c of alternative.changes)if(c.kind==='stops')c.ids.forEach(id=>picks.delete(id));for(const [id,set] of [...picks])if(!set.size)picks.delete(id);renderMissionList();$('#alternativePrompt').close();apply(alternative.plan,o)};
 $('#alternativePrompt').showModal();$('#plannerStatus').textContent='Review the alternative route.';
 }catch(e){console.error(e);toast('Route calculation failed. Adjust your plan.')}finally{$('#generate').disabled=false;$('#buildMission').disabled=!canBuild();$('#buildMission').textContent='Update mission →'}},30)
}
function renderMission(){if(!route||(!route.stops.length&&!route.baseTasks?.length)){$('#plannerStatus').textContent='No science stop fits these limits. Try a longer distance, more time, a less restrictive grade filter.';$('#stops').innerHTML='<div class="notice">No feasible mission found. Your distance and time limits were not exceeded.</div>';for(let id of ['Distance','Time','Stops','Ascent'])$('#metric'+id).textContent='—';routeTour=[];notesUI?.clear();$('#walkRoute').disabled=true;$('#viewCoverage').textContent='No connected views: adjust your mission limits.';$('#simulate').disabled=true;$('#block').disabled=true;$('#simStatus').textContent='No feasible mission. Adjust limits and generate again.';draw();return}$('#metricDistance').innerHTML=(route.distance/1000).toFixed(2)+'<small> km</small>';$('#metricTime').innerHTML=Math.ceil(route.minutes)+'<small> min</small>';$('#metricStops').textContent=route.stops.length;$('#metricAscent').innerHTML=Math.round(route.ascent)+'<small> m</small>';updateRouteTour();if(!route.stops.length)$('#walkRoute').disabled=true;$('#plannerStatus').textContent=`${route.stops.length} stops · ${Math.ceil(lastSettings.budget*.2)} min reserve`;$('#stops').innerHTML=route.stops.map((p,i)=>`<article class="stopcard"><span class="stopnumber">${String(i+1).padStart(2,'0')} / ARRIVE +${Math.round(p.arrival)} MIN</span><h3>${esc(p.name)}</h3><p>Science time: ${p.tasks.reduce((s,e)=>s+e.min,0)} min · ${p.custom?'Custom point':'Panorama sol '+p.sol}</p>${p.tasks.map(e=>`<label><input type="checkbox" data-task="${p.id}-${e.id}"> ${esc(e.name)}</label><small>${esc(e.task)}</small>`).join('')}${p.custom?'':`<button class="outline full" data-preview="${p.id}">Preview destination ↗</button>`}</article>`).join('')+`<article class="stopcard"><span class="stopnumber">HOME / +${Math.ceil(route.minutes)} MIN</span><h3>Return to Martian Base</h3><p>Keep ${Math.ceil(lastSettings.budget*.2)} min reserved for contingencies. Walking speed assumption: ${lastSettings.speed} km/h.</p></article>`;if(route.baseTasks?.length)$('#stops').insertAdjacentHTML('beforeend',`<article class="stopcard"><span class="stopnumber">BASE HANDOFF · 30 MIN</span><h3>Receive Sapphire Canyon</h3><p>Planned rover rendezvous · sample 25. Potential biosignatures, not confirmed life.</p><label><input type="checkbox" data-base-task="sample"> Verify seal, log custody and secure carrier</label><small>${esc(SAMPLE_HANDOFF.task)}</small><a href="${SAMPLE_HANDOFF.source}" target="_blank" rel="noopener">NASA sample record ↗</a></article>`);$$('[data-preview]').forEach(b=>b.onclick=()=>openPano(panos.find(p=>p.id===+b.dataset.preview)));$('#simulate').disabled=!route.stops.length;$('#block').disabled=!route.edgeIds.length;$('#simStatus').textContent='Ready · simulation at 120×.';refreshRouteNotes();draw()}
$('#generate').onclick=generate;
let notesUI=null;const terrainFor=p=>{const t=terrainAI?.panoramas?.[String(p.id)];return t?{loose:t.share.loose,rock:t.share.rock}:null};
function refreshRouteNotes(){
 if(!notesUI)return;
 try{const list=buildRouteNotes(route,{slopeAt:slope?.sample?.slopeDeg,limitDeg:route?.slopeCheck?.limitDeg??null,panos:panos.filter(p=>!/^Horizon/.test(p.name)),speedKmh:lastSettings?.speed||2,base:panos.find(p=>p.id===MISSION_BASE.panoramaId)?.coord,terrainAt:terrainFor});notesUI.set(list)}catch(e){console.error(e);notesUI.clear()}
}
notesUI=createNotesUI({layer:document.getElementById('routeNotes'),pop:document.getElementById('notePop'),project:c=>project(c),getBounds:()=>({cw,ch}),
 explain:async n=>{const t=noteText(n);return simUI?.explainPoint?(await simUI.explainPoint(n.title,noteQuestion(n),t)):{text:t,source:'ROUTE DATA'}}});
window.__notes=notesUI;window.__route=()=>route;window.__router=()=>costRouter;
function stopSimulation(){sim=null;simUI?.reset()}
$('#block').onclick=()=>{if(!route?.edgeIds.length)return;let id=route.edgeIds[Math.floor(route.edgeIds.length/4)];blocked.add(id);stopSimulation();generate();toast('Simulated blocked track segment excluded. Replanning from departure.')};$('#clearBlocks').onclick=()=>{blocked.clear();generate();toast('Obstacle flags cleared')};
function exportMission(){if(!route?.stops.length&&!route?.baseTasks?.length){toast('Generate a feasible mission before exporting.');return}let payload={schema:'marswalk.mission.v1',created:new Date().toISOString(),body:'Mars',coordinateSystem:'planetocentric latitude, east-positive longitude; elevation relative to Mars geoid',radiusMeters:3396190,simulation:true,settings:lastSettings,regionsVisited:[...new Set(route.stops.map(p=>regionName(p)).filter(Boolean))],base:MISSION_BASE,baseTasks:route.baseTasks||[],distanceMeters:route.distance,estimatedMinutes:route.minutes,ascentMeters:route.ascent,route:route.coords.map(([lon,lat,elevation])=>({lon,lat,elevation})),stops:route.stops.map(p=>({id:p.id,name:p.name,coordinates:p.coord,arrivalMinutes:p.arrival,panoramaSol:p.sol,positionSol:p.positionSol,tasks:p.tasks.map(e=>({id:e.id,name:e.name,minutes:e.min,instruction:e.task,completed:!!$(`[data-task="${p.id}-${e.id}"]`)?.checked}))})),panoramaWalk:routeTour.map(p=>({id:p.id,name:p.name,routeMeters:p.routeMeters,offsetMeters:p.offsetMeters,imageSource:p.source,sol:p.sol})),inferredConnectorMeters:route.connectorMeters,spurs:route.spurs||[],slopeModel:slope?.status,customStops:route.stops.filter(p=>p.custom).map(p=>p.id),slopeCheck:route.slopeCheck||null,blockedEdgeIds:[...blocked],explanations:route.explanations||[],chosenStops:[...picks.entries()].map(([id,t])=>({id,tasks:[...t]})),sources:sourceList.map(([name,status,description,url])=>({name,status,url})),limitations:'Prototype on historical rover corridors; no validated EVA safety, DEM-based route hazard analysis, live weather, radiation dose or hardware positioning.'};let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download='marvin-mission.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('Mission JSON exported for the portable companion')}
$('#export').onclick=exportMission;$('#exportAbout').onclick=exportMission;$('#print').onclick=()=>window.print();
const apiConfigs={crism:['CRISM','TRDR'],hirise:['HIRISE','RDRV11'],ctx:['CTX','EDR']};function apiURL(k){let [iid,pt]=apiConfigs[k];return 'https://oderest.rsl.wustl.edu/live2/?'+new URLSearchParams({query:'product',target:'mars',ihid:'mro',iid,pt,minlat:'18.40',maxlat:'18.52',westernlon:'77.36',easternlon:'77.48',output:'json',results:'copmf',limit:'30'})}
function showProducts(){let k=$('#instrument').value,o=products[k]?.ODEResults,ps=o?.Products?.Product||[];if(!Array.isArray(ps))ps=[ps];$('#products').innerHTML=ps.length?`<small>Showing ${ps.length} products from the bounded query, not the full archive. Query timestamp: ${esc(o.QuerySummary?.Date||'snapshot')}</small>`+ps.map(p=>{let files=p.Product_files?.Product_file||[];if(!Array.isArray(files))files=[files];let f=files.find(x=>/\.xml$|\.lbl$/i.test(x.URL))||files[0];return `<div class="product"><div><h3>${esc(p.pdsid)}</h3><small>${esc(p.Observation_time||p.Start_time||p.Product_creation_time||'Date in product label')} · ${esc(p.iid)} / ${esc(p.pt)}</small></div>${f?`<a href="${esc(f.URL)}" target="_blank" rel="noopener">Product / label ↗</a>`:''}</div>`}).join(''):'<p>No cached products for this instrument. Check the API or open its archive.</p>';$('#products').insertAdjacentHTML('beforeend',`<p><a href="${esc(apiURL(k))}" target="_blank" rel="noopener">Open this exact API query ↗</a></p>`)}
async function refresh(){let k=$('#instrument').value;$('#refreshData').disabled=true;$('#apiStatus').textContent='Requesting NASA PDS Orbital Data Explorer…';try{let r=await fetch(apiURL(k),{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error(r.status);let j=await r.json();if(j.ODEResults?.Error)throw Error(j.ODEResults.Error);products[k]=j;$('#apiStatus').textContent='Live ODE response received. Product metadata updated for the selected instrument.';showProducts();draw()}catch(e){$('#apiStatus').textContent='Live request unavailable (network, CORS, or service response). Showing the bundled snapshot where available; the exact API query and source archives remain accessible.'}finally{$('#refreshData').disabled=false}}
$('#refreshData').onclick=refresh;$('#instrument').onchange=showProducts;
async function init(){try{let results=await Promise.all(['data','traverse','waypoints'].map(n=>fetch(`assets/${n}.json`).then(r=>r.json())));data=results[0];panos=data.panoramas;traverseFeatures=results[1].features.filter(f=>f.geometry.coordinates.some(c=>c[0]>=data.bounds[0]&&c[0]<=data.bounds[2]&&c[1]>=data.bounds[1]&&c[1]<=data.bounds[3]));graph=buildGraph(traverseFeatures,data.bounds);for(let p of panos){p.node=graph.nearest(p.coord);p.snapDistance=distance(p.coord,graph.nodes[p.node])}panos=panos.filter(p=>p.snapDistance<35);try{let saved=JSON.parse(localStorage.getItem('marswalk-settings'));if(saved){$('#distance').value=saved.maxDistance/1000;$('#budget').value=saved.budget;$('#speed').value=saved.speed;$('#slope').value=saved.maxGrade;if(saved.routeStyle&&$('#routeStyle'))$('#routeStyle').value=saved.routeStyle;$('#preference').value=saved.uiVersion===2?saved.preference:'panorama';$('#distance').oninput()}}catch{}
$('#gallery').innerHTML=panos.map(p=>`<article class="card"><img loading="lazy" src="${p.image}" alt="${esc(p.name)} panorama"><div class="cardbody"><span class="eyebrow">MASTCAM-Z / SOL ${p.sol}</span><h3>${esc(p.name)}</h3><p>Position: sol ${p.positionSol}. Proposed activities: ${(t=>t.length?t.join(', '):'visit and document')(TASKS.filter(e=>taskAvailable(e,p)).map(e=>e.name))}.</p><button data-gallery="${p.id}">Explore panorama ↗</button></div></article>`).join('');$$('[data-gallery]').forEach(b=>b.onclick=()=>openPano(panos.find(p=>p.id===+b.dataset.gallery)));
await Promise.all([...Object.keys(layerNames),'global'].map(k=>new Promise(resolve=>{let im=new Image();im.onload=()=>{images[k]=im;resolve()};im.onerror=()=>resolve();im.src=k==='global'?'assets/mars-color.jpg':`assets/${k}.jpg`})));for(let k of Object.keys(apiConfigs)){try{let r=await fetch(`assets/${k}.json`);if(r.ok)products[k]=await r.json()}catch{}}showProducts();updateEquipment();choose(panos.find(p=>p.id===MISSION_BASE.panoramaId));$('#plannerStatus').textContent=`Ready. ${panos.length} surface previews on a recorded rover network.`;setupMissionFlow();setupPOIMarkers();slope=await loadTerrain();if(slope?.mode==='dem'&&slope.raw){try{costRouter=createCostRouter(slope.raw,{limitDeg:20,speedKmh:2});setPathRouter(costRouter);$('#plannerStatus').textContent=`Ready. ${panos.length} surface previews · routes are searched over the whole elevation model, not just the rover's tracks.`}catch(e){console.error('cost router unavailable, using rover-track routing',e)}}try{const hz=await fetch('assets/hazard_polygons.geojson').then(r=>r.ok?r.json():null);hazards=(hz?.features||[]).map(f=>({ring:f.geometry?.coordinates?.[0],gt:f.properties?.slope_gt_deg||20})).filter(h=>h.ring).sort((a,b)=>a.gt-b.gt)}catch{}const baseStop=panos.find(p=>p.id===MISSION_BASE.panoramaId);planPanel=createPlanPanel({root:$('#planBody'),onFocus:focusStop});simUI=createSimulatorUI({getTools:()=>toolApi,getTerrainAI:()=>terrainAI,togglePick,getPick:id=>picks.get(id)||new Set(),plan:planPanel,graph,panos,base:baseStop,bounds:data.bounds,store:poiStore,experiments,getRoute:()=>route,getSettings:()=>lastSettings,getBlocked:()=>blocked,postToScene:m=>{if(m.type==='marswalk-walker'){dem?.setWalker(m.clear?null:{coord:m.coord,heading:m.heading});$('#demElev').textContent=m.clear||!dem?'':(e=>Number.isFinite(e)?`Elev ${Math.round(e)} m`:'')(dem.elevationAt(m.coord[0],m.coord[1]))}$('#terrainFrame').contentWindow?.postMessage(m,location.origin)},openPano,toast,onPosition:c=>{sim=c?{coord:c}:null;draw();liveViewsTick(c)},onPoisChanged:flag=>{syncTerrain();if(flag&&route)changed();renderMissionList();draw()},getSlope:()=>slope,setPin:p=>{pinCoord=p;syncTerrain()}});$('#showSlope').onchange=()=>{draw();syncTerrain()};$('#showRegions').onchange=()=>{draw();syncTerrain()};regionAreas=REGIONS.map(r=>{const pts=panos.filter(p=>r.accept(p)&&p.id!==MISSION_BASE.panoramaId&&!/^Horizon/.test(p.name)).map(p=>p.coord.slice(0,2));return pts.length>=3?{id:r.id,name:r.name,ring:padRing(hullOf(pts))}:null}).filter(Boolean);syncTerrain();resolveMapReady(true);new ResizeObserver(draw).observe($('#mapstage'));window.addEventListener('resize',draw)}catch(e){console.error(e);resolveMapReady(false);$('#plannerStatus').textContent='Unable to load the bundled mission data. Please reload.'}}
init();

let tour=[],tourIndex=0,routeTour=[],failedViews=new Set(),lastJump='';
function updateRouteTour(){routeTour=panoramaSequence(route.coords,panos);$('#walkRoute').disabled=!routeTour.length;let gaps=routeTour.slice(1).map((p,i)=>p.routeMeters-routeTour[i].routeMeters);$('#viewCoverage').textContent=`${routeTour.length} photographed views · longest jump ${Math.round(Math.max(0,...gaps))} m · gaps have no imagery`;}
function setTour(p){let mode=routeTour.some(q=>q.id===p.id)?'route':'all';$('#tourMode').value=mode;tour=(mode==='route'?routeTour:[...panos].sort((a,b)=>a.sol-b.sol)).filter(q=>!failedViews.has(q.id));tourIndex=Math.max(0,tour.findIndex(q=>q.id===p.id));lastJump='';}
function renderTour(p){tourIndex=tour.findIndex(q=>q.id===p.id);$('#tourCount').textContent=`View ${tourIndex+1} of ${tour.length} · Sol ${p.sol}`;$('#prevView').disabled=tourIndex<=0;$('#nextView').disabled=tourIndex>=tour.length-1;$('#tourGap').textContent=lastJump||'Historical viewpoints, not continuous street imagery. Arrows jump over unphotographed terrain.';$('#tourStrip').innerHTML=tour.map((q,i)=>`<button class="frame ${i===tourIndex?'current':''}" data-frame="${i}" aria-label="View ${i+1}: ${esc(q.name)}" aria-current="${i===tourIndex?'step':'false'}"><img src="${q.image}" alt="" loading="lazy"><span>${i+1}. ${esc(q.name)}</span></button>`).join('');$$('[data-frame]').forEach(b=>b.onclick=()=>goView(+b.dataset.frame));}
function goView(i){if(i<0||i>=tour.length)return;let from=tour[tourIndex],to=tour[i],meters=$('#tourMode').value==='route'?Math.abs(to.routeMeters-from.routeMeters):distance(from.coord,to.coord);lastJump=`Jumped ${Math.round(meters)} m ${$('#tourMode').value==='route'?'along the planned route':'between approximate viewpoints (straight-line distance)'}. No intervening imagery is implied.`;tourIndex=i;showPano(to);}
$('#prevView').onclick=()=>goView(tourIndex-1);$('#nextView').onclick=()=>goView(tourIndex+1);
$('#panoBtn').onclick=()=>{const c=simUI?.position()?.coord||route?.coords?.[0]||panos.find(p=>p.id===MISSION_BASE.panoramaId)?.coord;if(!c)return;const p=[...panos].sort((x,y)=>distance(c,x.coord)-distance(c,y.coord))[0];if(p)openPano(p)};
$('#tourMode').onchange=()=>{tour=($('#tourMode').value==='route'?routeTour:[...panos].sort((a,b)=>a.sol-b.sol)).filter(p=>!failedViews.has(p.id));if(!tour.length){$('#tourGap').textContent='Generate a mission first to walk its route.';$('#prevView').disabled=true;$('#nextView').disabled=true;$('#tourStrip').innerHTML='';return}tourIndex=0;lastJump='';showPano(tour[0]);};
$('#panoDialog').addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.key==='ArrowRight'){e.preventDefault();goView(tourIndex+1)}if(e.key==='ArrowLeft'){e.preventDefault();goView(tourIndex-1)}});
$('#panoImage').onerror=()=>{let missing=tour[tourIndex];if(!missing)return;failedViews.add(missing.id);tour.splice(tourIndex,1);if(!tour.length){$('#tourGap').textContent='These images could not be loaded. Try again later or open the original source.';$('#prevView').disabled=true;$('#nextView').disabled=true;return}tourIndex=Math.min(tourIndex,tour.length-1);lastJump=`${missing.name} could not load; skipped to the next available view.`;showPano(tour[tourIndex]);};

const vr=new PanoramaVR({onChange:p=>{tourIndex=tour.findIndex(q=>q.id===p.id);showPano(p)},onStatus:text=>$('#vrStatus').textContent=text,onEnd:()=>{$('#enterVR').textContent='Enter VR · Quest 2';$('#enterVR').disabled=false;$('#vrStatus').textContent='VR ended. You can continue browsing or enter again.';}});
vrSupport().then(state=>{$('#enterVR').disabled=!state.ok;$('#vrStatus').textContent=state.message;});
$('#enterVR').onclick=async()=>{if(!tour.length){$('#vrStatus').textContent='Choose a panorama first.';return}$('#enterVR').disabled=true;$('#enterVR').textContent='Starting VR…';try{await vr.enter(tour,Math.max(0,tourIndex));if(vr.session)$('#enterVR').textContent='VR is active';}catch(error){$('#vrStatus').textContent=error.name==='NotAllowedError'?'VR was not allowed. Select Enter VR again when ready, then approve in the headset.':'Unable to start VR. Open the published site directly in Meta Quest Browser and try again.';$('#enterVR').disabled=false;$('#enterVR').textContent='Enter VR · Quest 2';}};
$('#panoDialog').addEventListener('close',()=>vr.exit());

fetch('downloads/project-version.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(m=>{$('#projectVersion').textContent=`Built ${new Date(m.built_at).toLocaleString()} · ${m.file_count} files · ${(m.zip_bytes/1048576).toFixed(1)} MB · source ${m.source_fingerprint.slice(0,12)}`}).catch(()=>{});



function askMission(kind,title,description,confirm,action){
 $('#promptKind').textContent=kind;$('#promptTitle').textContent=title;$('#promptDescription').textContent=description;$('#confirmPrompt').textContent=confirm;
 $('#confirmPrompt').onclick=()=>{$('#missionPrompt').close();action()};$('#cancelPrompt').onclick=()=>$('#missionPrompt').close();$('#missionPrompt').showModal();
}
function setupMissionFlow(){
 $('#buildMission').onclick=generate;$('#walkRoute').disabled=true;$('#plannerStatus').textContent='Click a point of interest, then pick a task.';
 $('#missionList').addEventListener('click',e=>{
  const x=e.target.closest('[data-unpick],[data-untask],[data-uncustom]');if(!x)return;
  if(x.dataset.unpick)picks.delete(+x.dataset.unpick);
  else if(x.dataset.untask){const [id,t]=x.dataset.untask.split('|'),set=picks.get(+id);set?.delete(t);if(set&&!set.size)picks.delete(+id)}
  else if(x.dataset.uncustom){poiStore.update(x.dataset.uncustom,{useInMission:false});simUI?.renderPoiList();syncTerrain()}
  changed();renderMissionList();
 });
 renderMissionList();
}
function renderMissionList(){
 const ul=$('#missionList');if(!ul)return;const items=[];
 for(const [id,set] of picks){const p=panos.find(q=>q.id===id);if(!p)continue;items.push(`<li><div class="mhead"><strong>${esc(p.name)}</strong><small>${esc(id===MISSION_BASE.panoramaId?'Martian Base':regionName(p))}</small><button class="x" data-unpick="${id}" aria-label="Remove ${esc(p.name)}">✕</button></div><div class="mtasks">${[...set].map(t=>`<span class="chip">${esc(experiments.find(e=>e.id===t)?.name||t)}<button data-untask="${id}|${esc(t)}" aria-label="Remove task">×</button></span>`).join('')}</div></li>`)}
 for(const c of customPicks())items.push(`<li><div class="mhead"><strong>${esc(c.name)}</strong><small>your point</small><button class="x" data-uncustom="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">✕</button></div><div class="mtasks">${(c.experimentIds||[]).map(t=>`<span class="chip">${esc(experiments.find(e=>e.id===t)?.name||t)}</span>`).join('')}</div></li>`);
 $('[data-slot=empty]').style.display=items.length?'none':'';ul.innerHTML=items.join('')||'<li class="feedempty">Nothing yet.</li>';
 const n=picks.size+customPicks().length,t=pickedTaskIds().length+(picks.get(MISSION_BASE.panoramaId)?.has('sample')?0:0);
 $('#chosenTasks').textContent=n?`${n} stop${n===1?'':'s'} · ${t} task${t===1?'':'s'}`:'No stops yet';$('#buildMission').disabled=!canBuild();updateEquipment();
}
function setupPOIMarkers(){
 $('#poiMarkers').innerHTML=panos.filter(p=>!/^Horizon/.test(p.name)).map(p=>`<div class="poi-marker" data-poi="${p.id}"><button class="poi-dot" aria-label="${esc(p.name)}" aria-describedby="poi-${p.id}"></button><div class="poi-bubble" id="poi-${p.id}"><strong>${esc(p.name)}</strong><p>${esc(poiDescription(p))}</p><button class="poi-open">View panorama →</button></div></div>`).join('');
 $$('.poi-marker').forEach(el=>{const p=panos.find(p=>p.id===+el.dataset.poi);el.querySelector('.poi-dot').onclick=()=>{choose(p);simUI?.handleMapClick({lon:p.coord[0],lat:p.coord[1],sx:parseFloat(el.style.left)||0,sy:parseFloat(el.style.top)||0})};el.querySelector('.poi-open').onclick=()=>openPano(p)});draw();
}
function updatePOIMarkers(local){
 $$('.poi-marker').forEach(el=>{const p=panos.find(p=>p.id===+el.dataset.poi),[x,y]=project(p.coord);el.hidden=!local||!$('#showStops').checked||x<12||y<12||x>cw-12||y>ch-12;el.style.left=x+'px';el.style.top=y+'px';el.classList.toggle('bubble-left',x>cw-280);el.classList.toggle('bubble-below',y<150);el.classList.toggle('on-route',!!route?.stops.some(s=>s.id===p.id));el.classList.toggle('picked',picks.has(p.id))});
}

let terrainLoaded=false,terrainReady=false,terrainCamera=null;let resolveTerrain;const terrainSignal=new Promise(resolve=>resolveTerrain=resolve);const terrainFlights=new Map();let flightNumber=0;
function flyTerrain(animate){return new Promise(resolve=>{const requestId=++flightNumber;terrainFlights.set(requestId,resolve);$('#terrainFrame').contentWindow?.postMessage({type:'marswalk-flight',animate,requestId},location.origin)})}
function syncTerrain(){demSync();if(!terrainReady)return;$('#terrainFrame').contentWindow?.postMessage({type:'marswalk-terrain',route:route?.coords||[],pois:(panos||[]).filter(p=>p.id!==MISSION_BASE.panoramaId).map(p=>({...p,description:poiDescription(p),plannedTasks:route?.stops.find(s=>s.id===p.id)?.tasks.map(t=>t.name).join(', ')||'Not in selected mission'})),base:{...MISSION_BASE,plannedTasks:route?.baseTasks?.map(t=>t.name).join(', ')||''},custom:poiStore.list().map(({id,name,coord})=>({id,name,coord})),pin:pinCoord,hazards:hazards.map(h=>({ring:h.ring,gt:h.gt})),showHazards:!!$('#showSlope')?.checked,regions:regionAreas,showRegions:!!$('#showRegions')?.checked,camera:terrainCamera},location.origin);terrainCamera=null}

function briefRoute(o){
 if(!route?.stops?.length)return;const sc=route.slopeCheck,n=route.stops.length;
 let t=`Route ready: ${n} stop${n>1?'s':''}, ${(route.distance/1000).toFixed(1)} km, about ${Math.ceil(route.minutes)} min.`;
 if(sc&&sc.totalMeters>sc.outsideMeters)t+=` Steepest ground ${sc.maxDeg.toFixed(1)}° on the DEM${sc.overLimitMeters>0?`, ${Math.round(sc.overLimitMeters)} m above your ${sc.limitDeg}° limit`:''}.`;
 if(route.connectorMeters>0)t+=` ${Math.round(route.connectorMeters)} m uses inferred joins.`;
 if(route.missingIds?.length)t+=` Not scheduled: ${route.missingIds.map(id=>experiments.find(e=>e.id===id)?.name).filter(Boolean).join(', ')}.`;
 if(route.unmetPins?.length)t+=` ${route.unmetPins.length} priority stop(s) did not fit.`;
 if(route.explanations?.length)t+=` Tap the numbered markers on the map to see why the route turns and how far each leg is.`;{const g=groundAlongRoute(route,{panos,terrainAt:terrainFor});if(g)t+=` Terrain AI reads the ground near this route as about ${g.loose}% loose and ${g.rock}% rock (${g.panoramas.length} panorama${g.panoramas.length>1?'s':''}; an estimate that tends to under-report rock).`}
 simUI?.say(t,'ROUTE');
}
function clearAlts(){altToken++;altRoutes=[];altPreview=null;altSel=-1;$('#altWrap').hidden=true;$('#altRoutes').innerHTML='';dem?.setAlt(null)}
function scheduleAlts(options){
 clearAlts();if(!route?.stops?.length)return;const token=altToken;$('#altWrap').hidden=false;$('#altCount').textContent='finding…';
 setTimeout(async()=>{try{
  if(slope?.mode!=='dem'){$('#altCount').textContent='needs DEM';$('#altRoutes').innerHTML='<p class="note">Alternatives are planned on the DEM slope grid, which is not loaded.</p>';return}
  if(!demData)demData=decodeTerrain(await fetch('assets/terrain.json').then(r=>r.json()));
  if(token!==altToken)return;
  const startP=panos.find(p=>p.id===MISSION_BASE.panoramaId);
  const res=alternativeRoutes(demData,graph,startP.coord,{coords:route.coords,distance:route.distance,minutes:route.minutes,stops:route.stops},options,{panos,slopeOf:c=>{try{return checkRouteSlope(slope,c)}catch{return null}}});
  if(token!==altToken)return;altRoutes=res.alternatives;renderAlts(res.chosen);
 }catch(e){console.error(e);$('#altCount').textContent='unavailable'}},30);
}
function renderAlts(cm){
 const f=(m,d=1)=>m==null?'—':m.toFixed(d);
 $('#altCount').textContent=altRoutes.length?`${altRoutes.length} found`:'none found';
 $('#altRoutes').innerHTML=(altRoutes.length?`<p class="note">Yours: ${(cm.distance/1000).toFixed(1)} km · ${Math.ceil(cm.minutes)} min · max ${f(cm.maxDeg)}°. Alternates are DEM-modelled, not rover-verified.</p>`:'<p class="note">No cross-country path under the slope limit.</p>')+altRoutes.map((a,i)=>`<article class="altcard${i===altSel?' on':''}"><h4>${i+1}. ${esc(a.label)}</h4><div class="altnums"><span>${(a.metrics.distance/1000).toFixed(2)} km</span><span>${Math.ceil(a.metrics.minutes)} min</span><span>max ${f(a.metrics.maxDeg)}°</span><span>${Math.round(a.metrics.offTrack)} m off track</span></div><p>${esc(a.why)}</p><button data-alt="${i}">${i===altSel?'Hide preview':'Preview on map'}</button></article>`).join('');
}
$('#altRoutes').addEventListener('click',e=>{const b=e.target.closest('[data-alt]');if(!b)return;const i=+b.dataset.alt;altSel=altSel===i?-1:i;altPreview=altSel>=0?altRoutes[altSel].coords:null;if(altSel>=0)simUI?.say(`${altRoutes[altSel].label}: ${altRoutes[altSel].why} Modelled on the DEM, not rover-verified.`,'ALT ROUTE');renderAlts(altCm());dem?.setAlt(altPreview);draw()});
function altCm(){return {distance:route.distance,minutes:route.minutes,maxDeg:route.slopeCheck?.maxDeg??null}}
let dem=null,demLoading=null;
function demStops(){const out=[];const b=(panos||[]).find(p=>p.id===MISSION_BASE.panoramaId);if(b?.coord)out.push({lon:b.coord[0],lat:b.coord[1],name:'BASE',base:true});for(const s of route?.stops||[])if(s.coord)out.push({lon:s.coord[0],lat:s.coord[1],name:s.name,custom:!!s.custom,picked:true});return out}
function demVRNotes(){const m={};for(const it of route?.explanations||[]){if(it.kind==='turn'||it.leg==null||!it.why&&!it.text)continue;if(it.kind!=='detour'&&it.kind!=='direct')continue;const nm=route.legs?.[it.leg]?.toName;if(nm&&!m[nm])m[nm]=it.why||it.text}return m}
async function vrButtons(){const b=$('#demVR'),st=$('#demVRStatus');if(!b||!dem?.vr)return;const s=await dem.vr.support();b.disabled=!s.ok;st.textContent=s.ok?'':s.message;st.title=s.message}
const pageText=sel=>{const el=document.querySelector(sel);if(!el)return '';const seen=new Set(),out=[];el.querySelectorAll('h1,h2,h3,h4,p,li,th,td,summary,dt,dd,label').forEach(n=>{const raw=n.matches('.acronym')?(n.getAttribute('aria-label')||''):n.querySelector('br')?[...n.childNodes].map(c=>c.textContent).join(' '):n.textContent,t=raw.replace(/\s+/g,' ').trim();if(t&&!seen.has(t)){seen.add(t);out.push(t)}});return out.join('\n').slice(0,7000)};
function vrPanelList(){
 const r=route,P=[];
 P.push({title:'Mission plan',text:r?.stops?.length?`${r.stops.length} stop${r.stops.length===1?'':'s'} · ${(r.distance/1000).toFixed(2)} km · ${Math.ceil(r.minutes)} min · climb ${Math.round(r.ascent||0)} m${r.kcal?` · about ${Math.round(r.kcal)} kcal`:''}\n\nMartian Base (start)\n`+r.stops.map((x,i)=>`${i+1}. ${x.name}`).join('\n')+'\nReturn to Martian Base':'No plan yet. Take the headset off or use the page to choose stops, then Make route.'});
 P.push({title:'Why this route',text:(r?.explanations||[]).filter(e=>e.kind!=='turn').map(e=>`${e.title}\n${e.text}`).join('\n\n')||'Build a route to see the reasons.'});
 P.push({title:'CAPCOM',text:pageText('#capcom')||'CAPCOM has nothing to report yet.'});
 P.push({title:'Terrain and ground',text:(pageText('#terrainAICard')||'Terrain AI: open Panorama and run the live scan.')+(r?.costSummary?`\n\nPath cost drivers: ${r.costSummary.drivers.slice(0,3).map(d=>d.label+' '+Math.round(d.share*100)+'%').join(', ')}. Steepest ground ${Math.round(r.costSummary.maxSlopeDeg)} degrees.`:'')});
 P.push({title:'Destinations',text:pageText('#destinations')||'-'});
 P.push({title:'Data archive',text:pageText('#data')||'-'});
 P.push({title:'About MARVIN',text:pageText('#about')||'-'});
 P.push({title:'VR controls',text:'EXIT VR: squeeze either grip (side) button. You can always press the Meta button too.\n\nTrigger: teleport where you aim, or turn a page when aiming at a panel.\nLeft stick: walk (click it to go fast). Right stick: turn in steps.\nWalking goes the way your head faces.\nA: jump to the next stop. B: follow the astronaut / move freely. Right stick click: start or pause the walk. Y: change eye height. Also the red EXIT VR button under the left wrist panel (aim, trigger).\nX: show or hide these panels. Turn your head or the right stick to see all 8 panels around you.'});
 return P;
}
async function launchVR(){
 const btns=[$('#demVR'),$('#vrFab')].filter(Boolean),set=(t,d)=>btns.forEach(b=>{b.textContent=t;b.disabled=!!d});
 if(dem?.vr?.active()){dem.vr.exit();return}
 set('Starting VR…',true);
 try{if($('#demPane').hidden)await openDem();else if(!dem)await loadDem();if(!dem?.vr)throw Error('3D view is not available');
  dem.vr.setPanels(vrPanelList());dem.vr.setNotes(demVRNotes());
  dem.vr.onEnd=()=>set('Enter VR',false);
  dem.vr.onWalk=()=>{const b=$('#simulate');if(b&&!b.disabled)b.click()};await dem.vr.enter();set('Exit VR',false);
  { const b=$('#simulate');if(route?.stops?.length&&b&&!b.disabled&&/Start/.test(b.textContent))b.click() }   // so there is an astronaut to follow
 }catch(e){console.warn('VR failed',e);$('#demVRStatus').textContent='VR could not start: '+(e?.message||e);set('Enter VR',false)}
}
$('#demVR').onclick=launchVR;
const fabEl=$('#vrFab');if(fabEl){fabEl.onclick=launchVR;vrSupport().then(st=>{if(!st.ok)return;fabEl.hidden=false;setTimeout(()=>loadDem().then(ok=>ok&&demSync()),1200)})}
function demSync(){if(!dem)return;dem.vr?.setNotes(demVRNotes());dem.vr?.setPanels(vrPanelList());dem.setRoute(route?.coords||[],demStops());dem.setAlt(altPreview);if(panos)dem.setPanos(panos.filter(p=>p.coord).map(p=>({id:p.id,lon:p.coord[0],lat:p.coord[1]})))}
const loadImg=src=>new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.onerror=()=>r(null);im.src=src});
function loadDem(){
 if(dem)return Promise.resolve(true);
 if(!demLoading)demLoading=(async()=>{try{const [{createDem3D},t,imagery]=await Promise.all([import('./dem3d.js'),fetch('assets/terrain.json').then(r=>r.json()),loadImg('assets/color.jpg')]);dem=createDem3D({container:$('#demStage'),terrain:t,imagery});window.__dem=dem;dem.setOnPick(({lon,lat,pano,sx,sy})=>{if(pano!=null){const p=panos?.find(x=>x.id===pano);if(p)choose(p)}simUI?.handleMapClick({lon,lat,sx,sy})});demSync();dem.frame();return true}catch(e){console.warn('DEM 3D unavailable',e);$('#demFail').hidden=false;demLoading=null;return false}})();
 return demLoading;
}
async function openDem(){
 $('#demToggle').classList.remove('hint');closeTerrain();$('#demPane').hidden=false;syncViewButtons();
 if(await loadDem()){dem.start();demSync();dem.resize();vrButtons()}
}
function closeDem(){$('#demPane').hidden=true;dem?.stop();syncViewButtons()}
$('#demToggle').onclick=()=>$('#demPane').hidden?openDem():closeDem();$('#map2d').onclick=()=>{closeDem();closeTerrain()};$('#allMars').addEventListener('click',closeDem,true);addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#demPane').hidden&&!document.querySelector('dialog[open]'))closeDem()});
$('#demViews').onclick=e=>{const b=e.target.closest('button[data-v]');if(!b)return;$$('#demViews button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));dem?.setView(b.dataset.v)};
$('#demLayer').onchange=e=>dem?.setLayer(e.target.value);$('#demFrame').onclick=()=>dem?.frame();
function syncViewButtons(){const d=!$('#demPane').hidden,t=!$('#terrainPane').hidden;$('#map2d').setAttribute('aria-pressed',String(!d&&!t));$('#demToggle').setAttribute('aria-pressed',String(d));$('#terrainToggle').setAttribute('aria-pressed',String(t));$('#demDock').hidden=!d}
function openTerrain(global=false){closeDem();$('#terrainPane').hidden=false;$('#terrainToggle').setAttribute('aria-pressed','true');terrainCamera={lon:view.lon,lat:view.lat,global};if(!terrainLoaded){terrainLoaded=true;$('#terrainFrame').src='terrain.html'}else syncTerrain()}
function closeTerrain(){$('#terrainPane').hidden=true;syncViewButtons()}
$('#terrainToggle').onclick=()=>$('#terrainPane').hidden?openTerrain():closeTerrain();$('#terrainClose').onclick=closeTerrain;$('#terrainJezero').onclick=()=>{terrainCamera={lon:77.42,lat:18.40,global:false};syncTerrain()};$('#terrainWorld').onclick=()=>{terrainCamera={lon:77.42,lat:18.46,global:true};syncTerrain()};
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==$('#terrainFrame').contentWindow)return;if(e.data?.type==='marswalk-terrain-ready'){terrainReady=true;syncTerrain();resolveTerrain(true)}if(e.data?.type==='marswalk-terrain-failed')resolveTerrain(false);if(e.data?.type==='marswalk-flight-done'){terrainFlights.get(e.data.requestId)?.();terrainFlights.delete(e.data.requestId)}if(e.data?.type==='marswalk-map-click'&&Number.isFinite(e.data.lon)&&Number.isFinite(e.data.lat))simUI?.handleMapClick(e.data);if(e.data?.type==='marswalk-open-panorama'){const p=panos?.find(p=>p.id===e.data.id);if(p)openPano(p)}});

// ---- tools CAPCOM (live Claude) may call; see capcom-tools.js for the validated definitions
const rnd=(v,d=1)=>Number.isFinite(v)?+v.toFixed(d):null;
function routeFacts(){
 if(!route?.stops?.length)return {hasRoute:false,note:'No mission is planned yet. Pick a point on the map and a task, then make the route.'};
 const e=dem?.effort(route.coords);
 return {hasRoute:true,stops:route.stops.map(x=>x.name),distanceKm:rnd(route.distance/1000,2),minutes:Math.ceil(route.minutes),ascentM:Math.round(route.ascent||0),
  maxSlopeDeg:rnd(route.slopeCheck?.maxDeg),metersAboveLimit:Math.round(route.slopeCheck?.overLimitMeters||0),slopeLimitDeg:route.slopeCheck?.limitDeg??null,
  walkingEffort:e?{kcal:Math.round(e.kcal),extraVsFlatPct:Math.round(e.extraVsFlatPct),note:e.note}:null,
  alternatesFound:altRoutes.length,settings:{preference:$('#preference').value,maxSlopeDeg:+$('#slope').value,budgetMin:+$('#budget').value}};
}
const waitAlts=async()=>{for(let i=0;i<60&&$('#altCount').textContent==='finding…';i++)await new Promise(r=>setTimeout(r,100))};
const kmBetween=(a,b)=>distance(a,b);
function panoFor(stop){
 let p=null;
 if(stop){const t=stop.toLowerCase();const rs=route?.stops?.find(x=>x.name.toLowerCase().includes(t));p=rs?panos.find(x=>x.id===rs.id)||rs:panos.find(x=>(x.name||'').toLowerCase().includes(t))}
 if(!p){const at=simUI?.position()?.coord||route?.coords?.[0]||panos.find(x=>x.id===MISSION_BASE.panoramaId)?.coord;if(at){let bd=Infinity;for(const x of panos)if(x.coord){const d=kmBetween(at,x.coord);if(d<bd){bd=d;p=x}}}}
 return p;
}
const toolApi={
 async assess_route(){await waitAlts();return routeFacts()},
 async list_alternates(){await waitAlts();return {alternates:altRoutes.map((a,i)=>({number:i+1,label:a.label,distanceKm:rnd(a.metrics.distance/1000,2),minutes:Math.ceil(a.metrics.minutes),maxSlopeDeg:rnd(a.metrics.maxDeg),offTrackM:Math.round(a.metrics.offTrack),why:a.why})),note:'DEM-modelled, not rover-verified.'}},
 async preview_alternate({number}){await waitAlts();const b=$(`#altRoutes [data-alt="${number-1}"]`);if(!b)return {error:'that alternate does not exist'};b.click();return {previewing:altSel>=0?altRoutes[altSel].label:null}},
 async replan({preference,max_slope_deg}){
  if(!route?.stops?.length&&$('#buildMission').disabled)return {error:'no stops chosen yet, so there is nothing to replan'};
  if(preference)$('#preference').value=preference;if(max_slope_deg)$('#slope').value=String(max_slope_deg);
  $('#preference').dispatchEvent(new Event('change',{bubbles:true}));
  if($('#buildMission').disabled)return {error:'the planner cannot build with the current stops'};
  const before=route?{km:route.distance/1000,min:route.minutes,maxDeg:route.slopeCheck?.maxDeg}:null;
  generate();await waitAlts();const now=routeFacts();return {replanned:true,before:before&&{distanceKm:rnd(before.km,2),minutes:Math.ceil(before.min),maxSlopeDeg:rnd(before.maxDeg)},now};
 },
 async open_panorama({stop}){if(!panos?.length)return {error:'panoramas not loaded'};const p=panoFor(stop);if(!p)return {error:'no panorama found'};openPano(p);return {opened:p.name,sol:p.sol??null}},
 async describe_terrain({stop}){
  await terrainAIReady;if(!terrainAI)return {error:'Terrain AI results are not loaded'};if(!panos?.length)return {error:'panoramas not loaded'};
  const p=panoFor(stop);if(!p)return {error:'no panorama found'};const t=terrainAI.panoramas[String(p.id)];if(!t)return {error:'no terrain estimate for that panorama'};
  const at=simUI?.position()?.coord||route?.coords?.[0]||panos.find(x=>x.id===MISSION_BASE.panoramaId)?.coord;
  return {panorama:p.name,metersFromAstronaut:at&&p.coord?Math.round(distance(at,p.coord)):null,sharePercent:t.share,analysedPercentOfImage:t.analysedPct,model:'SegFormer-B0 fine-tuned by the team on AI4Mars',heldOutTest:terrainAI.metrics?{mIoU:terrainAI.metrics.mIoU}:null,handCheck:terrainAI.handCheck,caveat:'Two groups only (loose = soil+sand, rock = bedrock+big rock). Hand check on these panoramas: about 81% right on rock vs loose, and it tends to under-report rock. Different camera than the training data; sky, rover and no-data skipped; not a safety rating.'};
 },
 async set_view({view:v}){if(v==='map2d'){closeDem();closeTerrain();return {view:'2D map'}}if(!await loadDem())return {error:'3D view unavailable'};if($('#demPane').hidden)await openDem();$$('#demViews button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.v===v)));dem.setView(v);return {view:v}},
 async abort_to_base(){const b=$('#simAbort');if(!b||b.disabled)return {error:'no walk is in progress, so there is nothing to abort'};b.click();return {aborted:true}}
};
window.__tools=toolApi;
// Preload the default 3D scene behind the automatic arrival sequence.
terrainLoaded=true;$('#terrainFrame').src='terrain.html';   // the 3D scene loads silently behind the intro

// ---- Live views: nearest real panoramas, distance and direction from the astronaut (or from base when not walking)
let lvAt=0,terrainAI=null;
function renderAICard(){
 const c=document.getElementById('terrainAICard');if(!c||!terrainAI?.handCheck)return;const h=terrainAI.handCheck;
 $('#aiStatMiou').textContent=terrainAI.metrics?.mIoU??'–';$('#aiStatLoose').textContent=Math.round(h.looseVsRockAccuracy*100)+'%';$('#aiStatFour').textContent=Math.round(h.fourClassAccuracy*100)+'%';
 $('#aiCardLimits').textContent=`Honest limits: the hand check is ${h.points} points from one labeller (roughly ±10 points). The model's soil/sand and bedrock/big-rock split did not hold up on Mastcam-Z images, so we show two groups, and it tends to under-report rock. The training data is from a different camera and mostly other terrain. An estimate, never a safety rating.`;
 c.hidden=false;
}
document.getElementById('aiCardRun')?.addEventListener('click',()=>{const ids=Object.entries(terrainAI?.panoramas||{}).sort((a,b)=>Math.abs(a[1].share.rock-50)-Math.abs(b[1].share.rock-50));const p=panos.find(q=>String(q.id)===ids[0]?.[0]);if(!p)return;openPano(p);runLiveScan(p)});
const terrainAIReady=Promise.all([fetch('assets/terrain-ai/summary.json').then(r=>r.ok?r.json():null),fetch('assets/models/metrics.json').then(r=>r.ok?r.json():null)]).then(([s,m])=>{if(s)terrainAI={...s,metrics:m};renderLiveViews(null);renderAICard()}).catch(()=>{});
const AI_ORDER=['loose','rock'],AI_LABEL={loose:'loose ground',rock:'rock'};
const aiBar=id=>{const t=terrainAI?.panoramas?.[String(id)];return t?`<i class="lvbar" title="Terrain AI estimate: ${AI_ORDER.map(c=>t.share[c]+'% '+AI_LABEL[c]).join(', ')}">${AI_ORDER.map(c=>`<b style="width:${t.share[c]}%;background:${terrainAI.colors[c]}"></b>`).join('')}</i>`:''};
function renderLiveViews(coord){
 if(!panos?.length||!$('#lvList'))return;const base=panos.find(p=>p.id===MISSION_BASE.panoramaId)?.coord,from=coord||base;
 $('#lvFrom').textContent=coord?'from you':'from Martian Base';
 $('#lvList').innerHTML=nearestViews(coord?panos:panos.filter(p=>p.id!==MISSION_BASE.panoramaId),from,distance,4).map(v=>`<li><button type="button" data-lv="${v.pano.id}" title="Open the ${esc(v.pano.name)} panorama"><img class="lvthumb" loading="lazy" alt="" src="assets/thumbs/pano-${v.pano.id}.jpg"><span class="lvname">${esc(v.pano.name)}<small>Sol ${esc(v.pano.sol)}</small>${aiBar(v.pano.id)}</span><span class="lvdist">${esc(v.label)} ${esc(v.dir)}</span></button></li>`).join('');
}
function liveViewsTick(c){const t=performance.now();if(c&&t-lvAt<700)return;lvAt=t;renderLiveViews(c||null)}
$('#lvList')?.addEventListener('click',e=>{const b=e.target.closest('[data-lv]');if(!b)return;const p=panos?.find(x=>String(x.id)===b.dataset.lv);if(p)openPano(p)});
loadDem();   // preload the 3D crater behind the intro so its button opens instantly
const experience=startExperience({paneId:'#terrainPane',onSurface:resetJezero,mapReady,terrainReady:terrainSignal,flyToJezero:flyTerrain});
mountSlots();
experience.ready.then(()=>{closeTerrain();closeDem();renderLiveViews(null);$('#demToggle').classList.add('hint');setTimeout(()=>simUI?.welcome(),500)});

// F1-F4 on-screen keys mirror the tabs; F5 starts or pauses the walking simulation (on-screen only; real function keys are left to the browser).
document.querySelectorAll('#keyrow [data-key]').forEach(b=>b.onclick=()=>{if(b.dataset.key==='walk'){document.querySelector('#simPlay').click();return}page(b.dataset.key);document.querySelectorAll('#keyrow [data-key]').forEach(x=>x.classList.toggle('on',x===b))});
