import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skyMonthlySandbox, localMonthlyPaymentFixture } from '../lib/sky-monthly-sandbox.ts';
import { handleMonthlySandbox, monthlySandboxAllowed } from '../lib/sky-monthly-sandbox-http.ts';
import { openMonthlySandboxDatabase } from '../scripts/sky-monthly-sandbox-db.mjs';
const input = { markdown: 'Text (Source: [Study](https://example.org/study))', language: 'en' };
function setup(t, at = Date.UTC(2026,9,15)) {
  const db = openMonthlySandboxDatabase(); t.after(() => db.close());
  let time = at; return { db, service: skyMonthlySandbox(db, () => time), advance: ms => { time += ms; } };
}
const execute = (service, quote, owner='a') => service.run(owner, quote.id, quote.amount_minor, quote.rate_version);
void test('Sky alone executes existing workflow, records one usage, closes and reconciles a monthly invoice', async t => {
  const { db, service, advance } = setup(t);
  const quote = await service.quote('a', randomUUID(), input);
  assert.equal(quote.amount_minor, 10);
  const result = await execute(service, quote);
  assert.equal(result.job.status, 'completed');
  assert.deepEqual(result.job.events.map(event => event.command.action), ['record','complete']);
  assert.match(result.job.standaloneAgent.text, /Sources/);
  assert.equal((await execute(service, quote)).replayed, true);
  assert.equal((await service.list('a')).usage.length, 1);
  assert.equal((await service.list('a')).invoices[0].total_minor, 10);
  assert.equal((await service.list('b')).usage.length, 0);
  await assert.rejects(service.close('a',quote.invoice_id), /月末前/);
  advance(32*86400000);
  assert.equal((await service.close('a',quote.invoice_id)).status, 'issued');
  assert.equal((await service.reconcile('a',quote.invoice_id,localMonthlyPaymentFixture)).status, 'paid');
  assert.equal((await service.reconcile('a',quote.invoice_id,localMonthlyPaymentFixture)).total_minor, 10);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 1);
});
void test('changed inputs, consent mismatch, cross-owner access, expiration and month boundary are rejected', async t => {
  const { service, advance } = setup(t,Date.UTC(2026,9,31,23,59));
  const quote = await service.quote('a',randomUUID(),input);
  await assert.rejects(service.quote('a',quote.id,{ ...input, markdown:'changed' }),/変更/);
  await assert.rejects(service.run('a',quote.id,0,quote.rate_version),/承認/);
  await assert.rejects(execute(service,quote,'b'),/見つかりません/);
  await assert.rejects(service.close('b',quote.invoice_id,true),/見つかりません/);
  advance(120000);
  await assert.rejects(execute(service,quote),/期限/);
  const next = await service.quote('a',randomUUID(),input);
  advance(300001);
  await assert.rejects(execute(service,next),/期限/);
});
void test('atomic monthly cap, duplicate submissions and closing races do not overcharge', async t => {
  const {service}=setup(t);
  const large={...input,markdown:'x'.repeat(20000)};
  const quotes=await Promise.all(Array.from({length:6},()=>service.quote('a',randomUUID(),large)));
  const result=await Promise.allSettled(quotes.map(q=>execute(service,q)));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,5);
  assert.equal((await service.list('a')).invoices[0].total_minor,1000);
  await assert.rejects(service.quote('a',randomUUID(),input),/上限/);
  await service.close('a',quotes[0].invoice_id,true);
  await assert.rejects(execute(service,quotes[5]),/締め/);
  assert.equal((await execute(service,quotes[0])).replayed,true);
});
void test('provider unknown or mismatched result never marks paid; retry reconciles same invoice', async t => {
  const {service}=setup(t);
  const q=await service.quote('a',randomUUID(),input); await execute(service,q); await service.close('a',q.invoice_id,true);
  await assert.rejects(service.reconcile('a',q.invoice_id,{reconcile:async()=>{throw new Error('timeout');}}),/timeout/);
  await assert.rejects(service.reconcile('a',q.invoice_id,{reconcile:async i=>({...await localMonthlyPaymentFixture.reconcile(i),amountMinor:999})}),/一致/);
  assert.equal((await service.list('a')).invoices[0].status,'issued');
  assert.equal((await service.reconcile('a',q.invoice_id,localMonthlyPaymentFixture)).status,'paid');
});
void test('persistence survives SQLite restart and duplicate execution remains single counted',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'sky-monthly-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'state.sqlite');let db=openMonthlySandboxDatabase(path);let service=skyMonthlySandbox(db);
  const q=await service.quote('a',randomUUID(),input);await execute(service,q);db.close();
  db=openMonthlySandboxDatabase(path);t.after(()=>db.close());service=skyMonthlySandbox(db);
  assert.equal((await execute(service,q)).replayed,true);assert.equal((await service.list('a')).invoices[0].total_minor,10);
  assert.match((await service.list('a')).usage[0].output,/Sources/);
});
void test('HTTP gate rejects production, disabled mode, wrong origin and client-declared paid state',async t=>{
  const {db}=setup(t);
  assert.equal(monthlySandboxAllowed(new Request('https://example.org/api'),'local-fixture'),false);
  assert.equal(monthlySandboxAllowed(new Request('http://127.0.0.1/api'),'live'),false);
  const req=(body,origin='http://127.0.0.1:5220')=>new Request('http://127.0.0.1:5220/api',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await handleMonthlySandbox(req({action:'quote',id:randomUUID(),input},'https://evil.example'),'a',db,'local-fixture')).status,403);
  assert.equal((await handleMonthlySandbox(req({action:'paid',id:randomUUID()}),'a',db,'local-fixture')).status,400);
  assert.equal((await handleMonthlySandbox(req({action:'quote',id:randomUUID(),input}),'',db,'local-fixture')).status,401);
  const response=await handleMonthlySandbox(req({action:'quote',id:randomUUID(),input}),'a',db,'local-fixture');assert.equal(response.status,200);
});
void test('simultaneous same-quote runs remain one charge and failed work persistence rolls back usage', async t => {
  const {db,service}=setup(t);
  const q=await service.quote('a',randomUUID(),input);
  const both=await Promise.all([execute(service,q),execute(service,q)]);
  assert.equal(both[0].job.id,both[1].job.id);
  assert.equal((await service.list('a')).usage.length,1);
  const collision=await service.quote('a',randomUUID(),input);
  db.sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(collision.id,'b','{}',0,'2026-10-15');
  await assert.rejects(execute(service,collision),/競合/);
  assert.equal((await service.list('a')).invoices[0].total_minor,10);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_monthly_sandbox_usage').get().n,1);
});

void test('deleting an artifact does not erase its itemized billing evidence',async t=>{
  const {db,service}=setup(t);
  const q=await service.quote('a',randomUUID(),input);await execute(service,q);
  db.sqlite.prepare('DELETE FROM work_jobs WHERE id=?').run(q.id);
  const snapshot=await service.list('a');
  assert.equal(snapshot.usage.length,1);assert.equal(snapshot.usage[0].output,null);assert.equal(snapshot.invoices[0].total_minor,10);
});
