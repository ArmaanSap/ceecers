export const COS=Math.cos(18.46*Math.PI/180);
export function scaleFor(w,h,z){return Math.max(w/(.12*COS),h/.12)*z}
export function worldZoom(w,h){return Math.min(w/(360*COS),h/180)/scaleFor(w,h,1)*.94}
export function projectPoint(c,v,w,h){let s=scaleFor(w,h,v.zoom);return [w/2+(c[0]-v.lon)*COS*s,h/2+(v.lat-c[1])*s]}
export function unprojectPoint(p,v,w,h){let s=scaleFor(w,h,v.zoom);return [v.lon+(p[0]-w/2)/(s*COS),v.lat-(p[1]-h/2)/s]}
export function clampView(v,w,h){v.zoom=Math.max(worldZoom(w,h),Math.min(12,v.zoom));let s=scaleFor(w,h,v.zoom),hx=w/(2*s*COS),hy=h/(2*s);v.lon=hx>=180?0:Math.max(-180+hx,Math.min(180-hx,v.lon));v.lat=hy>=90?0:Math.max(-90+hy,Math.min(90-hy,v.lat));return v}
export function zoomAt(v,f,p,w,h){let a=unprojectPoint(p,v,w,h);v.zoom=Math.max(worldZoom(w,h),Math.min(12,v.zoom*f));let b=unprojectPoint(p,v,w,h);v.lon+=a[0]-b[0];v.lat+=a[1]-b[1];return clampView(v,w,h)}
