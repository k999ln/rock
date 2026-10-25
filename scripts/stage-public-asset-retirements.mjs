import {readFile,readdir,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export async function stageRetiredPublicAssets(root) {
 const record=JSON.parse(await readFile(resolve(root,'data/public-asset-retirements.json'),'utf8'));
 if(record.schema!=='rockstaros-public-asset-retirements/1'||!Array.isArray(record.files))throw Error('Invalid asset retirement manifest');
 const files=record.files;
 for(const entry of files){if(!/^rockstaros\/[a-z0-9-]+\.png$/.test(entry.path)||!/^[a-f0-9]{64}$/.test(entry.sourceSha256))throw Error('Invalid retired asset path/hash');const bytes=await readFile(resolve(root,'public',entry.path));if(createHash('sha256').update(bytes).digest('hex')!==entry.sourceSha256)throw Error('Protected source image changed: '+entry.path);}
 async function scan(folder){for(const item of await readdir(folder,{withFileTypes:true})){if(item.name==='node_modules'||item.name.startsWith('.'))continue;const path=resolve(folder,item.name);if(item.isDirectory())await scan(path);else if(/\.(tsx?|jsx?|mjs|css|html|json|webmanifest|svg)$/.test(item.name)){const text=await readFile(path,'utf8');for(const entry of files)if(text.includes('/'+entry.path)||text.includes(entry.path.split('/').at(-1)))throw Error('Retired image is still referenced by runtime source: '+path);}}}
 for(const folder of ['app','components','lib','public'])await scan(resolve(root,folder));
 // Preflight every original and reference before touching the deployment output.
 for(const entry of files)await rm(resolve(root,'dist/client',entry.path),{force:true});
 return {retiredAssets:files.length,excludedBytes:files.reduce((sum,entry)=>sum+entry.bytes,0),sourceOriginalsPreserved:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await stageRetiredPublicAssets(process.cwd());console.log(JSON.stringify(result));}
