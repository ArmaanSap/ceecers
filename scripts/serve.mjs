// MARVIN server (no dependencies): serves dist/ and the CAPCOM API. Usage: node scripts/serve.mjs [port]
// Put your key in the environment (ANTHROPIC_API_KEY=...) or in a local .env file. It is never sent to the browser.
// Hosting (Railway etc.): listens on $PORT and 0.0.0.0 when PORT is set; /healthz for health checks; gzip, ETag/304 and Range for big assets.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import {makeCapcomApi,loadEnvFile} from './capcom-api.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.join(here,'..','dist');
loadEnvFile(path.join(here,'..','.env'));
const port=+process.argv[2]||+process.env.PORT||8123,host=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
const api=makeCapcomApi();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.onnx':'application/octet-stream','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif','.mp3':'audio/mpeg','.zip':'application/zip','.woff2':'font/woff2','.txt':'text/plain'};
const zippable=new Set(['.html','.js','.mjs','.css','.json','.geojson','.svg','.txt','.wasm','.onnx']),gz=new Map();   // compressed copies kept in memory, keyed by path+mtime
const base={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'}).end('ok');return}
  if(await api.handle(req,res))return;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD, POST'}).end();return}
  let p;try{p=decodeURIComponent(u.pathname)}catch{res.writeHead(400).end();return}
  if(p.includes('\0')){res.writeHead(400).end();return}
  if(p.endsWith('/'))p+='index.html';
  const file=path.normalize(path.join(root,p));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  const st=await fs.promises.stat(file).catch(()=>null);if(!st||!st.isFile()){res.writeHead(404,base).end('Not found');return}
  const ext=path.extname(file),etag=`W/"${st.size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`,type=types[ext]||'application/octet-stream';
  const h={...base,'Content-Type':type,ETag:etag,'Cache-Control':'no-cache','Accept-Ranges':'bytes',Vary:'Accept-Encoding'};
  if(req.headers['if-none-match']===etag){res.writeHead(304,h).end();return}
  const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if(range&&(range[1]||range[2])){
   let a=range[1]?+range[1]:st.size-+range[2],b=range[1]&&range[2]?+range[2]:st.size-1;b=Math.min(b,st.size-1);
   if(!(a>=0&&a<=b)){res.writeHead(416,{...h,'Content-Range':`bytes */${st.size}`}).end();return}
   res.writeHead(206,{...h,'Content-Range':`bytes ${a}-${b}/${st.size}`,'Content-Length':b-a+1});if(req.method==='HEAD'){res.end();return}
   fs.createReadStream(file,{start:a,end:b}).pipe(res);return;
  }
  if(zippable.has(ext)&&st.size>1024&&/\bgzip\b/.test(req.headers['accept-encoding']||'')){
   const key=file+st.mtimeMs;let z=gz.get(key);if(!z){z=zlib.gzipSync(await fs.promises.readFile(file),{level:6});gz.set(key,z)}
   res.writeHead(200,{...h,'Content-Encoding':'gzip','Content-Length':z.length});res.end(req.method==='HEAD'?undefined:z);return;
  }
  res.writeHead(200,{...h,'Content-Length':st.size});if(req.method==='HEAD'){res.end();return}
  fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch(e){console.error('request failed',e?.message);if(!res.headersSent)res.writeHead(500).end('Server error');else res.destroy()}
});
server.listen(port,host,()=>console.log(`MARVIN at http://${host==='0.0.0.0'?'0.0.0.0':'localhost'}:${port}/  ·  CAPCOM: ${api.live?'live Claude ('+api.model+')':'scripted (set ANTHROPIC_API_KEY to enable live)'}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref()});
