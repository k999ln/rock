import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function localStartFixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rock-local-start-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  for (const name of ['start-local-web.mjs', 'local-web-state.mjs', 'local-wrangler.mjs', 'spider-web-runtime.mjs']) {
    copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  }
  const packageAt = (path, manifest, source) => {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(path, 'index.mjs'), source);
  };
  const plugin = join(root, 'node_modules/@cloudflare/vite-plugin');
  packageAt(plugin, { name: '@cloudflare/vite-plugin', exports: { '.': { import: './index.mjs' } } }, '');
  packageAt(join(root, 'node_modules/wrangler'), {
    name: 'wrangler', version: '4.122.0', bin: { wrangler: 'index.mjs' },
  }, 'throw new Error("Wrong root Wrangler selected");');
  packageAt(join(plugin, 'node_modules/wrangler'), {
    name: 'wrangler', version: '4.147.0', bin: { wrangler: 'index.mjs' },
  }, `
    import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
    const args = process.argv.slice(2), stage = args[0];
    const record = (value) => appendFileSync('calls.jsonl', JSON.stringify(value) + '\\n');
    record({stage, args, ci: process.env.CI});
    if (stage === 'dev' && args.includes('dist/server/wrangler.json') && !existsSync('migrated')) process.exit(98);
    if (process.env.WAIT_STAGE === stage) {
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
        record({received: signal, stage}); process.exit(0);
      });
      console.log('READY:' + stage);
      setInterval(() => {}, 1000);
    } else if (process.env.SELF_SIGNAL_STAGE === stage) {
      process.kill(process.pid, 'SIGTERM');
    } else {
      const code = Number(process.env[stage === 'd1' ? 'MIGRATION_EXIT' : 'DEV_EXIT'] || 0);
      if (stage === 'd1' && code === 0) writeFileSync('migrated', 'done');
      process.exit(code);
    }
  `);
  return {
    root,
    command: [join(root, 'scripts/start-local-web.mjs')],
    calls: () => readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)),
    env: { ...process.env, CI: 'fixture-dev-env' },
  };
}

