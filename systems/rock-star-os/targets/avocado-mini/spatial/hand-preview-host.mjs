import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandPreview} from './hand-preview.mjs';
import {createLocalDraftApp} from './runtime.mjs';
// Only ephemeral local draft movement. No synthetic-ray promotion or real Tool.
if(process.platform!=='linux')throw Error('LINUX_CAMERA_HOST_REQUIRED');
const args=process.argv.slice(2);
if(args.length!==3||args[0]!=='--allow-local-capture'||args[1]!=='--allow-local-draft-only')throw Error('Usage: hand-preview-host.mjs --allow-local-capture --allow-local-draft-only PRIVATE_PROFILE');
const path=resolve(args[2]),s=await stat(path);if(s.uid!==process.getuid()||(s.mode&0o022)||s.size>32768)throw Error('OWNER_PROFILE_REQUIRED');
const raw=await readFile(path),p=JSON.parse(raw);
if(!Number.isSafeInteger(p.expiresUnixMs)||p.expiresUnixMs<=Date.now())throw Error('PROFILE_EXPIRED');
const preview=createHandPreview({profileSha256:createHash('sha256').update(raw).digest('hex'),modelSha256:p.modelSha256,calibrationId:p.calibrationId,placeEpoch:p.placeEpoch});
const draft=createLocalDraftApp();
const source=resolve(dirname(fileURLToPath(import.meta.url)),'../linux/hand_landmark_observer.py');
const child=spawn('/usr/bin/python3',[source,'--profile',path,'--allow-local-capture','--frames','100'],{stdio:['ignore','pipe','pipe'],shell:false});
let pending='',stopped=false,killTimer=null;
function stop(){if(stopped)return;stopped=true;preview.revoke();child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),1500);killTimer.unref();}
const deadline=setTimeout(stop,12000);process.once('SIGINT',stop);process.once('SIGTERM',stop);process.stdout.on('error',stop);
function emit(e){if(!process.stdout.write(JSON.stringify(e)+'\n'))throw Error('HAND_PREVIEW_BACKPRESSURE');}
let errorTail='';child.stderr.setEncoding('utf8');child.stderr.on('data',s=>{errorTail=(errorTail+s).slice(-1024);});
const ended=new Promise((ok,no)=>{child.once('error',no);child.once('close',(code)=>code===0?ok():no(Error('HAND_CAPTURE_FAILED')));});ended.catch(()=>{});
const freshness=setInterval(()=>{try{if(!stopped&&preview.tick().reason==='input-expired')emit({stage:'hand-preview-idle',reason:'input-expired',physicalAccepted:false});}catch{stop();}},250);
child.stdout.setEncoding('utf8');
try{
 for await(const chunk of child.stdout){
  pending+=chunk;if(pending.length>65536)throw Error('HAND_STREAM_OVERFLOW');let newline;
  while((newline=pending.indexOf('\n'))>=0){
   const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(!line)continue;
   const observed=preview.accept(line);emit(observed);
   if(observed.proposal){
    const delta=observed.proposal.deltaUv,previous=await draft.read();
    const uv=[previous.x+delta[0],previous.y+delta[1]].map(v=>Math.max(.025,Math.min(.975,v)));
    const moved=await draft.move(previous.revision,uv),readback=await draft.read();
    if(readback.revision!==moved.revision||readback.x!==moved.x||readback.y!==moved.y)throw Error('LOCAL_DRAFT_READBACK_MISMATCH');
    emit({stage:'ephemeral-local-draft-readback',revision:readback.revision,x:readback.x,y:readback.y,placeEpoch:p.placeEpoch,workflowExecuted:false,physicalAccepted:false});
   }
  }
 }
 await ended;if(stopped||pending.trim())throw Error('HAND_PREVIEW_INCOMPLETE');
}finally{
 stop();clearTimeout(deadline);clearInterval(freshness);if(killTimer)clearTimeout(killTimer);
 process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.stdout.removeListener('error',stop);
 if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
}
