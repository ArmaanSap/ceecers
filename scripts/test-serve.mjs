import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
const port=18000+Math.floor(Math.random()*1000);
const p=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port),ANTHROPIC_API_KEY:'',HOST:'127.0.0.1'},cwd:new URL('..',import.meta.url).pathname});
let out='';p.stdout.on('data',d=>out+=d);
for(let i=0;i<50&&!out.includes('MARVIN at');i++)await new Promise(r=>setTimeout(r,100));
const u=`http://127.0.0.1:${port}`;
try{
 assert.equal(await (await fetch(u+'/healthz')).text(),'ok');
 const r=await fetch(u+'/index.html',{headers:{'accept-encoding':'gzip'}});assert.equal(r.status,200);assert.equal(r.headers.get('content-encoding'),'gzip');assert.ok((await r.text()).includes('<title>'));
 const et=r.headers.get('etag');assert.ok(et);assert.equal((await fetch(u+'/index.html',{headers:{'if-none-match':et}})).status,304);
 const g=await fetch(u+'/assets/media/empty-rover.gif');assert.equal(g.headers.get('content-type'),'image/gif');
 const rg=await fetch(u+'/assets/frozen-star.mp3',{headers:{range:'bytes=0-9'}});assert.equal(rg.status,206);assert.equal((await rg.arrayBuffer()).byteLength,10);
 assert.equal((await fetch(u+'/..%2f..%2fpackage.json')).status,403);assert.equal((await fetch(u+'/%2e%2e/package.json')).status,404);assert.equal((await fetch(u+'/nope')).status,404);assert.equal((await fetch(u+'/%00')).status,400);
 assert.equal((await fetch(u+'/',{method:'DELETE'})).status,405);
 assert.deepEqual(await (await fetch(u+'/api/capcom/status')).json(),{live:false,model:null});
 {const {existsSync}=await import('node:fs');if(existsSync(new URL('../dist/downloads/Marvin-project.zip',import.meta.url)))assert.equal((await fetch(u+'/downloads/Marvin-project.zip',{method:'HEAD'})).status,200)}   // the zip is built after the tests
 console.log('Server: PORT/healthz, gzip, ETag/304, Range, path safety, CAPCOM status passed.');
}finally{p.kill('SIGTERM')}
