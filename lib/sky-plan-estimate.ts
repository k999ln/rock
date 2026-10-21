/** Planning only: never an executable rate card or authorization to bill/run a model. */
export const sky140Plan = {
 id:'sky-140-draft-v1', monthlyUsd:140, proposedUsageUsd:100, proposedServiceUsd:40,
 priceRequested:true, allocationApproved:true, liveEnabled:false, automaticOverage:false,
 checkedAt:'2026-10-15', allocationConfirmedAt:'2026-10-16', targetMarket:'US',
 collectionPolicyStatus:'design_only_not_enforced',
 sources:['https://developers.openai.com/api/docs/pricing','https://platform.claude.com/docs/en/about-claude/pricing'],
 models:[
  {id:'gpt-6-luna',input:0.10,output:0.50},
  {id:'gpt-6.1-sol',input:2,output:10},
  {id:'gpt-6-astra',input:10,output:50},
  {id:'claude-sonnet-5-5',input:2,output:10},
  {id:'claude-opus-5-5',input:4,output:20},
 ],
 workloads:[
  {id:'light',label:'軽い仕事',input:10000,output:2000},
  {id:'standard',label:'標準の仕事',input:50000,output:10000},
  {id:'heavy',label:'長い仕事',input:500000,output:100000},
 ],
};
export function estimateSkyJobs(input:number,output:number,inputRate:number,outputRate:number,budget:number,toolCostPerJob=0){
 if([input,output,inputRate,outputRate,budget,toolCostPerJob].some(v=>!Number.isFinite(v)||v<0))throw new RangeError('Nonnegative finite values required');
 const perJobUsd=(input*inputRate+output*outputRate)/1000000+toolCostPerJob;
 return {perJobUsd,jobs:perJobUsd>0?Math.floor((budget+1e-10)/perJobUsd):null};
}
