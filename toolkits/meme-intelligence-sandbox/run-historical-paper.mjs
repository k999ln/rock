#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const EVENTS = [
  {symbol:'BUFFET',mint:'641qV2TkLgZ3JMAMbrLWVbppAXDq7tHiAzpTy7fe9k5v',at:'2026-09-15T08:59:00Z',mcap:12200,liq:18800},
  {symbol:'MEME',mint:'9jmDC6hjfsXTs72xj8muCmP6ZJDkfsyUF6KvZRrvTLR1',at:'2026-09-15T18:38:00Z',mcap:192200,liq:36200},
  {symbol:'JIMOTHEE',mint:'F3ePkQYxF59EcojHmHxcnxi5Mno4Y8WNUghrQRcopump',at:'2026-09-15T01:08:00Z',mcap:186100,liq:35400},
  {symbol:'PAIDELON',mint:'2qSFzAxbEZLxGsQCx1fABNfi7gQ1aiRYcwd7GhhGpump',at:'2026-09-16T07:14:00Z',mcap:409700,liq:52500},
  {symbol:'GUMBUS',mint:'692MdH1nbX6gf2xYcULvJUqVDsVgi6cbQatrMqCxpump',at:'2026-09-18T15:44:00Z',mcap:240100,liq:42000},
  {symbol:'NOOB',mint:'3w1T8HXSZ2axXv3YPXFGWdLRMYRVNBGcntuJRM7vC7Da',at:'2026-09-18T07:03:00Z',mcap:55800,liq:18600},
  {symbol:'TOELY',mint:'9MBetPjhp7uZ4odThXNm44GTVaffoYBcmGpdda9rpump',at:'2026-09-15T18:33:00Z',mcap:389800,liq:51800},
  {symbol:'CHAIN',mint:'3C6sZzwq2ietUdjRaNgTwoKw6dBMkKCe5u1rricjEFAU',at:'2026-09-15T08:28:00Z',mcap:26400,liq:25},
  {symbol:'SCRIBE',mint:'6rHkNb7HCtkpvdnVJsBCZHH5dw3AndqEjfmbEGhooR7t',at:'2026-09-15T10:05:00Z',mcap:40300,liq:null},
  {symbol:'HANK',mint:'AATN1JBQi4UikvV8wi3z6yz21q4Y5SucEMzWBBfFpump',at:'2026-09-17T06:51:00Z',mcap:9000,liq:null},
  {symbol:'HYNU',mint:'D9fL3bqUnKq5ZAoVKFpTnNydW92uSJqq1vpK7udQLA9a',at:'2026-09-18T16:00:00Z',mcap:69600,liq:23500},
  {symbol:'PENNY',mint:'2jjbtFBnsZNqgNR3N3LVbDtVCLKHK23w3MZzr4a5PooH',at:'2026-09-21T20:10:00Z',mcap:355800,liq:52600},
  {symbol:'BABYCATE',mint:'4JHXtNwMogExmcxXB1Ykb1A9s6yyAWKYG7xRurnT14Ws',at:'2026-09-19T11:31:00Z',mcap:73000,liq:24300},
  {symbol:'AIRCAT',mint:'Bjygd7p7aTRpTobQgdSK5eq7bahFxvtj86Si6diPNvZp',at:'2026-09-22T13:48:00Z',mcap:87100,liq:27300},
  {symbol:'XCAT',mint:'2UxzjvPXQ6CeJhAhk95yHicD3FavprqkukXz1DJAKsRs',at:'2026-09-20T22:09:00Z',mcap:265700,liq:48400},
  {symbol:'AMD',mint:'4ArNPRk8ATz6vVobaLgpvWxK2dQm6BeGi8TPDhCrfSPX',at:'2026-09-21T14:50:00Z',mcap:49700,liq:20400},
  {symbol:'JCAT',mint:'7Mk7UhiXXjWBt9LuMntbtWLHMXmFAmSSYg1eb4baSTNK',at:'2026-09-21T06:45:00Z',mcap:46900,liq:18900},
  {symbol:'BUB',mint:'FZixBtMMBxfbr8XqtWxARcDmqsEvQM3dYeAy4WwEjpPq',at:'2026-09-21T13:48:00Z',mcap:68000,liq:21800},
  {symbol:'SDOG',mint:'6Ax9mQt3oxsrxDjAF5p1Ljc7NPPHmXWsSsPgnhRJfN8A',at:'2026-09-18T20:52:00Z',mcap:297300,liq:50200},
  {symbol:'INURANUS_A',mint:'EYMBTNraihZkLhjVQhDivPhjAWFgRF1By2zVd8rcNcGz',at:'2026-09-21T18:25:00Z',mcap:875400,liq:90900},
  {symbol:'COPCAT',mint:'HhcfXbZ2rukoKx8oAH8rfkmzXbwvfdh6MMLZjneg4rWk',at:'2026-09-21T21:19:00Z',mcap:753100,liq:78200},
  {symbol:'INURANUS_B',mint:'5MJrAgqPqG561M2henUp9cJATJRB84vnu5oCzbFupump',at:'2026-09-19T07:04:00Z',mcap:49200,liq:18700},
  {symbol:'BUTT',mint:'2pouN3by7twkiZGy5aEKYUpf78ALDpKRTNu2WsQkpkqt',at:'2026-09-06T11:27:00Z',mcap:793000,liq:81000},
];

const MIN_MCAP=30000, MIN_LIQ=10000, BUY_COST=.01, SELL_COST=.01;
const HOLD_SECONDS=7*24*3600, AGG=15;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const num=v=>Number.isFinite(Number(v))?Number(v):null;
async function text(url){
  const r=await fetch(url,{headers:{'user-agent':'RockstarOS-MemeReplay/0.1 (+research; PAPER-only)'},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}
async function json(url){
  const r=await fetch(url,{headers:{'user-agent':'RockstarOS-MemeReplay/0.1 (+research; PAPER-only)','accept':'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json();
}
async function resolvePool(e){
  try{
    const html=await text(`https://dxttools.trade/token/solana/${e.mint}`);
    const m=html.match(/https:\/\/dexscreener\.com\/solana\/([A-Za-z0-9]+)/i);
    if(m?.[1]) return {pool:m[1],via:'dxttools'};
  }catch{}
  const data=await json(`https://api.dexscreener.com/latest/dex/tokens/${e.mint}`);
  const at=Date.parse(e.at);
  const pairs=(data.pairs||[]).filter(p=>p.chainId==='solana'&&p.baseToken?.address===e.mint)
    .filter(p=>!p.pairCreatedAt||p.pairCreatedAt<=at+3600_000)
    .sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0));
  if(!pairs[0]?.pairAddress) throw new Error('no_pool');
  return {pool:pairs[0].pairAddress,via:'dexscreener'};
}
async function candles(pool,e){
  const start=Math.floor(Date.parse(e.at)/1000),end=start+HOLD_SECONDS;
  const u=new URL(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute`);
  u.searchParams.set('aggregate',String(AGG)); u.searchParams.set('before_timestamp',String(end));
  u.searchParams.set('limit','1000'); u.searchParams.set('currency','usd'); u.searchParams.set('token','base');
  const d=await json(u.toString());
  return (d?.data?.attributes?.ohlcv_list||[]).map(x=>({t:x[0],o:num(x[1]),h:num(x[2]),l:num(x[3]),c:num(x[4]),v:num(x[5])}))
    .filter(x=>x.t>=start&&x.t<=end&&x.o>0&&x.h>0&&x.l>0&&x.c>0).sort((a,b)=>a.t-b.t);
}
function replay(e,cs,bankroll){
  if(e.mcap<MIN_MCAP) return {status:'FILTERED',reason:'market_cap'};
  if(e.liq==null) return {status:'FILTERED',reason:'liquidity_unknown'};
  if(e.liq<MIN_LIQ) return {status:'FILTERED',reason:'liquidity'};
  const start=Math.floor(Date.parse(e.at)/1000);
  const entry=cs.find(x=>x.t>start);
  if(!entry) return {status:'NO_DATA',reason:'no_post_signal_candle'};
  let cash=bankroll,qty=0,cost=0,stage='FLAT',partial=false,trailActive=false,peak=entry.o,events=[];
  const buy=(usd,px,kind,t)=>{usd=Math.min(usd,cash);if(usd<=0)return;const q=usd/(px*(1+BUY_COST));cash-=usd;qty+=q;cost+=usd;stage=kind;events.push({t,kind,usd:+usd.toFixed(4),px});};
  const sell=(q,px,kind,t)=>{q=Math.min(q,qty);if(q<=0)return;cash+=q*px*(1-SELL_COST);qty-=q;events.push({t,kind,qty:q,px});if(qty<1e-14){qty=0;stage='FLAT';}};
  buy(bankroll*.02,entry.o,'PROBE',entry.t);
  let avgEffective=()=>qty>0?cost/Math.max(qty,1e-30):0;
  for(const c of cs.filter(x=>x.t>=entry.t)){
    const avg=avgEffective(); if(!qty)break;
    // Conservative intrabar ordering: protective stop before profit target.
    if(c.l<=avg*.65){sell(qty,avg*.65,'STOP',c.t);break;}
    if(trailActive){
      const trail=peak*.70;
      if(c.l<=trail){sell(qty,trail,'TRAIL_EXIT',c.t);break;}
    }
    if(stage==='PROBE'&&c.c>=entry.o*1.20){buy(bankroll*.03,c.c,'CONFIRM',c.t);}
    if(stage==='CONFIRM'&&c.c>=entry.o*1.50){buy(bankroll*.05,c.c,'SCALE',c.t);}
    const avg2=avgEffective();
    if(!partial&&qty&&c.h>=avg2*2){
      sell(qty*.5,avg2*2,'TAKE_2X',c.t); partial=true; peak=Math.max(c.h,avg2*2);
      // trailing starts on the next candle to avoid impossible same-candle ordering assumptions.
      trailActive=false; continue;
    }
    if(partial){
      if(!trailActive) trailActive=true;
      peak=Math.max(peak,c.h);
    }
  }
  if(qty){const last=cs.at(-1);sell(qty,last.c,'TIME_EXIT',last.t);}
  const final=cash,pnl=final-bankroll;
  return {status:'TRADED',entryTime:new Date(entry.t*1000).toISOString(),entryPrice:entry.o,final:+final.toFixed(4),pnl:+pnl.toFixed(4),returnPct:+(pnl/bankroll*100).toFixed(2),events};
}
const argv=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined};
const bankroll=Number(argv('--bankroll')||100); const out=argv('--output')||'meme-historical-paper-report.json';
const rows=[];
for(const e of EVENTS){
  let row={...e,source:`https://dxttools.trade/token/solana/${e.mint}`};
  try{
    if(e.mcap<MIN_MCAP||e.liq==null||e.liq<MIN_LIQ){row.replay=replay(e,[],bankroll);rows.push(row);continue;}
    const p=await resolvePool(e); row.pool=p.pool; row.poolSource=p.via;
    await sleep(2300);
    const cs=await candles(p.pool,e); row.candles=cs.length; row.replay=replay(e,cs,bankroll);
  }catch(err){row.replay={status:'ERROR',reason:String(err?.message||err)};}
  rows.push(row);
  process.stdout.write(`${e.symbol}: ${row.replay.status}${row.replay.pnl!=null?` pnl=${row.replay.pnl}`:''}\n`);
}
const traded=rows.filter(x=>x.replay.status==='TRADED'),pnl=traded.reduce((a,x)=>a+x.replay.pnl,0);
const report={schema:'rockstaros-meme-historical-paper-replay/1',generatedAt:new Date().toISOString(),mode:'PAPER_ONLY',method:{signal:'first DexScreener paid activity from historical DXT Tools records; NOT the full Jev/social engine',filter:`marketCap>=${MIN_MCAP} and liquidity>=${MIN_LIQ}`,candles:`GeckoTerminal ${AGG}-minute OHLCV; enter next candle open`,sizing:'$2 probe; +$3 at +20%; +$5 at +50%, normalized to $100 test bankroll',exit:'-35% stop; sell 50% at 2x; 30% trailing stop thereafter; 7-day max hold',costs:'1% assumed on each buy and sell',lookahead:'none in trade rules; event list is retrospectively sampled and therefore not a population-complete test'},summary:{events:rows.length,traded:traded.length,filtered:rows.filter(x=>x.replay.status==='FILTERED').length,errors:rows.filter(x=>x.replay.status==='ERROR').length,totalNormalizedPnl:+pnl.toFixed(4),normalizedStart:bankroll,normalizedEnd:+(bankroll+pnl).toFixed(4),winningTrades:traded.filter(x=>x.replay.pnl>0).length,losingTrades:traded.filter(x=>x.replay.pnl<0).length},rows};
writeFileSync(out,JSON.stringify(report,null,2)+'\n');
process.stdout.write('RESULT '+JSON.stringify(report.summary)+'\n');
