import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeAddressWord,
  decodeInt24Word,
  discoverV3Pool,
  encodeGetPool,
} from "../src/uniswap-v3-readonly.mjs";

const A="0x1111111111111111111111111111111111111111";
const B="0x2222222222222222222222222222222222222222";
const P="0x3333333333333333333333333333333333333333";

test("encodes Uniswap v3 factory getPool",()=>{
  const data=encodeGetPool(A,B,3000);
  assert.equal(data.slice(0,10),"0x1698ee82");
  assert.equal(data.length,10+64*3);
  assert.ok(data.endsWith((3000n).toString(16).padStart(64,"0")));
});

test("decodes address and signed tick words",()=>{
  assert.equal(
    decodeAddressWord("0x"+P.slice(2).padStart(64,"0")),
    P.toLowerCase(),
  );
  const minusOne=(2n**256n-1n).toString(16).padStart(64,"f");
  assert.equal(decodeInt24Word("0x"+minusOne),-1);
});

test("pool discovery is read-only eth_call",async()=>{
  const methods=[];
  const fakeRpc=async(_url,method)=>{
    methods.push(method);
    return "0x"+P.slice(2).padStart(64,"0");
  };
  const pool=await discoverV3Pool({
    rpcUrl:"https://example.invalid",
    factory:A,
    tokenA:A,
    tokenB:B,
    fee:3000,
    rpc:fakeRpc,
  });
  assert.equal(pool,P.toLowerCase());
  assert.deepEqual(methods,["eth_call"]);
});
