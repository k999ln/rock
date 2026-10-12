import {
  mkdtempSync,
  cpSync,
  readdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ExFAT/macOS may put AppleDouble files next to snapshots. Drizzle tries to parse
// those as JSON, so generate from a clean temporary copy and preserve old bytes.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'rock-migration-'));
const output = join(temporary, 'drizzle');
const source = join(root, 'drizzle');
cpSync(source, output, {
  recursive: true,
  filter: (file) => !file.split('/').some((part) => part.startsWith('._')),
});
const result = spawnSync(
  process.execPath,
  [
    join(root, 'node_modules/drizzle-kit/bin.cjs'),
    'generate',
    '--dialect=sqlite',
    `--schema=${join(root, 'db/schema.ts')}`,
    '--out=./drizzle',
    ...process.argv.slice(2),
  ],
  { cwd: temporary, encoding: 'utf8' },
);
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (
  result.status !== 0 ||
  /(?:^|\n)\w*Error:/.test((result.stdout || '') + (result.stderr || ''))
)
  process.exit(result.status || 1);
const files = readdirSync(output, { recursive: true, encoding: 'utf8' }).filter(
  (file) => /\.json$|\.sql$/.test(file),
);
for (const file of files) {
  const target = resolve(source, file);
  if (
    file !== 'meta/_journal.json' &&
    existsSync(target) &&
    !readFileSync(target).equals(readFileSync(join(output, file)))
  )
    throw new Error(`既存の適用履歴は変更できません: ${file}`);
}
for (const file of files) cpSync(join(output, file), join(source, file));
console.log('既存migrationを保ち、新しいmigrationとjournalを反映しました。');
