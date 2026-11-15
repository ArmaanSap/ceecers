// Location report and rule-based experiment suggestions for any clicked point.
// Nothing here is a measurement of the clicked spot. Every field says where it came from.
import {distance} from './routing.js';
import {REGIONS} from './mission-flow.js';
import {TASKS,taskAvailable,regionOf} from './region-tasks.js';
import {bearing} from './walk-sim.js';
import {classOf,rangeLabel} from './traversability.js';

export const MAX_ELEVATION_REACH_M=200;   // nearest recorded rover vertex used for elevation only within this distance
export const FAR_FROM_TRAVERSE_M=500;
export const POI_SNAP_M=150;   // a click this close to a photographed point counts as that major point of interest
const compass=b=>['N','NE','E','SE','S','SW','W','NW'][Math.round(b/45)%8];

export function inCoverage(lon,lat,bounds){return lon>=bounds[0]&&lon<=bounds[2]&&lat>=bounds[1]&&lat<=bounds[3]}

// terrain: optional {slopeDeg(lon,lat), elevM(lon,lat)} from a loaded DEM (see slope-router.js).
export function describeSite(lon,lat,{graph,panos,base,bounds,terrain=null}){
 const here=[lon,lat],fields=[];
 const covered=inCoverage(lon,lat,bounds);
 const node=graph.nearest(here),nodeCoord=graph.nodes[node],nodeDist=distance(here,nodeCoord);
 let nearestPano=null,panoDist=Infinity;for(const p of panos){const d=distance(here,p.coord);if(d<panoDist){panoDist=d;nearestPano=p}}
 const baseCoord=base.coord,baseDist=distance(here,baseCoord),baseBearing=bearing(baseCoord,here);
 let elevation=null,slopeDeg=null;
 if(terrain){const e=terrain.elevM(lon,lat),s=terrain.slopeDeg(lon,lat);if(Number.isFinite(e))elevation={value:e,source:terrain.elevNote?'DEM grid cell, '+terrain.elevNote:'DEM grid cell',provenance:'derived from loaded elevation model'};if(Number.isFinite(s))slopeDeg={value:s,source:'DEM grid cell central difference',provenance:'derived from loaded elevation model'}}
 if(!elevation&&nodeDist<=MAX_ELEVATION_REACH_M&&Number.isFinite(nodeCoord[2]))elevation={value:nodeCoord[2],source:`nearest recorded rover vertex, ${Math.round(nodeDist)} m away`,provenance:'recorded traverse data (not measured at this exact point)'};
 const region=covered&&nearestPano?REGIONS.find(r=>r.accept(nearestPano))||null:null;
 fields.push({label:'Coordinates',value:`${lat.toFixed(5)}° N · ${lon.toFixed(5)}° E`,provenance:'selected point'});
 fields.push({label:'Elevation',value:elevation?`${Math.round(elevation.value)} m`:'Not available here',source:elevation?.source||`No recorded rover vertex within ${MAX_ELEVATION_REACH_M} m and no DEM loaded`,provenance:elevation?.provenance||'none'});
 fields.push({label:'Slope',value:slopeDeg?`${slopeDeg.value.toFixed(1)}°`:'Not available',source:slopeDeg?.source||'Needs the DEM terrain model (assets/terrain.json); not yet supplied',provenance:slopeDeg?.provenance||'placeholder'});
 fields.push({label:'Nearest rover path',value:`${Math.round(nodeDist)} m`,source:'NASA Mars 2020 traverse',provenance:'recorded traverse data'});
 fields.push({label:'Nearest panorama',value:nearestPano?`${nearestPano.name} · ${Math.round(panoDist)} m`:'None',source:'Mastcam-Z',provenance:'recorded observation'});
 fields.push({label:'From Martian Base',value:`${(baseDist/1000).toFixed(2)} km ${compass(baseBearing)}`,source:'Fictional base at a recorded rover location',provenance:'derived'});
 const site={lon,lat,covered,region:region?.id||null,regionName:region?.name||null,nodeDist,nearestPano:nearestPano&&{id:nearestPano.id,name:nearestPano.name,sol:nearestPano.sol},panoDist,baseDist,elevation:elevation?.value??null,slopeDeg:slopeDeg?.value??null,offTraverse:nodeDist>FAR_FROM_TRAVERSE_M,fields,cautions:[]};
 if(!covered)site.cautions.push('Outside the bundled Jezero data area. No recommendations are made here.');
 if(site.offTraverse)site.cautions.push(`No rover has recorded data within ${FAR_FROM_TRAVERSE_M} m. The ground here is unscouted in this dataset.`);
 if(slopeDeg&&slopeDeg.value>=20)site.cautions.push('Steep per the loaded DEM. Rocks and sand are not modelled.');
 const cls=slopeDeg?classOf(slopeDeg.value):null;
 site.traversability=cls?{class:cls.n,label:cls.label,color:cls.color,range:rangeLabel(cls),slopeDeg:slopeDeg.value,source:'20 m CTX DEM (Mangold et al. 2021), slope only'}:null;
 site.explanation=explainSite(site,cls);
 site.poi=covered&&nearestPano&&panoDist<=POI_SNAP_M?nearestPano.id:null;
 site.recommendations=!covered?[]:site.poi!=null?poiTasks(nearestPano,site,base):recommendExperiments(site,{panos,graph});
 return site;
}

// A readable lead-in, built only from the fields above. No model is involved.
export function explainSite(site,cls){
 const bits=[];
 if(cls)bits.push(`Class ${cls.n} (${cls.label.toLowerCase()}): ${cls.note} Slope ${site.slopeDeg.toFixed(1)}° in a 20 m DEM cell.`);
 else bits.push('No DEM slope for this spot, so no traversability class is given.');
 if(site.nearestPano&&site.panoDist<600)bits.push(`Nearest photographed view: ${site.nearestPano.name}, ${Math.round(site.panoDist)} m away (sol ${site.nearestPano.sol}).`);
 bits.push(site.offTraverse?'No rover has recorded data near here.':`A recorded rover track passes ${Math.round(site.nodeDist)} m away.`);
 bits.push('Slope only: rocks and sand are not modelled.');
 return bits.join(' ');
}
// Tasks that can really be done at a major point of interest (region and place rules from region-tasks.js).
export function poiTasks(pano,site,base){
 const isBase=base&&pano.id===base.id;
 const list=TASKS.filter(t=>isBase?t.atBase&&t.region===regionOf(pano):taskAvailable(t,pano));
 const out=list.map(t=>({id:t.id,name:t.name,min:t.min,score:50,why:[t.why||t.summary],basis:'available at this point of interest'}));
 if(!isBase)out.push({id:'visit',name:'Visit & document',min:8,score:0,why:['Go here without a science task.'],basis:'user-chosen waypoint'});
 return out;
}
// Simple, inspectable scoring over the tasks that belong to the point's own region.
// Suggestions are proposed activities, not detections.
export function recommendExperiments(site,{panos=[]}={}){
 const region=site.region;if(!region)return [];
 const near=site.nearestPano&&site.panoDist<600?site.nearestPano:null;
 return TASKS.filter(t=>t.region===region&&!t.atBase&&(!t.match||(near&&t.match.test(near.name)))).map(t=>{
  let score=10;const why=[];
  if(near&&t.hint.test(near.name)){score+=35;why.push(`${t.why} (nearest panorama: ${near.name}, ${Math.round(site.panoDist)} m).`)}
  else why.push(t.why);
  if(site.slopeDeg!=null&&site.slopeDeg>=15){score-=15;why.push('Steep per the DEM: take extra care.')}
  if(site.offTraverse){score-=8;why.push('No rover data nearby, so the ground is unscouted.')}
  return {id:t.id,name:t.name,score:Math.max(0,Math.round(score)),why,basis:'rule-based suggestion'};
 }).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
}
