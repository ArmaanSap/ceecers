// Region-specific field tasks, varied instruction details, and arrival directions.
// Every task belongs to exactly one region. The topic of a task never changes; the details
// (what to look for, how to record it) are re-drawn each time instructions are shown.
// Search targets are things to LOOK FOR. Naming a mineral or feature here is not a claim that it is present.
import {REGIONS} from './mission-flow.js';
import {SAMPLE_HANDOFF} from './sample-mission.js';

export const regionOf=p=>REGIONS.find(r=>r.accept(p))?.id||null;
export const pick=(rng,arr)=>arr[Math.min(arr.length-1,Math.floor(rng()*arr.length))];
export const pickN=(rng,arr,n)=>{const a=[...arr],out=[];while(a.length&&out.length<n)out.push(a.splice(Math.min(a.length-1,Math.floor(rng()*a.length)),1)[0]);return out};
export const NOTE='Visual search targets only. Identifying a mineral or feature needs instrument analysis.';

export const TASKS=Object.freeze([
 // ---------------- CRATER FLOOR ----------------
 {id:'floor-rock',region:'floor',name:'Floor rock survey',icon:'◇',min:20,gear:'Hand lens, scale card, rock hammer (simulated)',
  hint:/Outcrop|Seitah|Rocks|Van Zyl/,why:'Photographed outcrops and floor rocks are close by.',
  summary:'Compare the rocks on the crater floor and record which kinds you find.',
  compose:r=>{const t=pick(r,['small pits (vesicle-like holes) in a dark, fine-grained rock','pale, elongated crystals sitting in a darker matrix','glassy green-tinged grains (a candidate olivine-like texture)','dark, blocky crystals with a metallic sheen','a rock with a clean, dust-free face next to a dust-coated one','thin, flat layers rather than a solid, massive block','a surface crust or coating that flakes away from the rock']);
   return {target:t,steps:[`Walk a slow ring about ${pick(r,[10,15,20])} m across and look for ${t}.`,`Photograph the best example with the scale card beside it. Shoot ${pick(r,['from above','at ground level','from the side the sun hits'])} first.`,`Compare it with ${pick(r,['the next-closest rock','a rock of a different colour','the largest boulder in view'])} and note one difference.`],record:`Record: where you saw ${t}, how many rocks showed it (${pick(r,['none','1–2','3–5','more than 5'])} is a useful bucket), and one alternative explanation.`}}},
 {id:'ripples',region:'floor',name:'Wind ripple survey',icon:'≈',min:15,gear:'Compass, ruler, camera',
  hint:/Horizon|Landing|Van Zyl/,why:'Open floor terrain where wind-blown ripples collect.',
  summary:'Measure the wind-blown ripples and dust on the open floor.',
  compose:r=>{const t=pick(r,['the direction the ripple crests run (use the compass)','how far apart the crests are, in boot-lengths','whether the ripple crests are sharp or rounded','which side of a rock the dust piles up on','whether ripple troughs are lighter or darker than the crests','the tallest ripple within 10 m']);
   return {target:t,steps:[`Stand at the edge of the nearest ripple field and measure ${t}.`,`Repeat at ${pick(r,['two','three'])} more spots, ${pick(r,[5,8,12])} m apart, and compare.`,`Take one photo along the crest line and one across it.`],record:`Record: your ${pick(r,['three','two','four'])} measurements of ${t}, and whether they agree.`}}},
 {id:'landing-zone',region:'floor',name:'Landing-area landmarks',icon:'◎',min:12,gear:'Camera, compass, notebook',
  hint:/Landing|Horizon/,why:'Close to the landing area and its horizon views.',
  summary:'Identify and log landmarks around the landing area from the ground.',
  compose:r=>{const t=pick(r,['the crater rim on the horizon','the steepest slope you can see','the darkest patch of ground in view','the largest boulder within 50 m','a notch or gap in the horizon line','the brightest, lightest-toned surface']);
   return {target:t,steps:[`Turn slowly through a full circle and pick out ${t}.`,`Take a compass bearing to it and estimate the distance (${pick(r,['paces','boot-lengths','tens of metres'])}).`,`Photograph it with something in the foreground for scale.`],record:`Record: the bearing and estimated distance to ${t}, and one thing that would make it easy to find again.`}}},
 // ---------------- DELTA EDGE ----------------
 {id:'strata',region:'delta',name:'Delta layer record',icon:'☰',min:25,gear:'Field notebook, hand lens, scale card',
  hint:/Ridge|Scarp|Falls|Lake|Harbor/,why:'Delta-side viewpoints with exposed layering.',
  summary:'Record the layers exposed at the delta edge: thickness, tilt and colour.',
  compose:r=>{const t=pick(r,['the thickest single layer, measured in boot-lengths','which way the layers tilt (toward or away from the crater centre)','a boundary where coarse layers meet fine ones','three layers and their colours, top to bottom','whether the layers are flat, wavy or crossed by finer lines','a layer that sticks out more than its neighbours']);
   return {target:t,steps:[`Face the exposed face and find ${t}.`,`Sketch the face in the notebook with at least ${pick(r,['three','four','five'])} labelled layers.`,`Photograph the face with the scale card at the ${pick(r,['top','middle','bottom'])}.`],record:`Record: ${t}, plus one alternative interpretation of how the layers formed.`}}},
 {id:'boulders',region:'delta',name:'Delta-front boulder census',icon:'●',min:18,gear:'Tape or scale card, tally sheet',
  hint:/Depot|Harbor|Lake|Falls/,why:'Boulder fields lie near the delta front.',
  summary:'Count and describe boulders near the delta front.',
  compose:r=>{const size=pick(r,['0.5 m','1 m','1.5 m']),t=pick(r,['rounded versus angular boulders','boulders with a visible coating','boulders that have split in place','boulders lying in a line or cluster','the single biggest boulder in the circle','boulders with flat, layered tops']);
   return {target:t,steps:[`Mark a ${pick(r,[8,10,12])} m circle by pacing out from where you stand.`,`Count boulders larger than ${size}, sorted by ${t}.`,`Photograph the ${pick(r,['biggest','most unusual','roundest','most angular'])} one with the scale card.`],record:`Record: counts for ${t}, and whether the pattern changes ${pick(r,['toward the delta face','away from the delta face','along the slope'])}.`}}},
 {id:'depot',region:'delta',match:/Depot/,name:'Sample-depot inspection',icon:'▥',min:20,gear:'Camera, scale card, checklist',
  hint:/Depot/,why:'This is the sample-depot viewpoint.',
  summary:'Inspect the sample depot area and log the layout of the tube caches.',
  compose:r=>{const t=pick(r,['the spacing between the cached tubes','how the tubes sit relative to the surrounding rocks','whether any tube is partly buried in dust or sand','the pattern the caches form on the ground','dust on the tube caps versus on the ground nearby']);
   return {target:t,steps:[`Approach slowly, keeping ${pick(r,[3,5,8])} m back, and photograph the whole depot area first.`,`Look closely at ${t}.`,`Make a simple map of the layout with a north arrow.`],record:`Record: ${t}, and the photo numbers that show it. Do not touch the caches (simulation).`}}},
 {id:'sample',region:'delta',atBase:true,name:SAMPLE_HANDOFF.name,icon:'▣',min:SAMPLE_HANDOFF.min,gear:SAMPLE_HANDOFF.gear,
  hint:/Rose River/,why:'The base is at the delta edge.',
  summary:SAMPLE_HANDOFF.task,
  compose:r=>{const t=pick(r,['the tube ID against the transfer sheet','the seal for dust or scratches','the carrier latch and tamper tag','the date sealed against the log','the carrier orientation (cap end up)']);
   return {target:t,steps:[`Check ${t} first.`,`Photograph the carrier from ${pick(r,['two','three'])} sides before you open the transfer.`,`Read each log line aloud as you sign it.`],record:'Record: custody log signed, carrier stowed, any difference from the sheet. Hypothetical rendezvous; not a real sample.'}}},
 // ---------------- UPPER TRAVERSE ----------------
 {id:'vantage',region:'upper',match:/Peak|Mountain|Pass|Dream/,name:'High-ground vantage panorama',icon:'△',min:15,gear:'Camera, compass, notebook',
  hint:/Peak|Mountain|Pass|Dream/,why:'High ground with a long view.',
  summary:'Use the height to log the far horizon and what you can see from here.',
  compose:r=>{const t=pick(r,['the far crater rim','the delta, as far away as you can still see it','the lowest point of the horizon','the sharpest peak or ridge line','the darkest large area of ground','a ridge line you could use as a route marker']);
   return {target:t,steps:[`Take a full 360° panorama in ${pick(r,['six','eight','ten'])} overlapping shots.`,`Find ${t} and take a compass bearing.`,`Mark where you would go next and why.`],record:`Record: bearing to ${t}, rough distance, and what blocks the view (if anything).`}}},
 {id:'outcrop-dip',region:'upper',name:'Outcrop contact survey',icon:'◭',min:25,gear:'Compass-clinometer, scale card, notebook',
  hint:/Belva|Ridge|Pass|Dream|Mountain/,why:'Steeper ground exposes rock contacts.',
  summary:'Find where two rock types meet and estimate which way the contact tilts.',
  compose:r=>{const t=pick(r,['where a dark rock meets a pale one','a line where the surface texture changes from smooth to rough','a step in the slope that follows a rock boundary','a thin band of different-coloured rock','a place where one layer cuts across another']);
   return {target:t,steps:[`Search the slope for ${t}.`,`Estimate which way it tilts and roughly how steeply (${pick(r,['flat','gentle','moderate','steep'])} is enough).`,`Photograph it ${pick(r,['straight on','from uphill','from downhill'])} with the scale card.`],record:`Record: where you found ${t}, the tilt direction, and your confidence (low / medium / high).`}}},
 {id:'ridge-weather',region:'upper',name:'Ridge wind and temperature log',icon:'◌',min:12,gear:'Environmental sensor package',
  hint:/Ridge|Peak|Mountain|Pass/,why:'Exposed high ground is windier than the floor.',
  summary:'Log wind, temperature and pressure on exposed high ground.',
  compose:r=>{const t=pick(r,['wind direction from dust streaks','the temperature at head height and at ground level','pressure at the start and end of the stop','whether gusts come in bursts or steadily','the temperature in sun versus in the shade of a rock']);
   return {target:t,steps:[`Set the sensor package down on ${pick(r,['bare rock','a flat patch of sand','the windward side of a boulder'])}.`,`Record ${t} every ${pick(r,[2,3,5])} minutes for ${pick(r,[6,9,12])} minutes.`,`Note anything that might spoil the reading (shade, vehicle heat, dust).`],record:`Record: your readings of ${t} with times. These are simulated, not live data.`}}}
]);

export const VISIT_TASK=Object.freeze({id:'visit',name:'Visit & document',icon:'⌖',min:8,gear:'Camera & notebook',region:null,
 summary:'A waypoint you chose to visit, with no planned science task.',
 compose:r=>{const t=pick(r,['the view back along your route','one thing about this spot that the panorama does not show','how the ground feels underfoot (firm, loose, crusted)','the best photo angle for this spot','anything that changed since the historical panorama was taken']);
  return {target:t,steps:[`Stop and look around. Pay attention to ${t}.`,`Take one photo and one short note.`,`Open the historical panorama and compare it with what you see.`],record:`Record: ${t}.`}}});

export const taskById=id=>TASKS.find(t=>t.id===id)||(id==='visit'?VISIT_TASK:null);
export const tasksForRegion=region=>TASKS.filter(t=>t.region===region);
export const taskAvailable=(t,p)=>!t.atBase&&t.region===regionOf(p)&&(!t.match||t.match.test(p.name));
export const regionHasTask=(t,panos,baseId)=>t.atBase?t.region===regionOf(panos.find(p=>p.id===baseId)||{id:-1}):panos.some(p=>p.id!==baseId&&taskAvailable(t,p));

// Instructions for one task. Pass a random source to get repeatable output in tests.
export function composeInstructions(taskId,rng=Math.random){
 const t=taskById(taskId);if(!t)return null;const c=t.compose(rng);
 return {id:t.id,name:t.name,summary:t.summary,target:c.target,steps:c.steps,record:c.record,note:NOTE,minutes:t.min,gear:t.gear};
}

const COMPASS=['N','NE','E','SE','S','SW','W','NW'],compass=b=>COMPASS[Math.round(((b%360)+360)%360/45)%8];
export const compassName=compass;
// Arrival directions from facts we really have: travel heading, the stop's own panorama, and the next leg.
export function buildDirections({stop,arrivalHeading=null,next=null,nextBearing=null,nextMeters=null,custom=false,returning=false}){
 const d=[];
 if(arrivalHeading!=null)d.push(`You arrive travelling ${compass(arrivalHeading)} (${Math.round(arrivalHeading)}°). Stop here and turn to face the area you want to examine.`);
 d.push(custom?'This is a point you placed on the map. There is no rover panorama here, so use your own view and the camera.':`Open the Mastcam-Z panorama for ${stop.name}${stop.sol!=null?` (sol ${stop.sol})`:''} and match its skyline to what you see. Work within about 15 m of where you stopped.`);
 d.push(returning?'Then carry on back to base.':next?`When finished, head ${compass(nextBearing??0)} (${Math.round(nextBearing??0)}°) for about ${Math.round(nextMeters??0)} m to ${next}.`:'When finished, carry on with the route.');
 return d;
}
