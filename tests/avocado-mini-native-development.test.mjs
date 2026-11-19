import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'systems/rock-star-os/targets/avocado-mini');
function run(program, args) {
  const value = spawnSync(program, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(value.error, undefined, value.error?.message);
  assert.equal(value.status, 0, (value.stdout + value.stderr).slice(-4000));
  return value.stdout;
}
function temporary(task) {
  const path = mkdtempSync(join(tmpdir(), 'mini-engineering-'));
  try { return task(path); } finally { rmSync(path, { recursive: true, force: true }); }
}
function files(path, prefix = '') {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(path, entry.name), prefix + entry.name + '/') : [prefix + entry.name]).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
await test('Mini supervisor C logic compiles and rejects stale/replayed grants on the host', () => temporary(out => {
  const executable = join(out, 'supervisor');
  run('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', join(target, 'firmware/supervisor.c'),
    join(target, 'tests/supervisor_test.c'), '-o', executable]);
  assert.match(run(executable, []), /LED-only bench logic/);
}));
await test('Mini driver communicates over a real host PTY and checks configured USB identity fixtures', () => {
  run('python3', ['-B', '-m', 'unittest', 'discover', '-s', join(target, 'tests'), '-p', 'test_*.py']);
});
await test('Mini rootfs overlay is staged without enabling a service or claiming an OS image', () => temporary(out => {
  const output = join(out, 'overlay');
  const manifest = JSON.parse(run('python3', [join(target, 'linux/stage.py'), '--output', output]));
  assert.equal(manifest.bootableOsImage, false);
  assert.equal(manifest.serviceEnabled, false);
  assert.equal(manifest.physicalAcceptance, false);
  assert.equal(manifest.factoryRelease, false);
  assert.ok(!Object.hasOwn(manifest.files, 'etc/rockstaros-mini/supervisor-device.json'));
  assert.match(readFileSync(join(output, 'usr/lib/rockstaros-mini/launch_eve.py'), 'utf8'), /https:\/\/avoado\.si\/os\/eve/);
  const retry = spawnSync('python3', [join(target, 'linux/stage.py'), '--output', output], { encoding: 'utf8' });
  assert.notEqual(retry.status, 0);
}));
await test('Mini CAD source and libraries regenerate deterministically with balanced expressions', () => temporary(out => {
  run('python3', [join(target, 'hardware/generate_bench.py'), '--output', out]);
  const source = join(target, 'hardware/cad');
  for (const path of files(out)) {
    const generated = readFileSync(join(out, path), 'utf8');
    assert.equal(generated, readFileSync(join(source, path), 'utf8'), path);
    if (!/kicad_(?:sch|pcb|mod|sym)$|lib-table$/.test(path)) continue;
    let quoted = false, escaped = false, depth = 0;
    for (const c of generated) {
      if (escaped) { escaped = false; continue; }
      if (quoted && c === '\\') { escaped = true; continue; }
      if (c === '"') quoted = !quoted;
      if (!quoted && c === '(') depth++;
      if (!quoted && c === ')') { depth--; assert.ok(depth >= 0, path); }
    }
    assert.equal(quoted, false, path); assert.equal(depth, 0, path);
  }
  const circuit = JSON.parse(readFileSync(join(source, 'bench-interface.json')));
  assert.equal(circuit.productionRelease, false);
  assert.deepEqual(circuit.normallyClosedContacts[0], [1, 2]);
  assert.ok(circuit.normallyClosedContacts.some(p => p[0] === 9 && p[1] === 10));
  assert.match(readFileSync(join(source, 'mini-supervisor-bench.kicad_sch'), 'utf8'), /4\.7k 1%/);
}));
await test('Mini binary protocol and billing remain limited to the documented engineering scope', () => {
  const contract = JSON.parse(readFileSync(resolve(root, 'contracts/avocado-mini-supervisor.json')));
  assert.equal(contract.frame.bytes, 20);
  assert.equal(contract.productionRelease, false);
  assert.equal(contract.physicalBootAccepted, false);
  assert.deepEqual(contract.hostDriverCommands, ['HEARTBEAT', 'STOP']);
  assert.equal(contract.flags.STOP_OK, 1);
  assert.equal(contract.flags.DOCKED, 16);
  assert.match(contract.billing, /no new pricing/);
});
