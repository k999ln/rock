#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs'; import {resolve} from 'node:path'; import {evaluateCandidate,paperTransition,buildJevPayload} from './index.mjs';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},fail=m=>{process.stderr.write(m+'\n');process.exit(1)};
const input=arg('--input'); if(!input)fail('Usage: node run-paper.mjs --input snapshots.jsonl [--bankroll 100] [--output report.json]');
const bankroll=Number(arg('--bankroll')??100); if(!Number.isFinite(bankroll)||bankroll<=0)fail('Invalid --bankroll');
const lines=readFileSync(resolve(input),'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),states=new Map(),events=[];
for(let i=0;i<lines.length;i++){let x;try{x=JSON.parse(lines[i])}catch{fail(`Invalid JSON line ${i+1}`)}
 const e=evaluateCandidate(x),k=x?.token?.mint||x?.token?.symbol||String(i),t=paperTransition(states.get(k),e,x);states.set(k,t);
 events.push({index:i+1,observedAt:x.observedAt||null,token:e.token,scores:{consensus:e.consensus,social:e.social.organic,capital:e.capital.score,callers:e.callers.score,momentum:e.momentum.score,rugRisk:e.risks.rug,promotionRisk:e.risks.promotion,exitRisk:e.exitRisk},hardFilter:e.hardFilter,rawAction:e.rawAction,finalAction:e.finalAction,paper:{event:t.event,stage:t.stage,exposurePct:t.exposurePct,notionalUsd:Math.round(bankroll*t.exposurePct*100)/100},jevInput:buildJevPayload(x,e)});
}
const report={schema:'rockstaros-meme-intelligence-paper-report/1',mode:'PAPER_ONLY',policy:{liveExecutionEnabled:false,walletKeysAccepted:false,externalOrdersAllowed:false},input:{snapshots:lines.length,bankrollUsd:bankroll},events};
const out=JSON.stringify(report,null,2)+'\n',dst=arg('--output'); if(dst)writeFileSync(resolve(dst),out);else process.stdout.write(out);
