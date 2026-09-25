import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webSchemaStatus } from './check-web-schema.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const tablePattern =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z][a-z0-9_]*)[`"]?/gi;

function collectTables(paths) {
  const tables = new Set();
  for (const path of paths) {
    for (const match of read(path).matchAll(tablePattern)) tables.add(match[1]);
  }
  return [...tables].sort((left, right) => left.localeCompare(right));
}

function webDomains(tables) {
  const core = new Set([
    'fund_plans',
    'tool_runs',
    'jobs',
    'job_events',
    'devices',
    'tool_controls',
    'book_records',
    'work_jobs',
    'remote_ai_rate_limits',
  ]);
  const definitions = [
    {
      id: 'core',
      label: '仕事・実行・端末・基本台帳',
      matches: (name) => core.has(name),
    },
    {
      id: 'sky',
      label: 'Sky接続・Tool管理',
      matches: (name) => name.startsWith('sky_'),
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      matches: (name) => name.startsWith('marketplace_'),
    },
    { id: 'csv', label: 'CSV業務', matches: (name) => name.startsWith('csv_') },
    {
      id: 'business',
      label: '自動化ファンド・事業補助',
      matches: (name) =>
        name === 'mercari_revenue_plans' || name.startsWith('automation_'),
    },
  ];
  const groups = definitions.map(({ id, label }) => ({
    id,
    label,
    tables: [],
  }));
  for (const table of tables) {
    const indexes = definitions
      .map((definition, index) => (definition.matches(table) ? index : -1))
      .filter((index) => index >= 0);
    if (indexes.length !== 1)
      throw new Error(`Web tableの分類が${indexes.length}件です: ${table}`);
    groups[indexes[0]].tables.push(table);
  }
  return groups.map((group) => ({
    ...group,
    tableCount: group.tables.length,
  }));
}

function taskCounts(tasks) {
  return Object.fromEntries(
    ['done', 'in_progress', 'planned', 'blocked'].map((status) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ]),
  );
}

export function buildDatabaseStatus() {
  const project = JSON.parse(read('data/project-status.json'));
  const deployments = JSON.parse(read('data/database-deployments.json'));
  const billingMigrations = readdirSync(
    resolve(root, 'services/sky-billing/migrations'),
  )
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => `services/sky-billing/migrations/${name}`);
  const operatorDockMigrations = readdirSync(
    resolve(root, 'services/operator-dock/migrations'),
  )
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => `services/operator-dock/migrations/${name}`);
  const osWalletSpendSources = [
    'systems/rock-star-os/src/blackberryrock/wallet.py',
    'systems/rock-star-os/src/blackberryrock/spend.py',
  ];
  const osTransientMigrationTables = ['wallet_postings_spend_v1'];
  const osWalletSpendTables = collectTables(osWalletSpendSources).filter(
    (table) => !osTransientMigrationTables.includes(table),
  );
  const definitions = [
    {
      id: 'web-d1',
      label: 'Web D1',
      engine: 'Cloudflare D1',
      authority: 'Webサービス状態',
      sources: ['db/schema.ts', 'drizzle/'],
      tables: webSchemaStatus.tables,
      expectedAppliedThrough: webSchemaStatus.latestMigration,
    },
    {
      id: 'sky-billing-d1',
      label: 'Sky Billing D1',
      engine: 'Cloudflare D1',
      authority: '収益精算・請求・受取Wallet',
      sources: ['services/sky-billing/migrations/'],
      tables: collectTables(billingMigrations),
      expectedAppliedThrough:
        billingMigrations.at(-1)?.split('/').at(-1) ?? null,
    },
    {
      id: 'operator-dock-d1',
      label: 'Operator Dock D1',
      engine: 'Cloudflare D1',
      authority: '運営専用の端末登録・緊急命令・監査',
      sources: ['services/operator-dock/migrations/'],
      tables: collectTables(operatorDockMigrations),
      expectedAppliedThrough:
        operatorDockMigrations.at(-1)?.split('/').at(-1) ?? null,
    },
    {
      id: 'os-wallet-spend-sqlite',
      label: 'OS Wallet / Spend SQLite',
      engine: 'SQLite',
      authority: '端末内Wallet・支出承認・PAPER position',
      sources: osWalletSpendSources,
      tables: osWalletSpendTables,
      transientMigrationTables: osTransientMigrationTables,
      expectedAppliedThrough: null,
    },
    {
      id: 'android-work-sqlite',
      label: 'Android Work Engine SQLite',
      engine: 'SQLite',
      authority: 'Android work・artifact・run・event',
      sources: [
        'android/core/src/main/resources/schema.sql',
        'android/core/src/main/java/dev/rock/core/ModelProfiles.java',
        'android/core/src/main/java/dev/rock/core/ExternalWriteOutbox.java',
        'android/core/src/main/java/dev/rock/core/BoundedMemory.java',
        'android/core/src/main/java/dev/rock/core/SkyExecutor.java',
      ],
      tables: collectTables([
        'android/core/src/main/resources/schema.sql',
        'android/core/src/main/java/dev/rock/core/ModelProfiles.java',
        'android/core/src/main/java/dev/rock/core/ExternalWriteOutbox.java',
        'android/core/src/main/java/dev/rock/core/BoundedMemory.java',
        'android/core/src/main/java/dev/rock/core/SkyExecutor.java',
      ]),
      expectedAppliedThrough: null,
    },
    {
      id: 'android-platform-sqlite',
      label: 'Android Platform Core SQLite',
      engine: 'SQLite',
      authority: 'component登録・owner承認・OS側ledger',
      sources: [
        'android/core/src/main/java/dev/rock/core/platform/PlatformStore.java',
      ],
      tables: collectTables([
        'android/core/src/main/java/dev/rock/core/platform/PlatformStore.java',
      ]),
      expectedAppliedThrough: null,
    },
  ];
  const expectedIds = definitions.map(({ id }) => id).sort();
  const deploymentIds = Object.keys(deployments.boundaries).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(deploymentIds))
    throw new Error(
      `database deployment境界が不一致です: expected=${expectedIds.join(',')} actual=${deploymentIds.join(',')}`,
    );

  const boundaries = definitions.map((definition) => {
    const deployment = deployments.boundaries[definition.id];
    for (const evidence of deployment.evidence) {
      if (!existsSync(resolve(root, evidence)))
        throw new Error(`${definition.id}: evidenceがありません: ${evidence}`);
    }
    return {
      ...definition,
      tableCount: definition.tables.length,
      sourceStatus: 'VERIFIED',
      deployment,
    };
  });
  const counts = taskCounts(project.tasks);
  const domains = webDomains(webSchemaStatus.tables);
  return {
    schema: 1,
    updatedAt: project.updatedAt,
    scope:
      'repository source, local schema convergence, and recorded deployment evidence',
    summary: {
      boundaryCount: boundaries.length,
      tableCount: boundaries.reduce(
        (sum, boundary) => sum + boundary.tableCount,
        0,
      ),
      sourceVerifiedCount: boundaries.filter(
        (boundary) => boundary.sourceStatus === 'VERIFIED',
      ).length,
      currentProductionReadbackCount: boundaries.filter(
        (boundary) => boundary.deployment.productionReadbackAt,
      ).length,
    },
    projectProgress: {
      total: project.tasks.length,
      ...counts,
      milestone: project.milestone,
      nextAction: project.nextAction,
    },
    webSchema: {
      ...webSchemaStatus,
      domains,
    },
    boundaries,
  };
}

const pipe = (value) => String(value).replaceAll('|', '\\|');
const shown = (value) => value ?? '未確認';

export function renderDatabaseStatus(report) {
  const progress = report.projectProgress;
  const lines = [
    '# Database status',
    '',
    '> `data/project-status.json`、schema、migration、`data/database-deployments.json`から生成する。source検証と本番readbackを混同しない。',
    '',
    `更新日: ${report.updatedAt}`,
    '',
    '## 全体',
    '',
    `- データ境界: ${report.summary.boundaryCount}、table: ${report.summary.tableCount}`,
    `- source inventory: ${report.summary.sourceVerifiedCount}/${report.summary.boundaryCount}確認済み`,
    `- current production readback: ${report.summary.currentProductionReadbackCount}/${report.summary.boundaryCount}`,
    `- 作業進捗: ${progress.total} task中 ${progress.done} done、${progress.in_progress} in progress、${progress.planned} planned、${progress.blocked} blocked`,
    `- 現在milestone: ${progress.milestone}`,
    '',
    '## 保存境界と配備状態',
    '',
    '| 境界 | 責任 | table | source | 配備状態 | 本番適用済み | current readback |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
    ...report.boundaries.map(
      (boundary) =>
        `| ${pipe(boundary.label)} | ${pipe(boundary.authority)} | ${boundary.tableCount} | ${boundary.sourceStatus} | ${boundary.deployment.deploymentStatus} | ${shown(boundary.deployment.productionAppliedThrough)} | ${shown(boundary.deployment.productionReadbackAt)} |`,
    ),
    '',
    '## Web D1',
    '',
    `- expected latest migration: ${report.webSchema.latestMigration}`,
    `- migration files: ${report.webSchema.migrationCount}`,
    `- accidental duplicate: ${report.webSchema.accidentalDuplicateCount}`,
    `- published convergence definitions: ${report.webSchema.publishedConvergenceDeclarations}`,
    `- Marketplace relation guards: ${report.webSchema.marketplaceRelationGuardCount}`,
    '',
    '| 分野 | table | 内訳 |',
    '| --- | ---: | --- |',
    ...report.webSchema.domains.map(
      (domain) =>
        `| ${domain.label} | ${domain.tableCount} | ${domain.tables.join(', ')} |`,
    ),
    '',
    '## 境界別の全table',
    '',
    ...report.boundaries.flatMap((boundary) => [
      `<details><summary>${boundary.label}: ${boundary.tableCount} table</summary>`,
      '',
      boundary.tables.map((table) => `\`${table}\``).join('、'),
      '',
      ...(boundary.transientMigrationTables?.length
        ? [
            `移行時だけ使用して最終schemaに残さないtable: ${boundary.transientMigrationTables.map((table) => `\`${table}\``).join('、')}`,
            '',
          ]
        : []),
      `次の確認: ${boundary.deployment.nextAction}`,
      '',
      '</details>',
      '',
    ]),
    '## 次の作業',
    '',
    progress.nextAction,
    '',
    '本番readbackは読み取り専用で行い、migration適用やデータ変更とは分離して記録する。',
    '',
  ];
  return lines.join('\n');
}

export function serializeDatabaseStatus(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function sync(path, expected, checkOnly) {
  const absolute = resolve(root, path);
  const actual = readFileSync(absolute, 'utf8');
  if (actual === expected) return false;
  if (checkOnly) {
    console.error(`${path}: npm run database:status を実行してください。`);
    return true;
  }
  writeFileSync(absolute, expected);
  return false;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const report = buildDatabaseStatus();
  const checkOnly = process.argv.includes('--check');
  const stale = [
    sync(
      'data/database-status.json',
      serializeDatabaseStatus(report),
      checkOnly,
    ),
    sync('docs/database-status.md', renderDatabaseStatus(report), checkOnly),
  ].some(Boolean);
  if (stale) process.exitCode = 1;
  else
    console.log(
      `database status: ${report.summary.boundaryCount}境界、${report.summary.tableCount} tables、source ${report.summary.sourceVerifiedCount}/${report.summary.boundaryCount}、production readback ${report.summary.currentProductionReadbackCount}/${report.summary.boundaryCount}`,
    );
}
