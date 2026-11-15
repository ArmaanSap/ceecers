import urllib.request as U,json,math,io,concurrent.futures,re
from PIL import Image
from bs4 import BeautifulSoup
from pathlib import Path
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--input-dir',type=Path,required=True);args=parser.parse_args()
for name in ['waypoints.json','traverse.json','panos.html']:
 if not (args.input_dir/name).is_file():parser.error(f'Missing input: {name}')
OUT=Path(__file__).resolve().parents[1]/'dist/assets'
B=[77.36,18.40,77.48,18.52]
layers={'orbital':('JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',13,'png'),'ctx':('JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',12,'png'),'mola':('Mars_MGS_MOLA_ClrShade_merge_global_463m',7,'jpg'),'thermal':('THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018',9,'png')}
def get(u):return U.urlopen(u,timeout=35).read()
def mosaic(k,v):
 label,z,ext=v; span=180/2**z
 x0=math.floor((B[0]+180)/span);x1=math.floor((B[2]+180)/span)
 y0=math.floor((90-B[3])/span);y1=math.floor((90-B[1])/span)
 im=Image.new('RGB',((x1-x0+1)*256,(y1-y0+1)*256),'#202526')
 def tile(xy):
  x,y=xy;u=f'https://trek.nasa.gov/tiles/Mars/EQ/{label}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}'
  try:return x,y,Image.open(io.BytesIO(get(u))).convert('RGB')
  except Exception as e:print('tile failed',k,x,y,str(e));return x,y,None
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  for x,y,t in pool.map(tile,[(x,y) for x in range(x0,x1+1) for y in range(y0,y1+1)]):
   if t:im.paste(t,((x-x0)*256,(y-y0)*256))
 box=((B[0]+180)/span*256-x0*256,(90-B[3])/span*256-y0*256,(B[2]+180)/span*256-x0*256,(90-B[1])/span*256-y0*256)
 im=im.crop(tuple(round(x) for x in box)); im.resize((1500,1500)).save(OUT/f'{k}.jpg',quality=91)
 print('saved',k,im.size,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda kv:mosaic(*kv),layers.items()))
wp=json.load(open(args.input_dir/'waypoints.json'));tr=json.load(open(args.input_dir/'traverse.json'))
points=[f for f in wp['features'] if B[0]<f['geometry']['coordinates'][0]<B[2] and B[1]<f['geometry']['coordinates'][1]<B[3]]
json.dump({'type':'FeatureCollection','features':points},open(OUT/'waypoints.json','w'))
json.dump(tr,open(OUT/'traverse.json','w'))
s=BeautifulSoup(open(args.input_dir/'panos.html').read(),'html.parser');panos=[]
for a in s.find_all('a'):
 href=a.get('href','')
 if re.match(r'https://maps.planet.fu-berlin.de/jezero/360/\d+$',href):
  im=a.find_next('img');
  # first natural-color image after the interactive link
  while im and ('natural' not in im.get('src','') or 'vertical' in im.get('src','')):im=im.find_next('img')
  if not im:continue
  src=im['src'];m=re.search(r'Sols?(\d+)',src)
  if not m:continue
  sol=int(m[1]); candidates=[f for f in wp['features'] if f['properties']['sol']<=sol]
  if not candidates:pt=wp['features'][0]
  else:pt=max(candidates,key=lambda f:f['properties']['sol'])
  coord=pt['geometry']['coordinates']
  if not (B[0]<coord[0]<B[2] and B[1]<coord[1]<B[3]):continue
  pid=int(href.split('/')[-1]);name=src.split('Mastcam-Z_360_')[-1].split('_Sol')[0].replace('_',' ')
  original=re.sub(r'-\d+x\d+(?=\.jpg)', '',src)
  try:
   data=get(original);img=Image.open(io.BytesIO(data));img.thumbnail((6000,1800));img.convert('RGB').save(OUT/f'pano-{pid}.jpg',quality=88)
  except Exception:
   try:(OUT/f'pano-{pid}.jpg').write_bytes(get(src))
   except:continue
  panos.append({'id':pid,'name':name,'sol':sol,'positionSol':pt['properties']['sol'],'coord':coord,'image':f'assets/pano-{pid}.jpg','source':original,'interactive':href})
  print('pano',pid,name,sol,flush=True)
json.dump({'bounds':B,'panoramas':panos,'retrieved':'2026-11-13','layers':layers},open(OUT/'data.json','w'))
