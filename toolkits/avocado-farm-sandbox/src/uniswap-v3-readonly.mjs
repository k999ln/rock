import { jsonRpc } from "./rpc.mjs";

export const ROBINHOOD_MAINNET_UNISWAP_V3 = Object.freeze({
  chainId: 4663,
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
  positionManager: "0x73991a25c818bf1f1128deaab1492d45638de0d3",
  swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
});

const SELECTOR = Object.freeze({
  getPool: "0x1698ee82",
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  fee: "0xddca3f43",
  decimals: "0x313ce567",
});

const ADDRESS_RE=/^0x[0-9a-fA-F]{40}$/;

function strip0x(value){ return value.startsWith("0x") ? value.slice(2) : value; }
function word(value){ return strip0x(value).padStart(64,"0"); }
function addressWord(address){
  if(!ADDRESS_RE.test(address)) throw new Error(`Invalid address: ${address}`);
  return word(address.toLowerCase());
}
function uintWord(value){ return BigInt(value).toString(16).padStart(64,"0"); }

export function encodeGetPool(tokenA, tokenB, fee){
  return SELECTOR.getPool + addressWord(tokenA) + addressWord(tokenB) + uintWord(fee);
}

export function decodeAddressWord(hex){
  const clean=strip0x(hex);
  if(clean.length < 64) throw new Error("Short address return");
  return "0x"+clean.slice(24,64);
}

export function decodeUintWord(hex, index=0){
  const clean=strip0x(hex);
  const start=index*64;
  const chunk=clean.slice(start,start+64);
  if(chunk.length!==64) throw new Error("Short uint return");
  return BigInt("0x"+chunk);
}

export function decodeInt24Word(hex, index=0){
  const raw=decodeUintWord(hex,index) & ((1n<<24n)-1n);
  return Number(raw >= (1n<<23n) ? raw-(1n<<24n) : raw);
}

async function ethCall(rpcUrl,to,data,rpc=jsonRpc){
  return rpc(rpcUrl,"eth_call",[{to,data},"latest"]);
}

export async function discoverV3Pool({
  rpcUrl=ROBINHOOD_MAINNET_UNISWAP_V3.rpcUrl,
  factory=ROBINHOOD_MAINNET_UNISWAP_V3.factory,
  tokenA,
  tokenB,
  fee,
  rpc=jsonRpc,
}){
  const result=await ethCall(rpcUrl,factory,encodeGetPool(tokenA,tokenB,fee),rpc);
  const pool=decodeAddressWord(result);
  return /^0x0{40}$/i.test(pool) ? null : pool;
}

export async function readV3Pool({
  rpcUrl=ROBINHOOD_MAINNET_UNISWAP_V3.rpcUrl,
  pool,
  rpc=jsonRpc,
}){
  if(!ADDRESS_RE.test(pool)) throw new Error("Invalid pool address");

  const [slot0Hex, liquidityHex, token0Hex, token1Hex, feeHex] = await Promise.all([
    ethCall(rpcUrl,pool,SELECTOR.slot0,rpc),
    ethCall(rpcUrl,pool,SELECTOR.liquidity,rpc),
    ethCall(rpcUrl,pool,SELECTOR.token0,rpc),
    ethCall(rpcUrl,pool,SELECTOR.token1,rpc),
    ethCall(rpcUrl,pool,SELECTOR.fee,rpc),
  ]);

  const token0=decodeAddressWord(token0Hex);
  const token1=decodeAddressWord(token1Hex);

  const [dec0Hex, dec1Hex] = await Promise.all([
    ethCall(rpcUrl,token0,SELECTOR.decimals,rpc),
    ethCall(rpcUrl,token1,SELECTOR.decimals,rpc),
  ]);

  const sqrtPriceX96=decodeUintWord(slot0Hex,0);
  const tick=decodeInt24Word(slot0Hex,1);
  const decimals0=Number(decodeUintWord(dec0Hex));
  const decimals1=Number(decodeUintWord(dec1Hex));
  const ratio=Number(sqrtPriceX96) / 2**96;
  const priceToken1PerToken0=(ratio*ratio) * 10**(decimals0-decimals1);

  return {
    pool,
    token0,
    token1,
    fee: Number(decodeUintWord(feeHex)),
    liquidity: decodeUintWord(liquidityHex),
    sqrtPriceX96,
    tick,
    decimals0,
    decimals1,
    priceToken1PerToken0,
  };
}

export async function probePair({
  tokenA,
  tokenB,
  feeTiers=[100,500,3000,10000],
  rpcUrl=ROBINHOOD_MAINNET_UNISWAP_V3.rpcUrl,
  rpc=jsonRpc,
}){
  const found=[];
  for(const fee of feeTiers){
    const pool=await discoverV3Pool({rpcUrl,tokenA,tokenB,fee,rpc});
    if(!pool) continue;
    found.push(await readV3Pool({rpcUrl,pool,rpc}));
  }
  return found;
}
