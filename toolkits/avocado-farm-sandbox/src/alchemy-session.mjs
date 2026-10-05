import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function verifyAlchemyAgentWalletSession() {
  try {
    const { stdout } = await execFileAsync(
      "alchemy",
      ["--json", "--no-interactive", "wallet", "status", "--verify"],
      { timeout: 15_000, maxBuffer: 1_000_000 },
    );
    return { ok: true, status: JSON.parse(stdout) };
  } catch (error) {
    return {
      ok: false,
      reason:
        "No verified Alchemy Agent Wallet session was found. Paper mode still works.",
      detail: String(error?.message ?? error),
    };
  }
}
