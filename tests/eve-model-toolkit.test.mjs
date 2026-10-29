import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
void test('Eve model toolkit controls use synthetic data and no model/Pixel',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'eve-toolkit-ci-'));
  try{
    for(const [command,args] of [
      ['python3',['-m','unittest','discover','-s','toolkits/eve-model','-p','test_*.py','-v']],
      [process.execPath,['--test','toolkits/eve-model/test_bridge.mjs']],
    ]){
      const result=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,
        env:{...process.env,PYTHONPYCACHEPREFIX:temporary}});
      assert.equal(result.status,0,[String(command)+': '+String(result.error?.message??''),String(result.stdout??'').slice(-4000),String(result.stderr??'').slice(-4000)].join('\n'));
    }
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
