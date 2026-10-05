import { jsonRpc } from "./rpc.mjs";

function toRpcHex(value) {
  return "0x" + value.toString(16);
}

export async function simulateIntentBatch({
  rpcUrl,
  from,
  intents,
  rpc = jsonRpc,
}) {
  const results = [];

  for (const intent of intents) {
    try {
      const result = await rpc(rpcUrl, "eth_call", [
        {
          from,
          to: intent.to,
          data: intent.data,
          value: toRpcHex(intent.valueWei),
        },
        "latest",
      ]);
      results.push({
        label: intent.label,
        to: intent.to,
        ok: true,
        result,
      });
    } catch (error) {
      results.push({
        label: intent.label,
        to: intent.to,
        ok: false,
        error: String(error?.message ?? error),
      });
    }
  }

  return {
    ok: results.every((x) => x.ok),
    results,
  };
}
