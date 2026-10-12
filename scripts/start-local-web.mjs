import { runLocalWrangler } from './local-wrangler.mjs';
import { assertLocalWebStateSafe, localWebArguments } from './local-web-state.mjs';

try {
  const { persistTo, devArgs, config, selectionArgs } = localWebArguments(process.argv.slice(2));
  assertLocalWebStateSafe(undefined, persistTo, config);
  await runLocalWrangler([
    { args: ['d1', 'migrations', 'apply', 'site-creator-d1', '--local', ...selectionArgs, '--persist-to', persistTo], env: { ...process.env, CI: '1' } },
    { args: ['dev', ...selectionArgs, ...devArgs, '--persist-to', persistTo] },
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
