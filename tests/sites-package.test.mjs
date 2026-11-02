import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,cpSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script=fileURLToPath(new URL('../scripts/check-sites-package.py',import.meta.url));
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),'rock-package-guard-')),root=join(directory,'source'),staged=join(directory,'staged'),archive=join(directory,'candidate.tar.gz');
  const put=(base,path,value)=>{const target=join(base,path);mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,typeof value==='string'?value:JSON.stringify(value));};
  const hosting={project_id:'synthetic-sites-fixture',d1:'DB'};
  put(root,'.openai/hosting.json',hosting);put(root,'dist/.openai/hosting.json',hosting);
  for(const name of ['index.js','vinext.js','domain-router.mjs'])put(root,'dist/server/'+name,'export default "synthetic";');
  put(root,'dist/server/wrangler.json',{main:'index.js',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',migrations_dir:'../../migrations'}]});
  put(root,'dist/client/chunk.js','export const synthetic=true;');
  put(root,'migrations/0001_fixture.sql','CREATE TABLE synthetic_fixture(id TEXT);');put(root,'dist/.openai/drizzle/0001_fixture.sql','CREATE TABLE synthetic_fixture(id TEXT);');
  mkdirSync(staged);cpSync(join(root,'dist'),join(staged,'dist'),{recursive:true});
  return {root,staged,put:(path,value)=>put(staged,path,value),run(){
    const tar=spawnSync('tar',['-C',staged,'-czf',archive,'dist'],{encoding:'utf8',env:{...process.env,COPYFILE_DISABLE:'1'},timeout:10000});assert.equal(tar.status,0,tar.stderr);
    return spawnSync('python3',[script,archive,'--root',root],{encoding:'utf8',timeout:10000});
  },close(){rmSync(directory,{recursive:true,force:true});}};
}

void test('package guard reads matching Worker, assets, Site and selected SQL without extraction',()=>{
  const f=fixture();try{const r=f.run();assert.equal(r.status,0,r.stderr);const proof=JSON.parse(r.stdout);assert.equal(proof.status,'PASS');assert.equal(proof.sqlFiles,1);assert.equal(proof.filesCompared,7);assert.equal(proof.publicAcceptance,false);}finally{f.close();}
});

void test('package guard rejects metadata, altered bytes, wrong identity, missing files and links',async t=>{
  const cases={
    metadata:f=>f.put('dist/.openai/drizzle/._0001_fixture.sql','AppleDouble fixture'),
    worker:f=>f.put('dist/server/vinext.js','export default "tampered";'),
    identity:f=>f.put('dist/.openai/hosting.json',{project_id:'another-synthetic-fixture',d1:'DB'}),
    routing:f=>{const p=join(f.staged,'dist/server/wrangler.json');const d=JSON.parse(readFileSync(p,'utf8'));d.assets.run_worker_first=false;writeFileSync(p,JSON.stringify(d));},
    missing:f=>rmSync(join(f.staged,'dist/client/chunk.js')),
    sql:f=>f.put('dist/.openai/drizzle/0001_fixture.sql','DROP TABLE synthetic_fixture;'),
    link:f=>symlinkSync('chunk.js',join(f.staged,'dist/client/link.js')),
  };
  for(const [name,mutate] of Object.entries(cases))await t.test(name,()=>{const f=fixture();try{mutate(f);const r=f.run();assert.equal(r.status,1,r.stdout);assert.match(r.stderr,/Sites package check failed:/);}finally{f.close();}});
});
