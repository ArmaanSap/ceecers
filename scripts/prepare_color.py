"""Cache the provider's HRSC-pan-sharpened Jezero color map in our map bounds."""
import urllib.request,urllib.parse,math,io,json
from pathlib import Path
from PIL import Image
OUT=Path(__file__).resolve().parents[1]/'dist/assets'
B=[77.36,18.40,77.48,18.52]
BASE='https://maps.planet.fu-berlin.de/jez-bin/wms'
params={'SERVICE':'WMS','VERSION':'1.1.1','REQUEST':'GetMap','LAYERS':'base-hsv','STYLES':'','SRS':'EPSG:49911','BBOX':','.join(str(x*math.pi/180*3396190) for x in B),'WIDTH':1500,'HEIGHT':1500,'FORMAT':'image/png'}
u=BASE+'?'+urllib.parse.urlencode(params)
with urllib.request.urlopen(u,timeout=60) as r:raw=r.read()
im=Image.open(io.BytesIO(raw)).convert('RGB');assert im.size==(1500,1500)
im.save(OUT/'color.jpg',quality=88,optimize=True)
(OUT/'color-source.json').write_text(json.dumps({'bounds':B,'request':u,'source':'https://maps.planet.fu-berlin.de/jezero/','method':'Provider colorized HiRISE/CTX mosaic, pan-sharpened with HRSC color. Not native full-resolution RGB HiRISE.','credit':'ESA/DLR/FU Berlin · NASA/JPL-Caltech/UArizona/USGS','size':list(im.size)},indent=2))
print('Color map saved',im.size)
