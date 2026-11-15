"""Run the trained terrain model (SegFormer-B0 fine-tuned on AI4Mars) over every real panorama.
Writes dist/assets/terrain-ai/pano-N.png (RGBA overlay at 1/4 scale) and dist/assets/terrain-ai/summary.json.
Usage: python3 scripts/run_terrain_model.py [--only 1,5] [--preview DIR]"""
import json,sys,os,argparse,numpy as np
import onnxruntime as ort
from PIL import Image
ROOT=os.path.join(os.path.dirname(__file__),'..','dist','assets')
CLASSES=['soil','bedrock','sand','big_rock'];SIZE=384;SCALE=4
MEAN=np.array([0.485,0.456,0.406],np.float32);STD=np.array([0.229,0.224,0.225],np.float32)
COLORS={'soil':(217,164,65),'bedrock':(110,168,255),'sand':(255,226,122),'big_rock':(255,90,71)}
sess=ort.InferenceSession(os.path.join(ROOT,'models','marswalk_terrain.onnx'))
def softmax(l):e=np.exp(l-l.max(0,keepdims=True));return e/e.sum(0,keepdims=True)
def classify(im):
    W,H=im.size;tile=min(H,W);step=max(1,tile//2);w4,h4=W//SCALE,H//SCALE
    acc=np.zeros((4,h4,w4),np.float32);cnt=np.zeros((h4,w4),np.float32)
    xs=list(range(0,max(1,W-tile+1),step));
    if xs[-1]+tile<W:xs.append(W-tile)
    for x0 in xs:
        t=im.crop((x0,0,x0+tile,tile)).resize((SIZE,SIZE),Image.BILINEAR)
        x=((np.asarray(t,np.float32)/255-MEAN)/STD).transpose(2,0,1)[None]
        lg=sess.run(None,{'image':x})[0][0]                       # 4x96x96
        p=softmax(lg);tw=tile//SCALE
        big=np.stack([np.asarray(Image.fromarray(c).resize((tw,tw),Image.BILINEAR)) for c in p])
        # weight tile centre more than edges to hide seams
        g=np.hanning(tw+2)[1:-1];wgt=np.outer(g,g).astype(np.float32)+1e-3
        xa=x0//SCALE;acc[:,:tw,xa:xa+tw]+=big*wgt;cnt[:tw,xa:xa+tw]+=wgt
    return (acc/np.maximum(cnt,1e-6)).argmax(0).astype(np.uint8),acc/np.maximum(cnt,1e-6)
from scipy import ndimage as ndi
def ground_mask(im,w4,h4):
    """True where the pixel is ground the model can judge. The model was trained on ground only (AI4Mars ignores sky, far terrain and the rover),
    so we drop: black no-data from the mosaic, sky above the horizon, and the rover hardware (white/grey/black, i.e. unsaturated pixels)."""
    a=np.asarray(im.resize((w4,h4),Image.BILINEAR),np.float32);mx=a.max(2);mn=a.min(2);sat=(mx-mn)/np.maximum(mx,1)
    black=mx<14
    rover=(sat<0.20)&~black
    rover=ndi.binary_opening(rover,iterations=1);rover=ndi.binary_closing(rover,iterations=4);rover_core=rover;rover=ndi.binary_dilation(rover,iterations=7)|ndi.binary_dilation(black,iterations=2)   # hardware plus a margin: the model labels the rover as rock
    g=ndi.gaussian_filter(a.mean(2),1.2);dy=np.abs(np.diff(g,axis=0,prepend=g[:1]))
    edge=dy>3.0;first=np.where(edge.any(0),edge.argmax(0),0)
    first=ndi.median_filter(first,size=41,mode='nearest')            # one horizon height per column, smoothed
    sky=np.arange(h4)[:,None]<first[None,:]+2
    ok=~(rover|sky);ok=ndi.binary_opening(ok,iterations=2)
    near=ndi.binary_dilation(rover_core,iterations=22)
    return ok,near
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only');ap.add_argument('--preview');a=ap.parse_args()
    data=json.load(open(os.path.join(ROOT,'data.json')));out={};os.makedirs(os.path.join(ROOT,'terrain-ai'),exist_ok=True)
    only=set(a.only.split(',')) if a.only else None
    for p in data['panoramas']:
        if only and str(p['id']) not in only:continue
        im=Image.open(os.path.join(ROOT,'..',p['image'])).convert('RGB');m,prob=classify(im)
        ok,near=ground_mask(im,m.shape[1],m.shape[0]);ok=ok&~((m==3)&near)   # near the rover, 'big rock' is mostly the rover itself
        cov=float(ok.mean())*100
        share={c:(round(float((m[ok]==i).mean())*100,1) if ok.any() else 0.0) for i,c in enumerate(CLASSES)}
        rgba=np.zeros(m.shape+(4,),np.uint8)
        for i,c in enumerate(CLASSES):rgba[(m==i)&ok]=(*COLORS[c],150)
        Image.fromarray(rgba,'RGBA').save(os.path.join(ROOT,'terrain-ai',f"pano-{p['id']}.png"),optimize=True)
        out[str(p['id'])]={'name':p['name'],'share':share,'analysedPct':round(cov,1)}
        if a.preview:
            os.makedirs(a.preview,exist_ok=True);base=im.resize((m.shape[1],m.shape[0]));ov=Image.fromarray(rgba,'RGBA');base=base.convert('RGBA');base.alpha_composite(ov);
            both=Image.new('RGB',(m.shape[1],m.shape[0]*2));both.paste(im.resize((m.shape[1],m.shape[0])),(0,0));both.paste(base.convert('RGB'),(0,m.shape[0]));both.save(os.path.join(a.preview,f"p{p['id']}.jpg"),quality=85)
        print(p['id'],p['name'],share,'analysed',round(cov),'%',flush=True)
    if not only:json.dump({'model':'SegFormer-B0 (nvidia/mit-b0 encoder) fine-tuned on AI4Mars','classes':CLASSES,'colors':{c:'#%02x%02x%02x'%COLORS[c] for c in CLASSES},'panoramas':out},open(os.path.join(ROOT,'terrain-ai','summary.json'),'w'),indent=1)

if __name__=='__main__':main()
