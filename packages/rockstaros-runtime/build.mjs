import {copyFile,readFile,writeFile,rm,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import {build} from 'esbuild';
const root=new URL('../../',import.meta.url),captured=new Map(),results=[];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const freeze={name:'freeze-local-inputs',setup(builder){builder.onLoad({filter:/\.(ts|mjs|js)$/},async({path})=>{
 const name=relative(fileURLToPath(root),path).replaceAll('\\','/');
 if(!/^(lib|packages\/rockstaros-runtime)\//.test(name)||name.includes('..'))throw Error('Unexpected source');
 const bytes=await readFile(path),sha=digest(bytes);if(captured.has(name)&&captured.get(name)!==sha)throw Error('Source changed during build: '+name);
 captured.set(name,sha);return {contents:bytes.toString('utf8'),loader:path.endsWith('.ts')?'ts':'js'};
});}};
const shared={name:'shared-runtime-ports',setup(builder){builder.onResolve({filter:/^(\.\/executor\.mjs|\.\/index\.mjs|\.\/node-host\.mjs|\.\/node-service-host\.mjs|.*\/lib\/rockstar-adapters\.ts|.*\/lib\/rockstar-linked-execution\.ts|.*\/lib\/sky-linux-record\.ts)$/},({path})=>({path:path==='./node-host.mjs'?'./node-host.mjs':path==='./node-service-host.mjs'?'./service-host.mjs':'./index.mjs',external:true}));}};
await rm(new URL('./dist/build-inputs.json',import.meta.url),{force:true});
for(const [source,target,node] of [['index','index',false],['doctor','doctor',true],['node-host','node-host',true],['node-service-host','service-host',true],['host-cli','host-cli',true],['linux-manager-executor','linux-manager-executor',true]]){
 const r=await build({absWorkingDir:fileURLToPath(root),entryPoints:[fileURLToPath(new URL('./src/'+source+'.mjs',import.meta.url))],outfile:fileURLToPath(new URL('./dist/'+target+'.mjs',import.meta.url)),bundle:true,platform:node?'node':'neutral',format:'esm',target:node?'node22':'es2022',metafile:true,sourcemap:false,legalComments:'inline',plugins:node?[shared,freeze]:[freeze],...(source==='host-cli'?{banner:{js:'#!/usr/bin/env node'}}:{})});results.push(r);
}
await chmod(new URL('./dist/host-cli.mjs',import.meta.url),0o755);
await copyFile(new URL('../../contracts/rockstaros-portable-runtime.json',import.meta.url),new URL('./dist/runtime-manifest.json',import.meta.url));
const names=[...new Set([...results.flatMap(r=>Object.keys(r.metafile.inputs)),'packages/rockstaros-runtime/build.mjs','contracts/rockstaros-portable-runtime.json'])].sort(),inputs={};
for(const name of names){if(!/^(lib|packages\/rockstaros-runtime|contracts)\//.test(name)||name.includes('..'))throw Error('Unapproved build input');const current=digest(await readFile(new URL(name,root)));if(captured.has(name)&&captured.get(name)!==current)throw Error('Source changed during build: '+name);inputs[name]=current;}
const hash=async name=>digest(await readFile(new URL('./dist/'+name+'.mjs',import.meta.url)));
await writeFile(new URL('./dist/build-inputs.json',import.meta.url),JSON.stringify({schema:'rockstaros.runtime-build/1',inputs,bundleSha256:await hash('index'),nodeHostBundleSha256:await hash('node-host'),nodeServiceBundleSha256:await hash('service-host'),hostCliBundleSha256:await hash('host-cli'),linuxManagerBundleSha256:await hash('linux-manager-executor'),sharedExecutionKernel:'index.mjs',physicalAcceptance:false,manufacturingRelease:false},null,2)+'\n');
