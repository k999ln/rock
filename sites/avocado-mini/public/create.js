const builder = document.querySelector('#game-builder');
const arena = document.querySelector('#game-arena');
const target = document.querySelector('#game-target');
const scoreNode = document.querySelector('#game-score');
const timeNode = document.querySelector('#game-time');
const message = document.querySelector('#game-message');
let timer = null;
let mover = null;
let score = 0;
let remaining = 30;

function settings() {
  return {
    schema: 'avokado-mini-browser-game/1',
    title: document.querySelector('#game-title').value.trim().slice(0, 60) || 'Catch the Light',
    durationSeconds: Number(document.querySelector('#game-duration').value),
    pace: document.querySelector('#game-pace').value,
    accent: document.querySelector('#game-accent').value,
  };
}

function moveTarget() {
  const padding = 24;
  const width = Math.max(0, arena.clientWidth - target.offsetWidth - padding * 2);
  const height = Math.max(0, arena.clientHeight - target.offsetHeight - padding * 2);
  target.style.left = `${padding + Math.random() * width}px`;
  target.style.top = `${padding + Math.random() * height}px`;
}

function stopGame() {
  clearInterval(timer);
  clearInterval(mover);
  timer = null;
  mover = null;
  target.disabled = true;
  target.hidden = true;
  message.hidden = false;
  message.textContent = `Round complete. You caught ${score} lights. Change a setting and play again.`;
}

function startGame() {
  clearInterval(timer);
  clearInterval(mover);
  const game = settings();
  score = 0;
  remaining = game.durationSeconds;
  scoreNode.textContent = '0';
  timeNode.textContent = String(remaining);
  document.querySelector('#preview-title').textContent = game.title;
  arena.style.setProperty('--game-accent', game.accent);
  message.hidden = true;
  target.hidden = false;
  target.disabled = false;
  moveTarget();
  const interval = { calm: 1700, steady: 1200, quick: 750 }[game.pace] || 1200;
  mover = setInterval(moveTarget, interval);
  timer = setInterval(() => {
    remaining -= 1;
    timeNode.textContent = String(remaining);
    if (remaining <= 0) stopGame();
  }, 1000);
}

target.addEventListener('click', () => {
  if (target.disabled) return;
  score += 1;
  scoreNode.textContent = String(score);
  moveTarget();
});
document.querySelector('#game-start').addEventListener('click', startGame);
document.querySelector('#game-export').addEventListener('click', () => {
  const manifest = JSON.stringify(settings(), null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([manifest], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mini-browser-game.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
builder.addEventListener('submit', event => event.preventDefault());

const form = document.querySelector('#creator-submission');
const kind = document.querySelector('#submission-kind');
const categoryField = document.querySelector('#category-field');
const demoField = document.querySelector('#demo-field');
const sourceField = document.querySelector('#source-field');
const demoInput = document.querySelector('#submission-demo');
const submitButton = document.querySelector('#submission-button');
const submitStatus = document.querySelector('#submission-status');

function updateKind() {
  const game = kind.value === 'game';
  categoryField.hidden = game;
  demoField.hidden = !game;
  sourceField.hidden = !game;
  demoInput.required = game;
}
kind.addEventListener('change', updateKind);
updateKind();

async function checkAvailability() {
  try {
    const response = await fetch('/api/participation/availability', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.open) throw new Error('closed');
  } catch {
    submitButton.disabled = true;
    submitStatus.textContent = 'The review queue is temporarily unavailable. The browser game and starter kit still work.';
  }
}
checkAvailability();

const errorMessages = {
  invalid_origin: 'Please reload this page and try again.',
  invalid_format: 'Check the form and try again.',
  too_large: 'Your submission is too long. Shorten it and try again.',
  invalid_submission: 'Check the title, description, and HTTPS link, then try again.',
  rate_limited: 'Too many submissions from this connection today. Please try tomorrow.',
  unavailable: 'The review queue is temporarily unavailable. Please try later.',
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  submitStatus.textContent = 'Sending for private review…';
  const values = new FormData(form);
  const data = {
    kind: values.get('kind'),
    category: values.get('category'),
    title: values.get('title'),
    description: values.get('description'),
    demoUrl: values.get('demoUrl') || '',
    sourceUrl: values.get('sourceUrl') || '',
    website: values.get('website') || '',
    reviewConsent: values.get('reviewConsent') === 'on',
  };
  try {
    const response = await fetch('/api/participation/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(errorMessages[result.error] || 'The submission could not be saved. Please try later.');
    document.querySelector('#receipt-id').value = result.id;
    document.querySelector('#removal-code').value = result.removalCode;
    document.querySelector('#submission-receipt').hidden = false;
    submitStatus.textContent = 'Saved for private review. Copy your receipt below.';
    form.reset();
    updateKind();
  } catch (error) {
    submitStatus.textContent = error.message || 'The submission could not be saved. Please try later.';
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#receipt-copy').addEventListener('click', async () => {
  const id = document.querySelector('#receipt-id').value;
  const removalCode = document.querySelector('#removal-code').value;
  try {
    await navigator.clipboard.writeText(`Receipt ID: ${id}\nRemoval code: ${removalCode}`);
    submitStatus.textContent = 'Receipt copied. Keep it somewhere safe.';
  } catch {
    submitStatus.textContent = 'Copy the two codes above and keep them somewhere safe.';
  }
});

document.querySelector('#creator-remove').addEventListener('submit', async event => {
  event.preventDefault();
  const removalForm = event.currentTarget;
  if (!removalForm.reportValidity()) return;
  const status = document.querySelector('#remove-status');
  const values = new FormData(removalForm);
  status.textContent = 'Removing…';
  try {
    const response = await fetch('/api/participation/submissions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: values.get('id'), removalCode: values.get('removalCode') }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error('Removal is unavailable. Check your codes or try later.');
    status.textContent = result.removed ? 'Your submission was removed.' : 'No matching submission was found. Check both codes.';
    if (result.removed) removalForm.reset();
  } catch (error) { status.textContent = error.message; }
});
