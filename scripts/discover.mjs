// Collect public metadata for human review. Never execute discovered code.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const args=process.argv.slice(2);
if(args.includes('--help')){
  console.log('Usage: npm run discover -- [search words]\nQueries public GitHub repositories and Hugging Face models. Saves data/discovered.json. Product Hunt API is not enabled.');
  process.exit(0);
}
const query=args.join(' ').trim()||'automation';
if(query.length>200)throw new Error('検索語は200文字以内にしてください。');
const root=fileURLToPath(new URL('../',import.meta.url));
async function getJson(url,headers={}) {
 const response=await fetch(url,{headers:{'User-Agent':'Rock-Star-discovery/0.1',...headers},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`HTTP ${response.status}${response.status===403||response.status===429?' (rate limit or access restriction)':''}`);
 return response.json();
}
const jobs=[
 {source:'github',async run(){const u=new URL('https://api.github.com/search/repositories');u.searchParams.set('q',query+' archived:false');u.searchParams.set('sort','updated');u.searchParams.set('per_page','12');const d=await getJson(u,{'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});if(!Array.isArray(d.items))throw new Error('Unexpected GitHub response');return d.items.map(r=>({source:'github',id:r.full_name,name:r.name,description:r.description||'',url:r.html_url,license:r.license?.spdx_id||'REVIEW_REQUIRED',updatedAt:r.updated_at,reviewStatus:'pending',executionEnabled:false}));}},
 {source:'huggingface',async run(){const u=new URL('https://huggingface.co/api/models');u.searchParams.set('search',query);u.searchParams.set('limit','12');u.searchParams.set('sort','lastModified');u.searchParams.set('direction','-1');const d=await getJson(u);if(!Array.isArray(d))throw new Error('Unexpected Hugging Face response');return d.map(r=>({source:'huggingface',id:r.id,name:r.id,description:r.pipeline_tag||'',url:'https://huggingface.co/'+r.id,license:'REVIEW_MODEL_CARD',updatedAt:r.lastModified||null,reviewStatus:'pending',executionEnabled:false}));}}
];
const result=await Promise.allSettled(jobs.map(j=>j.run()));
const records=[];const failures=[];
result.forEach((r,i)=>{if(r.status==='fulfilled')records.push(...r.value);else failures.push({source:jobs[i].source,error:r.reason instanceof Error?r.reason.message:'Unknown error'});});
const report={schemaVersion:1,collectedAt:new Date().toISOString(),query,mode:'review-only',productHunt:'disabled-pending-commercial-permission',records,failures};
await mkdir(resolve(root,'data'),{recursive:true});
await writeFile(resolve(root,'data/discovered.json.tmp'),JSON.stringify(report,null,2)+'\n');
await rename(resolve(root,'data/discovered.json.tmp'),resolve(root,'data/discovered.json'));
console.log(`${records.length} candidates saved for review; ${failures.length} sources failed. No tools were executed or added to the published catalog.`);
for(const error of failures)console.error(`${error.source}: ${error.error}`);
if(failures.length)process.exitCode=1;
