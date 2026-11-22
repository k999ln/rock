/** Read-only coverage audit. Metadata/handshake success is never counted as execution success. */
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { noahCloudEntry } from '../lib/noah-cloud-api.ts';
import { noahProjectDetail } from '../lib/noah-project-api.ts';
import { resolveNoahProvider } from '../lib/noah-provider-resolve.ts';
import { prepareProvider } from '../lib/noah-gradio.ts';
import { prepareProviderMcp } from '../lib/noah-provider-mcp.ts';
import { createCollectorNetwork } from './noah-collector-network.mjs';

export async function auditNoahEntry(entry, { live = false, fetcher = fetch } = {}) {
  const base = { id: entry.card.feedbackId ?? entry.card.id, name: entry.card.name };
  const profile = noahCloudEntry(entry);
  const { connection } = noahProjectDetail(entry);
  if (connection.kind === 'ready') return { ...base, state: 'listed_provider', family: connection.familyId, executionVerified: false };
  if (profile) return { ...base, state: 'cloud_profile', profile, executionVerified: false };
  if (!live) return { ...base, state: connection.kind === 'space' ? 'space_candidate' : 'needs_resolution', executionVerified: false };
  try {
    const target = await resolveNoahProvider(entry, fetcher);
    const prepared = target.kind === 'space' ? await prepareProvider(target.repository, fetcher) : await prepareProviderMcp(target.url, fetcher);
    return { ...base, state: 'definition_confirmed', protocol: target.kind === 'space' ? 'gradio' : 'mcp', operations: prepared.endpoints.length, executionVerified: false };
  } catch (error) {
    return { ...base, state: 'needs_support', reason: error instanceof Error ? error.message.slice(0, 300) : 'unknown', executionVerified: false };
  }
}
async function main() {
  const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
  if (!args.includes('--input') || !args.includes('--output')) throw Error('Usage: node --experimental-strip-types scripts/noah-agent-coverage.mjs --input catalog.json --output report.json [--live]');
  const snapshot = JSON.parse(await fs.readFile(value('--input'), 'utf8'));
  if (!Array.isArray(snapshot.items) || snapshot.items.length > 20000) throw Error('Invalid catalog snapshot');
  const entries = snapshot.items.map(card => ({ card, observedAt: 0, families: card.id.startsWith('project-') ? [] : [card.id] }));
  const output = value('--output'), live = args.includes('--live');
  const report = { schema: 'noah-agent-coverage/1', startedAt: new Date().toISOString(), sourceCapturedAt: snapshot.at, total: entries.length, live, counts: {}, items: [] };
  const network = createCollectorNetwork();
  try {
  for (let offset = 0; offset < entries.length; offset += 4) {
    const batch = await Promise.all(entries.slice(offset, offset + 4).map(e => auditNoahEntry(e, { live, fetcher: network.fetch })));
    report.items.push(...batch);
    for (const result of batch) report.counts[result.state] = (report.counts[result.state] ?? 0) + 1;
    report.checked = report.items.length;
    await fs.writeFile(output + '.tmp', JSON.stringify(report, null, 2));
    await fs.rename(output + '.tmp', output);
    if (offset % 100 === 0) console.log(JSON.stringify({ checked: report.checked, total: report.total, counts: report.counts }));
  }
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checked: report.checked, total: report.total, counts: report.counts }));
  } finally { await network.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
