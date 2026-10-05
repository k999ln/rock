import assert from 'node:assert/strict';
import test from 'node:test';
import { csvOutputKeys, csvRemovalKeys, removeCsvJobStorage, purgeExpiredCsvJobs } from '../lib/csv-retention.ts';
const id='123e4567-e89b-12d3-a456-426614174000';
const row={id,user_id:'synthetic-owner',status:'completed',revision:3,expires_at:100,input_key:`csv/${id}/input.csv`,result_key:null,safe_result_key:null,report_json_key:null,report_html_key:null};

void test('cleanup covers unrecorded partial outputs only inside this job namespace',()=>{
  const keys=csvRemovalKeys(row);
  assert.equal(new Set(keys).size,5);
  for(const name of ['input.csv','result.csv','spreadsheet-safe.csv','report.json','report.html']) assert.ok(keys.includes(`csv/${id}/${name}`));
  assert.throws(()=>csvRemovalKeys({...row,result_key:'csv/other-owner/result.csv'}));
  assert.throws(()=>csvRemovalKeys({...row,input_key:`csv/${id}/../other.csv`}));
  assert.throws(()=>csvRemovalKeys({...row,input_key:null}));
});

void test('processing and lost revision claims never touch R2',async()=>{
  const bucket={delete(){assert.fail('must not delete');}};
  assert.equal(await removeCsvJobStorage({prepare(){assert.fail('must not claim');}},bucket,{...row,status:'processing'}),'busy');
  const db={prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})};}};}};
  assert.equal(await removeCsvJobStorage(db,bucket,row),'changed');
});

void test('R2 failure retains the claimed row and never deletes events or job metadata',async()=>{
  let claims=0;
  const db={prepare(sql){assert.match(sql,/UPDATE csv_jobs/);return {bind(){return {run:async()=>{claims++;return {meta:{changes:1}};}};}};},batch(){assert.fail('metadata must remain');}};
  await assert.rejects(removeCsvJobStorage(db,{delete:async()=>{throw new Error('partial R2 failure');}},row));
  assert.equal(claims,1);
});

void test('unsafe cleanup bounds are rejected before any DB or R2 access',async()=>{
  const db={prepare(){assert.fail('must not scan');}};
  for(const options of [{limit:0},{limit:101},{limit:1.1},{now:NaN},{now:-1}]) await assert.rejects(purgeExpiredCsvJobs(db,{},options));
});

void test('output keys belong to the random input incarnation, with legacy fallback',()=>{
  const first={...row,input_key:`csv/${id}/input-123e4567-e89b-12d3-a456-426614174001.csv`};
  const second={...row,input_key:`csv/${id}/input-123e4567-e89b-12d3-a456-426614174002.csv`};
  assert.equal(csvOutputKeys(first).some(key=>csvRemovalKeys(second).includes(key)),false);
  for(const key of csvOutputKeys(first)) assert.ok(csvRemovalKeys(first).includes(key));
  assert.equal(csvOutputKeys(row)[0],`csv/${id}/result.csv`);
});
