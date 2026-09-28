const ACTIONS=['SKIP','WATCH','ARMED','ENTER'];
export const POLICY={mode:'PAPER_ONLY',liveExecutionEnabled:false,minLiquidityUsd:1e4,minMarketCapUsd:3e4,minHolders:50,maxTop10Pct:30,maxDevPct:5,maxBundlerPct:20,maxSniperPct:20,maxFreshWalletPct:25,maxRugRiskForArmed:45,maxRugRiskForEnter:30,maxPromotionRiskForEnter:45,probePct:.02,confirmAddPct:.03,scaleAddPct:.05,maxPositionPct:.10};
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const c=(v,a=0,b=100)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a));
const r=v=>c(n(v),0,1), s=(v,a,b)=>b<=a?0:c((n(v)-a)/(b-a)*100);
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const act=v=>ACTIONS.includes(String(v||'').toUpperCase())?String(v).toUpperCase():'SKIP';
const lower=(a,b)=>ACTIONS[Math.min(ACTIONS.indexOf(act(a)),ACTIONS.indexOf(act(b)))];

export function hardFilter(x,p=POLICY){
  const t=x?.token||{},q=x?.risk||{},z=[];
  if(n(t.liquidityUsd)<p.minLiquidityUsd)z.push('liquidity_below_minimum');
  if(n(t.marketCapUsd)<p.minMarketCapUsd)z.push('market_cap_below_minimum');
  if(n(t.holders)<p.minHolders)z.push('holders_below_minimum');
  if(n(t.top10Pct)>p.maxTop10Pct)z.push('top10_concentration_too_high');
  if(n(t.devPct)>p.maxDevPct)z.push('dev_concentration_too_high');
  if(n(t.bundlerPct)>p.maxBundlerPct)z.push('bundler_concentration_too_high');
  if(n(t.sniperPct)>p.maxSniperPct)z.push('sniper_concentration_too_high');
  if(n(t.freshWalletPct)>p.maxFreshWalletPct)z.push('fresh_wallet_share_too_high');
  if(t.mintDisabled===false)z.push('mint_authority_enabled');
  if(t.freezeDisabled===false)z.push('freeze_authority_enabled');
  if(q.honeypot)z.push('honeypot_detected');
  if(q.sellBlocked)z.push('sell_blocked');
  if(q.ownerPrivileges)z.push('unsafe_owner_privileges');
  return{pass:!z.length,reasons:z};
}
export function callerScore(list=[]){
  const d=(Array.isArray(list)?list:[]).map(x=>{
    let v=20+(x.verifiedWallet?20:0)+(x.walletBoughtBeforeCall?20:0)+r(x.historicalHitRate)*20+s(x.medianMaxMultiple,1,8)*.1-r(x.postPumpCallRate)*20-r(x.deletedCallRate)*15-(x.affiliateHeavy?10:0)-(x.callAfterLargeMove?15:0);
    return{id:x.id||'unknown',clusterId:x.clusterId||x.id||'unknown',score:Math.round(c(v)),verified:!!x.verifiedWallet&&!!x.walletBoughtBeforeCall};
  });
  return{score:Math.round(avg(d.map(x=>x.score))),verified:d.filter(x=>x.verified).length,independent:new Set(d.map(x=>x.clusterId)).size,details:d};
}
export function socialScore(x){
  const o=x?.social||{},cur=n(o.mentions5m),prev=n(o.mentionsPrev5m),vel=prev>0?(cur-prev)/prev*100:cur>0?100:0;
  return{organic:Math.round(c(100-r(o.duplicateRatio)*35-r(o.referralRatio)*30-r(o.botRatio)*35)),velocity:Math.round(s(vel,0,200)),kol:Math.round(s(o.independentKolClusters,0,5)),narrative:Math.round(avg([c(n(o.narrativeSimilarity)),c(n(o.narrativePersistence))])),unique:Math.round(s(o.uniqueAuthors5m,3,80)),velocityPct:Math.round(vel*100)/100};
}
export function capitalScore(x){
  const o=x?.capital||{},t=x?.token||{},b=n(o.buyVolume1mUsd),d=n(o.sellVolume1mUsd),share=b+d?b/(b+d):.5;
  const flow=c((share-.4)*166.67),smart=s(n(o.smartWalletBuyers)-n(o.smartWalletSellers),0,6),cluster=s(o.verifiedWalletClusters,0,5);
  return{score:Math.round(flow*.25+smart*.35+cluster*.2+s(t.holderGrowthPct,0,25)*.1+s(t.liquidityGrowthPct,0,30)*.1),flow:Math.round(flow),smart:Math.round(smart),cluster:Math.round(cluster)};
}
function risks(x,cs){
  const t=x?.token||{},o=x?.social||{},q=x?.risk||{},a=Array.isArray(x?.callers)?x.callers:[];
  let rug=s(t.top10Pct,15,40)*.18+s(t.devPct,1,10)*.18+s(t.bundlerPct,5,30)*.14+s(t.sniperPct,5,30)*.12+s(t.freshWalletPct,10,40)*.1+r(q.suspiciousFundingClusterRatio)*18;
  if(q.honeypot||q.sellBlocked)rug=100; if(q.ownerPrivileges)rug+=25; if(t.mintDisabled===false)rug+=20; if(t.freezeDisabled===false)rug+=20;
  const post=a.length?avg(a.map(v=>r(v.postPumpCallRate))):0,aff=a.length?a.filter(v=>v.affiliateHeavy).length/a.length:0;
  const promo=r(o.duplicateRatio)*30+r(o.referralRatio)*25+r(o.botRatio)*20+post*15+aff*10;
  return{rug:Math.round(c(rug)),promotion:Math.round(c(promo)),sellPressure:Math.round(s(n(x?.capital?.smartWalletSellers)-n(x?.capital?.smartWalletBuyers),0,5)),liquidityDecline:Math.round(s(-n(t.liquidityGrowthPct),0,25)),callerWeakness:Math.round(100-s(cs.score,25,80))};
}
function momentum(x,ss){
  const t=x?.token||{},o=x?.capital||{},v=n(t.volumeAcceleration,NaN),va=Number.isFinite(v)?v:(n(t.volume5mUsd)>0?n(t.volume1mUsd)/(n(t.volume5mUsd)/5):0),b=n(o.buyVolume1mUsd),d=n(o.sellVolume1mUsd),br=d>0?b/d:b>0?4:1;
  return{score:Math.round(s(va,1,4)*.3+s(br,1,3)*.25+s(t.holderGrowthPct,0,25)*.2+s(t.liquidityGrowthPct,0,30)*.1+ss.velocity*.15),volumeAcceleration:Math.round(va*100)/100,buySellRatio:Math.round(br*100)/100};
}
export function buildJevPayload(x,e){
  const t=x?.token||{};
  return{schema:'rockstaros-meme-jev-input/1',mode:'PAPER_ONLY',token:{symbol:t.symbol||null,mint:t.mint||null,marketCapUsd:n(t.marketCapUsd),liquidityUsd:n(t.liquidityUsd),holders:n(t.holders)},signals:{consensus:e.consensus,socialQuality:e.social.organic,capitalQuality:e.capital.score,callerIntegrity:e.callers.score,verifiedCallers:e.callers.verified,independentCallerClusters:e.callers.independent,narrativeSimilarity:c(n(x?.social?.narrativeSimilarity)),momentumQuality:e.momentum.score,rugRisk:e.risks.rug,promotionRisk:e.risks.promotion},allowedActions:ACTIONS,constraints:{liveExecutionEnabled:false,mayIncreaseRiskBeyondGuardrails:false}};
}
export function evaluateCandidate(x,opt={}){
  const p={...POLICY,...(opt.policy||{})},hard=hardFilter(x,p),callers=callerScore(x?.callers),social=socialScore(x),capital=capitalScore(x),mom=momentum(x,social),risk=risks(x,callers),t=x?.token||{};
  const consensus=Math.round(c(social.organic*.17+social.velocity*.12+social.kol*.10+capital.score*.20+s(t.holderGrowthPct,0,25)*.10+s(t.liquidityGrowthPct,0,30)*.08+social.narrative*.13+callers.score*.10));
  const composite=consensus*.55+mom.score*.25+capital.score*.20-risk.promotion*.10;
  let raw=!hard.pass||risk.rug>=70?'SKIP':composite>=78?'ENTER':composite>=64?'ARMED':composite>=45?'WATCH':'SKIP',guarded=raw,gr=[];
  if(!hard.pass){guarded='SKIP';gr=hard.reasons}else if(risk.rug>p.maxRugRiskForArmed){guarded='WATCH';gr=['rug_risk_above_armed_limit']}else if(raw==='ENTER'&&risk.rug>p.maxRugRiskForEnter){guarded='ARMED';gr=['rug_risk_above_enter_limit']}else if(raw==='ENTER'&&risk.promotion>p.maxPromotionRiskForEnter){guarded='ARMED';gr=['promotion_risk_above_enter_limit']};
  const jev=opt.jevDecision||x?.jevDecision,final=jev?lower(guarded,jev.action):guarded,exitRisk=Math.round(c(risk.rug*.45+risk.promotion*.15+risk.sellPressure*.15+risk.liquidityDecline*.15+(100-consensus)*.10));
  return{schema:'rockstaros-meme-intelligence-evaluation/1',mode:'PAPER_ONLY',policy:{liveExecutionEnabled:false,maxPositionPct:p.maxPositionPct},token:{symbol:t.symbol||null,mint:t.mint||null},hardFilter:hard,social,callers,capital,momentum:mom,risks:risk,consensus,rawAction:raw,guardedAction:guarded,finalAction:final,guardrailReasons:gr,exitRisk,jev:jev?{action:act(jev.action),consensusState:jev.consensusState||null}:null};
}
export function paperTransition(prev,e,_x,po={}){
  const p={...POLICY,...po},cur=prev||{stage:'FLAT',exposurePct:0},a=act(e.finalAction||e.guardedAction);
  if(cur.exposurePct>0&&e.exitRisk>=75)return{stage:'FLAT',exposurePct:0,event:'EXIT',reason:'exit_risk_threshold'};
  if(a!=='ENTER')return{stage:cur.stage,exposurePct:cur.exposurePct,event:cur.exposurePct>0?'HOLD':a,reason:a.toLowerCase()};
  let add=0,stage=cur.stage,event='HOLD';
  if(cur.stage==='FLAT'){add=p.probePct;stage='PROBE';event='PROBE'}else if(cur.stage==='PROBE'){add=p.confirmAddPct;stage='CONFIRM';event='CONFIRM'}else if(cur.stage==='CONFIRM'){add=p.scaleAddPct;stage='SCALE';event='SCALE'}
  return{stage,exposurePct:Math.min(p.maxPositionPct,cur.exposurePct+add),event,reason:add?'paper_stage_advanced':'paper_position_at_limit'};
}
