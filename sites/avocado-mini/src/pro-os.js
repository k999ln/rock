import { createProLocalExport, previewProLocalExport } from './pro-local-import.mjs';
const DRAFT_KEY = 'avocadoProOS:draft:v1';
const TASK_KEY = 'avocadoProOS:tasks:v1';
const views = [...document.querySelectorAll('[data-panel]')];
const viewButtons = [...document.querySelectorAll('button[data-view]')];
const drafts = [...document.querySelectorAll('[data-draft-input]')];
const draftStatuses = [...document.querySelectorAll('[data-draft-status]')];
const taskLists = [...document.querySelectorAll('[data-task-list]')];
const boardStatus = document.querySelector('[data-board-status]');
const systemStatus = document.querySelector('[data-system-status]');
const getSaved = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const putSaved = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
let draft = getSaved(DRAFT_KEY, '');
let tasks;
try { const loaded = JSON.parse(getSaved(TASK_KEY, '[]')); tasks = Array.isArray(loaded) ? loaded.filter(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean').slice(0, 100) : []; }
catch { tasks = []; }
function setView(name, updateHash = true) {
  if (!views.some(view => view.dataset.panel === name)) return;
  views.forEach(view => { view.hidden = view.dataset.panel !== name; });
  viewButtons.forEach(button => { if (button.dataset.view === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  if (updateHash) history.replaceState(null, '', `#${name}`);
  document.title = `${name === 'home' ? 'avocadoPro OS' : name[0].toUpperCase() + name.slice(1) + ' · avocadoPro OS'} — Your work starts here`;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
window.addEventListener('hashchange', () => setView(location.hash.slice(1), false));
setView(location.hash.slice(1) || 'home', false);
function updateDraft(value, source) {
  draft = value.slice(0, 3000);
  drafts.forEach(input => { if (input !== source) input.value = draft; });
  const saved = putSaved(DRAFT_KEY, draft);
  draftStatuses.forEach(status => { status.textContent = saved ? 'Saved on this device only' : 'Browser storage unavailable; copy your draft'; });
}
drafts.forEach(input => { input.value = draft; input.addEventListener('input', () => updateDraft(input.value, input)); });
document.querySelectorAll('[data-copy-draft]').forEach(button => button.addEventListener('click', async () => {
  const status = button.closest('.surface').querySelector('[data-draft-status]');
  if (!draft.trim()) { status.textContent = 'Write a draft first'; return; }
  try { await navigator.clipboard.writeText(draft); status.textContent = 'Copied. Paste it in Eve.'; }
  catch { status.textContent = 'Copy unavailable here; select the text manually.'; }
}));
function saveTasks() { if (!putSaved(TASK_KEY, JSON.stringify(tasks)) && boardStatus) boardStatus.textContent = 'Browser storage unavailable; export your board.'; }
function renderTasks() {
  taskLists.forEach(list => {
    list.replaceChildren();
    tasks.forEach(item => {
      const li = document.createElement('li');
      if (item.done) li.classList.add('is-done');
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = item.done ? '↺' : '○'; toggle.setAttribute('aria-label', item.done ? `Reopen ${item.text}` : `Complete ${item.text}`);
      toggle.addEventListener('click', () => { item.done = !item.done; saveTasks(); renderTasks(); });
      const span = document.createElement('span'); span.textContent = item.text;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${item.text}`);
      remove.addEventListener('click', () => { tasks = tasks.filter(task => task.id !== item.id); saveTasks(); renderTasks(); });
      li.append(toggle, span, remove); list.append(li);
    });
  });
}
document.querySelectorAll('[data-task-form]').forEach(form => form.addEventListener('submit', event => {
  event.preventDefault();
  const input = form.elements.task; const value = input.value.trim();
  if (!value || tasks.length >= 100) { if (boardStatus) boardStatus.textContent = tasks.length >= 100 ? 'Board is full. Remove an item to add another.' : ''; return; }
  tasks.unshift({ id: crypto.randomUUID(), text: value.slice(0, 160), done: false });
  input.value = ''; saveTasks(); renderTasks();
  if (boardStatus) boardStatus.textContent = 'Saved on this device only.';
}));
document.querySelector('[data-clear-board]')?.addEventListener('click', () => { tasks = tasks.filter(task => !task.done); saveTasks(); renderTasks(); boardStatus.textContent = 'Completed items cleared.'; });
document.querySelector('[data-export-board]')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'avocadoProOS-local-board-v1', exportedAt: new Date().toISOString(), tasks }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'avocadopro-board.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  boardStatus.textContent = 'Board exported as JSON.';
});
document.querySelector('[data-clear-all]')?.addEventListener('click', () => {
  if (!window.confirm('Erase the draft and local board saved in this browser?')) return;
  draft = ''; tasks = []; drafts.forEach(input => { input.value = ''; }); renderTasks();
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(TASK_KEY); systemStatus.textContent = 'Local preview data erased.'; }
  catch { systemStatus.textContent = 'Browser storage could not be cleared.'; }
});
const clock = document.querySelector('#os-clock');
function tick() { if (clock) clock.textContent = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date()); }
tick(); setInterval(tick, 30000); renderTasks();

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
  migrationStatus.textContent = 'Cancelled. Original browser keys are unchanged. Account migration is not connected.';
}
function showMigration(result) {
  migrationEnvelope = result.envelope;
  migrationPreview.textContent = JSON.stringify({ draft: result.draft, items: result.items }, null, 2);
  migrationDownload.disabled = false;
  migrationStatus.textContent = 'Local preview only. Legacy checks remain draft provenance. No account data has been saved.';
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
  migrationStatus.textContent = 'Private file exported. Originals retained. Account migration is not connected.';
});
document.querySelector('[data-migration-cancel]')?.addEventListener('click', cancelMigration);
