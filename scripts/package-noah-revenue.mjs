import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.argv[2]||'work/noah-revenue-package');
const provenance=JSON.parse(await readFile(resolve(root,'toolkits/noah-revenue-pack/upstream/provenance.json'),'utf8'));
for(const file of provenance.files){
  if(!/^[\w.-]+$/.test(file.file))throw Error('上流ファイル名が不正です。');
  const bytes=await readFile(resolve(root,'toolkits/noah-revenue-pack/upstream',file.file));
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('固定sourceのhashが一致しません。');
  if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==file.blob)throw Error('GitHub blobと固定sourceが一致しません。');
}
await mkdir(out,{recursive:false});
const result=await build({entryPoints:[resolve(root,'toolkits/noah-revenue-pack/cli.mjs')],outfile:resolve(out,'agent.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',metafile:true,logLevel:'silent'});
if(Object.values(result.metafile.outputs).flatMap(o=>o.imports).some(i=>i.external&&!i.path.startsWith('node:')))throw Error('配布に外部依存が残っています。');
for(const file of ['README.md','request.example.json','upstream'])await cp(resolve(root,'toolkits/noah-revenue-pack',file),resolve(out,file),{recursive:true,errorOnExist:true,force:false});
const bytes=await readFile(resolve(out,'agent.mjs'));
await writeFile(resolve(out,'manifest.json'),JSON.stringify({schema:'noah.revenue.package/1',entry:'agent.mjs',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,node:'>=22.13.0',orchestration:'owner-mac',inference:'anonymous-free-cloud-direct',budgetMinor:0},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({directory:out,bytes:bytes.length}));
