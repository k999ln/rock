import { jsonRpc } from "./rpc.mjs";

export const ROBINHOOD_MAINNET = Object.freeze({
  chainId: 4663,
  publicRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
});

export const UNISWAP_V4_ROBINHOOD = Object.freeze({
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  positionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
  quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
  stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
});

export async function verifyRobinhoodMainnetUniswapV4(
  rpcUrl = ROBINHOOD_MAINNET.publicRpcUrl,
) {
  const chainHex = await jsonRpc(rpcUrl, "eth_chainId");
  const chainId = Number.parseInt(chainHex, 16);
  if (chainId !== ROBINHOOD_MAINNET.chainId) {
    throw new Error(`Wrong chain: expected 4663, got ${chainId}`);
  }

  const entries = await Promise.all(
    Object.entries(UNISWAP_V4_ROBINHOOD).map(async ([name, address]) => {
      const code = await jsonRpc(rpcUrl, "eth_getCode", [address, "latest"]);
      return {
        name,
        address,
        hasCode: typeof code === "string" && code !== "0x" && code !== "0x0",
        byteLength:
          typeof code === "string" && code.startsWith("0x")
            ? Math.max(0, (code.length - 2) / 2)
            : 0,
      };
    }),
  );

  const missing = entries.filter((entry) => !entry.hasCode);
  if (missing.length) {
    throw new Error(
      `Missing expected Uniswap v4 code: ${missing.map((x) => x.name).join(", ")}`,
    );
  }
  return { chainId, rpcUrl, contracts: entries };
}
