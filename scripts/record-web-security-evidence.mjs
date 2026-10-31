import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const path='docs/evidence/launch/web-security-local-20260917.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
// Run the real response check first. Failure leaves the previous evidence intact.
const raw=execFileSync(process.execPath,['scripts/check-web-security-response.mjs'],{encoding:'utf8'});
const result=JSON.parse(raw);
if(result.status!=='PASS'||result.baseOrigin!=='http://127.0.0.1:8787')throw Error('Unexpected measurement scope');
const previousRaw=readFileSync(path),previous=JSON.parse(previousRaw);
const inputs=Object.fromEntries(Object.keys(previous.inputs).map(file=>[file,hash(readFileSync(file))]));
if(hash(readFileSync('dist/server/domain-router.mjs'))!==inputs['services/sky-web/domain-router.mjs'])throw Error('Built router differs from current source; rebuild before recording');
if(hash(readFileSync('dist/client/sw.js'))!==inputs['public/sw.js'])throw Error('Built Service Worker differs from current source; rebuild before recording');
const evidence={schema:previous.schema,observedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),scope:'LOCAL_PRODUCTION_BUILD_NOT_SITES_DEPLOYMENT',server:previous.server,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),measurement:{nodeVersion:process.version,packageLockSha256:hash(readFileSync('package-lock.json')),rawResultSha256:hash(raw),builtApplicationSha256:hash(readFileSync('dist/server/vinext.js')),entryWrapperSha256:hash(readFileSync('dist/server/index.js')),outerRouterSha256:inputs['services/sky-web/domain-router.mjs']},inputs,result,boundary:{sitesDeploymentVerified:false,canonicalPublicSwRuntimeAccepted:false,canonicalPublicSwUnitContractAccepted:true,nextAction:'Verify the saved Sites deployment separately; this records local HTTP headers, redirect, manifest, SW and static asset responses only. No DB migration, physical-device, financial or general-launch acceptance is implied.'},supersedes:{observedAt:previous.observedAt,sha256:hash(previousRaw),sourceCommit:previous.sourceCommit}};
writeFileSync(path,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({path,status:result.status,headers:result.universalHeaders,routes:result.routes.length,sourceCommit:evidence.sourceCommit}));
