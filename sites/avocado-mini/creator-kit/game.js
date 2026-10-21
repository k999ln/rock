const defaults = { title: 'Catch the Light', durationSeconds: 30, pace: 'steady', accent: '#9ed8aa' };
let settings = defaults;
try {
  const response = await fetch('./manifest.example.json');
  if (response.ok) {
    const candidate = await response.json();
    if (candidate.schema === 'avokado-mini-browser-game/1') settings = {
      title: typeof candidate.title === 'string' ? candidate.title.slice(0, 60) : defaults.title,
      durationSeconds: [30, 45, 60].includes(candidate.durationSeconds) ? candidate.durationSeconds : defaults.durationSeconds,
      pace: ['calm', 'steady', 'quick'].includes(candidate.pace) ? candidate.pace : defaults.pace,
      accent: /^#[0-9a-fA-F]{6}$/.test(candidate.accent) ? candidate.accent : defaults.accent,
    };
  }
} catch { /* The sample also runs when a browser blocks file:// fetch. */ }

const arena = document.querySelector('#arena');
const target = document.querySelector('#target');
const message = document.querySelector('#message');
let score = 0;
let time = settings.durationSeconds;
let clock;
let movement;
document.querySelector('#title').textContent = settings.title;
document.querySelector('#time').textContent = String(time);
arena.style.setProperty('--accent', settings.accent);
function move() {
  target.style.left = `${20 + Math.random() * Math.max(0, arena.clientWidth - 106)}px`;
  target.style.top = `${20 + Math.random() * Math.max(0, arena.clientHeight - 106)}px`;
}
function stop() {
  clearInterval(clock);
  clearInterval(movement);
  target.hidden = true;
  message.hidden = false;
  message.textContent = `Round complete. You caught ${score} lights.`;
}
document.querySelector('#start').addEventListener('click', () => {
  clearInterval(clock);
  clearInterval(movement);
  score = 0;
  time = settings.durationSeconds;
  document.querySelector('#score').textContent = '0';
  document.querySelector('#time').textContent = String(time);
  message.hidden = true;
  target.hidden = false;
  move();
  movement = setInterval(move, { calm: 1700, steady: 1200, quick: 750 }[settings.pace]);
  clock = setInterval(() => { time -= 1; document.querySelector('#time').textContent = String(time); if (time <= 0) stop(); }, 1000);
});
target.addEventListener('click', () => { score += 1; document.querySelector('#score').textContent = String(score); move(); });
