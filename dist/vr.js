// Native WebXR viewer. Cylindrical monoscopic photographs, not reconstructed geometry.
export function cylinderUV([x,y,z],aspect){return [((Math.atan2(x,-z)/(2*Math.PI)+.5)%1+1)%1,.5-y/Math.max(.00001,Math.hypot(x,z))*aspect/(2*Math.PI)]}
export function controllerStep(hand){return hand==='left'?-1:1}
export async function vrSupport(nav=globalThis.navigator,secure=globalThis.isSecureContext){
 if(!secure)return {ok:false,message:'VR requires the HTTPS website. Open MARVIN directly in your headset browser.'};
 if(!nav?.xr)return {ok:false,message:'For immersive VR, open this website in Meta Quest Browser on your Quest 2. The regular panorama viewer still works here.'};
 try{return await nav.xr.isSessionSupported('immersive-vr')?{ok:true,message:'Headset ready. Enter VR, then use right trigger for next, left trigger for previous, and either grip to exit.'}:{ok:false,message:'No immersive VR headset is available in this browser. Open the site directly in Meta Quest Browser.'}}catch{return {ok:false,message:'VR availability could not be checked. Open MARVIN directly in your headset browser and try again.'}}
}
const vertex=`attribute vec2 position; varying vec2 screen; void main(){screen=position;gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;
varying vec2 screen; uniform mat4 projection; uniform mat4 pose; uniform sampler2D panorama; uniform sampler2D hud; uniform float aspect; uniform float fade; uniform float yaw; uniform float clock; uniform float loading;
void main(){
 vec3 eye=normalize(vec3((screen.x+projection[2][0])/projection[0][0],(screen.y+projection[2][1])/projection[1][1],-1.));
 vec3 d=mat3(pose)*eye; float c=cos(yaw),s=sin(yaw); d=vec3(c*d.x-s*d.z,d.y,s*d.x+c*d.z);
 float u=fract(atan(d.x,-d.z)/6.28318530718+.5); float v=.5-d.y/max(.00001,length(d.xz))*aspect/6.28318530718;
 vec3 color=vec3(.055,.075,.065); if(v>=0. && v<=1.)color=texture2D(panorama,vec2(u,v)).rgb*fade;
 // A world-anchored information panel below the starting gaze; no head-locked motion.
 if(d.z<-.01){vec2 p=vec2(d.x/-d.z,d.y/-d.z);vec2 t=vec2(p.x/1.4+.5,(p.y+.62)/.35+.5);if(t.x>=0. && t.x<=1. && t.y>=0. && t.y<=1.)color=texture2D(hud,vec2(t.x,1.-t.y)).rgb;}
 // Subtle helmet visor guides are head-relative; the readable panel stays world-anchored.
 vec2 visor=eye.xy/max(.01,-eye.z);vec2 a=abs(visor);
 float corners=step(.45,a.x)*step(a.x,.65)*step(.32,a.y)*step(a.y,.34)+step(.63,a.x)*step(a.x,.65)*step(.17,a.y)*step(a.y,.34);
 color=mix(color,vec3(.45,.8,.68),min(.45,corners*.45));
 if(loading>.5){float r=length(visor);float angle=atan(visor.y,visor.x);if(r>.065&&r<.075&&sin(angle-clock*2.)>-.35)color=vec3(.65,.88,.72);}
 gl_FragColor=vec4(color,1.);
}`;
export class PanoramaVR{
 constructor({onChange=()=>{},onStatus=()=>{},onEnd=()=>{}}={}){this.onChange=onChange;this.onStatus=onStatus;this.onEnd=onEnd;this.session=null;this.busy=false;this.token=0;this.resources=[];}
 async enter(views,index=0){
  if(this.session||this.starting)return;
  if(!views.length)throw Error('Choose a panorama first.');
  this.starting=true;this.views=[...views];this.index=Math.max(0,Math.min(index,views.length-1));this.failed=new Set();this.lastSelect=0;
  try{
   // Request in the original click activation, before image loads or other async work.
   const session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local']});
   this.session=session;session.addEventListener('end',()=>this.cleanup(),{once:true});
   this.canvas=document.createElement('canvas');const gl=this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,xrCompatible:true});
   if(!gl)throw Error('WebGL is unavailable on this device.');
   await gl.makeXRCompatible();if(this.session!==session)return;
   this.space=await session.requestReferenceSpace('local');if(this.session!==session)return;
   this.layer=new XRWebGLLayer(session,gl,{alpha:false,depth:false,antialias:false,framebufferScaleFactor:1});session.updateRenderState({baseLayer:this.layer});
   this.setupGL();this.aspect=8;this.fade=0;this.yaw=null;
   session.addEventListener('select',e=>{if(this.busy)return;let now=performance.now();if(now-this.lastSelect<350)return;this.lastSelect=now;this.step(controllerStep(e.inputSource.handedness));});
   session.addEventListener('squeezestart',()=>this.exit());
   this.space.addEventListener('reset',()=>{this.yaw=null;});
   this.writeHUD('Loading panorama…');
   session.requestAnimationFrame((t,f)=>this.frame(t,f));
   await this.load(this.index,1);if(this.session===session)this.onStatus('VR active. Right trigger: next. Left trigger: previous. Either grip: exit.');
  }catch(error){if(this.session){try{await this.session.end()}catch{}this.cleanup()}throw error}
  finally{this.starting=false;}
 }
 setupGL(){const gl=this.gl;const shader=(type,source)=>{let s=gl.createShader(type);this.resources.push(['shader',s]);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('VR shader could not compile.');return s};
  let program=this.program=gl.createProgram();this.resources.push(['program',program]);gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('VR renderer could not initialize.');gl.useProgram(program);
  const buffer=gl.createBuffer();this.resources.push(['buffer',buffer]);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  this.uniforms=Object.fromEntries(['projection','pose','panorama','hud','aspect','fade','yaw','clock','loading'].map(k=>[k,gl.getUniformLocation(program,k)]));
  const texture=()=>{let t=gl.createTexture();this.resources.push(['texture',t]);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([14,19,16,255]));return t};
  this.photoTexture=texture();this.hudTexture=texture();this.hudCanvas=document.createElement('canvas');this.hudCanvas.width=1024;this.hudCanvas.height=256;
 }
 writeHUD(message=''){if(!this.gl||!this.hudCanvas)return;const c=this.hudCanvas,g=c.getContext('2d'),p=this.views[this.index];g.fillStyle='#0c1b1a';g.fillRect(0,0,c.width,c.height);g.strokeStyle='#6baf98';g.lineWidth=3;g.strokeRect(8,8,1008,240);g.fillStyle='#91c5b0';g.font='17px monospace';g.fillText('EVA / SURFACE ARCHIVE                                      VISOR DISPLAY',28,30);g.fillStyle='#f3efdf';g.font='28px monospace';g.fillText(`${this.index+1} / ${this.views.length}   ${p.name} · Sol ${p.sol}`,28,70,968);g.font='23px sans-serif';g.fillStyle='#ded0ad';g.fillText(message,28,112,968);g.fillStyle='#f3efdf';g.fillText('Left trigger: previous     Right trigger: next     Grip: exit VR',28,151,968);g.fillStyle='#b8c4b6';g.font='20px sans-serif';g.fillText('Historical 360° photo · no stereo depth · dark areas are not photographed',28,202,968);this.upload(this.hudTexture,c);}
 upload(texture,image){let gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}
 async load(index,direction){if(!this.session)return;this.busy=true;this.fade=0;const token=++this.token,old=this.index;let skipped=0;
  while(index>=0&&index<this.views.length){const p=this.views[index];if(this.failed.has(p.id)){index+=direction;continue}this.index=index;this.writeHUD('Loading next photographed location…');
   try{const im=await new Promise((resolve,reject)=>{const im=new Image();const timeout=setTimeout(()=>reject(Error('Image timeout')),12000);im.onload=()=>{clearTimeout(timeout);resolve(im)};im.onerror=()=>{clearTimeout(timeout);reject(Error('Image unavailable'))};im.src=p.image});if(token!==this.token||!this.session)return;
    const max=Math.min(4096,this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));let source=im;this.aspect=im.naturalWidth/im.naturalHeight;
    if(im.naturalWidth>max||im.naturalHeight>max){let c=document.createElement('canvas'),scale=max/Math.max(im.naturalWidth,im.naturalHeight);c.width=Math.round(im.naturalWidth*scale);c.height=Math.round(im.naturalHeight*scale);c.getContext('2d').drawImage(im,0,0,c.width,c.height);source=c}
    this.upload(this.photoTexture,source);this.fade=1;this.busy=false;let gap=Number.isFinite(p.routeMeters)&&Number.isFinite(this.views[old].routeMeters)?`${Math.round(Math.abs(p.routeMeters-this.views[old].routeMeters))} m along the planned route. `:'';
    this.writeHUD((skipped?'Unavailable image skipped. ':'')+(old!==index?gap+'Jumped across missing imagery.':'Look around; use the triggers to move between views.'));this.onChange(p);return;
   }catch(error){if(token!==this.token||!this.session)return;this.failed.add(p.id);skipped++;index+=direction;}
  }
  this.busy=false;this.writeHUD('No more available images in this direction. Try the other trigger or exit.');
 }
 step(direction){if(this.busy||!this.session)return;let next=this.index+direction;if(next<0||next>=this.views.length){this.writeHUD(direction>0?'End of this walk. Left trigger goes back; grip exits.':'Start of this walk. Right trigger goes forward; grip exits.');return}return this.load(next,direction);}
 frame(time,frame){if(!this.session||frame.session!==this.session)return;this.session.requestAnimationFrame((t,f)=>this.frame(t,f));let gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.layer.framebuffer);gl.clearColor(.055,.075,.065,1);gl.clear(gl.COLOR_BUFFER_BIT);let pose=frame.getViewerPose(this.space);if(!pose)return;
  if(this.yaw===null){const m=pose.transform.matrix;this.yaw=Math.atan2(m[8],m[10]);}
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.photoTexture);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.hudTexture);gl.uniform1i(this.uniforms.panorama,0);gl.uniform1i(this.uniforms.hud,1);gl.uniform1f(this.uniforms.aspect,this.aspect);gl.uniform1f(this.uniforms.fade,this.fade);gl.uniform1f(this.uniforms.yaw,this.yaw);gl.uniform1f(this.uniforms.clock,time/1000);gl.uniform1f(this.uniforms.loading,this.busy?1:0);
  for(const view of pose.views){const v=this.layer.getViewport(view);gl.viewport(v.x,v.y,v.width,v.height);gl.uniformMatrix4fv(this.uniforms.projection,false,view.projectionMatrix);gl.uniformMatrix4fv(this.uniforms.pose,false,view.transform.matrix);gl.drawArrays(gl.TRIANGLES,0,6);}
 }
 async exit(){if(this.session){try{await this.session.end()}catch{this.cleanup()}}}
 cleanup(){this.token++;const gl=this.gl;for(const [type,value] of this.resources){const method={shader:'deleteShader',program:'deleteProgram',buffer:'deleteBuffer',texture:'deleteTexture'}[type];gl?.[method](value)}this.resources=[];this.session=null;this.gl=null;this.canvas=null;this.hudCanvas=null;this.busy=false;this.onEnd();}
}
