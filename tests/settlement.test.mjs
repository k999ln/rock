import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultEstimate, estimate } from '../lib/settlement.ts';
import { parseAccounts, walletError } from '../lib/wallet.ts';

test('zero income never creates a Rock star debt, but real running costs remain',()=>{
 const actual=estimate(defaultEstimate);assert.equal(actual.fee,0);assert.equal(actual.electricity,74);assert.equal(actual.net,-74);
});
test('fee cannot exceed low income and no remainder is carried',()=>{
 const actual=estimate({...defaultEstimate,revenue:500});assert.equal(actual.fee,500);assert.equal(actual.payout,0);assert.equal(actual.net,-74);
});
test('monthly fee capped at 8.88 USD, all operating costs included',()=>{
 const actual=estimate({...defaultEstimate,revenue:130000,dataGB:10,dataRate:20,apiCost:500});
 assert.deepEqual(actual,{revenue:130000,feeCap:1332,fee:1332,payout:128668,electricity:74,data:200,api:500,totalCost:2106,net:127894});
});
test('zero-cost run and fractional FX round in whole JPY',()=>{
 const actual=estimate({...defaultEstimate,revenue:2000,fx:155.55,watts:0});assert.equal(actual.fee,1381);assert.equal(actual.net,619);
});
test('invalid financial inputs fail instead of silently clamping',()=>{
 for(const patch of [{revenue:-1},{fx:0},{hours:745},{dataGB:NaN},{apiCost:Infinity},{watts:'60'},{dataRate:100001}]) assert.throws(()=>estimate({...defaultEstimate,...patch}));
});
test('only valid EVM addresses can appear as connected',()=>{
 const address='0x'+'ab'.repeat(20);assert.deepEqual(parseAccounts([address,'0xdead',null,5]),[address]);assert.deepEqual(parseAccounts({address}),[]);assert.deepEqual(parseAccounts([]),[]);
});
test('wallet cancellation and pending requests are understandable',()=>{
 assert.match(walletError({code:4001}),/キャンセル/);assert.match(walletError({code:-32002}),/保留中/);assert.match(walletError(null),/接続できません/);
});
