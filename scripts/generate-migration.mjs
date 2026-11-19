import {
  mkdtempSync,
  cpSync,
  readdirSync,
  readFileSync,
  existsSync,
  renameSync,
  writeFileSync,
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

// Published fork histories can have a SQL ordinal different from journal idx.
// Drizzle uses idx for snapshot names; preserve those, but give new SQL its next
// unused ordinal so a manual/historical migration is never shadowed.
const priorJournal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8'));
const nextJournalPath = join(output, 'meta/_journal.json');
const nextJournal = JSON.parse(readFileSync(nextJournalPath, 'utf8'));
let ordinal = Math.max(-1, ...readdirSync(source).filter(file => /^\d{4}_.+\.sql$/.test(file)).map(file => Number(file.slice(0, 4))));
for (const entry of nextJournal.entries.slice(priorJournal.entries.length)) {
  const nextTag = String(++ordinal).padStart(4, '0') + entry.tag.slice(4);
  if (nextTag !== entry.tag) {
    renameSync(join(output, entry.tag + '.sql'), join(output, nextTag + '.sql'));
    entry.tag = nextTag;
  }
}
writeFileSync(nextJournalPath, JSON.stringify(nextJournal, null, 2) + '\n');
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
