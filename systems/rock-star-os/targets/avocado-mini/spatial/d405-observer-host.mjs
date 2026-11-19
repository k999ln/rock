import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createD405ObservationReader} from './depth-observation.mjs';

// Explicit local CLI, no HTTP endpoint and no account/tool/billing writes.
if(process.platform!=='linux')throw Error('LINUX_SENSOR_HOST_REQUIRED');
const args=process.argv.slice(2);
if(args.length!==3||args[0]!=='--allow-local-capture')throw Error('Usage: d405-observer-host.mjs --allow-local-capture DEVICE_PROFILE_JSON EXTRINSIC_JSON');
async function ownerFile(path){const info=await stat(path);if(info.uid!==process.getuid()||(info.mode&0o022)||info.size>65536)throw Error('OWNER_CONTROLLED_SENSOR_CONFIG_REQUIRED');return await readFile(path);}
const calibrationPath=resolve(args[1]),extrinsicPath=resolve(args[2]);
const raw=await ownerFile(calibrationPath),calibration=JSON.parse(raw),extrinsic=JSON.parse(await ownerFile(extrinsicPath));
if(extrinsic.calibrationId!==calibration.calibrationId||extrinsic.placeEpoch!==calibration.placeEpoch)throw Error('EXTRINSIC_BINDING_MISMATCH');
if(typeof calibration.serial!=='string'||calibration.model!=='D405')throw Error('RECEIVED_D405_PROFILE_REQUIRED');
const reader=createD405ObservationReader({calibrationId:calibration.calibrationId,profileSha256:createHash('sha256').update(raw).digest('hex'),deviceSerialSha256:createHash('sha256').update(calibration.serial).digest('hex'),placeEpoch:calibration.placeEpoch,cameraToPlace:extrinsic.cameraToPlace});
const source=resolve(dirname(fileURLToPath(import.meta.url)),'../linux/d405_depth_observer.py');
const child=spawn('/usr/bin/python3',[source,'--profile',calibrationPath,'--allow-local-capture','--frames','100'],{stdio:['ignore','pipe','pipe'],shell:false});
let pending='',errorText='',stopped=false,killTimer=null;
function stop(){if(stopped)return;stopped=true;reader.revoke();child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),3000);killTimer.unref();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
const deadline=setTimeout(stop,30000);
child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-4096);});
child.stdout.setEncoding('utf8');
const ended=new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolveExit({code,signal}));});
// Prevent an early spawn failure from becoming an unhandled rejection while reading.
ended.catch(()=>{});
try{
 for await(const chunk of child.stdout){
  pending+=chunk;if(pending.length>65536)throw Error('SENSOR_STREAM_OVERFLOW');
  let newline;
  while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(!line)continue;const observed=reader.accept(line);if(!process.stdout.write(JSON.stringify(observed)+'\n'))throw Error('SENSOR_CONSUMER_BACKPRESSURE');}
 }
 const result=await ended;if(result.code!==0||pending.trim())throw Error('SENSOR_CAPTURE_INCOMPLETE: '+errorText.slice(-500));
}catch(error){stop();throw error;}finally{clearTimeout(deadline);if(killTimer)clearTimeout(killTimer);reader.revoke();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
