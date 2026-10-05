export async function jsonRpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`RPC error ${payload.error.code}: ${payload.error.message}`);
  }
  return payload.result;
}

export async function inspectRobinhoodRpc(rpcUrl, expectedChainId = 46630) {
  const [chainHex, blockHex] = await Promise.all([
    jsonRpc(rpcUrl, "eth_chainId"),
    jsonRpc(rpcUrl, "eth_blockNumber"),
  ]);

  const chainId = Number.parseInt(chainHex, 16);
  const blockNumber = Number.parseInt(blockHex, 16);

  if (chainId !== expectedChainId) {
    throw new Error(`Wrong chain: expected ${expectedChainId}, got ${chainId}`);
  }

  return { chainId, blockNumber, rpcUrl };
}
