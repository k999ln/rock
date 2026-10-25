/** Downloads only the pinned public model; no camera or upload operation. */
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('./runtime/model.json',import.meta.url),'utf8'));
const response=await fetch(manifest.url,{signal:AbortSignal.timeout(30000),redirect:'error'});
if(!response.ok)throw Error('model_download_failed');
const parts=[];let total=0;
for await(const part of response.body){total+=part.length;if(total>manifest.maxBytes)throw Error('model_size_limit');parts.push(part);}
const bytes=Buffer.concat(parts);
if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('model_digest_mismatch');
const folder=new URL('./runtime/models/',import.meta.url);await mkdir(folder,{recursive:true});
const temp=new URL('hand_landmarker.task.download',folder),target=new URL('hand_landmarker.task',folder);
await writeFile(temp,bytes);await rename(temp,target);
process.stdout.write(`Verified model: ${bytes.length} bytes; camera remains off.\n`);
