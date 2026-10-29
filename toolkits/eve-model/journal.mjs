import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import {prepareEveTextJob} from '../../lib/eve-text-job.ts';
import {createWorkJob,updateComposedWork,applyWorkCommand} from '../../lib/workflow.ts';
import {compositionPayloadFingerprint} from '../../lib/work-composition.ts';
import {executeCompositionNode} from '../../lib/work-composition-executor.ts';

export const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class Journal {
  constructor(file,owner) {
    this.owner=owner;this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,payload TEXT NOT NULL,
        state TEXT NOT NULL,record TEXT NOT NULL);`);
    // A restarted transport cannot know the effect of an interrupted inference.
    for (const row of this.db.prepare("SELECT id,record FROM runs WHERE state='running' AND owner=?").all(this.owner)) {
      const record=JSON.parse(row.record);record.state='unknown';record.error='transport restarted; reconcile without generation replay';
      this.save(record);
    }
  }
  get(id) {
    const row=this.db.prepare('SELECT owner,record FROM runs WHERE id=?').get(id);
    if (!row || row.owner!==this.owner) return null;
    return JSON.parse(row.record);
  }
  list() { return this.db.prepare('SELECT record FROM runs WHERE owner=? ORDER BY rowid DESC LIMIT 60').all(this.owner).map(x=>JSON.parse(x.record)); }
  save(record) {
    const row=this.db.prepare('SELECT owner FROM runs WHERE id=?').get(record.id);
    if (!row || row.owner!==this.owner) throw Error('owner mismatch');
    this.db.prepare('UPDATE runs SET state=?,record=? WHERE id=? AND owner=?').run(record.state,JSON.stringify(record),record.id,this.owner);
  }
  async create(input,task,binding) {
    if (!/^[0-9a-f-]{36}$/.test(input.operationId)) throw Error('invalid operation identity');
    const taskSha256=fingerprint(task);
    const payload=fingerprint({...input,taskSha256,source:task.materials,request:task.request,binding});
    const old=this.get(input.operationId);
    if (old) {
      if (old.payload!==payload) throw Error('operation payload conflict');
      return {record:old,replayed:true};
    }
    const prepared=prepareEveTextJob(task.materials,task.request);
    let job=createWorkJob({id:input.operationId,title:`Eve synthetic ${task.id}`,templateId:'composition',plan:prepared.plan});
    const result=await executeCompositionNode(job.composition,prepared.plan.nodes[0],prepared.source);
    job=updateComposedWork(job,{action:'run',id:crypto.randomUUID(),revision:job.revision,
      fingerprint:await compositionPayloadFingerprint(prepared),stepId:'s1',source:prepared.source,result});
    const record={id:input.operationId,owner:this.owner,payload,taskSha256,caseId:task.id,arm:input.arm,category:input.category,
      state:'prepared',createdAt:new Date().toISOString(),job,binding,result:null,trace:[],
      productionAccountAcceptance:false,qualityAccepted:false,pixelNativeInference:false,
      inferencePlacement:'Pixel client → USB localhost → Mac MLX',
      note:'Development journal reuses existing WorkJob preparation/cancel reducers; synthetic owner, separate from production account jobs.'};
    try {this.db.prepare('INSERT INTO runs VALUES (?,?,?,?,?)').run(record.id,this.owner,payload,record.state,JSON.stringify(record));}
    catch (error) {
      const raced=this.get(record.id);
      if (!raced || raced.payload!==payload) throw error;
      return {record:raced,replayed:true};
    }
    return {record,replayed:false};
  }
  cancel(id) {
    const record=this.get(id);if (!record) throw Error('job not found');
    if (['cancelled','completed','failed','unknown'].includes(record.state)) return record;
    record.job=applyWorkCommand(record.job,{action:'cancel',id:crypto.randomUUID()},record.job.revision);
    record.state='cancelled';record.cancelledAt=new Date().toISOString();record.result=null;
    this.save(record);return record;
  }
  finish(id,outcome,trace) {
    const record=this.get(id);if (!record) throw Error('job not found');
    if (record.state==='cancelled') {
      record.lateOutputRejected=true;record.trace=trace;this.save(record);return record;
    }
    record.state=outcome.error?'failed':'completed';record.result=outcome.result??null;
    record.error=outcome.error??null;record.trace=trace;record.finishedAt=new Date().toISOString();
    // A model response never completes the saved WorkJob or approves its content.
    this.save(record);return record;
  }
}
