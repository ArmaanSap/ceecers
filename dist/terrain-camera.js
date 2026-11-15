export const MARS_SR={wkid:104971};
export function poiExtent(pois=[],base){
 const coords=pois.map(p=>p.coord).filter(c=>c&&Number.isFinite(c[0])&&Number.isFinite(c[1]));if(base)coords.push([base.longitude,base.latitude]);
 if(!coords.length)return {type:'extent',xmin:77.36,ymin:18.4,xmax:77.48,ymax:18.52,spatialReference:MARS_SR};
 const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]);let xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),px=Math.max(.008,(xmax-xmin)*.18),py=Math.max(.008,(ymax-ymin)*.18);
 return {type:'extent',xmin:xmin-px,ymin:ymin-py,xmax:xmax+px,ymax:ymax+py,spatialReference:MARS_SR};
}

// ---- walking-simulator camera (pure; the scene applies the result with view.goTo) ----
export const M_PER_DEG_LAT=59274,M_PER_DEG_LON=56200;   // same local scale used by routing.js at Jezero
export const EYE_HEIGHT_M=1.7;
export function offsetCoord(c,headingDeg,meters){const h=headingDeg*Math.PI/180;return [c[0]+Math.sin(h)*meters/M_PER_DEG_LON,c[1]+Math.cos(h)*meters/M_PER_DEG_LAT]}
// mode: overhead | topfollow | follow | free | first | third.
// 'free' and 'overhead' return null: the scene keeps the user's camera / the fixed top-down route framing (see terrain.js).
export function walkerCamera(mode,coord,heading,groundZ){
 if(mode==='free'||mode==='overhead'||!coord)return null;
 const z=Number.isFinite(groundZ)?groundZ:Number.isFinite(coord[2])?coord[2]:0;
 const cam=(c,up,tilt,h=heading)=>({position:{x:c[0],y:c[1],z:z+up,spatialReference:MARS_SR},heading:h,tilt});
 if(mode==='first')return cam(coord,EYE_HEIGHT_M,88);
 if(mode==='third')return cam(offsetCoord(coord,heading,-14),7,72);
 if(mode==='topfollow')return cam(coord,700,0,0);
 return cam(offsetCoord(coord,heading,-120),70,55);   // follow
}
export function walkerMessageValid(m){return m&&Array.isArray(m.coord)&&Number.isFinite(m.coord[0])&&Number.isFinite(m.coord[1])&&Number.isFinite(m.heading)&&['overhead','topfollow','follow','free','first','third'].includes(m.mode)}
