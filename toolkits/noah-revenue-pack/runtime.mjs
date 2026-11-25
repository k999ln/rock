import { DatabaseSync } from 'node:sqlite';
import { chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { workStore } from '../../lib/work-store.ts';
import { REVENUE_ROLES, runRevenueStep, revenueDigest } from '../../lib/noah-revenue-pack.ts';

function regular(path,maximum=65536) {
  const s=lstatSync(path);
  if(!s.isFile()||s.isSymbolicLink()||s.size>maximum)throw Error('容量上限以内の通常ファイルが必要です。');
}
export function readJson(path){
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size>65536)throw Error('容量上限以内の通常ファイルが必要です。');
    const bytes=Buffer.alloc(65537);let length=0,count;
    while(length<bytes.length&&(count=readSync(fd,bytes,length,bytes.length-length,null))>0)length+=count;
    if(length>65536)throw Error('JSONの容量上限を超えました。');
    return JSON.parse(bytes.subarray(0,length).toString('utf8'));
  } finally {closeSync(fd);}
}
function writeExclusive(path,value){
  try {writeFileSync(path,value,{flag:'wx',mode:0o600});return true;}
  catch(error){if(error.code==='EEXIST')return false;throw error;}
}
function writeNew(path,value){if(!writeExclusive(path,JSON.stringify(value,null,2)+'\n')){const error=Error('保存先は既に存在します。');error.code='EEXIST';throw error;}}
export function initialize(directory){
  const root=resolve(directory);
  if(existsSync(root))throw Error('初期化先には新しいフォルダを指定してください。');
  mkdirSync(root,{recursive:true,mode:0o700});chmodSync(root,0o700);
  writeNew(join(root,'identity.json'),{schema:'noah.revenue.owner/1',owner:`terminal:${randomUUID()}`,cloud:'anonymous-free-direct',budgetMinor:0});
  return root;
}
export function openRuntime(directory){
  const root=resolve(directory),stat=lstatSync(root);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid?.())throw Error('本人だけが使う0700ディレクトリが必要です。');
  const identityPath=join(root,'identity.json');regular(identityPath);
  const identityStat=lstatSync(identityPath);if((identityStat.mode&0o077)!==0||identityStat.uid!==stat.uid)throw Error('本人IDファイルの権限を確認してください。');
  const identity=readJson(identityPath);
  if(identity.schema!=='noah.revenue.owner/1'||!/^terminal:[a-f0-9-]{36}$/.test(identity.owner)||identity.cloud!=='anonymous-free-direct'||identity.budgetMinor!==0)throw Error('本人用無料接続の設定が不正です。');
  const path=join(root,'work.sqlite');
  // Exclusive creation is atomic; an existing path is never truncated.
  writeExclusive(path,'');regular(path,32*1024*1024);
  const sqlite=new DatabaseSync(path);chmodSync(path,0o600);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS work_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL)');
  const db={prepare(sql){return {bind(...values){const q=sqlite.prepare(sql);return {async first(){return q.get(...values)??null;},async all(){return {results:q.all(...values)};},async run(){return {meta:{changes:Number(q.run(...values).changes)}};}};}};}};
  const store=workStore(db);
  async function checkStopped(){if(existsSync(join(root,'STOP')))throw Error('停止中です。新規送信を行いません。');}
  async function waitUntil(time){while(Date.now()<time){await checkStopped();await new Promise(resolve=>setTimeout(resolve,Math.min(1000,time-Date.now())));}await checkStopped();}
  function stop(){writeExclusive(join(root,'STOP'),'stopped\n');}
  async function run({id,brief,consent},fetcher){
    if(!/^[a-zA-Z0-9-]{1,64}$/.test(id)||typeof brief!=='string'||!brief.trim()||brief.length>3000||consent!=='anonymous-free-direct-v1')throw Error('batch ID・依頼・無料クラウド送信への同意が必要です。');
    const batch={schema:'noah.revenue.batch/1',id,owner:identity.owner,brief,consent,inputSha256:await revenueDigest(brief)};
    const batchFile=join(root,`batch-${id}.json`);
    if(existsSync(batchFile)){if(JSON.stringify(readJson(batchFile))!==JSON.stringify(batch))throw Error('同じbatch IDの依頼が変わっています。');}
    else {await checkStopped();try{writeNew(batchFile,batch);}catch(error){if(error.code!=='EEXIST'||JSON.stringify(readJson(batchFile))!==JSON.stringify(batch))throw error;}}
    let previous='',nextSlot=0;const jobs=[];
    for(const role of REVENUE_ROLES){
      await checkStopped();
      if(!fetcher)await waitUntil(nextSlot);
      const input={db,owner:identity.owner,allowedOwner:identity.owner,consent:true,batchId:id,role:role.id,brief,previous,checkStopped,fetcher};
      let job=await runRevenueStep(input);
      while(job.freeCloud?.state==='waiting'&&job.freeCloud.retryAt<Date.now()+300000&&Date.now()<job.freeCloud.retryDeadline){
        await waitUntil(job.freeCloud.retryAt);job=await runRevenueStep(input);
      }
      jobs.push(job);
      if(job.freeCloud?.state!=='completed')throw Error(`仕事 ${job.id} は ${job.freeCloud?.state}。再送していません。`);
      previous=job.freeCloud.text;
      nextSlot=new Date(job.updatedAt).getTime()+46000;
      const output=join(root,`${id}-${role.id}.md`),text=`# ${role.name}\n\n状態: 下書き・本人確認待ち。収益実績ではありません。\n\n${previous}\n`;
      writeExclusive(output,text);
    }
    return jobs;
  }
  return {db,sqlite,root,owner:identity.owner,run,stop,checkStopped,list:()=>store.list(identity.owner),close:()=>sqlite.close()};
}
