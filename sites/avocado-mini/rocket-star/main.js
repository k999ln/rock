const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const launch = document.querySelector('.launch-scroll');
const sticky = document.querySelector('.launch-sticky');
const background = document.querySelector('.launch-cinematic-bg');
const panels = [...document.querySelectorAll('.launch-panel')];
const rail = [...document.querySelectorAll('.launch-rail span')];
const progressBar = document.querySelector('#launch-progress');
const step = document.querySelector('#launch-step');
const altitude = document.querySelector('#launch-altitude');
const labels = [
  ['01 / PURPOSE', 'GROUND'],
  ['02 / SYSTEM', 'ASCENT'],
  ['03 / FUNDING', 'ORBIT'],
];
let activeStage = -1;
let frame = 0;

document.documentElement.classList.add('launch-motion-ready');
requestAnimationFrame(() => document.body.classList.add('is-ready'));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);

function updateLaunch() {
  frame = 0;
  if (!launch || !sticky) return;
  const distance = Math.max(1, launch.offsetHeight - window.innerHeight);
  const progress = clamp(-launch.getBoundingClientRect().top / distance, 0, 1);
  const stage = progress < 0.32 ? 0 : progress < 0.69 ? 1 : 2;

  if (stage !== activeStage) {
    activeStage = stage;
    panels.forEach((panel, index) => {
      const visible = index === stage;
      panel.classList.toggle('is-active', visible);
      panel.setAttribute('aria-hidden', String(!visible));
    });
    rail.forEach((item, index) => item.classList.toggle('is-active', index === stage));
    step.textContent = labels[stage][0];
    altitude.textContent = labels[stage][1];
  }

  const motion = reducedMotion.matches ? (stage === 0 ? 0 : stage === 1 ? 0.5 : 1) : progress;
  const lift = smooth(clamp(motion / 0.3, 0, 1));
  const orbitExit = smooth(clamp((motion - 0.72) / 0.28, 0, 1));
  const rocketY = lift * 49 + orbitExit * 53;
  const rocketScale = 1 - lift * 0.08 - orbitExit * 0.3;
  const rocketX = 24 - smooth(clamp((motion - 0.45) / 0.42, 0, 1)) * 24;
  const horizontalScale = window.innerWidth <= 600 ? 0.4 : 1;
  const groundDrop = smooth(clamp(motion / 0.58, 0, 1)) * 76;
  const smoke = clamp(Math.min((motion + 0.03) / 0.12, (0.42 - motion) / 0.14), 0, 1);
  const flame = clamp(Math.min((motion - 0.015) / 0.07, (0.82 - motion) / 0.12), 0, 1);
  const spaceOpacity = smooth(clamp((motion - 0.2) / 0.55, 0, 1));
  const atmosphereOpacity = 1 - smooth(clamp((motion - 0.18) / 0.58, 0, 1));
  const sceneOpacity = 1 - smooth(clamp((motion - 0.48) / 0.48, 0, 1)) * 0.72;
  const wordOpacity = 1 - smooth(clamp(motion / 0.34, 0, 1));

  sticky.style.setProperty('--launch-progress', motion.toFixed(4));
  sticky.style.setProperty('--rocket-y', rocketY.toFixed(2));
  sticky.style.setProperty('--rocket-x', `${(rocketX * horizontalScale).toFixed(2)}vw`);
  sticky.style.setProperty('--rocket-scale', rocketScale.toFixed(3));
  sticky.style.setProperty('--ground-drop', `${groundDrop.toFixed(2)}vh`);
  sticky.style.setProperty('--smoke', smoke.toFixed(3));
  sticky.style.setProperty('--flame', flame.toFixed(3));
  sticky.style.setProperty('--space-opacity', spaceOpacity.toFixed(3));
  sticky.style.setProperty('--atmosphere-opacity', atmosphereOpacity.toFixed(3));
  sticky.style.setProperty('--scene-opacity', sceneOpacity.toFixed(3));
  sticky.style.setProperty('--word-opacity', wordOpacity.toFixed(3));
  background.style.transform = `scale(${1.03 + motion * 0.08}) translate3d(${motion * -1.5}%, ${motion * -2.4}%, 0)`;
  progressBar.style.width = `${Math.round(progress * 100)}%`;
}

function scheduleLaunch() {
  if (frame) return;
  frame = requestAnimationFrame(updateLaunch);
}

window.addEventListener('scroll', scheduleLaunch, { passive: true });
window.addEventListener('resize', scheduleLaunch);
reducedMotion.addEventListener('change', scheduleLaunch);
updateLaunch();
