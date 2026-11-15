// Tiny WebAudio "hardware" sounds: key clicks, relay clunks, a teletype blip. No audio files, synthesised on demand.
// Browsers only allow audio after a user gesture, so the context is created on the first press. Mute is remembered.
let ctx=null,muted=false;
try{muted=localStorage.getItem('marswalk-sfx-muted')==='1'}catch{}
export const isMuted=()=>muted;
export function setMuted(v){muted=!!v;try{localStorage.setItem('marswalk-sfx-muted',muted?'1':'0')}catch{}}
function ac(){if(muted)return null;try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}catch{return null}}
function burst(c,{freq=1800,dur=.03,gain=.06,type='square',slide=0.5}={}){
 const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*slide),t+dur);
 g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.01);
}
export function sfx(name='click'){
 const c=ac();if(!c)return;
 if(name==='click'){burst(c,{freq:2200,dur:.025,gain:.05});setTimeout(()=>burst(c,{freq:900,dur:.02,gain:.03}),22)}
 else if(name==='latch'){burst(c,{freq:600,dur:.05,gain:.07,slide:.4});setTimeout(()=>burst(c,{freq:1500,dur:.02,gain:.04}),45)}
 else if(name==='relay'){burst(c,{freq:300,dur:.09,gain:.09,type:'sawtooth',slide:.3});setTimeout(()=>burst(c,{freq:1200,dur:.03,gain:.05}),80)}
 else if(name==='blip'){burst(c,{freq:880,dur:.06,gain:.04,type:'sine',slide:1})}
 else if(name==='alert'){burst(c,{freq:660,dur:.08,gain:.05,type:'sine',slide:1});setTimeout(()=>burst(c,{freq:880,dur:.08,gain:.05,type:'sine',slide:1}),110)}
}
// Every button or key press on the unit clicks.
export function wireButtons(root=document){
 root.addEventListener('pointerdown',e=>{const b=e.target.closest('button,.keycap,summary,select,[role=button]');if(b&&!b.disabled)sfx('click')},true);
 root.addEventListener('change',e=>{if(e.target.matches('input[type=checkbox],input[type=radio]'))sfx('latch')},true);
}
