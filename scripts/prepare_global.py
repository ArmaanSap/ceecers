"""Cache Mars Trek MOLA global context; fails rather than publishing missing tiles."""
import urllib.request,io,concurrent.futures,json
from pathlib import Path
from PIL import Image
BASE='https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm'
def tile(xy):
 x,y=xy
 with urllib.request.urlopen(f'{BASE}/2/{y}/{x}.jpg',timeout=45) as r: im=Image.open(io.BytesIO(r.read())).convert('RGB')
 return x,y,im
if __name__=='__main__':
 out=Path(__file__).resolve().parents[1]/'dist/assets';image=Image.new('RGB',(2048,1024))
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for x,y,im in pool.map(tile,[(x,y) for y in range(4) for x in range(8)]):image.paste(im,(x*256,y*256))
 image.save(out/'mars-global.jpg',quality=90)
 (out/'global-source.json').write_text(json.dumps({'name':'Mars Global Surveyor MOLA color-shaded relief','bounds':[-180,-90,180,90],'source':BASE,'tileLevel':2,'note':'Global elevation context; local mission data remains in Jezero.'},indent=2))
 print('Global Mars image cached')
