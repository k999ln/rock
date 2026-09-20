import * as THREE from 'three';
import './style.css';

const story = document.querySelector('.story');
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#product-canvas');
const fallback = document.querySelector('#stage-fallback');
const angle = document.querySelector('#angle');
const progressBar = document.querySelector('#progress');
const pricePanel = document.querySelector('#price-panel');
const crowdfundingLink = document.querySelector('#crowdfunding-link');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function makeModel() {
  const model = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xf0f5f6, metalness: 0.36, roughness: 0.23 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0xbecdd3, metalness: 0.42, roughness: 0.28 });
  const underside = new THREE.MeshStandardMaterial({ color: 0x40525d, metalness: 0.38, roughness: 0.33 });
  const sensor = new THREE.MeshPhysicalMaterial({ color: 0x07121b, metalness: 0.15, roughness: 0.08, clearcoat: 1 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x75efff, emissive: 0x1bc6eb, emissiveIntensity: 1.6 });
  const cylinder = (top, bottom, height, y, material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 64), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  };

  cylinder(0.54, 0.54, 0.1, -2.9, underside);
  cylinder(0.55, 0.55, 0.14, -2.81, silver);
  cylinder(0.46, 0.54, 0.09, -2.69, brushed);
  cylinder(0.115, 0.115, 2.72, -1.27, silver);
  cylinder(0.102, 0.102, 2.17, 0.55, brushed);
  cylinder(0.086, 0.086, 1.77, 1.99, silver);
  cylinder(0.12, 0.12, 0.045, -0.16, underside);
  cylinder(0.107, 0.107, 0.04, 1.45, underside);
  cylinder(0.091, 0.091, 0.035, 2.86, brushed);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.014, 8, 64), cyan);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -2.595;
  model.add(ring);
  for (const [y, radius] of [[-1.82, 0.115], [0.55, 0.102], [2.32, 0.086]]) {
    const window = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.31, 6, 16), sensor);
    window.position.set(0, y, radius + 0.006);
    model.add(window);
    const light = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 4, 12), cyan);
    light.position.set(0, y + 0.11, radius + 0.044);
    model.add(light);
  }
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 32), cyan);
  button.position.set(0, -2.58, 0.35);
  model.add(button);
  model.scale.set(0.7, 1, 0.7);
  return model;
}

function showFallback() {
  canvas.hidden = true;
  fallback.hidden = false;
  updateProgress();
}

function updatePrice(turn) {
  const visible = turn >= 1;
  pricePanel.classList.toggle('visible', visible);
  pricePanel.setAttribute('aria-hidden', String(!visible));
  crowdfundingLink.tabIndex = visible ? 0 : -1;
}

function updateProgress(model, renderer, scene, camera) {
  const distance = Math.max(1, story.offsetHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, -story.getBoundingClientRect().top / distance));
  const turn = Math.min(1, progress / 0.72);
  progressBar.style.width = `${Math.round(turn * 100)}%`;
  if (model && renderer && scene && camera) {
    model.rotation.y = reducedMotion.matches ? 0 : turn * Math.PI * 2;
    angle.textContent = reducedMotion.matches ? '静止表示' : `${Math.round(turn * 360)}°`;
    renderer.render(scene, camera);
  } else {
    angle.textContent = '構想画像';
  }
  updatePrice(turn);
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
  camera.position.set(2.4, 1.5, 9.6);
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
    camera.position.set(width < 650 ? 2.5 : 2.4, width < 650 ? 1.2 : 1.5, width < 650 ? 11.3 : 9.6);
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
