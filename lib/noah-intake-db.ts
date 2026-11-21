/** D1 binding adapter. Contract SQL stays verbatim, including repeated named parameters. */
export type IntakeDb = Pick<D1Database, 'prepare' | 'batch'>;
export function intakeStatement(db: IntakeDb, sql: string, values: Record<string, string | number | null> = {}) {
  const args: (string | number | null)[] = [];
  // Strip comments before binding: comments contain example parameter names too.
  const query = sql.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'|:([a-z_][a-z_0-9]*)/g, (token: string, name: string | undefined) => {
    if (!name) return token;
    if (!Object.hasOwn(values, name)) throw new Error(`Missing intake parameter: ${name}`);
    args.push(values[name]);
    return '?';
  });
  return db.prepare(query).bind(...args);
}
