import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFund,distributeFund,validateFund} from '../lib/fund.ts';
void test('fund cash is conserved through fees, member payouts and reserves',()=>{
  for(let i=0;i<1200;i++){
    const p={...defaultFund,revenue:i*101.37,commonCost:i*17%10000,members:i%27+2,myBoost:i%5*1234,otherBoost:i%17*97,basePercent:i%81,boostPercent:10};
    const r=distributeFund(p);
    assert.equal(r.revenue,r.recovered+r.fee+r.distributable);
    assert.equal(r.distributable,r.mine+r.others+r.reserve);
    assert.equal(r.fee,0);
    for(const key of ['mine','others','reserve','fee','unrecovered'])assert.ok(r[key]>=0);
  }
});
void test('legacy fund fixture preserves the old cap without using it by default',()=>{
  const p={...defaultFund,revenue:130000,commonCost:0};
  assert.equal(distributeFund(p).fee,0);
  assert.equal(distributeFund(p,true).fee,Math.round(p.fx*8.88));
});
void test('boosts never become revenue, even with no income or unrecovered costs',()=>{
  for(const revenue of [0,100,10000]){
    const p={...defaultFund,revenue,commonCost:20000,members:2,myBoost:1e8,otherBoost:1e8};
    const r=distributeFund(p);assert.equal(r.distributable,0);assert.equal(r.mine,0);assert.equal(r.fee,0);assert.equal(r.unrecovered,20000-revenue);
  }
});
void test('unsupported boost and rounding are reserved; boost share is bounded and monotone',()=>{
  const p={...defaultFund,revenue:130000,members:3};
  const r=distributeFund(p);assert.equal(r.mineBoost,0);assert.equal(r.reserve,r.distributable-3*r.mineBase);
  let previous=0;
  for(const boost of [0,10,100,1000,100000]){const s=distributeFund({...p,myBoost:boost,otherBoost:1000});assert.ok(s.mineBoost>=previous);assert.ok(s.mineBoost<=Math.floor(s.distributable*.1));previous=s.mineBoost;}
  assert.deepEqual(distributeFund({...p,myBoost:1000,otherBoost:3000}).mineBoost,distributeFund({...p,myBoost:10000,otherBoost:30000}).mineBoost);
});
void test('invalid financial assumptions and fictional other members are rejected',()=>{
  for(const change of [{revenue:NaN},{fx:0},{members:0},{members:1.5},{members:1,otherBoost:10},{weights:[20,20,20,20]},{weights:[100,-1,1,0]},{basePercent:90,boostPercent:11},{myBoost:-1}])assert.throws(()=>validateFund({...defaultFund,...change}));
});
