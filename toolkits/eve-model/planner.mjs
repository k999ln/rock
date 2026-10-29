import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';

export const sameBinding=(a,b)=>a&&b&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.keys(a).every(k=>typeof a[k]==='string'&&a[k]===b[k]);
const fatalError=message=>Object.assign(Error(message),{fatal:true});

export class Planner {
  constructor({python,root,base,expectedBinding,candidateRoot}) {this.config={python,root,base,candidateRoot};this.expectedBinding=expectedBinding;this.child=null;this.pending=null;this.ready=null;this.halted=false;this.stopReason=null;this.stopIntent=null;this.stopPromise=null;}
  async start() {
    if(this.halted)throw fatalError('experiment halted after fatal model/resource error; no automatic retry');
    if (this.child) return this.ready;
    this.stopReason=null;
    this.stopIntent=null;this.stopPromise=null;
    const {python,root,base,candidateRoot}=this.config;
    const log=fs.openSync(path.join(root,'inference-worker.log'),'a',0o600);
    const child=spawn(python,[fileURLToPath(new URL('./model_worker.py',import.meta.url)),'--root',root,'--base',base,...(candidateRoot?['--candidate-root',candidateRoot]:[])],
      {stdio:['pipe','pipe',log],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});
    fs.closeSync(log);this.child=child;
    this.ready=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.halted=true;reject(fatalError('model startup timeout'));void this.stop('timeout');},30000);
      const lines=readline.createInterface({input:child.stdout});
      lines.on('line',line=>{
        let data;try{data=JSON.parse(line);}catch{this.halted=true;reject(fatalError('invalid model transport'));void this.stop('transport');return;}
        if(data.ready){
          if(!sameBinding(data.binding,this.expectedBinding)){clearTimeout(timeout);this.halted=true;reject(fatalError('worker candidate identity mismatch'));void this.stop('identity');return;}
          clearTimeout(timeout);resolve(data.binding);return;
        }
        const pending=this.pending;
        if(!pending || data.id!==pending.id){this.halted=true;reject(fatalError('unexpected model response'));void this.stop('transport');return;}
        this.pending=null;clearTimeout(pending.timeout);
        if(data.error){const error=Error(data.error.message??'planner failed');error.fatal=Boolean(data.error.fatal);if(error.fatal)this.halted=true;pending.reject(error);}
        else if(!sameBinding(data.result?.binding,this.expectedBinding)){this.halted=true;pending.reject(fatalError('result candidate identity mismatch'));void this.stop('identity');}
        else pending.resolve(data.result);
      });
      child.on('error',error=>{clearTimeout(timeout);this.halted=true;reject(fatalError('model process start failed: '+error.message));});
      child.on('exit',(code,signal)=>{
        const intent=this.stopIntent?.child===child?this.stopIntent:null;
        const deliberate=intent&&['owner_stop','normal_job_end'].includes(intent.reason);
        const expected=deliberate&&((signal&&intent.sentSignals.includes(signal))||code===0);
        const fatal=(typeof code==='number'&&code!==0)||!expected;if(fatal)this.halted=true;
        clearTimeout(timeout);reject(fatal?fatalError('model worker exited before ready'):Error('owned model worker stopped'));
        if(this.child===child)this.child=null;
        if(this.pending){const pending=this.pending;clearTimeout(pending.timeout);this.pending=null;void this.abandon(pending.id).finally(()=>pending.reject(fatal?fatalError('model worker exited; accounting unknown'):Error('owned model worker stopped; accounting unknown')));}
      });
    });
    return this.ready;
  }
  async generate(request,timeoutMs) {
    const started=Date.now();await this.start();timeoutMs-=Date.now()-started;
    if(timeoutMs<=0)throw Error('whole-job timeout during startup');
    if(this.pending)throw Error('only one model call at a time');
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.halted=true;reject(fatalError('planner timeout; accounting unknown'));void this.stop('timeout');},Math.min(120000,timeoutMs));
      this.pending={id:request.id,resolve,reject,timeout};
      this.child.stdin.write(JSON.stringify(request)+'\n');
    });
  }
  async abandon(id) {
    const {python,root}=this.config;
    return new Promise(resolve=>{const child=spawn(python,[fileURLToPath(new URL('./budget.py',import.meta.url)),'--root',root,'--abandon-call',id],{stdio:'ignore'});const timeout=setTimeout(()=>{child.kill('SIGKILL');resolve();},10000);child.on('error',()=>{clearTimeout(timeout);resolve();});child.on('exit',()=>{clearTimeout(timeout);resolve();});});
  }
  async stop(reason='owner_stop') {
    const child=this.child;if(!child)return {terminated:true,alreadyStopped:true};
    if(child.exitCode!==null||child.signalCode!==null)return {terminated:true,alreadyStopped:true};
    if(this.stopIntent?.child===child&&this.stopPromise)return this.stopPromise;
    this.stopReason=reason;const intent={child,reason,sentSignals:[]};this.stopIntent=intent;
    this.stopPromise=new Promise(resolve=>{
      const kill=setTimeout(()=>{if(child.kill('SIGKILL'))intent.sentSignals.push('SIGKILL');},5000);
      child.once('exit',()=>{clearTimeout(kill);resolve({terminated:true});});
      if(child.kill('SIGTERM'))intent.sentSignals.push('SIGTERM');
    });
    return this.stopPromise;
  }
}
