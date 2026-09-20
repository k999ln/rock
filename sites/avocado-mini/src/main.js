import * as THREE from 'three';
import './style.css';

const story = document.querySelector('.story');
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#product-canvas');
const fallback = document.querySelector('#stage-fallback');
const angle = document.querySelector('#angle');
const chapter = document.querySelector('#chapter');
const progressBar = document.querySelector('#progress');
const pricePanel = document.querySelector('#price-panel');
const crowdfundingLink = document.querySelector('#crowdfunding-link');
const gallery = document.querySelector('#highlight-gallery');
const galleryPrev = document.querySelector('#gallery-prev');
const galleryNext = document.querySelector('#gallery-next');
const beats = [...document.querySelectorAll('.feature-beat')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const storyWord = document.querySelector('#story-word');
const storySticky = document.querySelector('.story-sticky');
const storyRail = [...document.querySelectorAll('.story-rail span')];
const priceStart = 0.91;
const storyWords = ['FORM', 'SENSE', 'REACH', 'STABLE', 'FLOW', 'MINI'];
const storyColors = ['#08090b', '#101821', '#182532', '#101a22', '#141f26', '#08090b'];
// A single tower follows a choreographed path across the viewport while completing one turn.
const motionKeys = [
  { at: 0, x: 19, y: 1, scale: 0.96, tilt: -9, yaw: 0 },
  { at: 0.18, x: 20, y: -2, scale: 1.14, tilt: 9, yaw: 48 },
  { at: 0.36, x: -20, y: 1, scale: 1.04, tilt: -13, yaw: 124 },
  { at: 0.54, x: 20, y: -2, scale: 1.16, tilt: 10, yaw: 203 },
  { at: 0.72, x: -19, y: 1, scale: 1.02, tilt: -8, yaw: 290 },
  { at: priceStart, x: -22, y: 0, scale: 0.96, tilt: 0, yaw: 360 },
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

function makeModel() {
  const model = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xd7dce0, metalness: 0.78, roughness: 0.25 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0xaeb8c0, metalness: 0.75, roughness: 0.34 });
  const underside = new THREE.MeshStandardMaterial({ color: 0x171b1e, metalness: 0.35, roughness: 0.5 });
  const collar = new THREE.MeshStandardMaterial({ color: 0x15191d, metalness: 0.22, roughness: 0.23 });
  const sensor = new THREE.MeshPhysicalMaterial({ color: 0x080d14, metalness: 0.2, roughness: 0.08, clearcoat: 1 });
  const cylinder = (top, bottom, height, y, material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 64), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  };

  // Proportions follow ME-001/ME-101/ME-301: 220 mm base, 520 mm foot envelope,
  // 52/45/38 mm tubes and a three-camera head. This is one tower at free height.
  cylinder(0.55, 0.55, 0.12, -2.9, underside);
  cylinder(0.55, 0.55, 0.18, -2.75, silver);
  cylinder(0.49, 0.55, 0.10, -2.62, brushed);
  for (let index = 0; index < 3; index += 1) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.07, 0.12), brushed);
    foot.position.set(0.77, -2.93, 0);
    const pivot = new THREE.Group();
    pivot.rotation.y = index * Math.PI * 2 / 3;
    pivot.add(foot);
    model.add(pivot);
  }
  cylinder(0.26, 0.26, 3.10, -1.03, silver);
  cylinder(0.225, 0.225, 2.65, 0.83, brushed);
  cylinder(0.19, 0.19, 1.88, 1.99, silver);
  cylinder(0.27, 0.27, 0.37, 2.87, collar);
  cylinder(0.28, 0.28, 0.10, 3.10, silver);
  for (const theta of [-0.6, 0, 0.6]) {
    const aperture = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 16), sensor);
    aperture.position.set(Math.sin(theta) * 0.275, 2.89, Math.cos(theta) * 0.275);
    model.add(aperture);
  }
  return model;
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

function showFallback() {
  canvas.hidden = true;
  fallback.hidden = false;
  updateProgress();
}

function updateStory(progress) {
  const visible = progress >= priceStart;
  const phase = clamp(progress / 0.18, 0, 4);
  const active = visible ? 5 : Math.min(4, Math.round(phase));
  const first = Math.floor(phase);
  const blend = smooth(phase - first);
  storySticky.style.setProperty('--story-bg', visible ? storyColors[5] : mixColor(storyColors[first], storyColors[Math.min(5, first + 1)], blend));
  storyWord.textContent = storyWords[active];
  storyRail.forEach((dot, index) => dot.classList.toggle('is-active', index === active));
  beats.forEach((beat, index) => {
    // Let the previous heading disappear before the next one enters.
    const opacity = visible ? 0 : clamp((0.5 - Math.abs(phase - index)) / 0.16, 0, 1);
    beat.style.opacity = opacity;
    beat.style.transform = `translateY(calc(${window.innerWidth < 800 ? '0px' : '-50%'} + ${(index - phase) * 35}px))`;
    beat.classList.toggle('is-active', opacity > 0.02);
    beat.setAttribute('aria-hidden', String(opacity < 0.5));
  });
  chapter.textContent = visible ? 'COMPLETE / 04' : active === 0 ? 'INTRO / 04' : `${String(active).padStart(2, '0')} / 04`;
  pricePanel.classList.toggle('visible', visible);
  pricePanel.setAttribute('aria-hidden', String(!visible));
  crowdfundingLink.tabIndex = visible ? 0 : -1;
}

function updateProgress(model, renderer, scene, camera) {
  const distance = Math.max(1, story.offsetHeight - window.innerHeight);
  const progress = clamp(-story.getBoundingClientRect().top / distance, 0, 1);
  const motion = motionAt(Math.min(progress, priceStart));
  const turn = motion.yaw / 360;
  progressBar.style.width = `${Math.round(turn * 100)}%`;
  if (model && renderer && scene && camera) {
    const mobile = window.innerWidth < 800;
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.length();
    const visibleWidth = visibleHeight * camera.aspect;
    model.position.set(
      reducedMotion.matches ? 0 : motion.x * visibleWidth / 100 * (mobile ? 0.48 : 1),
      mobile ? -1.55 : reducedMotion.matches ? 0 : motion.y * visibleHeight / 100,
      0,
    );
    model.scale.setScalar(mobile ? motion.scale * 0.83 : motion.scale * 0.84);
    model.rotation.z = reducedMotion.matches ? 0 : THREE.MathUtils.degToRad(motion.tilt * (mobile ? 0.38 : 1));
    model.rotation.y = reducedMotion.matches ? 0 : THREE.MathUtils.degToRad(motion.yaw);
    angle.textContent = reducedMotion.matches ? '静止表示' : `${Math.round(turn * 360)}°`;
    renderer.render(scene, camera);
  } else {
    angle.textContent = '構想画像';
  }
  updateStory(progress);
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  showFallback();
  window.addEventListener('scroll', () => updateProgress(), { passive: true });
  window.addEventListener('resize', () => updateProgress());
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
  camera.position.set(2.4, 1.5, 11.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xdff5ff, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(-3, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x65dfff, 2);
  rim.position.set(4, 3, -6);
  scene.add(rim);
  const model = makeModel();
  scene.add(model);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.97;
  floor.receiveShadow = true;
  scene.add(floor);

  function resize() {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    camera.aspect = width / height;
    camera.position.set(width < 650 ? 2.5 : 2.4, width < 650 ? 1.2 : 1.5, width < 650 ? 15.5 : 11.5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    updateProgress(model, renderer, scene, camera);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateProgress(model, renderer, scene, camera);
    });
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', resize);
  reducedMotion.addEventListener('change', schedule);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.dispose();
    observer.disconnect();
    showFallback();
    window.addEventListener('scroll', () => updateProgress(), { passive: true });
  });
  resize();
}
