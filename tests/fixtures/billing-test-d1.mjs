import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

class Statement {
  #database;
  #sql;
  #values = [];
  constructor(database, sql) {
    this.#database = database;
    this.#sql = sql;
  }
  bind(...values) {
    this.#values = values;
    return this;
  }
  run() {
    const result = this.#database.prepare(this.#sql).run(...this.#values);
    return Promise.resolve({
      success: true,
      meta: { changes: Number(result.changes) },
    });
  }
  first() {
    return Promise.resolve(
      this.#database.prepare(this.#sql).get(...this.#values) ?? null,
    );
  }
  all() {
    return Promise.resolve({
      success: true,
      results: this.#database.prepare(this.#sql).all(...this.#values),
    });
  }
}

export class TestD1 {
  constructor(path = ':memory:', { migrate = true, hooks = {} } = {}) {
    this.database = new DatabaseSync(path);
    this.hooks = hooks;
    this.closed = false;
    if (!migrate) return;
    for (const migration of [
      '0001_billing.sql',
      '0002_earnings_settlement.sql',
      '0003_automation_funds.sql',
      '0004_rock_settlement_wallet.sql',
    ])
      this.database.exec(
        readFileSync(
          new URL(
            `../../services/sky-billing/migrations/${migration}`,
            import.meta.url,
          ),
          'utf8',
        ),
      );
  }
  prepare(sql) {
    return new Statement(this.database, sql);
  }
  async batch(statements) {
    if (this.hooks.beforeBatch) await this.hooks.beforeBatch();
    this.database.exec('BEGIN IMMEDIATE');
    const results = [];
    try {
      for (const [index, statement] of statements.entries()) {
        results.push(await statement.run());
        if (this.hooks.afterStatement)
          await this.hooks.afterStatement(index);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    // A lost acknowledgement must not try to roll back an already committed DB.
    if (this.hooks.afterCommit) await this.hooks.afterCommit();
    return results;
  }
  close() {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}
