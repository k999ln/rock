import { loadConfig } from "../src/config.mjs";
import { Store } from "../src/db.mjs";
import { signApprovalGrant } from "../src/approval.mjs";

const [approvalId, actorId] = process.argv.slice(2);
if (!approvalId || !actorId) throw new Error("Usage: npm run approval:sign -- <approval-id> <actor-id>");
const config = loadConfig();
const store = new Store(config.dbPath);
store.migrate();
const request = store.get("SELECT * FROM approval_requests WHERE id = ?", approvalId);
if (!request) throw new Error("approval_not_found");
process.stdout.write(`${signApprovalGrant(request, actorId, config.approvalSecret)}\n`);
store.close();
