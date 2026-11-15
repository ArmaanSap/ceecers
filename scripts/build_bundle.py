"""Build, watch or verify a complete portable project snapshot (standard library only)."""
from pathlib import Path
import argparse,hashlib,json,time,zipfile,os
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/downloads'; ZIP=OUT/'Marvin-project.zip'; META=OUT/'project-version.json'
ROOT_FILES={'Run-Marvin.bat','Run-Marvin.command','README.md','AGENTS.md','package.json','package-lock.json','requirements.txt','.gitignore','.dockerignore','.env.example','Dockerfile','railway.json'}
DIRS={'dist','scripts','docs','tests','src','public','.githooks'}
def inputs():
 result=[]
 for p in ROOT.rglob('*'):
  r=p.relative_to(ROOT)
  if not p.is_file() or p.is_symlink():continue
  if any(s in {'.git','node_modules','__pycache__','.cache','downloads'} for s in r.parts):continue
  if p.name.startswith('.env') or p.suffix in {'.pem','.key','.pyc','.zip','.tar','.gz'}:continue
  if (len(r.parts)==1 and p.name in ROOT_FILES) or r.parts[0] in DIRS or r.as_posix()=='.openai/hosting.json':result.append(p)
 return sorted(result)
def snapshot():
 files=[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in inputs()]
 fingerprint=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
 return files,fingerprint
def build():
 files,fingerprint=snapshot();OUT.mkdir(parents=True,exist_ok=True)
 if META.exists() and ZIP.exists() and json.loads(META.read_text()).get('source_fingerprint')==fingerprint:return False
 manifest={'project':'MARVIN','format':1,'built_at':datetime.now(timezone.utc).isoformat(),'source_fingerprint':fingerprint,'files':files,'exclusions':['Git history and credentials','Secrets and environment files','Generated archives (avoids self-inclusion)','Browser-local mission settings','External science archives not ingested into the project']}
 temporary=ZIP.with_suffix('.zip.tmp')
 with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for f in files:z.write(ROOT/f['path'],'Marvin/'+f['path'])
  z.writestr('MARVIN/ARCHIVE-MANIFEST.json',json.dumps(manifest,indent=2))
 os.replace(temporary,ZIP)
 metadata={k:v for k,v in manifest.items() if k!='files'};metadata.update(file_count=len(files),zip_bytes=ZIP.stat().st_size,zip_sha256=hashlib.sha256(ZIP.read_bytes()).hexdigest(),download='downloads/Marvin-project.zip')
 tmp=META.with_suffix('.json.tmp');tmp.write_text(json.dumps(metadata,indent=2));os.replace(tmp,META)
 print(f'Updated {ZIP.name}: {len(files)} files, {ZIP.stat().st_size:,} bytes',flush=True);return True
def check():
 files,fingerprint=snapshot();meta=json.loads(META.read_text());assert meta['source_fingerprint']==fingerprint,'ZIP is stale; run npm run bundle'
 assert hashlib.sha256(ZIP.read_bytes()).hexdigest()==meta['zip_sha256'],'ZIP checksum mismatch'
 with zipfile.ZipFile(ZIP) as z:
  assert z.testzip() is None
  assert len(z.namelist())==len(files)+1
  for f in files:assert hashlib.sha256(z.read('Marvin/'+f['path'])).hexdigest()==f['sha256'],f['path']
 print('Project ZIP verified: current inputs, entry hashes and archive checksum match.')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args()
 if args.check:check()
 else:
  build()
  if args.watch:
   print('Watching source files; Ctrl+C stops. Published downloads update after deployment.',flush=True)
   try:
    while True:time.sleep(1);build()
   except KeyboardInterrupt:pass
