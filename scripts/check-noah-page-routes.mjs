import { NOAH_REDIRECTS, NOAH_LOCAL_LABS } from '../services/sky-web/noah-page-routes.mjs';
import { writeFileSync } from 'node:fs';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8787');
if (base.username || base.password || base.search || base.hash || !['https:', 'http:'].includes(base.protocol)) throw Error('Use a plain HTTP(S) origin');
const results=[];
async function get(path, expectedStatus, expectedPath) {
  const response=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(20000)});
  const destination=response.headers.get('location');
  if(response.status!==expectedStatus) throw Error(`${path}: ${response.status}, expected ${expectedStatus}`);
  if(expectedPath && new URL(destination,base).pathname!==expectedPath) throw Error(`${path}: unexpected destination`);
  if(destination && new URL(destination,base).origin!==base.origin) throw Error(`${path}: unexpected origin`);
  await response.arrayBuffer(); results.push({path,status:response.status,destination});
  return destination;
}
const pages=new Set(['/noah','/noah/features','/noah/tools','/noah/saved','/noah/local-tools']);
for(const [from,to] of NOAH_REDIRECTS) {
  if(from.includes(':id')) continue; // A real shared-code/catalog record is not fabricated by this route check.
  const source=from.replace(':campusId','nyu').replace(':toolId','mr-citations');
  const expected=to.replace(':campusId','nyu').replace(':toolId','mr-citations');
  const url=await get(source+'?source=route-check&filter=a&filter=b',308,new URL(expected,base).pathname);
  const actual=new URL(url,base);
  if(actual.searchParams.get('source')!=='route-check' || actual.searchParams.getAll('filter').join(',')!=='a,b') throw Error(source+': query lost');
  pages.add(actual.pathname+actual.search);
}
for(const path of pages) await get(path,200);
if(base.hostname==='avoado.si') for(const lab of NOAH_LOCAL_LABS) await get('/os/sky/'+lab,307,'/noah/local-tools');
await get('/noah/unknown-route-check',404);
const report={status:'PASS',baseOrigin:base.origin,checkedAt:new Date().toISOString(),checks:results.length,results};
if(process.argv[3]) writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,baseOrigin:report.baseOrigin,checks:report.checks}));
