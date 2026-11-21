import { auditNoahContainerArgs, auditNoahVmArgs } from '../lib/noah-screenless-audit.mjs';
import { RECIPES } from '../lib/noah-execution-contract.mjs';
import { containerArgs, engineArgs } from './noah-isolated-runtime.mjs';
import { terminalContainerArgs } from './noah-terminal-runtime.mjs';

// Inspect the same argument builders as the runner; never start a VM or container.
const failures = [];
let checked = 0;
const check = (name, violations) => {
  checked += 1;
  for (const violation of violations) failures.push(`${name}: ${violation}`);
};
for (const recipe of Object.values(RECIPES)) {
  check(`adapter ${recipe.key}`, auditNoahContainerArgs(containerArgs('noah-run-check', 'image', recipe)));
}
const volume = 'noah-terminal-00000000-0000-0000-0000-000000000000';
for (const [language, entry] of [['python', 'main.py'], ['node', 'main.mjs']]) {
  for (const stage of [false, true]) {
    const args = terminalContainerArgs('noah-terminal-check', 'image', volume, { root: '' }, entry, language, stage);
    check(`${language} ${stage ? 'stage' : 'run'}`, auditNoahContainerArgs(args, { stage }));
  }
}
check('VM', auditNoahVmArgs(engineArgs()));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Noah screenless: ${checked} launch configurations passed`);
}
