import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const silver = new THREE.MeshStandardMaterial({ color: 0x9ca4aa, metalness: 0.86, roughness: 0.27, envMapIntensity: 0.75 });
const brightSilver = new THREE.MeshStandardMaterial({ color: 0xbcc3c9, metalness: 0.82, roughness: 0.23, envMapIntensity: 0.8 });
const seam = new THREE.MeshStandardMaterial({ color: 0x33373d, metalness: 0.45, roughness: 0.34 });
const underside = new THREE.MeshStandardMaterial({ color: 0x181b1f, metalness: 0.3, roughness: 0.48 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x07121a, metalness: 0.12, roughness: 0.12, clearcoat: 1 });
const lens = new THREE.MeshStandardMaterial({ color: 0x12394b, emissive: 0x28b7ef, emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.1 });
const lightBlue = new THREE.MeshStandardMaterial({ color: 0x76dcff, emissive: 0x35bff2, emissiveIntensity: 1.7 });

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}

function disk(parent, top, bottom, height, y, material = silver) {
  return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, 48), material, 0, y);
}

function ring(parent, radius, thickness, y, material = lightBlue) {
  const part = mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 64), material, 0, y);
  part.rotation.x = Math.PI / 2;
  return part;
}

function cameraWindow(parent, radius, centerY, height, count) {
  mesh(parent, new THREE.CylinderGeometry(radius + 0.011, radius + 0.011, height + 0.07, 40, 1, true, -0.43, 0.86), seam, 0, centerY);
  mesh(parent, new THREE.CylinderGeometry(radius + 0.014, radius + 0.014, height, 40, 1, true, -0.39, 0.78), glass, 0, centerY);
  for (let index = 0; index < count; index += 1) {
    const y = centerY + (index - (count - 1) / 2) * (count === 3 ? 0.17 : 0.2);
    const bezel = mesh(parent, new THREE.SphereGeometry(0.039, 20, 12), underside, 0, y, radius + 0.023);
    bezel.scale.z = 0.35;
    const eye = mesh(parent, new THREE.SphereGeometry(0.021, 16, 10), lens, 0, y, radius + 0.039);
    eye.scale.z = 0.55;
  }
}

function p02CameraHead(parent) {
  // P0.2 ME-101: three apertures share one horizontal row, hidden by a lifting privacy cap at rest.
  disk(parent, 0.17, 0.17, 0.2, 5.04, brightSilver);
  mesh(parent, new THREE.CylinderGeometry(0.177, 0.177, 0.09, 48, 1, true, -0.58, 1.16), glass, 0, 5.04);
  for (const angle of [-0.36, 0, 0.36]) {
    const x = Math.sin(angle) * 0.18;
    const z = Math.cos(angle) * 0.18;
    const bezel = mesh(parent, new THREE.SphereGeometry(0.026, 20, 12), underside, x, 5.04, z);
    bezel.scale.z = 0.42;
    bezel.rotation.y = angle;
    const eye = mesh(parent, new THREE.SphereGeometry(0.014, 16, 10), lens, x + Math.sin(angle) * 0.011, 5.04, z + Math.cos(angle) * 0.011);
    eye.scale.z = 0.5;
    eye.rotation.y = angle;
  }
  const cap = new THREE.Group();
  parent.add(cap);
  disk(cap, 0.2, 0.2, 0.095, 5.04, brightSilver);
  disk(cap, 0.2, 0.2, 0.035, 5.105, silver);
  ring(cap, 0.187, 0.004, 5.129);
  return cap;
}

function tower() {
  const root = new THREE.Group();
  disk(root, 0.54, 0.56, 0.13, 0.12, underside);
  disk(root, 0.54, 0.5, 0.22, 0.28, silver);
  disk(root, 0.45, 0.48, 0.035, 0.405, brightSilver);
  ring(root, 0.235, 0.009, 0.433);
  disk(root, 0.2, 0.21, 0.06, 0.44, seam);

  disk(root, 0.164, 0.17, 2.04, 1.51);
  disk(root, 0.17, 0.17, 0.045, 2.54, seam);
  cameraWindow(root, 0.17, 1.25, 0.47, 2);

  const middle = new THREE.Group();
  root.add(middle);
  disk(middle, 0.143, 0.148, 1.64, 3.28, brightSilver);
  disk(middle, 0.15, 0.15, 0.035, 4.1, seam);

  const upper = new THREE.Group();
  root.add(upper);
  disk(upper, 0.119, 0.123, 1.05, 4.5, silver);
  const privacyCap = p02CameraHead(upper);

  const legs = [];
  for (let index = 0; index < 3; index += 1) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.18;
    pivot.rotation.y = index * Math.PI * 2 / 3 + 1.35;
    root.add(pivot);
    mesh(pivot, new THREE.BoxGeometry(0.92, 0.065, 0.14), silver, 0.82);
    mesh(pivot, new THREE.CylinderGeometry(0.085, 0.085, 0.07, 16), underside, 1.27, -0.085);
    legs.push(pivot);
  }

  const scanMaterial = new THREE.LineBasicMaterial({ color: 0x77dfff, transparent: true, opacity: 0, depthWrite: false });
  const scan = new THREE.Group();
  root.add(scan);
  const points = [];
  for (const target of [[-1.05, 3.65, 2.4], [1.05, 3.65, 2.4], [-0.8, 5.25, 2.4], [0.8, 5.25, 2.4]]) {
    points.push(0, 5.04, 0.18, ...target);
  }
  scan.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), scanMaterial));
  return { root, middle, upper, privacyCap, legs, scanMaterial };
}

function softShadow(scene) {
  const bitmap = document.createElement('canvas');
  bitmap.width = bitmap.height = 128;
  const context = bitmap.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 63);
  gradient.addColorStop(0, '#000b');
  gradient.addColorStop(1, '#0000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadow = mesh(scene, new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bitmap), transparent: true, depthWrite: false }), 0, 0.01);
  shadow.rotation.x = -Math.PI / 2;
}

export function createTowerScene(host) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'tower-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);
  host.classList.add('has-webgl');

  const scene = new THREE.Scene();
  const environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  for (const [color, intensity, position] of [
    [0xffffff, 2.5, [-4, 7, 7]],
    [0xc3eaff, 1.8, [4, 5, 2]],
    [0xffffff, 1.3, [1, 2, -5]],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }
  softShadow(scene);
  const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 40);
  camera.position.set(0, 2.65, 12.8);
  camera.lookAt(0, 2.65, 0);

  const hero = tower();
  scene.add(hero.root);
  const kit = new THREE.Group();
  scene.add(kit);
  const satellites = [-0.45, 0.45, 1.35].map((x) => {
    const unit = tower();
    unit.root.scale.setScalar(0.62);
    unit.root.position.x = x;
    kit.add(unit.root);
    return unit;
  });
  const hub = new THREE.Group();
  kit.add(hub);
  hub.position.set(0, 0, 1.5);
  disk(hub, 0.5, 0.54, 0.18, 0.1, underside);
  disk(hub, 0.42, 0.45, 0.04, 0.21, silver);
  ring(hub, 0.31, 0.01, 0.235);
  for (const x of [-1.35, -0.45, 0.45, 1.35]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.32, 0.48),
      new THREE.Vector3(x * 0.55, 0.32, 0.9),
      new THREE.Vector3(0, 0.32, 1.5),
    ]);
    kit.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.012, 5, false), lightBlue));
  }
  kit.visible = false;

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
  }

  function update({ yaw, progress, reducedMotion }) {
    const smooth = (value) => {
      const clamped = THREE.MathUtils.clamp(value, 0, 1);
      return clamped * clamped * (3 - 2 * clamped);
    };
    const extension = 0.78 - 0.28 * smooth((progress - 0.27) / 0.07) + 0.5 * smooth((progress - 0.34) / 0.18);
    const legAmount = smooth((progress - 0.43) / 0.1) * (1 - smooth((progress - 0.76) / 0.13));
    const kitAmount = smooth((progress - 0.61) / 0.09) * (1 - smooth((progress - 0.84) / 0.07));
    const baseDetail = smooth((progress - 0.43) / 0.09) * (1 - smooth((progress - 0.64) / 0.06));
    const sensing = reducedMotion ? 0 : smooth((progress - 0.07) / 0.06) * (1 - smooth((progress - 0.27) / 0.08));
    const capLift = 0.14 * smooth((progress - 0.05) / 0.06);

    const units = [hero, ...satellites];
    for (const unit of units) {
      unit.root.rotation.y = THREE.MathUtils.degToRad(unit === hero ? yaw : yaw * (1 - kitAmount) + 360 * kitAmount);
      unit.middle.position.y = -(1 - extension) * 0.9;
      unit.upper.position.y = -(1 - extension) * 1.65;
      unit.privacyCap.position.y = capLift;
      unit.legs.forEach((leg) => { leg.scale.x = Math.max(0.001, legAmount); });
      unit.scanMaterial.opacity = unit === hero ? sensing * 0.32 : 0;
    }
    hero.root.scale.setScalar(1 - kitAmount * 0.38);
    hero.root.position.x = -1.35 * kitAmount;
    kit.visible = kitAmount > 0.02;
    kit.scale.setScalar(Math.max(0.001, kitAmount));
    camera.position.z = 12.8 - baseDetail * 6.2 - kitAmount * 1.9
      + (window.innerWidth < 800 ? baseDetail * 1.8 + kitAmount * 2.8 : 0);
    camera.position.y = 2.65 + baseDetail * 0.5;
    camera.lookAt(0, 2.65 - baseDetail * 1.85 - kitAmount * 0.45, 0);
    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return { update, resize, dispose() { observer.disconnect(); environment.dispose(); renderer.dispose(); renderer.domElement.remove(); host.classList.remove('has-webgl'); } };
}
