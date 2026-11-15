// MARVIN traversability class (I to VIII): one readable score per point, in the spirit of the USDA Land Capability
// Classification format used for farmland (a roman numeral first, then the facts behind it). It is NOT the USDA scale.
// It uses ground slope from the 20 m DEM only. Rocks, sand and suit limits are not modelled.
export const CLASSES=Object.freeze([
 {n:'I',max:2,label:'Flat',color:'#3dff7a',note:'Level ground. Walk at full speed.'},
 {n:'II',max:4,label:'Nearly flat',color:'#8dff5a',note:'Barely any grade.'},
 {n:'III',max:6,label:'Gentle',color:'#d4ff3d',note:'Gentle slope, normal pace.'},
 {n:'IV',max:9,label:'Moderate',color:'#ffe23d',note:'Noticeable slope; pace slows a little.'},
 {n:'V',max:13,label:'Rising',color:'#ffbf1f',note:'Steady climb; plan extra time.'},
 {n:'VI',max:17,label:'Steep',color:'#ff9a1a',note:'Steep; slow going.'},
 {n:'VII',max:20,label:'Very steep',color:'#ff6a1a',note:'At the edge of the 20° planning limit.'},
 {n:'VIII',max:Infinity,label:'Above limit',color:'#ff3b3b',note:'Above the 20° planning limit. Avoid.'}
]);
export const classOf=deg=>Number.isFinite(deg)?CLASSES.find(c=>deg<c.max)||CLASSES.at(-1):null;
export const classIndex=deg=>{const c=classOf(deg);return c?CLASSES.indexOf(c):-1};
export const rangeLabel=c=>{const i=CLASSES.indexOf(c),lo=i?CLASSES[i-1].max:0;return c.max===Infinity?`${lo}°+`:`${lo}–${c.max}°`};
