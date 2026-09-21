const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const story = document.querySelector('.rocket-story');
const sticky = document.querySelector('.rocket-story-sticky');
const image = document.querySelector('.rocket-story-image');
const word = document.querySelector('.rocket-story-word');
const chapters = [...document.querySelectorAll('.rocket-chapter')];
const progress = document.querySelector('#rocket-progress');
const step = document.querySelector('#rocket-step');
const status = document.querySelector('#rocket-status');
const words = ['ORBIT', 'RELAY', 'RECEIVE', 'UPDATE'];
let activeChapter = -1;
let frame = 0;

document.documentElement.classList.add('rocket-motion-ready');
requestAnimationFrame(() => document.body.classList.add('is-ready'));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function updateStory() {
  frame = 0;
  if (!story || !sticky) return;
  const distance = Math.max(1, story.offsetHeight - window.innerHeight);
  const storyProgress = clamp(-story.getBoundingClientRect().top / distance, 0, 1);
  const chapter = Math.min(chapters.length - 1, Math.floor(storyProgress * chapters.length));
  const chapterProgress = (storyProgress * chapters.length) % 1;

  if (chapter !== activeChapter) {
    activeChapter = chapter;
    chapters.forEach((item, index) => {
      const visible = index === chapter;
      item.classList.toggle('is-active', visible);
      item.setAttribute('aria-hidden', String(!visible));
    });
    word.textContent = words[chapter];
    step.textContent = `${String(chapter + 1).padStart(2, '0')} / 04`;
    status.textContent = words[chapter];
  }

  const travel = reducedMotion.matches ? 0 : storyProgress;
  sticky.style.setProperty('--rocket-progress', travel.toFixed(4));
  sticky.style.setProperty('--chapter-progress', chapterProgress.toFixed(4));
  image.style.transform = `scale(${1.06 + travel * 0.08}) translate3d(${travel * -2.4}%, ${travel * -1.2}%, 0)`;
  progress.style.width = `${Math.round(storyProgress * 100)}%`;
}

function scheduleStory() {
  if (frame) return;
  frame = requestAnimationFrame(updateStory);
}

const revealTargets = document.querySelectorAll('.rocket-mission, .rocket-receiver, .rocket-funding');
if (reducedMotion.matches || !('IntersectionObserver' in window)) {
  revealTargets.forEach((target) => target.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  revealTargets.forEach((target) => observer.observe(target));
}

window.addEventListener('scroll', scheduleStory, { passive: true });
window.addEventListener('resize', scheduleStory);
reducedMotion.addEventListener('change', scheduleStory);
updateStory();
