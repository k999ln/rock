import { initialize, openRuntime, readJson } from './runtime.mjs';
import { REVENUE_ROLES } from '../../lib/noah-revenue-pack.ts';
import { createMobileServer } from './mobile.mjs';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [command,directory,inputFile]=process.argv.slice(2);
function view(job){return {id:job.id,title:job.title,status:job.status,state:job.freeCloud?.state,model:job.freeCloud?.reportedModel,responseId:job.freeCloud?.providerResponseId,inputTokens:job.freeCloud?.inputTokens,outputTokens:job.freeCloud?.outputTokens,chargeMinor:job.freeCloud?.chargeMinor};}
try{
  if(command==='init'){if(!directory)throw Error('保存先を指定してください。');console.log(JSON.stringify({directory:initialize(directory)}));}
  else if(command==='serve'){
    const port=inputFile===undefined?3138:Number(inputFile);
    if(!directory||!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('保存先と有効なポート番号を指定してください。');
    const runtime=openRuntime(directory),mobile=createMobileServer(runtime,{port,example:readJson(join(dirname(fileURLToPath(import.meta.url)),'request.example.json'))});
    try{
      const connection=await mobile.start();
      writeFileSync(join(runtime.root,'mobile-link.json'),JSON.stringify({...connection,expiresAt:Date.now()+300000}),{mode:0o600});
      console.log(JSON.stringify({origin:connection.origin,pairFile:join(runtime.root,'mobile-link.json')}));
      const close=()=>{void mobile.close().finally(()=>{runtime.close();process.exit(0);});};
      process.once('SIGINT',close);process.once('SIGTERM',close);
    }catch(error){runtime.close();throw error;}
  }
  else if(command==='list')console.log(JSON.stringify(REVENUE_ROLES.map(({id,name,source})=>({id,name,source})),null,2));
  else if(['run','status','stop'].includes(command)){
    if(!directory)throw Error('保存先を指定してください。');
    const runtime=openRuntime(directory);
    const stop=()=>runtime.stop();process.on('SIGINT',stop);process.on('SIGTERM',stop);
    try{
      if(command==='run'){if(!inputFile)throw Error('依頼JSONを指定してください。');console.log(JSON.stringify({directory:runtime.root,jobs:(await runtime.run(readJson(inputFile))).map(view)},null,2));}
      if(command==='status')console.log(JSON.stringify({directory:runtime.root,jobs:(await runtime.list()).map(view)},null,2));
      if(command==='stop'){runtime.stop();console.log('停止しました。送信済み処理の取消ではなく、次の送信を停止します。');}
    }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);runtime.close();}
  }else console.log('Noah revenue: init <private-dir> | list | serve <private-dir> [port] | run <private-dir> <request.json> | status <private-dir> | stop <private-dir>');
}catch(error){console.error(error.message);process.exitCode=1;}
