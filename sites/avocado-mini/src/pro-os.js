import { createProLocalExport, previewProLocalExport } from './pro-local-import.mjs';

// Explicit file handoff only: never submits to an account or changes legacy keys.
const migrationStatus = document.querySelector('[data-migration-status]');
const migrationPreview = document.querySelector('[data-migration-preview]');
const migrationConsent = document.querySelector('[data-migration-consent]');
const migrationFile = document.querySelector('[data-migration-file]');
const migrationDownload = document.querySelector('[data-migration-download]');
let migrationEnvelope = null;
let migrationEpoch = 0;
function cancelMigration() {
  migrationEpoch++;
  migrationEnvelope = null;
  migrationPreview.textContent = '';
  migrationDownload.disabled = true;
  migrationConsent.checked = false;
  migrationFile.value = '';
  migrationStatus.textContent = 'Cancelled. Original browser notes are unchanged. To archive later, export a file and select it manually at the private archive.';
}
function showMigration(result) {
  migrationEnvelope = result.envelope;
  migrationPreview.textContent = JSON.stringify({ draft: result.draft, items: result.items }, null, 2);
  migrationDownload.disabled = false;
  migrationStatus.textContent = 'Local preview only. Legacy checks remain draft provenance. No account data has been saved. Export a file, then use the private archive link for account confirmation and separate save consent.';
}
document.querySelector('[data-migration-prepare]')?.addEventListener('click', async () => {
  cancelMigration();
  const epoch = migrationEpoch;
  try {
    const result = await previewProLocalExport(JSON.stringify(await createProLocalExport(localStorage)));
    if (epoch === migrationEpoch) showMigration(result);
  }
  catch { if (epoch === migrationEpoch) migrationStatus.textContent = 'Export unavailable: storage is inaccessible or originals need repair. Nothing was changed.'; }
});
migrationFile?.addEventListener('change', async () => {
  const file = migrationFile.files?.[0];
  cancelMigration();
  if (!file) return;
  const epoch = migrationEpoch;
  try {
    if (file.size > 262144) throw new Error('Too large');
    const result = await previewProLocalExport(await file.text());
    if (epoch === migrationEpoch) showMigration(result);
  } catch { if (epoch === migrationEpoch) migrationStatus.textContent = 'File rejected. Nothing was imported or changed.'; }
});
migrationDownload?.addEventListener('click', () => {
  if (!migrationEnvelope || !migrationConsent.checked) {
    migrationStatus.textContent = 'Review the preview and confirm private file export first.'; return;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(migrationEnvelope, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'avocadopro-local-import.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  migrationStatus.textContent = 'Private file exported to this device. Originals retained; no account data has been saved. Open the private archive link, sign in, manually select this file again, confirm the destination account, and give separate archive save consent.';
});
document.querySelector('[data-migration-cancel]')?.addEventListener('click', cancelMigration);
