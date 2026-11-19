import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { workStore } from '../../lib/work-store.ts';
import { createNoahWork, updateNoahWork } from '../../lib/noah-execution.ts';
import { createNoahOperationService, presentNoahOperation, validateOperationRun } from '../../lib/noah-operations.ts';
import { createExecutionManager } from '../../scripts/noah-executions.mjs';
import { createGeneralOperations } from '../../scripts/noah-general-operations.mjs';
import { InstallError } from '../../scripts/noah-source-fetch.mjs';

export function operationFixture({ run, auto = false, validateBinding } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL)');
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return {results:sqlite.prepare(sql).all(...args)}; },
    async run() { return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}; },
  }; } }; } };
  const store = workStore(db), time = { now: Date.now() }, service = createNoahOperationService(store, () => time.now, validateBinding);
  const user = 'alice', scope = `owner-v1:${'a'.repeat(64)}`, runs = [];
  let allowed = true;
  const runtime = { execution: { image: 'sha256:'+'a'.repeat(64) }, async run(prompt, signal, onModel) { runs.push(prompt); return run ? run(prompt, signal, onModel) : { text: prompt,files:[],exitCode:0 }; } };
  const executions = createExecutionManager({ async execution() { if (!allowed) throw new InstallError('disconnected'); return runtime; } });
  const work = async (action, input) => {
    if (action === 'get') { const job = await store.get(user,input.id); if (!job) throw new InstallError('not found',404); return { job }; }
    if (action === 'create') { const candidate = await createNoahWork(input.id,input.binding); const parent = await validateOperationRun(store,user,candidate); const job = parent ? await store.createNoahOperationRun(user,candidate,parent) : await store.create(user,candidate); if (!job) throw new InstallError('changed',409); return {job}; }
    const current = await store.get(user,input.id), parent = action === 'start' ? await validateOperationRun(store,user,current) : null;
    const job = await updateNoahWork(current,{...input,action});
    if (!await (parent ? store.startNoahOperationRun(user,job,current.revision,parent) : store.update(user,job,current.revision))) throw new InstallError('changed',409);
    return {job};
  };
  const client = { work, async revalidate() { if (!allowed) throw new InstallError('revoked',403); }, async api(action,input) {
    if (action === 'get') return input.id ? {job:presentNoahOperation(await service.get(user,input.id))} : {jobs:(await service.list(user,input.agentId,input.archived === '1')).map(presentNoahOperation)};
    return {job:action === 'create' ? await service.create(user,input.config,input.binding,input.lease) : await service.command(user,{...input,action})};
  } };
  const manager = createGeneralOperations({executions,now:()=>time.now,auto});
  const config = (overrides={}) => ({id:randomUUID(),agentId:'research-ce4e58553bea6313acf7',prompt:'Synthetic operation fixture',intervalSeconds:60,maxRuns:3,expiresAt:time.now+3600000,timeZone:'Asia/Tokyo',confirmation:'noah-operation/1',...overrides});
  return {db,sqlite,store,service,time,user,scope,runtime,executions,manager,client,config,runs,revoke(){allowed=false;}, async tick() {await manager.tick();await manager.drain();}, async close() {await manager.close();await executions.close();sqlite.close();}};
}
