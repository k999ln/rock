const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('type-motion-ready');

const splitTypeSelectors = [
  '.hero-bottom > p',
  '.hero-statement h2',
  '.highlight-card h3',
  '.design-intro h2',
  '.feature-beat h2',
  '.feature-headline',
  '.preorder-hero h1',
  '.article h1',
];

for (const heading of document.querySelectorAll(splitTypeSelectors.join(','))) {
  if (!heading.innerHTML.match(/<br\s*\/?>/i)) continue;
  const lines = heading.innerHTML.split(/<br\s*\/?>/i);
  heading.innerHTML = lines.map((line, index) => `<span class="type-line" style="--type-line:${index}"><span>${line}</span></span>`).join('');
}

const revealSections = document.querySelectorAll([
  '.film-hero',
  '.hero-statement',
  '.highlights',
  '.design-intro',
  '.story',
  '.os-install',
  '.preorder-hero',
  '.preorder-products',
  '.preorder-terms',
  '.article',
].join(','));

if (reducedMotion?.matches || !('IntersectionObserver' in window)) {
  revealSections.forEach((section) => section.classList.add('is-type-visible'));
} else {
  const typeObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-type-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  revealSections.forEach((section) => typeObserver.observe(section));
}

requestAnimationFrame(() => document.body.classList.add('is-type-loaded'));

const story = document.querySelector('.story');
const storySticky = document.querySelector('.story-sticky');
const storyWord = document.querySelector('#story-word');
const storyRail = [...document.querySelectorAll('.story-rail span')];
const beats = [...document.querySelectorAll('.feature-beat')];
const storyFocusWash = document.createElement('span');
storyFocusWash.className = 'story-focus-wash';
storyFocusWash.setAttribute('aria-hidden', 'true');
storySticky?.append(storyFocusWash);
const product = document.querySelector('#motion-product');
const frames = [...document.querySelectorAll('.turn-frame')];
const sensorCloseup = document.querySelector('#sensor-closeup');
const sensorGaze = document.querySelector('#sensor-gaze');
const angle = document.querySelector('#angle');
const chapter = document.querySelector('#chapter');
const progressBar = document.querySelector('#progress');
const pricePanel = document.querySelector('#price-panel');
const preorderLink = document.querySelector('#preorder-link');
const gallery = document.querySelector('#highlight-gallery');
const galleryPrev = document.querySelector('#gallery-prev');
const galleryNext = document.querySelector('#gallery-next');
const priceStart = 0.91;
const storyWords = ['R5', 'INPUT', 'SIZE', 'SCALE', 'PLAY', 'STATUS'];
const storyColors = ['#09090a', '#111214', '#0d0e10', '#111214', '#0d0e10', '#09090a'];
let lastStoryChapter = -1;
const motionKeys = [
  { at: 0, x: 0, y: 1, scale: 0.96, tilt: -2, yaw: 0 },
  { at: 0.18, x: 2, y: 0, scale: 1.02, tilt: 1, yaw: 32 },
  { at: 0.36, x: -2, y: 1, scale: 1.01, tilt: -2, yaw: 70 },
  { at: 0.54, x: 2, y: 0, scale: 1.04, tilt: 2, yaw: 110 },
  { at: 0.72, x: -2, y: 1, scale: 1.01, tilt: -1, yaw: 150 },
  { at: priceStart, x: 0, y: 0, scale: 0.98, tilt: 0, yaw: 180 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);
const mix = (start, end, amount) => start + (end - start) * amount;
const mixColor = (start, end, amount) => `#${[1, 3, 5].map((offset) => {
  const first = parseInt(start.slice(offset, offset + 2), 16);
  const second = parseInt(end.slice(offset, offset + 2), 16);
  return Math.round(mix(first, second, amount)).toString(16).padStart(2, '0');
}).join('')}`;

function motionAt(progress) {
  const nextIndex = motionKeys.findIndex((key) => key.at > progress);
  const index = nextIndex < 0 ? motionKeys.length - 2 : Math.max(0, nextIndex - 1);
  const first = motionKeys[index];
  const next = motionKeys[index + 1];
  const amount = smooth(clamp((progress - first.at) / (next.at - first.at), 0, 1));
  return Object.fromEntries(['x', 'y', 'scale', 'tilt', 'yaw'].map((key) => [key, mix(first[key], next[key], amount)]));
}

function updateGalleryControls() {
  if (!gallery) return;
  galleryPrev.disabled = gallery.scrollLeft < 8;
  galleryNext.disabled = gallery.scrollLeft + gallery.clientWidth >= gallery.scrollWidth - 8;
}

for (const [button, direction] of [[galleryPrev, -1], [galleryNext, 1]]) {
  button?.addEventListener('click', () => {
    const card = gallery.querySelector('.highlight-card');
    gallery.scrollBy({ left: direction * ((card?.getBoundingClientRect().width || 600) + 24), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
}
gallery?.addEventListener('scroll', updateGalleryControls, { passive: true });
window.addEventListener('resize', updateGalleryControls);
updateGalleryControls();

function showView() {
  frames.forEach((frame, index) => { frame.style.opacity = index === 0 ? '1' : '0'; });
}

function updateStory(progress) {
  const priceVisible = progress >= priceStart;
  const phase = clamp(progress / 0.18, 0, 4);
  const active = priceVisible ? 5 : Math.min(4, Math.round(phase));
  if (active !== lastStoryChapter) {
    if (lastStoryChapter >= 0 && !reducedMotion.matches) {
      storyFocusWash.getAnimations().forEach((animation) => animation.cancel());
      storyFocusWash.animate([
        { opacity: 0, backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' },
        { opacity: 0.58, backdropFilter: 'blur(8px)', webkitBackdropFilter: 'blur(8px)', offset: 0.24 },
        { opacity: 0.22, backdropFilter: 'blur(3px)', webkitBackdropFilter: 'blur(3px)', offset: 0.62 },
        { opacity: 0, backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' },
      ], { duration: 780, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    lastStoryChapter = active;
  }
  const first = Math.floor(phase);
  storySticky.style.setProperty('--story-bg', priceVisible ? storyColors[5] : mixColor(storyColors[first], storyColors[Math.min(5, first + 1)], smooth(phase - first)));
  storyWord.textContent = storyWords[active];
  storyRail.forEach((dot, index) => dot.classList.toggle('is-active', index === active));
  beats.forEach((beat, index) => {
    const visible = !priceVisible && index === active;
    beat.style.opacity = visible ? '1' : '0';
    beat.style.transform = `translateY(${window.innerWidth < 800 ? '0' : '-50%'})`;
    beat.classList.toggle('is-active', visible);
    beat.setAttribute('aria-hidden', String(!visible));
  });
  chapter.textContent = priceVisible ? 'STATUS / R5' : active === 0 ? 'INTRO / R5' : `${String(active).padStart(2, '0')} / R5`;
  pricePanel.classList.toggle('visible', priceVisible);
  pricePanel.setAttribute('aria-hidden', String(!priceVisible));
  preorderLink.tabIndex = priceVisible ? 0 : -1;
}

function updateProgress() {
  const distance = Math.max(1, story.offsetHeight - window.innerHeight);
  const progress = clamp(-story.getBoundingClientRect().top / distance, 0, 1);
  const motion = motionAt(Math.min(progress, priceStart));
  const mobile = window.innerWidth < 800;
  const yaw = reducedMotion.matches ? 0 : motion.yaw;
  showView();

  const x = motion.x * (mobile ? 0.28 : 1);
  const priceBlend = smooth(clamp((progress - 0.88) / 0.04, 0, 1));
  const y = motion.y * (mobile ? 0.4 : 1) + (mobile ? priceBlend * 6 : 0);
  const scale = motion.scale * (mobile ? 0.94 - priceBlend * 0.2 : 0.96);
  const tilt = reducedMotion.matches ? 0 : motion.tilt * (mobile ? 0.38 : 1);
  product.style.transform = `translate(-50%, -50%) translate3d(${x}vw, ${y}vh, 0) scale(${scale}) rotate(${tilt}deg)`;

  const cameraOn = clamp((progress - 0.07) / 0.13, 0, 1);
  const scan = clamp((progress - 0.16) / 0.18, 0, 1);
  const scanVisible = clamp(Math.min((progress - 0.14) / 0.05, (0.39 - progress) / 0.07), 0, 1);
  product.style.setProperty('--camera-on', cameraOn.toFixed(3));
  product.style.setProperty('--scan-opacity', reducedMotion.matches ? 0 : scanVisible.toFixed(3));
  product.style.setProperty('--scan-angle', `${mix(-80, 80, scan)}deg`);
  sensorCloseup.style.opacity = progress >= 0.09 && progress < 0.27 ? '1' : '0';

  // The light follows the rendered sensor positions and only blooms while the lenses face the viewer.
  const firstTurn = smooth(clamp((progress - 0.055) / 0.065, 0, 1)) * (1 - smooth(clamp((progress - 0.28) / 0.08, 0, 1)));
  const frontFacing = smooth(clamp(1 - yaw / 72, 0, 1));
  const gaze = reducedMotion.matches ? 0 : frontFacing * firstTurn;
  product.style.setProperty('--front-facing', frontFacing.toFixed(3));
  const productBounds = product.getBoundingClientRect();
  sensorGaze.style.setProperty('--gaze', gaze.toFixed(3));
  sensorGaze.style.setProperty('--gaze-x', `${productBounds.left + productBounds.width * 0.5}px`);
  sensorGaze.style.setProperty('--gaze-upper-y', `${productBounds.top + productBounds.height * 0.12}px`);
  sensorGaze.style.setProperty('--gaze-lower-y', `${productBounds.top + productBounds.height * 0.71}px`);

  progressBar.style.width = `${Math.round(progress * 100)}%`;
  angle.textContent = 'R5';
  updateStory(progress);
}

let frame = 0;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    updateProgress();
  });
}
window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule);
reducedMotion.addEventListener('change', schedule);
updateProgress();
