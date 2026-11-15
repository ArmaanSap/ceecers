import urllib.request as U,urllib.parse as P,json,concurrent.futures
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'dist/assets'
def get(v):
 name,iid,pt=v;u='https://oderest.rsl.wustl.edu/live2/?'+P.urlencode(dict(query='product',target='mars',ihid='mro',iid=iid,pt=pt,minlat=18.40,maxlat=18.52,westernlon=77.36,easternlon=77.48,output='json',results='copmf',limit=30))
 try:
  d=json.loads(U.urlopen(u,timeout=30).read());(out/(name+'.json')).write_text(json.dumps(d));print(name,d['ODEResults'].get('Count'),d['ODEResults'].get('Error'))
 except Exception as e:print(name,str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:list(p.map(get,[('hirise','HIRISE','RDRV11'),('ctx','CTX','EDR'),('dtms','HIRISE','DTM')]))
