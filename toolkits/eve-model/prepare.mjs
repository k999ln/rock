// Local synthetic data only. Execute the existing pure Tool validator for repair observations.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {executeZemaLocalAgentTool} from '../../lib/zema-local-agent.ts';

const [corpus,output] = process.argv.slice(2);
if (!corpus || !output || fs.existsSync(output)) throw Error('new output directory required');
fs.mkdirSync(output,{recursive:true});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const metadata={schema:'eve.observed-training-material/1',inputs:{},repairObservations:{},sealedFilesRead:false};
for (const split of ['train','validation','development']) {
  const raw=fs.readFileSync(path.join(corpus,`${split}.jsonl`),'utf8');
  metadata.inputs[split]=sha(raw);
  const rows=raw.trim().split('\n').map(JSON.parse);
  for (const row of rows) {
    if (!row.setupToolFailure) continue;
    const setup=row.setupToolFailure;
    try { executeZemaLocalAgentTool(setup.tool,setup.arguments); throw Error('expected real validator rejection'); }
    catch (error) {
      if (error.code!=='INVALID_TOOL_ARGUMENTS') throw error;
      row.observedToolFailure={tool:setup.tool,arguments:setup.arguments,output:{error:error.code},origin:'existing executeZemaLocalAgentTool; synthetic injected fault'};
      metadata.repairObservations[row.id]=row.observedToolFailure;
    }
  }
  fs.writeFileSync(path.join(output,`${split}.jsonl`),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
}
fs.writeFileSync(path.join(output,'observations-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({output,repairObservations:Object.keys(metadata.repairObservations).length,sealedFilesRead:false}));
