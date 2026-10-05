import { readFileSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonical, dependencyAcceptances } from './amc-sky-directives.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
export function sourceFile(root, path) {
  if(typeof path!=='string' || !path || isAbsolute(path) || path.split('/').some(x=>!x || x==='..' || x==='.') || (path.includes('\\') || path.split('').some(c=>c.charCodeAt(0)<32)) || /(^|\/)\.env(?:\.|$)/.test(path)) throw new Error('Invalid source path');
  const absolute=resolve(root,path);
  if(!existsSync(absolute)) return null;
  const actual=realpathSync(absolute), rel=relative(realpathSync(root),actual);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||!lstatSync(actual).isFile()) throw new Error('Source must be a repository file');
  return readFileSync(actual);
}
export async function observeSkyTask({root,goal,taskId,owner,assignee,reviewers,previous,locks=[],evidencePaths=[]}) {
  const specs=JSON.parse(sourceFile(root,'data/amc/sky-directives-v2.json'));
  const registry=JSON.parse(sourceFile(root,'data/amc/sky-contracts-v1.json'));
  const raw=specs.tasks[taskId]; if(!raw) throw new Error('Unknown readiness task');
  const spec={taskId,...raw};
  const task=goal.tasks.find(t=>t.id===taskId); if(!task) throw new Error('Task missing from Goal');
  const contracts=registry.contracts.filter(c=>c.consumerTaskIds.includes(taskId));
  for(const path of [...spec.readPaths,...contracts.flatMap(c=>c.paths)]) if(sourceFile(root,path)===null) throw new Error(`Required source unavailable: ${path}`);
  const paths=[...new Set([...spec.readPaths,...spec.writePaths,...contracts.flatMap(c=>c.paths)])].sort((a,b)=>a.localeCompare(b));
  const sourceInputs=paths.map(path=>({path,hash:sourceFile(root,path)===null?'absent':hash(sourceFile(root,path))}));
  const dependencies=(await dependencyAcceptances({...goal,tasks:goal.tasks.filter(t=>task.dependsOn.includes(t.id))},p=>{const b=sourceFile(root,p);if(!b)throw new Error('Dependency evidence unavailable');return b;}));
  const old=new Map(previous?.sourceInputs?.map(x=>[x.path,x.hash])||[]);
  const contractRefs=contracts.map(c=>({id:c.id,version:c.version,hash:hash(canonical({definition:c,files:sourceInputs.filter(p=>c.paths.includes(p.path))})),changedPaths:previous?c.paths.filter(p=>old.get(p)!==sourceInputs.find(i=>i.path===p)?.hash):[]}));
  const outputEvidence=[...new Set([...(task.result?.evidence||[]),...evidencePaths])].map(path=>{const b=sourceFile(root,path); if(!b)throw new Error('Submitted evidence unavailable');return {path,hash:hash(b)};});
  return {spec, observation:{status:'verified',owner,goalId:goal.id,observedAt:new Date().toISOString(),taskSpecHash:hash(canonical(spec)),requirementRefs:task.requirementIds||[],contractRefs,dependencyAcceptances:dependencies,sourceInputs,assignee,reviewers,locks,outputEvidence,submittedEvidence:outputEvidence}};
}
export function sourceSnapshot(root, paths) {
  const files=[...new Set(paths)].sort((a,b)=>a.localeCompare(b)).map(path=>({path,sha256:sourceFile(root,path)===null?null:hash(sourceFile(root,path))}));
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const changed=execFileSync('git',['status','--porcelain=v1','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  return {observedAt:new Date().toISOString(),head,changedEntries:changed,scopedFiles:files,scopedFingerprint:hash(canonical(files)),remote:'unknown; separate authenticated remote observation required'};
}
