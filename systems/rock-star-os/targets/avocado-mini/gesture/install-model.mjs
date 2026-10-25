/** Pinned public model installer. No camera/upload; never overwrite an existing path.
 * The code/manifest and executing UID are trusted. Node has no directory-relative
 * openat here: checks do not promise defense against concurrent parent replacement
 * by the same UID (which can also replace this installer).
 */
import {constants} from 'node:fs';
import {lstat, realpath, mkdir, mkdtemp, open, link, unlink, rmdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const MODEL_URL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MAX_BYTES=10000000;
const uid=process.getuid?.();
if(uid===undefined || !constants.O_NOFOLLOW)throw Error('unsupported_model_storage_platform');
const root=await realpath(dirname(fileURLToPath(import.meta.url)));
const runtime=join(root,'runtime'), folder=join(runtime,'models');
const target=join(folder,'hand_landmarker.task'), legacyTemp=join(folder,'hand_landmarker.task.download');
const same=(a,b)=>a.dev===b.dev && a.ino===b.ino;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inspect(path) {
  try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function owned(stat){return stat.uid===uid && (stat.mode & 0o022)===0;}
async function directory(path) {
  const stat=await inspect(path);
  if(!stat?.isDirectory() || !owned(stat) || await realpath(path)!==path)throw Error('unsafe_model_directory');
  return stat;
}
async function regularBytes(path,limit) {
  const before=await inspect(path);
  if(!before?.isFile() || before.nlink!==1 || !owned(before) || before.size>limit)throw Error('unsafe_model_file');
  const fd=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat=await fd.stat();
    if(!stat.isFile() || stat.nlink!==1 || !owned(stat) || !same(before,stat) || stat.size>limit)throw Error('unsafe_model_file');
    const bytes=Buffer.alloc(limit+1);let count=0;
    while(count<bytes.length){const {bytesRead}=await fd.read(bytes,count,bytes.length-count,null);if(!bytesRead)break;count+=bytesRead;}
    const after=await fd.stat(), current=await inspect(path);
    if(count>limit || after.size!==count || after.nlink!==1 || after.mtimeMs!==stat.mtimeMs || !current || !same(current,stat))throw Error('model_file_changed');
    return bytes.subarray(0,count);
  } finally {await fd.close();}
}
const rootStat=await directory(root), runtimeStat=await directory(runtime);
const manifest=JSON.parse((await regularBytes(join(runtime,'model.json'),8192)).toString('utf8'));
if(manifest.url!==MODEL_URL || !/^[a-f0-9]{64}$/.test(manifest.sha256)
  || !Number.isSafeInteger(manifest.maxBytes) || manifest.maxBytes<1 || manifest.maxBytes>MAX_BYTES)throw Error('invalid_model_manifest');
try{await mkdir(folder,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
const folderStat=await directory(folder);
async function storageUnchanged() {
  for(const [path,stat] of [[root,rootStat],[runtime,runtimeStat],[folder,folderStat]]){
    if(!same(stat,await directory(path)))throw Error('model_directory_changed');
  }
  // Never consume, delete or follow a leftover from the old fixed-temp installer.
  if(await inspect(legacyTemp))throw Error('existing_model_download_path');
}
await storageUnchanged();
if(await inspect(target)) {
  if(digest(await regularBytes(target,manifest.maxBytes))!==manifest.sha256)throw Error('existing_model_digest_mismatch');
  await storageUnchanged();
  process.stdout.write('Verified existing model; camera remains off.\n');
} else {
  const response=await fetch(MODEL_URL,{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok || !response.body || response.redirected || (response.url && response.url!==MODEL_URL))throw Error('model_download_failed');
  const parts=[];let total=0;
  for await(const part of response.body){total+=part.length;if(total>manifest.maxBytes)throw Error('model_size_limit');parts.push(part);}
  const bytes=Buffer.concat(parts);
  if(digest(bytes)!==manifest.sha256)throw Error('model_digest_mismatch');
  await storageUnchanged();
  if(await inspect(target))throw Error('model_target_appeared');
  const tempDir=await mkdtemp(join(folder,'.hand-landmarker-'));
  const tempDirStat=await directory(tempDir), temp=join(tempDir,'model');
  let tempStat, fd;
  try {
    if((tempDirStat.mode & 0o077)!==0)throw Error('unsafe_model_temporary_directory');
    fd=await open(temp,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
    tempStat=await fd.stat();
    if(!tempStat.isFile() || tempStat.nlink!==1 || !owned(tempStat) || (tempStat.mode & 0o077)!==0)throw Error('unsafe_model_temporary_file');
    await fd.writeFile(bytes);await fd.sync();await fd.close();fd=null;
    await storageUnchanged();
    if(!same(tempDirStat,await directory(tempDir)) || !same(tempStat,await lstat(temp)))throw Error('model_temporary_path_changed');
    if(digest(await regularBytes(temp,manifest.maxBytes))!==manifest.sha256)throw Error('model_temporary_digest_mismatch');
    // link publishes the fully verified inode atomically and refuses ANY existing
    // target, unlike rename which could replace one between validation and adoption.
    await link(temp,target);
    process.stdout.write(`Verified model: ${bytes.length} bytes; camera remains off.\n`);
  } finally {
    if(fd)await fd.close();
    const current=await inspect(temp);
    if(tempStat && current && same(tempStat,current) && current.isFile())await unlink(temp);
    const currentDir=await inspect(tempDir);
    if(currentDir?.isDirectory() && same(tempDirStat,currentDir))await rmdir(tempDir);
  }
}
