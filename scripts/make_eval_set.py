"""Build a blind labelling set to measure the terrain model on the REAL Mastcam-Z panoramas.
Samples points the model judged to be ground, stratified by predicted class, crops them from the full-resolution panorama and writes
tools/terrain-eval/ (open label.html, label ~80 crops in 5 minutes, get accuracy and a confusion matrix)."""
import json,os,random,sys
import numpy as np
from PIL import Image,ImageDraw
sys.path.insert(0,os.path.dirname(__file__))
import run_terrain_model as R
OUT=os.path.join(os.path.dirname(__file__),'..','tools','terrain-eval');os.makedirs(os.path.join(OUT,'crops'),exist_ok=True)
rng=random.Random(7);CROP=192;PER_CLASS=20;MAX_PER_PANO=5
data=json.load(open(os.path.join(R.ROOT,'data.json')));cands={c:[] for c in R.CLASSES}
for p in data['panoramas']:
    im=Image.open(os.path.join(R.ROOT,'..',p['image'])).convert('RGB');m,_=R.classify(im);ok,near=R.ground_mask(im,m.shape[1],m.shape[0])
    ok=ok&~((m==3)&near);half=CROP//2//R.SCALE+1
    from scipy import ndimage as ndi
    safe=ndi.binary_erosion(ok,iterations=half)   # whole crop must be analysed ground, so the label is about ground, not rover or sky
    for ci,c in enumerate(R.CLASSES):
        ys,xs=np.where(safe&(m==ci))
        if len(ys):
            idx=rng.sample(range(len(ys)),min(len(ys),MAX_PER_PANO))
            cands[c]+= [(p['id'],p['name'],int(xs[i]),int(ys[i])) for i in idx]
    print(p['id'],{c:len(v) for c,v in cands.items()},flush=True)
chosen=[]
for c in R.CLASSES:
    v=cands[c];rng.shuffle(v);chosen+=[(c,)+t for t in v[:PER_CLASS]]
rng.shuffle(chosen);key=[]
cache={}
for n,(c,pid,name,x,y) in enumerate(chosen):
    pano=cache.get(pid) or Image.open(os.path.join(R.ROOT,'..',[q for q in data['panoramas'] if q['id']==pid][0]['image'])).convert('RGB');cache={pid:pano}
    cx,cy=x*R.SCALE+R.SCALE//2,y*R.SCALE+R.SCALE//2;box=(cx-CROP//2,cy-CROP//2,cx+CROP//2,cy+CROP//2);crop=pano.crop(box)
    d=ImageDraw.Draw(crop);m_=CROP//2
    for dx,dy in ((-1,0),(1,0),(0,-1),(0,1)):d.line((m_+dx*10,m_+dy*10,m_+dx*22,m_+dy*22),fill=(255,0,255),width=2)   # four ticks pointing at the centre pixel
    crop.save(os.path.join(OUT,'crops',f'c{n:03d}.jpg'),quality=88);key.append({'file':f'crops/c{n:03d}.jpg','pred':c,'pano':pid,'name':name})
open(os.path.join(OUT,'key.js'),'w').write('window.KEY='+json.dumps(key)+';')
print('wrote',len(key),'crops; per predicted class',{c:sum(k['pred']==c for k in key) for c in R.CLASSES})
