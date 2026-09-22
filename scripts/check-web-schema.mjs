import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = resolve(root, 'drizzle');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

function unique(values, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  if (duplicates.size)
    throw new Error(
      `web schema: ${label}が重複しています: ${[...duplicates].join(', ')}`,
    );
  return seen;
}

const canonicalTables = [
  ...read('db/schema.ts').matchAll(
    /sqliteTable\(\s*(['"`])([a-z][a-z0-9_]*)\1/g,
  ),
].map((match) => match[2]);
const canonicalSet = unique(canonicalTables, 'db/schema.tsのtable名');

const sqlFiles = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right));
const journal = JSON.parse(read('drizzle/meta/_journal.json')).entries;
const journalFiles = journal.map((entry) => `${entry.tag}.sql`);
unique(journalFiles, 'migration journal entry');
if (
  JSON.stringify(
    [...journalFiles].sort((left, right) => left.localeCompare(right)),
  ) !== JSON.stringify(sqlFiles)
)
  throw new Error(
    `web schema: SQLとjournalが一致しません\nSQL: ${sqlFiles.join(', ')}\njournal: ${journalFiles.join(', ')}`,
  );

for (let index = 0; index < journal.length; index += 1) {
  if (journal[index].idx !== index)
    throw new Error(
      `web schema: migration idxが連続していません: ${journal[index].tag}`,
    );
  if (index > 0 && journal[index - 1].when >= journal[index].when)
    throw new Error(
      `web schema: migration timestampが昇順ではありません: ${journal[index].tag}`,
    );
}

const ordinalGroups = new Map();
for (const file of sqlFiles) {
  const ordinal = file.slice(0, 4);
  const group = ordinalGroups.get(ordinal) ?? [];
  group.push(file);
  ordinalGroups.set(ordinal, group);
}
const publishedFork = ['0002_operations_backend.sql', '0002_work_jobs.sql'];
for (const [ordinal, files] of ordinalGroups) {
  if (files.length === 1) continue;
  if (
    ordinal !== '0002' ||
    JSON.stringify(files) !== JSON.stringify(publishedFork)
  )
    throw new Error(
      `web schema: migration番号${ordinal}が重複しています: ${files.join(', ')}`,
    );
}

const declarationPattern =
  /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z][a-z0-9_]*)[`"]?/gi;
const declarations = new Map();
for (const file of sqlFiles) {
  for (const match of read(`drizzle/${file}`).matchAll(declarationPattern)) {
    const name = match[2];
    const entries = declarations.get(name) ?? [];
    entries.push({ file, idempotent: Boolean(match[1]) });
    declarations.set(name, entries);
  }
}

let convergenceDeclarations = 0;
for (const [table, entries] of declarations) {
  if (entries.length === 1) continue;
  const repeated = entries.slice(1);
  for (const entry of repeated) {
    if (entry.file !== '0004_union_bridge.sql' || !entry.idempotent)
      throw new Error(
        `web schema: ${table}が意図しないmigrationで再定義されています: ${entry.file}`,
      );
    convergenceDeclarations += 1;
  }
}

const requiredMarketplaceTriggers = [
  'marketplace_approvals_relation_guard',
  'marketplace_position_binding_frozen',
  'marketplace_positions_no_delete',
  'marketplace_positions_relation_guard',
  'marketplace_receipts_relation_guard',
  'marketplace_reservation_binding_frozen',
  'marketplace_reservations_no_delete',
  'marketplace_reservations_relation_guard',
];
const requiredSkyReviewTriggers = [
  'sky_tool_package_reviews_no_delete',
  'sky_tool_package_reviews_no_update',
];
const database = new DatabaseSync(':memory:');
try {
  for (const file of sqlFiles) {
    for (const statement of read(`drizzle/${file}`)
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      database.exec(statement);
  }
  const migratedTables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => name);
  const migratedSet = new Set(migratedTables);
  const missing = [...canonicalSet].filter((name) => !migratedSet.has(name));
  const extra = [...migratedSet].filter((name) => !canonicalSet.has(name));
  if (missing.length || extra.length)
    throw new Error(
      `web schema: canonical schemaとmigration結果が不一致です\nmissing: ${missing.join(', ') || '-'}\nextra: ${extra.join(', ') || '-'}`,
    );

  const migratedTriggers = new Set(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
      )
      .all()
      .map(({ name }) => name),
  );
  const missingTriggers = requiredMarketplaceTriggers.filter(
    (name) => !migratedTriggers.has(name),
  );
  const missingSkyReviewTriggers = requiredSkyReviewTriggers.filter(
    (name) => !migratedTriggers.has(name),
  );
  if (missingTriggers.length)
    throw new Error(
      `web schema: Marketplace関係guardが不足しています: ${missingTriggers.join(', ')}`,
    );
  if (missingSkyReviewTriggers.length)
    throw new Error(
      `web schema: Sky審査台帳guardが不足しています: ${missingSkyReviewTriggers.join(', ')}`,
    );
} finally {
  database.close();
}

export const webSchemaStatus = Object.freeze({
  tableCount: canonicalSet.size,
  tables: [...canonicalSet].sort((left, right) => left.localeCompare(right)),
  migrationCount: sqlFiles.length,
  latestMigration: sqlFiles.at(-1),
  accidentalDuplicateCount: 0,
  publishedConvergenceDeclarations: convergenceDeclarations,
  marketplaceRelationGuardCount: requiredMarketplaceTriggers.length,
  skyReviewGuardCount: requiredSkyReviewTriggers.length,
  migrationJournalMatches: true,
});

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  console.log(
    `web schema: ${webSchemaStatus.tableCount} tables、accidental duplicate ${webSchemaStatus.accidentalDuplicateCount}、published convergence ${webSchemaStatus.publishedConvergenceDeclarations} definitions、Marketplace relation guards ${webSchemaStatus.marketplaceRelationGuardCount}、Sky review guards ${webSchemaStatus.skyReviewGuardCount}、migration/journal一致`,
  );
