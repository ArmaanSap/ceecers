// "Live views": the real Mastcam-Z panoramas nearest to the astronaut, with distance and compass direction from where they stand.
// The images are historical rover panoramas taken at those places, not a live camera feed.
const DIRS=['N','NE','E','SE','S','SW','W','NW'];
export const compass=deg=>DIRS[Math.round((((deg%360)+360)%360)/45)%8];
export function bearingDeg(a,b){const r=Math.PI/180,y=Math.sin((b[0]-a[0])*r)*Math.cos(b[1]*r),x=Math.cos(a[1]*r)*Math.sin(b[1]*r)-Math.sin(a[1]*r)*Math.cos(b[1]*r)*Math.cos((b[0]-a[0])*r);return (Math.atan2(y,x)/r+360)%360}
export function fmtDist(m){if(!Number.isFinite(m))return '';if(m<1000)return `${Math.max(5,Math.round(m/5)*5)} m`;return `${(m/1000).toFixed(m<10000?2:1)} km`}
// panos: [{id,name,coord:[lon,lat],sol}], from: [lon,lat], dist(a,b) in metres. Returns the nearest n, closest first.
export function nearestViews(panos,from,dist,n=4){
 if(!from||!Array.isArray(from))return [];
 return (panos||[]).filter(p=>Array.isArray(p.coord)&&Number.isFinite(p.coord[0])&&Number.isFinite(p.coord[1]))
  .map(p=>({pano:p,meters:dist(from,p.coord),bearing:bearingDeg(from,p.coord)})).sort((a,b)=>a.meters-b.meters).slice(0,n)
  .map(v=>({...v,dir:compass(v.bearing),label:fmtDist(v.meters)}));
}
