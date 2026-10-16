import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY140_TEST_VERSION, sky140TestAccess, sky140TestMonthCharge, readSky140TestAccess } from '../lib/sky-140-collection-test.ts';
const contract = { id:'fixture', owner:'owner', account:'acct_fixture', customer:'cus_fixture', consentVersion:SKY140_TEST_VERSION, creditMinor:14000, state:'active', invoices:[{id:'in_previous',period:'2026-08'},{id:'in_current',period:'2026-09'}] };
const invoice = (id, period, patch={}) => ({id,livemode:false,customer:contract.customer,currency:'usd',total:14000,amount_paid:14000,amount_remaining:0,status:'paid',metadata:{sky140_contract:contract.id,sky140_period:period,sky140_version:SKY140_TEST_VERSION},...patch});
const paid = () => contract.invoices.map(i=>invoice(i.id,i.period));
const budget = {settledMinor:100,reservedMinor:0};
const access=(c=contract,readbacks=paid(),b=budget,n=100)=>sky140TestAccess(c,'owner','acct_fixture',readbacks,b,n);
void test('month end charges 140 once with no extra charge for 0 through 100 included dollars',()=>{
  for(const settledMinor of [0,100,10000]) assert.deepEqual(sky140TestMonthCharge('2026-09',Date.parse('2026-10-01T00:00:00Z'),{settledMinor,reservedMinor:0}),{fixedMinor:14000,includedUsageMinor:settledMinor,extraUsageChargeMinor:0});
  assert.throws(()=>sky140TestMonthCharge('2026-09',Date.parse('2026-09-30T23:59:59Z'),budget));
  for(const b of [{settledMinor:10001,reservedMinor:0},{settledMinor:0,reservedMinor:1},{settledMinor:-1,reservedMinor:0}])assert.throws(()=>sky140TestMonthCharge('2026-09',Date.now(),b));
});
void test('all arrears must be paid; old or newer paid invoice cannot unlock another unpaid invoice',()=>{
  for(const idx of [0,1]){const rows=paid();rows[idx]={...rows[idx],status:'open',amount_paid:0,amount_remaining:14000};assert.equal(access(contract,rows).reason,'unpaid_or_unknown');}
  assert.equal(access().allowed,true);assert.equal(access().productionAuthorized,false);
});
void test('cancelled, disputed, missing consent and unlimited credit cannot restore service',()=>{
  for(const patch of [{state:'cancelled'},{state:'disputed'},{consentVersion:null},{creditMinor:Infinity},{creditMinor:0}])assert.equal(access({...contract,...patch}).allowed,false);
});
void test('budget includes reservations and does not grant production execution',()=>{
  assert.equal(access(contract,paid(),{settledMinor:9900,reservedMinor:100},1).allowed,false);
  assert.equal(access(contract,paid(),{settledMinor:9800,reservedMinor:100},100).allowed,true);
  for(const n of [-1,NaN,Infinity,0.5])assert.equal(access(contract,paid(),budget,n).allowed,false);
});
void test('readback mismatch, foreign identity, duplicate/missing invoices and nonpaid states fail closed',()=>{
  for(const patch of [{livemode:true},{currency:'jpy'},{customer:'cus_other'},{total:14100},{amount_paid:13999},{amount_remaining:1},{status:'void'},{metadata:{}}]){
    const rows=paid();rows[0]={...rows[0],...patch};assert.equal(access(contract,rows).allowed,false);
  }
  for(const patch of [{owner:'other'},{account:'acct_other'}])assert.equal(access({...contract,...patch}).allowed,false);
  assert.equal(access(contract,paid().slice(1)).allowed,false);
  assert.equal(access(contract,[paid()[0],paid()[0]]).allowed,false);
  assert.equal(access({...contract,invoices:[contract.invoices[0],contract.invoices[0]]}).allowed,false);
});
void test('restricted account preserves payment and export; provider read failure never falls back to allowed',async()=>{
  const decision=access({...contract,state:'disputed'});assert.equal(decision.exportAllowed,true);assert.equal(decision.paymentAllowed,true);
  await assert.rejects(readSky140TestAccess({accounts:{retrieve:async()=>({id:contract.account})},invoices:{retrieve:async()=>{throw Error('network');}}},contract,'owner',budget,100));
});
