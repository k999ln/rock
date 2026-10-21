import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSpiderRiskPlan,
  MAX_RISK_CONTENT_CHARACTERS,
  MAX_RISK_PATHS,
} from '../toolkits/spider-guard/risk-policy.mjs';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const argumentsList = process.argv.slice(2);
const useChanged = argumentsList.length === 0 || argumentsList.includes('--changed');
const explicitPaths = argumentsList.filter((value) => value !== '--changed');
const TEXT_EXTENSIONS = new Set([
  '', '.c', '.css', '.env', '.h', '.html', '.java', '.js', '.json', '.jsx',
  '.md', '.mjs', '.mts', '.py', '.sh', '.sql', '.toml', '.ts', '.tsx', '.txt',
  '.xml', '.yaml', '.yml',
]);

function gitPaths(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 2 * 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
    }).toString('utf8').split('\0').filter(Boolean);
  } catch {
    throw new Error('SPIDER_RISK_GIT_READ_FAILED');
  }
}

const paths = useChanged
  ? [
      ...gitPaths(['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD', '--']),
      ...gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
    ]
  : explicitPaths;
const uniquePaths = [...new Set(paths)];
if (uniquePaths.length > MAX_RISK_PATHS) throw new Error('SPIDER_RISK_PATH_LIMIT');

let totalBytes = 0;
let aggregateCoverageLimited = false;
const inputs = [];
for (const relativePath of uniquePaths) {
  if (typeof relativePath !== 'string' || relativePath.includes('\0') ||
      relativePath.startsWith('/') || relativePath.split('/').includes('..'))
    throw new Error('SPIDER_RISK_PATH_INVALID');
  const absolutePath = resolve(root, relativePath);
  const stat = lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) continue;
  const canonical = realpathSync(absolutePath);
  if (canonical !== root && !canonical.startsWith(`${root}${sep}`))
    throw new Error('SPIDER_RISK_PATH_INVALID');
  const extension = relativePath.match(/(?:^|\/)\.env(?:\.|$)/u)
    ? '.env'
    : extname(relativePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) continue;
  if (totalBytes + stat.size > 2 * 1024 * 1024) {
    aggregateCoverageLimited = true;
    inputs.push({ path: relativePath, content: '' });
    continue;
  }
  totalBytes += stat.size;
  const content = readFileSync(canonical, 'utf8');
  inputs.push({
    path: relativePath,
    content: content.slice(0, MAX_RISK_CONTENT_CHARACTERS + 1),
  });
}

const plan = createSpiderRiskPlan(inputs);
plan.coverageLimited ||= aggregateCoverageLimited;
console.log(JSON.stringify(plan, null, 2));
