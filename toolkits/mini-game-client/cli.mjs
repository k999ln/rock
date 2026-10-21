#!/usr/bin/env node
import { handoff, inspect, targets } from './client.mjs';

const [action = 'check', target, ...extra] = process.argv.slice(2);
if (extra.length || !['check', 'setup', 'open'].includes(action) || (target !== undefined && !targets.includes(target)) || (action !== 'check' && !target)) {
  console.error('Usage: node toolkits/mini-game-client/cli.mjs [check [ps5|xbox|pro] | setup ps5|xbox|pro | open ps5|xbox|pro]');
  process.exitCode = 2;
} else {
  const result = action === 'check'
    ? (target ? inspect(target) : targets.map((item) => inspect(item)))
    : await handoff(target, action);
  console.log(JSON.stringify(result, null, 2));
  if (['blocked', 'handoff_failed'].includes(result.state)) process.exitCode = 1;
}
