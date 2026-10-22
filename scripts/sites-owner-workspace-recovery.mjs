import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

/** Published timestamp anomalies are immutable history, never a general waiver.
 * Accept only the exact retained main lineage plus its additive recovery.
 */
export function auditSitesOwnerWorkspaceRecovery(root, journal) {
  const read = path => readFileSync(resolve(root, path));
  const proof = JSON.parse(read('data/sites-owner-workspace-recovery.json').toString());
  const fail = reason => { throw new Error(`main owner workspace recovery: ${reason}`); };
  if (JSON.parse(read('.openai/hosting.json').toString()).project_id !== 'appgprj_6abdfad4c5648191bcae957913bd02fa')
    fail('not the canonical main Site');
  if (createHash('sha256').update(read('tests/fixtures/sky-monthly-historical-schema.sql')).digest('hex') !== '211ec0013d66de21a8f9f8cb958869348aac86be28eafaa4cbb015c2f66981ca')
    fail('published restored-schema fixture changed');
  if (proof.sourceBase !== '6f32e4d55fc1eecb156bffba8f8e8fdaba1a1caf' || proof.published.length !== 11)
    fail('published baseline mismatch');
  for (const [i, entry] of proof.published.entries()) {
    if (journal[i]?.tag !== entry.tag || journal[i]?.when !== entry.when) fail('published journal changed');
    const bytes = read(`drizzle-main/${entry.tag}.sql`);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) fail('published SQL changed');
  }
  const recovery = journal[11];
  if (recovery?.tag !== '0031_owner_workspace_schema_recovery' || recovery.when !== 4102444800003 ||
      recovery.when <= Math.max(...proof.published.map(e => e.when))) fail('new recovery watermark missing');
  const sql = read(`drizzle-main/${recovery.tag}.sql`);
  if (createHash('sha256').update(sql).digest('hex') !== proof.recovery.sha256) fail('recovery SQL digest changed');
  const exceptions = new Set(['0026_eve_account_sync', '0027_os_timeline', '0028_rockstar_accounts']);
  let highest = -Infinity;
  for (const entry of journal) {
    if (entry.when <= highest && !exceptions.has(entry.tag)) fail('unrecognized timestamp rollback');
    highest = Math.max(highest, entry.when);
  }
  for (const entry of journal) {
    if (!read(`drizzle/${entry.tag}.sql`).equals(read(`drizzle-main/${entry.tag}.sql`))) fail('packaged main SQL differs');
  }
  if (!read('drizzle/meta/_journal.json').equals(read('drizzle-main/meta/_journal.json'))) fail('packaged main journal differs');
  return exceptions;
}
