// Draws the numbered route notes over the 2D map and opens a popup for the one you click.
// Pure DOM glue: positions come from the map's project(); explaining a note is delegated to explain(note) (CAPCOM).
import {noteText} from './route-notes.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createNotesUI({layer,pop,project,explain,getBounds}){
 let notes=[],openId=null,shown=true;
 const byId=id=>notes.find(n=>n.id===id);
 function close(){openId=null;pop.hidden=true;layer.querySelectorAll('.rnote.open').forEach(e=>e.classList.remove('open'))}
 function paintPop(n,extra){
  pop.innerHTML=`<header><span class="rnbadge ${esc(n.kind)}">${n.n}</span><strong>${esc(n.title)}</strong><button type="button" class="rnclose" aria-label="Close">✕</button></header>
  <p class="rnsum">${esc(n.summary)}</p>
  <ul class="rnwhy">${n.why.map(w=>`<li><b>${esc(w.tag)}</b> ${esc(w.text)}</li>`).join('')}</ul>
  <div class="rnai" aria-live="polite">${extra?`<small>${esc(extra.source)}</small><p>${esc(extra.text)}</p>`:''}</div>
  <footer><button type="button" class="rnask">${extra?'Ask again':'Explain with CAPCOM'}</button></footer>`;
 }
 function place(){
  if(pop.hidden||!openId)return;const n=byId(openId);if(!n)return close();
  const [x,y]=project(n.coord),W=layer.clientWidth||600,H=layer.clientHeight||400,pw=Math.min(300,W-24);
  pop.style.width=pw+'px';pop.style.left=Math.max(12,Math.min(W-pw-12,x-pw/2))+'px';
  pop.style.maxHeight=(H-16)+'px';const ph=Math.min(pop.offsetHeight||220,H-16);pop.style.top=Math.max(8,Math.min(H-ph-8,y>ph+40?y-ph-18:y+22))+'px';
 }
 function open(id,extra=null){
  const n=byId(id);if(!n)return;openId=id;paintPop(n,extra);pop.hidden=false;
  layer.querySelectorAll('.rnote').forEach(e=>e.classList.toggle('open',e.dataset.note===id));place();
  pop.querySelector('.rnclose').onclick=close;
  pop.querySelector('.rnask').onclick=async e=>{
   const b=e.currentTarget;b.disabled=true;b.textContent='CAPCOM is thinking…';
   let r;try{r=await explain(n)}catch{r={text:noteText(n),source:'ROUTE DATA'}}
   if(openId===id)open(id,r);
  };
 }
 layer.addEventListener('click',e=>{const b=e.target.closest('.rnote');if(b){e.stopPropagation();openId===b.dataset.note?close():open(b.dataset.note)}});
 addEventListener('keydown',e=>{if(e.key==='Escape'&&!pop.hidden)close()});
 return {
  set(list){notes=list||[];close();layer.innerHTML=notes.map(n=>`<button type="button" class="rnote ${esc(n.kind)}" data-note="${esc(n.id)}" aria-label="Route note ${n.n}: ${esc(n.title)}">${n.n}</button>`).join('')},
  clear(){notes=[];close();layer.innerHTML=''},
  visible(v){shown=v;layer.hidden=!v;if(!v)close()},
  // reposition on every map draw; hidden when the local map is not showing or the point is off-screen
  update(local,cw,ch){layer.querySelectorAll('.rnote').forEach(el=>{const n=byId(el.dataset.note);if(!n)return;const [x,y]=project(n.coord);el.hidden=!local||!shown||x<8||y<8||x>cw-8||y>ch-8;el.style.left=x+'px';el.style.top=y+'px'});place()},
  open,close,notes:()=>notes,
 };
}
