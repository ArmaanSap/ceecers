"""Prepare a color globe from NASA Viking imagery distributed by ASU."""
import urllib.request,io,concurrent.futures,json
from pathlib import Path
from PIL import Image
BASE='https://www.mars.asu.edu/data/mdim_color/'
OUT=Path(__file__).resolve().parents[1]/'dist/assets'
def tile(item):
 x,y,name=item
 with urllib.request.urlopen(BASE+'large/'+name,timeout=40) as r:im=Image.open(io.BytesIO(r.read())).convert('RGB')
 im.thumbnail((1024,1024));return x,y,im
if __name__=='__main__':
 items=[(x,y,f'mars45{hemi}{lon}.png') for y,hemi in enumerate(['n','s']) for x,lon in enumerate(['225','315','045','135'])]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:tiles=list(p.map(tile,items))
 w,h=tiles[0][2].size;result=Image.new('RGB',(w*4,h*2))
 for x,y,im in tiles:result.paste(im,(x*w,y*h))
 result.thumbnail((4096,2048));result.save(OUT/'mars-color.jpg',quality=78,optimize=True)
 (OUT/'globe-source.json').write_text(json.dumps({'name':'Viking Merged Color Mosaic','source':BASE,'bounds':[-180,-90,180,90],'size':result.size,'credit':'NASA Viking Orbiter / USGS / ASU','note':'Prepared from the provider full-resolution tiles, downsampled for the globe. Global context only; local map uses HiRISE.'},indent=2))
 print('Color globe texture prepared',result.size)
