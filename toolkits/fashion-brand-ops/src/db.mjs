import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./config.mjs";
import { parseJson } from "./util.mjs";

function hydrate(row) {
  if (!row) return null;
  const value = { ...row };
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith("_json")) value[key.slice(0, -5)] = parseJson(item, {});
  }
  return value;
}

export class Store {
  constructor(dbPath) {
    if (dbPath !== ":memory:") {
      mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
      chmodSync(path.dirname(dbPath), 0o700);
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ":memory:") chmodSync(dbPath, 0o600);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }

  migrate(migrationsDir = path.join(APP_ROOT, "db", "migrations")) {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const applied = new Set(this.db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(sql);
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  close() { this.db.close(); }
  exec(sql) { return this.db.exec(sql); }
  run(sql, ...params) { return this.db.prepare(sql).run(...params); }
  get(sql, ...params) { return hydrate(this.db.prepare(sql).get(...params)); }
  all(sql, ...params) { return this.db.prepare(sql).all(...params).map(hydrate); }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
