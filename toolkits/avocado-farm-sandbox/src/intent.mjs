const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_RE = /^0x(?:[a-fA-F0-9]{2})*$/;

export function createCallIntent({
  label,
  to,
  data = "0x",
  valueWei = 0n,
  contractRole = "unknown",
}) {
  if (!ADDRESS_RE.test(to)) throw new Error("Invalid target address");
  if (!HEX_RE.test(data)) throw new Error("Invalid calldata");
  if (typeof valueWei !== "bigint" || valueWei < 0n) {
    throw new Error("valueWei must be a non-negative bigint");
  }

  return Object.freeze({
    label,
    to,
    data,
    valueWei,
    contractRole,
  });
}

export function validateIntentBatch(intents, policy) {
  const reasons = [];
  if (!Array.isArray(intents) || intents.length === 0) {
    reasons.push("Intent batch is empty");
  }
  if (intents.length > (policy.maxCallsPerBatch ?? 8)) {
    reasons.push("Too many calls in one batch");
  }

  const allow = new Set((policy.allowedContracts ?? []).map((x) => x.toLowerCase()));
  let totalValueWei = 0n;

  for (const intent of intents) {
    if (!allow.has(intent.to.toLowerCase())) {
      reasons.push(`Target not allowlisted: ${intent.to}`);
    }
    totalValueWei += intent.valueWei;
  }

  if (
    policy.maxNativeValueWei !== undefined &&
    totalValueWei > policy.maxNativeValueWei
  ) {
    reasons.push("Native value limit exceeded");
  }

  return { ok: reasons.length === 0, reasons, totalValueWei };
}
