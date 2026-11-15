"""WebXR check with an emulated Quest (IWER): the VR button enables, a session starts, the rig stands on the DEM,
stick walks, A jumps to the next stop, B-less exit restores the orbit camera. Run: python3 scripts/browser-vr.py"""
import http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright
here=os.path.dirname(os.path.abspath(__file__));root=os.path.join(here,'..','dist')
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(s,*a,**k):super().__init__(*a,directory=root,**k)
    def log_message(s,*x):pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8166),Q);threading.Thread(target=srv.serve_forever,daemon=True).start()
iw=open(os.path.join(here,'fixtures','iwer.min.js')).read();fails=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c:fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']);pg=b.new_page(viewport={'width':1400,'height':900});errs=[]
    pg.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1') else r.abort())
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'Failed to load' not in m.text and 'ERR_' not in m.text else None)
    pg.add_init_script(iw+";window.__xrdev=new IWER.XRDevice(IWER.metaQuest3);window.__xrdev.installRuntime({forceInstall:true});")
    pg.goto('http://127.0.0.1:8166/index.html');pg.wait_for_function("!document.body.classList.contains('intro-active')",timeout=90000)
    pg.wait_for_function("!document.querySelector('#vrFab').hidden",timeout=20000)
    ok(True,'floating Enter VR appears once a headset is detected')
    pg.click('#demToggle');pg.wait_for_function("window.__dem",timeout=60000);pg.wait_for_timeout(1500)
    ok(not pg.evaluate("document.querySelector('#demVR').disabled"),'Enter VR is enabled when a headset session is supported')
    pg.evaluate("window.__dem.setRoute([[77.43,18.45],[77.44,18.455]],[{lon:77.43,lat:18.45,name:'BASE',base:true},{lon:77.44,lat:18.455,name:'Test stop',picked:true}])")
    pg.evaluate("window.__dem.vr.setNotes({'Test stop':'A straight line is not allowed here; this route stays under your slope limit.'})")
    pg.click('#vrFab');pg.wait_for_timeout(3000)
    s=pg.evaluate("window.__dem.vr.state()")
    ok(s['on'] and s['inputs']==2,'VR session starts with both controllers')
    ok(pg.evaluate('window.__dem.vr.panelCount()')==8,'a 360 ring of 8 panels (plan, reasons, CAPCOM, terrain, destinations, data, about, controls) surrounds you')
    ok(pg.evaluate("document.querySelector('#vrFab').textContent")=='Exit VR','button turns into Exit VR')
    ok(s['x']>0 and s['z']>0 and s['target']==0,'rig spawns on the map at the first target')
    pg.evaluate("window.__xrdev.controllers.left.updateAxes('thumbstick',0,-1)");a0=pg.evaluate("window.__dem.vr.state()");pg.wait_for_timeout(2000);a1=pg.evaluate("window.__dem.vr.state()")
    pg.evaluate("window.__xrdev.controllers.left.updateAxes('thumbstick',0,0)")
    ok(((a1['x']-a0['x'])**2+(a1['z']-a0['z'])**2)**.5>1,'left stick walks across the terrain')
    pg.evaluate("window.__xrdev.controllers.right.updateButtonValue('a-button',1)");pg.wait_for_timeout(700);pg.evaluate("window.__xrdev.controllers.right.updateButtonValue('a-button',0)");pg.wait_for_timeout(300)
    ok(pg.evaluate("window.__dem.vr.state().target")==1,'A button jumps to the next stop (Martian Base)')
    pg.evaluate("window.__xrdev.controllers.right.updateButtonValue('squeeze',1)");pg.wait_for_timeout(1200)
    e=pg.evaluate("window.__dem.vr.state()")
    ok(not e['on'] and e['x']==0 and pg.inner_text('#demVR').lower()=='enter vr','squeezing a grip exits VR and restores the desktop view and button')
    ok(pg.evaluate("window.__dem.info().view")=='orbit','orbit camera is back')
    ok(not errs,'no page errors'+(' '+str(errs[:2]) if errs else ''))
    b.close()
sys.exit(1 if fails else 0)
