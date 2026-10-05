export class DexAdapter {
  constructor({ id, contracts = {} }) {
    this.id = id;
    this.contracts = Object.freeze({ ...contracts });
  }

  async readPoolState() {
    throw new Error("readPoolState() not implemented");
  }

  async quoteSwap() {
    throw new Error("quoteSwap() not implemented");
  }

  async buildRemoveLiquidityCalls() {
    throw new Error("buildRemoveLiquidityCalls() not implemented");
  }

  async buildSwapCalls() {
    throw new Error("buildSwapCalls() not implemented");
  }

  async buildAddLiquidityCalls() {
    throw new Error("buildAddLiquidityCalls() not implemented");
  }
}

export function assertDexContracts(contracts, requiredRoles) {
  const missing = requiredRoles.filter((role) => !contracts[role]);
  if (missing.length) {
    throw new Error(`Missing DEX contract roles: ${missing.join(", ")}`);
  }
  return true;
}
