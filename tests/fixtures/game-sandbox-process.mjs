// One OS process of the GAME01 restart E2E. `start` applies the first half of
// the fixture and writes the save file; `resume` is a fresh process that loads
// that file and continues. Output is one JSON line for the parent test.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  applySandboxCommand,
  createSandbox,
  loadSandbox,
  saveSandbox,
  sandboxDigest,
} from '../../lib/game-sandbox.ts';

const [mode, savePath] = process.argv.slice(2);
const fixture = JSON.parse(
  readFileSync(new URL('./game-sandbox-session.json', import.meta.url), 'utf8'),
);
const apply = (state, commands) =>
  commands.reduce(
    (current, command) =>
      applySandboxCommand(current, command, current.revision),
    state,
  );
if (mode === 'start') {
  const state = apply(
    createSandbox(fixture.create),
    fixture.commands.slice(0, fixture.restartAfter),
  );
  writeFileSync(savePath, await saveSandbox(state));
  console.log(
    JSON.stringify({ pid: process.pid, digest: await sandboxDigest(state) }),
  );
} else if (mode === 'resume') {
  const loaded = await loadSandbox(readFileSync(savePath, 'utf8'));
  const loadedDigest = await sandboxDigest(loaded);
  const state = apply(loaded, fixture.commands.slice(fixture.restartAfter));
  console.log(
    JSON.stringify({
      pid: process.pid,
      loadedDigest,
      digest: await sandboxDigest(state),
      tick: state.tick,
    }),
  );
} else {
  throw new Error('mode must be start or resume');
}
