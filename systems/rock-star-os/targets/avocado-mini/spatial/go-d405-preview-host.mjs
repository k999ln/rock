import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGoDepthSession} from './go-depth-session.mjs';
// Explicit, bounded local CLI; neither a web route nor a general process API.
if(process.platform!=='linux')throw Error('LINUX_X11_SENSOR_HOST_REQUIRED');
const a=process.argv.slice(2);
if(a.length!==5||a[0]!=='--allow-local-capture'||a[1]!=='--allow-bridge-settings-update')throw Error('Usage: go-d405-preview-host.mjs --allow-local-capture --allow-bridge-settings-update GO_PROFILE D405_PROFILE EXTRINSIC');
const digest=b=>createHash('sha256').update(b).digest('hex');
async function config(path){const p=resolve(path),s=await stat(p);if(s.uid!==process.getuid()||(s.mode&0o022)||s.size>32768)throw Error('OWNER_CONFIG_REQUIRED');const raw=await readFile(p);return {path:p,raw,value:JSON.parse(raw)};}
const go=await config(a[2]),depth=await config(a[3]),extrinsic=await config(a[4]);
const g=go.value,d=depth.value,e=extrinsic.value;
if(g.model!=='Looking Glass Go'||d.model!=='D405'||typeof g.serial!=='string'||typeof d.serial!=='string'||g.calibrationId!==d.calibrationId||e.calibrationId!==d.calibrationId||g.placeEpoch!==d.placeEpoch||e.placeEpoch!==d.placeEpoch)throw Error('GO_DEPTH_CALIBRATION_BINDING_REQUIRED');
if(![g,d].every(p=>Number.isSafeInteger(p.expiresUnixMs)&&p.expiresUnixMs>Date.now()))throw Error('PROFILE_EXPIRED');
const session=createGoDepthSession({goProfileSha256:digest(go.raw),goSerialSha256:digest(g.serial),calibrationId:d.calibrationId,placeEpoch:d.placeEpoch,depthConfig:{profileSha256:digest(depth.raw),deviceSerialSha256:digest(d.serial),calibrationId:d.calibrationId,placeEpoch:d.placeEpoch,cameraToPlace:e.cameraToPlace}});
const native=resolve(dirname(fileURLToPath(import.meta.url)),'../linux');
const children=new Set();let stopped=false,depthStarted=false,killTimer=null;
function stop(){if(stopped)return;stopped=true;session.revoke();for(const c of children)c.kill('SIGTERM');killTimer=setTimeout(()=>{for(const c of children)if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL');},1500);killTimer.unref();}
const deadline=setTimeout(stop,12000);process.once('SIGINT',stop);process.once('SIGTERM',stop);
process.stdout.on('error',stop);
function run(name,args,onLine){
 const c=spawn('/usr/bin/python3',[resolve(native,name),...args],{stdio:['ignore','pipe','pipe'],shell:false});children.add(c);
 let stderr='',pending='';c.stderr.setEncoding('utf8');c.stderr.on('data',s=>{stderr=(stderr+s).slice(-2048);});
 const ended=new Promise((ok,no)=>{c.once('error',no);c.once('close',(code)=>code===0||stopped?ok():no(Error('DEVICE_PROCESS_FAILED: '+name)));});ended.catch(()=>{});
 c.stdout.setEncoding('utf8');
 const consume=(async()=>{
  for await(const chunk of c.stdout){pending+=chunk;if(pending.length>65536)throw Error('DEVICE_STREAM_OVERFLOW');let i;
   while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(line)onLine(line);}
  }
  if(pending.trim())throw Error('DEVICE_STREAM_TRUNCATED');await ended;
 })();
 // Every process error triggers session revocation, including after startup.
 consume.catch(stop);return {child:c,consume};
}
function emit(value){if(!process.stdout.write(JSON.stringify(value)+'\n'))throw Error('PREVIEW_CONSUMER_BACKPRESSURE');}
let depthRun=null;
try{
 const goRun=run('go-bridge-observer.py',['--profile',go.path,'--allow-bridge-settings-update','--frames','40'],line=>{
  const receipt=session.acceptGo(line);if(stopped)throw Error('SESSION_STOPPED');
  if(!depthStarted){depthStarted=true;emit(receipt);depthRun=run('d405_depth_observer.py',['--profile',depth.path,'--allow-local-capture','--frames','100'],line=>emit(session.acceptDepth(line)));}
 });
 // Wait for the first bounded Go sample before sensor capture, without inventing readiness.
 await goRun.consume;
 if(!depthRun)throw Error('GO_NEVER_AVAILABLE');await depthRun.consume;
 if(stopped)throw Error('PREVIEW_REVOKED_OR_TIMED_OUT');
}finally{
 stop();clearTimeout(deadline);if(killTimer)clearTimeout(killTimer);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.stdout.removeListener('error',stop);
 for(const c of children)if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL');
}
