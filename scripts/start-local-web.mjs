import { runLocalWrangler } from './local-wrangler.mjs';

const config = 'dist/server/wrangler.json';
await runLocalWrangler([
  {
    args: ['d1', 'migrations', 'apply', 'site-creator-d1', '--local', '--config', config],
    env: { ...process.env, CI: '1' },
  },
  { args: ['dev', '--config', config, ...process.argv.slice(2)] },
]);
