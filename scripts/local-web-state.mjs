import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Resolve existing symlinks even when their destination or a later child does
// not exist yet. Otherwise a custom path can silently put state back in dist.
function physicalPath(path, depth = 0) {
  if (depth > 40) throw new Error('Local persistence path contains a symlink loop.');
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(sep).filter(Boolean)) {
    const next = join(current, part);
    try {
      current = lstatSync(next).isSymbolicLink()
        ? physicalPath(resolve(dirname(next), readlinkSync(next)), depth + 1)
        : realpathSync(next);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      current = next;
    }
  }
  return current;
}

function inside(path, directory) {
  const child = relative(directory, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

export function localWebArguments(args, root = projectRoot) {
  let persistTo, config, environment;
  const devArgs = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--cwd' || arg.startsWith('--cwd='))
      throw new Error('This local preview wrapper does not support --cwd. Run cd /path/to/project && npm start so migration and serving use the same project.');
    if (arg === '--no-remote') continue;
    if (['--remote', '-r'].includes(arg) || arg.startsWith('--remote=') || (arg.startsWith('-r') && !arg.startsWith('--'))) {
      let value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : 'true';
      if (!arg.includes('=') && ['true', 'false'].includes(args[index + 1])) value = args[++index];
      if (value !== 'false') throw new Error('This preview wrapper runs local migrations and cannot use --remote. Use Wrangler directly for an explicitly authorized remote session.');
      continue;
    }
    const option = ['--persist-to', '--config', '-c', '--env', '-e'].find(name => arg === name || arg.startsWith(`${name}=`)) ??
      (arg.startsWith('-c') && !arg.startsWith('--') ? '-c' : arg.startsWith('-e') && !arg.startsWith('--') ? '-e' : undefined);
    if (!option) { devArgs.push(arg); continue; }
    const value = arg === option ? args[++index] : arg.slice(option.length + (arg[option.length] === '=' ? 1 : 0));
    if (!value?.trim() || (arg === option && value.startsWith('-')))
      throw new Error(`${option} requires a non-empty value.`);
    if (option === '--env' || option === '-e') {
      if (environment !== undefined && environment !== value) throw new Error('Conflicting --env values; choose one local environment.');
      environment = value;
      continue;
    }
    const next = physicalPath(resolve(root, value));
    if (option === '--config' || option === '-c') {
      if (config && config !== next) throw new Error('Conflicting --config paths; choose one local Worker configuration.');
      config = next;
    } else {
      if (persistTo && persistTo !== next) throw new Error('Conflicting --persist-to directories; choose one complete local store.');
      persistTo = next;
    }
  }
  persistTo ??= physicalPath(join(root, '.wrangler/state'));
  if (inside(persistTo, physicalPath(join(root, 'dist'))))
    throw new Error(`Local persistence must be outside build output: ${persistTo}`);
  config ??= 'dist/server/wrangler.json';
  const selectionArgs = ['--config', config, ...(environment === undefined ? [] : ['--env', environment])];
  return { persistTo, devArgs, config, selectionArgs };
}

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function assertLocalWebStateSafe(root = projectRoot, persistTo = localWebArguments([], root).persistTo, config = 'dist/server/wrangler.json') {
  const buildLegacy = join(root, 'dist/server/.wrangler/state');
  const configuredLegacy = join(dirname(resolve(root, config)), '.wrangler/state');
  const legacy = [...new Set([buildLegacy, configuredLegacy])].find(path =>
    existsSync(path) && readdirSync(path).length > 0 &&
    (path === buildLegacy || physicalPath(path) !== persistTo));
  if (!legacy) return;
  const occupied = existsSync(persistTo);
  throw new Error([
    `Existing local preview state needs an explicit store choice: ${legacy}`,
    'Build/start stopped without changing either store. Stop all local preview processes first.',
    legacy !== buildLegacy ? 'For a custom configuration outside dist, --persist-to may select its existing complete store directly.' : 'This old location is inside build output and must be moved before rebuilding.',
    'Back up the complete old state directory outside dist, including D1, R2, SQLite WAL/SHM files and blobs.',
    `Selected persistence directory: ${persistTo} (${occupied ? 'already exists' : 'does not exist'}).`,
    occupied
      ? 'Both locations exist: back up both and choose one complete store. Never merge or overwrite them. Move the old dist state to a separate unused backup directory before rebuilding; use --persist-to to select that store if needed.'
      : `After backing up, move the whole old store only while the destination is absent:\n  mkdir -p ${quote(dirname(persistTo))}\n  mv ${quote(legacy)} ${quote(persistTo)}`,
    'Then run npm run build and npm start (add -- --persist-to /absolute/store for a custom location).',
  ].join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { assertLocalWebStateSafe(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
