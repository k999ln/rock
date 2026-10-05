import {
  probePair,
  ROBINHOOD_MAINNET_UNISWAP_V3,
} from "./uniswap-v3-readonly.mjs";

const [tokenA,tokenB]=process.argv.slice(2);
if(!tokenA || !tokenB){
  console.error("Usage: npm run uniswap:probe -- <tokenA> <tokenB>");
  process.exit(2);
}

console.log("READ ONLY — Robinhood Chain mainnet Uniswap v3");
console.log(`Factory: ${ROBINHOOD_MAINNET_UNISWAP_V3.factory}`);

const pools=await probePair({tokenA,tokenB});
console.log(JSON.stringify(pools,(_,v)=>typeof v==="bigint"?v.toString():v,2));
