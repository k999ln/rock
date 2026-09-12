import { loadConfig } from "../src/config.mjs";
import { Store } from "../src/db.mjs";

const config = loadConfig();
const store = new Store(config.dbPath);
store.migrate();
const migrations = store.all("SELECT version, applied_at FROM schema_migrations ORDER BY version");
process.stdout.write(`${JSON.stringify({ ok: true, db_path: config.dbPath, migrations }, null, 2)}\n`);
store.close();
