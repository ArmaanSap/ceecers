// User-placed points of interest, persisted in localStorage. Storage is injected so it can be tested.
export const POI_KEY='marswalk-custom-pois';
export const MAX_POIS=40;
export const MAX_NAME=60;
export const MAX_NOTE=400;
const clean=(s,n)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);

export function validCoord(lon,lat){return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=-180&&lon<=180&&lat>=-90&&lat<=90}

export function createPoiStore(storage,{key=POI_KEY}={}){
 let pois=[];
 try{const raw=JSON.parse(storage?.getItem(key)||'[]');if(Array.isArray(raw))pois=raw.filter(p=>p&&typeof p.id==='string'&&Array.isArray(p.coord)&&validCoord(p.coord[0],p.coord[1])).slice(0,MAX_POIS).map(p=>({...p,name:clean(p.name,MAX_NAME)||'Custom point',note:clean(p.note,MAX_NOTE),custom:true}))}catch{pois=[]}
 // Names must be unique: routing, the plan panel and CAPCOM all find a stop by its name, so two points called the same thing confuse them.
 const uniqueName=(name,exceptId=null)=>{const taken=new Set(pois.filter(p=>p.id!==exceptId).map(p=>p.name.toLowerCase()));let out=name,k=2;while(taken.has(out.toLowerCase())){const suffix=' '+k++;out=name.slice(0,MAX_NAME-suffix.length)+suffix}return out};
 { const seen=pois.splice(0);for(const p of seen){p.name=uniqueName(p.name);pois.push(p)} }
 const save=()=>{try{storage?.setItem(key,JSON.stringify(pois));return true}catch{return false}};
 const nextId=()=>{let n=1;const used=new Set(pois.map(p=>p.id));while(used.has('custom-'+n))n++;return 'custom-'+n};
 return {
  list:()=>pois.map(p=>({...p})),
  get:id=>{const p=pois.find(p=>p.id===id);return p?{...p}:null},
  add({lon,lat,elev=null,name,note='',experimentIds=[],site=null}){
   if(!validCoord(lon,lat))throw new Error('Invalid coordinates');
   if(pois.length>=MAX_POIS)throw new Error('Limit of '+MAX_POIS+' custom points reached');
   const id=nextId(),poi={id,custom:true,coord:Number.isFinite(elev)?[lon,lat,elev]:[lon,lat],name:uniqueName(clean(name,MAX_NAME)||'Custom point '+id.split('-')[1]),note:clean(note,MAX_NOTE),experimentIds:[...experimentIds],created:new Date().toISOString(),site};
   pois.push(poi);save();return {...poi};
  },
  update(id,patch){const p=pois.find(p=>p.id===id);if(!p)return false;if('useInMission' in patch)p.useInMission=!!patch.useInMission;if(Array.isArray(patch.experimentIds))p.experimentIds=patch.experimentIds.map(String);save();return true},
  rename(id,name){const p=pois.find(p=>p.id===id),n=clean(name,MAX_NAME);if(!p||!n)return false;p.name=uniqueName(n,id);save();return true},
  setNote(id,note){const p=pois.find(p=>p.id===id);if(!p)return false;p.note=clean(note,MAX_NOTE);save();return true},
  remove(id){const n=pois.length;pois=pois.filter(p=>p.id!==id);if(pois.length===n)return false;save();return true},
  clear(){pois=[];save()}
 };
}
