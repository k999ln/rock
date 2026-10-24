// Portable private notes only. This envelope grants no owner or execution authority.
export const PRO_LOCAL_KEYS = ['avocadoProOS:draft:v1', 'avocadoProOS:tasks:v1'];
const LIMIT = 262144;
function fail() { throw new Error('Invalid local export. Originals have not been changed.'); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}
function text(value, max, multiline = false) {
  if (typeof value !== 'string' || value.length > max
    // eslint-disable-next-line no-control-regex -- Intentionally reject raw controls in private text.
    || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail();
}
function inspect(originals) {
  exact(originals, PRO_LOCAL_KEYS);
  const draft = originals[PRO_LOCAL_KEYS[0]];
  const rawTasks = originals[PRO_LOCAL_KEYS[1]];
  if (draft !== null) text(draft, 3000, true);
  if (rawTasks !== null) text(rawTasks, LIMIT, true);
  let tasks;
  try { tasks = rawTasks === null ? [] : JSON.parse(rawTasks); } catch { fail(); }
  if (!Array.isArray(tasks) || tasks.length > 100) fail();
  const ids = new Set();
  for (const item of tasks) {
    exact(item, ['id', 'text', 'done']); text(item.id, 128); text(item.text, 160);
    if (!item.id || ids.has(item.id) || typeof item.done !== 'boolean') fail();
    ids.add(item.id);
  }
  return { draft: draft ?? '', items: tasks.map(item => ({ sourceItemId: item.id,
    objective: item.text, legacyChecked: item.done, proposedState: 'draft' })) };
}
async function digest(originals) {
  const bytes = new TextEncoder().encode(JSON.stringify(PRO_LOCAL_KEYS.map(key => originals[key])));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function createProLocalExport(storage) {
  // Read original strings, never a filtered UI projection; no write/remove calls.
  const originals = Object.fromEntries(PRO_LOCAL_KEYS.map(key => [key, storage.getItem(key)]));
  inspect(originals);
  const contentSha256 = await digest(originals);
  return { schema: 'pro-local-import/1', operationId: `pro-local-${contentSha256}`, contentSha256, originals };
}
export async function previewProLocalExport(serialized) {
  text(serialized, LIMIT, true);
  let envelope;
  try { envelope = JSON.parse(serialized); } catch { fail(); }
  exact(envelope, ['schema', 'operationId', 'contentSha256', 'originals']);
  if (envelope.schema !== 'pro-local-import/1') fail();
  const preview = inspect(envelope.originals);
  const contentSha256 = await digest(envelope.originals);
  if (envelope.contentSha256 !== contentSha256 || envelope.operationId !== `pro-local-${contentSha256}`) fail();
  return { envelope, ...preview, accountMigration: 'not_connected' };
}
