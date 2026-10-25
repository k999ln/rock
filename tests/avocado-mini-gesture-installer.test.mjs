import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, copyFile, rm, symlink, link, readdir, lstat, chmod, realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Execute an exact installer copy with only its trusted fixture manifest and fetch
// replaced. Optional original-source path runs the same assertions as a negative
// control; neither mode downloads a model or opens a camera.
const source=process.env.MINI_GESTURE_INSTALLER_SOURCE || new URL('../systems/rock-star-os/targets/avocado-mini/gesture/install-model.mjs',import.meta.url);
const modelURL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const options={skip:process.platform==='win32'};
const runner=`
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(await fs.readFile(join(root,'config.json'),'utf8'));
const folder=join(root,'gesture/runtime/models'), target=join(folder,'hand_landmarker.task');
const report={fetchCalls:0,privateTemporaryChecked:false};
process.on('exit',()=>writeFileSync(join(root,'report.json'),JSON.stringify(report)));
const originalLink=fs.link, originalOpen=fs.open;
fs.link=async(from,to)=>{
  assert.equal((await fs.stat(dirname(from))).mode & 0o777,0o700);
  const st=await fs.lstat(from);assert.ok(st.isFile());assert.equal(st.mode & 0o777,0o600);assert.equal(st.nlink,1);
  report.privateTemporaryChecked=true;
  if(config.scenario==='publish-error')throw Error('fixture_publish_error');
  if(config.scenario==='publish-race')await fs.symlink(join(root,'outside/marker'),target);
  if(config.scenario==='publish-file-race')await fs.writeFile(target,'race-owned-file');
  return originalLink(from,to);
};
fs.open=async(path,...args)=>{
  const fd=await originalOpen(path,...args);
  if(String(path).endsWith('/model') && ['write-error','temporary-tamper'].includes(config.scenario)){
    const originalWrite=fd.writeFile.bind(fd);
    fd.writeFile=async()=>{await originalWrite('partial fixture bytes');if(config.scenario==='write-error')throw Error('fixture_write_error');};
  }
  return fd;
};
syncBuiltinESMExports();
globalThis.fetch=async(url,opts)=>{
  report.fetchCalls++;assert.equal(url,config.expectedURL);assert.equal(opts.redirect,'error');assert.ok(opts.signal instanceof AbortSignal);
  if(config.scenario==='network-error')throw Error('fixture_network_error');
  if(config.scenario==='fetch-target-race')await fs.symlink(join(root,'outside/marker'),target);
  if(config.scenario==='stream-error')return {ok:true,body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.error(Error('fixture_stream_error'));}})};
  if(config.scenario==='redirected')return {ok:true,redirected:true,body:new ReadableStream()};
  if(config.scenario==='http-error')return new Response('unavailable',{status:503});
  const bytes=config.scenario==='oversize'?Buffer.alloc(257):config.scenario==='wrong-hash'?Buffer.from('wrong model'):Buffer.from(config.bytes,'base64');
  return new Response(bytes);
};
await import('./gesture/install-model.mjs');
`;
async function fixture(t,scenario='normal') {
  const root=await realpath(await mkdtemp(join(tmpdir(),'mini-installer-test-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const gesture=join(root,'gesture'),runtime=join(gesture,'runtime'),models=join(runtime,'models');
  const target=join(models,'hand_landmarker.task'),legacy=join(models,'hand_landmarker.task.download');
  const outside=join(root,'outside'),marker=join(outside,'marker'),bytes=Buffer.from('synthetic public model bytes\n');
  await mkdir(runtime,{recursive:true});await mkdir(outside);await writeFile(marker,'outside must remain unchanged');
  await copyFile(source,join(gesture,'install-model.mjs'));
  const manifest={url:modelURL,sha256:createHash('sha256').update(bytes).digest('hex'),maxBytes:256};
  await writeFile(join(runtime,'model.json'),JSON.stringify(manifest));
  await writeFile(join(root,'config.json'),JSON.stringify({scenario,expectedURL:modelURL,bytes:bytes.toString('base64')}));
  await writeFile(join(root,'runner.mjs'),runner);
  return {root,runtime,models,target,legacy,outside,marker,bytes,manifest,async run(){
    const before=await readdir(outside);
    const result=spawnSync(process.execPath,[join(root,'runner.mjs')],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:128*1024,env:{...process.env,NODE_OPTIONS:''}});
    assert.equal(result.error,undefined);assert.equal(result.signal,null);
    assert.equal(await readFile(marker,'utf8'),'outside must remain unchanged');
    assert.deepEqual(await readdir(outside),before,'no files may be created through an outside directory link');
    return {...result,report:JSON.parse(await readFile(join(root,'report.json'),'utf8'))};
  }};
}
async function noTemporary(f) {
  assert.deepEqual((await readdir(f.models)).filter(name=>name.startsWith('.hand-landmarker-')),[]);
}
void test('model installer publishes a private regular file and rechecks an unchanged model without fetching',options,async t=>{
  const f=await fixture(t);const result=await f.run();assert.equal(result.status,0,result.stderr);
  assert.equal(result.report.fetchCalls,1);assert.equal(result.report.privateTemporaryChecked,true);
  assert.deepEqual(await readFile(f.target),f.bytes);const st=await lstat(f.target);assert.ok(st.isFile());assert.equal(st.nlink,1);assert.equal(st.mode & 0o777,0o600);await noTemporary(f);
  const again=await f.run();assert.equal(again.status,0,again.stderr);assert.equal(again.report.fetchCalls,0);assert.equal((await lstat(f.target)).ino,st.ino);await noTemporary(f);
});
for(const [name,place,kind] of [
  ['legacy symlink','legacy','symlink'],['legacy hardlink','legacy','hardlink'],['legacy regular file','legacy','file'],['legacy directory','legacy','directory'],['legacy FIFO','legacy','fifo'],
  ['target symlink','target','symlink'],['target hardlink','target','hardlink'],['target regular wrong bytes','target','file'],['target directory','target','directory'],['target FIFO','target','fifo'],
])void test('model installer refuses '+name+' without clobbering or fetching',options,async t=>{
  const f=await fixture(t);await mkdir(f.models);const path=f[place];
  if(kind==='symlink')await symlink(f.marker,path);
  if(kind==='hardlink')await link(f.marker,path);
  if(kind==='file')await writeFile(path,'existing must remain unchanged');
  if(kind==='directory')await mkdir(path);
  if(kind==='fifo')assert.equal(spawnSync('mkfifo',[path]).status,0);
  const before=await lstat(path),result=await f.run();assert.notEqual(result.status,0);assert.equal(result.report.fetchCalls,0);assert.equal((await lstat(path)).ino,before.ino);
  if(kind==='file')assert.equal(await readFile(path,'utf8'),'existing must remain unchanged');await noTemporary(f);
});
for(const kind of ['models-symlink','models-file','models-writable','runtime-symlink'])void test('model installer refuses '+kind+' before network or outside writes',options,async t=>{
  const f=await fixture(t);
  if(kind==='models-symlink')await symlink(f.outside,f.models);
  if(kind==='models-file')await writeFile(f.models,'existing directory-path file');
  if(kind==='models-writable'){await mkdir(f.models);await chmod(f.models,0o777);}
  if(kind==='runtime-symlink'){await copyFile(join(f.runtime,'model.json'),join(f.outside,'model.json'));await rm(f.runtime,{recursive:true});await symlink(f.outside,f.runtime);}
  const result=await f.run();assert.notEqual(result.status,0);assert.equal(result.report.fetchCalls,0);
  if(kind==='models-file')assert.equal(await readFile(f.models,'utf8'),'existing directory-path file');
});
for(const scenario of ['wrong-hash','oversize','network-error','stream-error','http-error','redirected','write-error','temporary-tamper','publish-error'])void test('model installer cleans up after '+scenario,options,async t=>{
  const f=await fixture(t,scenario),result=await f.run();assert.notEqual(result.status,0);assert.equal(result.report.fetchCalls,1);
  assert.deepEqual(await readdir(f.models),[]);await assert.rejects(lstat(f.target),{code:'ENOENT'});
});
for(const scenario of ['fetch-target-race','publish-race','publish-file-race'])void test('model installer preserves a target appearing during '+scenario,options,async t=>{
  const f=await fixture(t,scenario),result=await f.run();assert.notEqual(result.status,0);await noTemporary(f);
  if(scenario==='publish-file-race')assert.equal(await readFile(f.target,'utf8'),'race-owned-file');else assert.ok((await lstat(f.target)).isSymbolicLink());
});
for(const [name,value] of [['url','http://storage.googleapis.com/model'],['url',modelURL+'?alternate=1'],['sha256','invalid'],['maxBytes',10000001],['maxBytes',0],['maxBytes','256']])void test('model installer rejects an invalid manifest '+name+' '+String(value),options,async t=>{
  const f=await fixture(t);f.manifest[name]=value;await writeFile(join(f.runtime,'model.json'),JSON.stringify(f.manifest));
  const result=await f.run();assert.notEqual(result.status,0);assert.equal(result.report.fetchCalls,0);assert.match(result.stderr,/invalid_model_manifest/);
});
