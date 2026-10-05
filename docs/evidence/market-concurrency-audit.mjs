// Diagnostic only. Run from repository root: node docs/evidence/market-concurrency-audit.mjs
// Uses an ephemeral local D1 database; no live orders, credentials or real funds.
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {everythingMarketStore} from '../../lib/everything-market-store.ts';
const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("audit fixture")}}',compatibilityDate:'2026-08-18',d1Databases:['DB'],host:'127.0.0.1',port:0}));
const db=await worker.getD1Database('DB');
try {
for(const f of ['0009_sad_giant_girl.sql','0012_marketplace_relation_guards.sql']) for(const st of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean)) await db.prepare(st).run();
const store=everythingMarketStore(db,'audit-only');
async function approved(price,qty=1,side='buy') {const p=await store.propose({assetId:'rock:research-brief',side,priceMinor:price,quantity:qty,mode:'PAPER',expiresAt:new Date(Date.now()+600000).toISOString()},'proposal:'+crypto.randomUUID());return await store.approve(p.id,p.digest)}
const initial=await approved(50000);await store.execute(initial.id,'execute:'+crypto.randomUUID());
const a=await approved(40000),b=await approved(40000);
const out=await Promise.allSettled([store.execute(a.id,'execute:'+crypto.randomUUID()),store.execute(b.id,'execute:'+crypto.randomUUID())]);
const snap=await store.snapshot();console.log(JSON.stringify({case:'parallel-buy-cap',statuses:out.map(x=>x.status==='fulfilled'?x.value.status:String(x.reason)),exposedMinor:snap.exposedMinor,maxExposureMinor:snap.limits.maxExposureMinor,paperBalanceMinor:snap.paperBalanceMinor}));
const seller=everythingMarketStore(db,'audit-seller');
async function sellerApproved(side){const p=await seller.propose({assetId:'rock:research-brief',side,priceMinor:2200,quantity:1,mode:'PAPER',expiresAt:new Date(Date.now()+600000).toISOString()},'proposal:'+crypto.randomUUID());return await seller.approve(p.id,p.digest)}
const buy=await sellerApproved('buy');await seller.execute(buy.id,'execute:'+crypto.randomUUID());const c=await sellerApproved('sell'),d=await sellerApproved('sell');const out2=await Promise.allSettled([seller.execute(c.id,'execute:'+crypto.randomUUID()),seller.execute(d.id,'execute:'+crypto.randomUUID())]);
console.log(JSON.stringify({case:'parallel-sell-inventory',statuses:out2.map(x=>x.status==='fulfilled'?x.value.status:String(x.reason)),position:await db.prepare("SELECT SUM(CASE WHEN side='buy' THEN quantity ELSE -quantity END) AS quantity FROM marketplace_positions WHERE user_id='audit-seller'").first()}));

} finally {await worker.dispose()}
