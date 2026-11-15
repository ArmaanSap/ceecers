// HUD minimap: fits the planned route into a small canvas and shows the walker. Pure drawing, no DOM lookups.
export const COSLAT=Math.cos(18.46*Math.PI/180);
export function fitView(points,w,h,pad=14){
 const xs=points.map(p=>p[0]*COSLAT),ys=points.map(p=>p[1]);
 let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const dx=Math.max(x1-x0,1e-5),dy=Math.max(y1-y0,1e-5),s=Math.min((w-2*pad)/dx,(h-2*pad)/dy);
 const ox=(w-dx*s)/2-x0*s,oy=(h+dy*s)/2+y0*s;
 return c=>[c[0]*COSLAT*s+ox,oy-c[1]*s];
}
export function drawMinimap(ctx,w,h,{route=[],stops=[],base=null,pos=null,heading=0,trail=[],discovered=[]}={}){
 ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(4,12,20,.86)';ctx.fillRect(0,0,w,h);
 const pts=[...route,...(base?[base]:[])];if(pts.length<2)return false;
 const P=fitView(pts,w,h);
 ctx.strokeStyle='rgba(94,246,255,.12)';ctx.lineWidth=1;for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(i*w/6,0);ctx.lineTo(i*w/6,h);ctx.moveTo(0,i*h/6);ctx.lineTo(w,i*h/6);ctx.stroke()}
 ctx.beginPath();route.forEach((c,i)=>{const [x,y]=P(c);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle='rgba(94,246,255,.75)';ctx.lineWidth=2;ctx.stroke();
 if(trail.length>1){ctx.beginPath();trail.forEach((c,i)=>{const [x,y]=P(c);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle='#ffb007';ctx.lineWidth=3;ctx.stroke()}
 for(const c of stops){const [x,y]=P(c);ctx.fillStyle='#ffc343';ctx.fillRect(x-3,y-3,6,6)}
 for(const c of discovered){const [x,y]=P(c);ctx.strokeStyle='#ffb007';ctx.strokeRect(x-4,y-4,8,8)}
 if(base){const [x,y]=P(base);ctx.fillStyle='#ffffff';ctx.fillRect(x-5,y-5,10,10);ctx.strokeStyle='#0a160b';ctx.strokeRect(x-5,y-5,10,10)}
 if(pos){const [x,y]=P(pos),a=heading*Math.PI/180;
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#ffb007';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.sin(a)*14,-Math.cos(a)*14);ctx.stroke();   // heading tick
  ctx.lineWidth=1.3;ctx.strokeStyle='#050b06';ctx.fillStyle='#f4f1ec';ctx.beginPath();ctx.roundRect?ctx.roundRect(-4,-1,8,9,2):ctx.rect(-4,-1,8,9);ctx.fill();ctx.stroke();   // body
  ctx.beginPath();ctx.arc(0,-5,4.4,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#e0a11a';ctx.beginPath();ctx.ellipse(0,-4.6,2.9,2.4,0,0,7);ctx.fill();ctx.restore()}
 return true;
}
