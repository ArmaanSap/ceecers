// Synthetic DEM for tests: W x H cells of ~20 m, elevation from a function of (x_m, y_m), slope computed like the real file.
export function synthTerrain(W,H,elevFn,{cellM=20}={}){
 const R=3396190,D2R=Math.PI/180,lat0=18.45,dlat=cellM/(R*D2R),dlon=cellM/(R*D2R*Math.cos(lat0*D2R));
 const west=77.4,north=lat0+H*dlat/2,south=north-H*dlat,east=west+W*dlon;
 const elev=new Float32Array(W*H),slope=new Uint8Array(W*H);
 for(let r=0;r<H;r++)for(let c=0;c<W;c++)elev[r*W+c]=elevFn(c*cellM,r*cellM);
 for(let r=0;r<H;r++)for(let c=0;c<W;c++){const e=(rr,cc)=>elev[Math.min(H-1,Math.max(0,rr))*W+Math.min(W-1,Math.max(0,cc))];
  const gx=(e(r,c+1)-e(r,c-1))/(2*cellM),gy=(e(r+1,c)-e(r-1,c))/(2*cellM);slope[r*W+c]=Math.min(254,Math.round(Math.atan(Math.hypot(gx,gy))/D2R/0.5))}
 return {version:1,width:W,height:H,bounds:{west,east,south,north},radiusM:R,slopeScaleDeg:0.5,nodataCode:255,slope_b64:Buffer.from(slope).toString('base64'),elev_b64:Buffer.from(elev.buffer).toString('base64'),source:{dem:'synthetic'},
  at:(xm,ym)=>[west+xm/(R*D2R*Math.cos(lat0*D2R)),north-ym/(R*D2R)]};
}
