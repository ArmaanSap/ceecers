// Tools CAPCOM (live Claude) may call. Definitions are shared by the server (sent to the model) and the page (which executes them).
// The model never touches the page directly: it names a tool and an input, the page validates both and runs it against the real planner,
// and the result goes back to the model. Anything not listed here is refused. Every tool is a plain function of the app, nothing else.
const VIEWS=['orbit','follow','eye','map2d'],PREFS=['panorama','science','short','gentle'];
export const TOOL_DEFS=[
 {name:'assess_route',description:'Facts about the current mission plan: stops, distance, time, climb, steepest DEM slope, walking effort estimate, and how many alternates exist. Call this before judging or comparing routes.',input_schema:{type:'object',properties:{},additionalProperties:false}},
 {name:'list_alternates',description:'The cross-country alternates for the current stops, with their metrics and why each was not chosen.',input_schema:{type:'object',properties:{},additionalProperties:false}},
 {name:'preview_alternate',description:'Show one alternate route (1 to 4) as a dashed line on the map and in 3D. Calling with the same number again hides it.',input_schema:{type:'object',properties:{number:{type:'integer',minimum:1,maximum:4}},required:['number'],additionalProperties:false}},
 {name:'replan',description:'Rebuild the mission with different planner settings. Use when the astronaut asks for a safer, shorter, more scenic or more scientific route. preference: gentle = lower recorded grades, short = shorter distance, panorama = more photo sites, science = more science. max_slope_deg limits track grade.',input_schema:{type:'object',properties:{preference:{type:'string',enum:PREFS},max_slope_deg:{type:'integer',enum:[10,20,30]}},additionalProperties:false}},
 {name:'open_panorama',description:'Open the real Mastcam-Z panorama viewer at the named stop, or at the nearest panorama to the astronaut if no name is given.',input_schema:{type:'object',properties:{stop:{type:'string',maxLength:80}},additionalProperties:false}},
 {name:'set_view',description:'Switch the main view: orbit or follow or eye (the 3D terrain camera), or map2d for the flat map.',input_schema:{type:'object',properties:{view:{type:'string',enum:VIEWS}},required:['view'],additionalProperties:false}},
 {name:'describe_terrain',description:'Terrain AI estimate of the ground in the real Mastcam-Z panorama nearest the astronaut (or at a named stop): share of loose ground (soil or sand) vs rock (bedrock or big rock), about 81% right in the team own hand check, tends to under-report rock. It comes from a SegFormer model the team trained on NASA AI4Mars images; it is an estimate, not a safety rating.',input_schema:{type:'object',properties:{stop:{type:'string',maxLength:80}},additionalProperties:false}},
 {name:'abort_to_base',description:'Abort the simulated walk and return to base by the fastest verified path. Only call when the astronaut clearly asks to abort or head home.',input_schema:{type:'object',properties:{},additionalProperties:false}}
];
export const TOOL_NAMES=new Set(TOOL_DEFS.map(t=>t.name));
const clean=s=>String(s??'').replace(/[\u0000-\u001f]/g,' ').slice(0,80);
// Validate a model-supplied input against the tool's own schema (types, enums, ranges). Returns {ok,input,error}.
export function validateInput(name,input){
 const def=TOOL_DEFS.find(t=>t.name===name);if(!def)return {ok:false,error:'unknown tool'};
 const props=def.input_schema.properties,out={};input=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 for(const k of Object.keys(input))if(!(k in props))return {ok:false,error:`unexpected field ${k}`};
 for(const k of def.input_schema.required||[])if(input[k]==null)return {ok:false,error:`${k} is required`};
 for(const [k,p] of Object.entries(props)){const v=input[k];if(v==null)continue;
  if(p.type==='integer'){if(!Number.isInteger(v)||(p.minimum!=null&&v<p.minimum)||(p.maximum!=null&&v>p.maximum)||(p.enum&&!p.enum.includes(v)))return {ok:false,error:`${k} out of range`};out[k]=v}
  else if(p.type==='string'){if(typeof v!=='string'||(p.enum&&!p.enum.includes(v)))return {ok:false,error:`${k} invalid`};out[k]=clean(v)}}
 return {ok:true,input:out};
}
// Run one tool call against the app. `api` is supplied by the page (see app.js); each member returns a plain JSON-able object.
// Never throws: a failure is returned as {error} so the model can tell the astronaut honestly.
export async function runTool(name,input,api){
 const v=validateInput(name,input);if(!v.ok)return {error:v.error};
 try{
  const fn=api?.[name];if(typeof fn!=='function')return {error:'not available right now'};
  const r=await fn(v.input);return r&&typeof r==='object'?r:{result:r??'done'};
 }catch(e){return {error:String(e?.message||e).slice(0,120)}}
}
