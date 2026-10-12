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

function e3CameraHead(parent) {
  // Tower20 E3: one active monochrome camera and two reserved exterior windows.
  mesh(parent, new THREE.CylinderGeometry(0.226, 0.226, 0.23, 48, 1, true), glass, 0, 1.78);
  for (const [angle, active] of [[-0.43, false], [0, true], [0.43, false]]) {
    const x = Math.sin(angle) * 0.232;
    const z = Math.cos(angle) * 0.232;
    const bezel = mesh(parent, new THREE.SphereGeometry(active ? 0.038 : 0.044, 20, 12), underside, x, 1.78, z);
    bezel.scale.z = 0.35;
    bezel.rotation.y = angle;
    if (active) {
      const eye = mesh(parent, new THREE.SphereGeometry(0.021, 16, 10), lens, x, 1.78, z + 0.012);
      eye.scale.z = 0.5;
      eye.rotation.y = angle;
    }
  }
  disk(parent, 0.235, 0.235, 0.15, 1.97, brightSilver);
}

function tower() {
  const root = new THREE.Group();
  disk(root, 0.49, 0.5, 0.10, 0.05, underside);
  disk(root, 0.48, 0.46, 0.22, 0.20, silver);
  disk(root, 0.41, 0.44, 0.03, 0.325, brightSilver);
  disk(root, 0.225, 0.225, 0.05, 0.35, seam);

  disk(root, 0.22, 0.22, 0.54, 0.64, silver);
  disk(root, 0.222, 0.222, 0.018, 0.92, seam);
  disk(root, 0.22, 0.22, 0.40, 1.13, brightSilver);
  disk(root, 0.222, 0.222, 0.018, 1.34, seam);
  disk(root, 0.22, 0.22, 0.31, 1.51, silver);
  e3CameraHead(root);

  const legs = [];
  for (let index = 0; index < 4; index += 1) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.12;
    pivot.rotation.y = index * Math.PI / 2 + Math.PI / 4;
    root.add(pivot);
    mesh(pivot, new THREE.BoxGeometry(0.58, 0.055, 0.11), silver, 0.67);
    mesh(pivot, new THREE.CylinderGeometry(0.065, 0.065, 0.055, 16), underside, 0.96, -0.055);
    legs.push(pivot);
  }

  const scanMaterial = new THREE.LineBasicMaterial({ color: 0x77dfff, transparent: true, opacity: 0, depthWrite: false });
  const scan = new THREE.Group();
  root.add(scan);
  const points = [];
  for (const target of [[-1.05, 1.4, 2.4], [1.05, 1.4, 2.4], [-0.8, 2.15, 2.4], [0.8, 2.15, 2.4]]) {
    points.push(0, 1.78, 0.23, ...target);
  }
  scan.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), scanMaterial));
  return { root, legs, scanMaterial };
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
  camera.position.set(0, 1.08, 7.2);
  camera.lookAt(0, 1.02, 0);

  const hero = tower();
  scene.add(hero.root);
  const kit = new THREE.Group();
  scene.add(kit);
  const satellites = [-0.45, 0.45, 1.35].map((x) => {
    const unit = tower();
    unit.root.scale.setScalar(0.72);
    unit.root.position.x = x;
    kit.add(unit.root);
    return unit;
  });
  const hub = new THREE.Group();
  kit.add(hub);
  hub.position.set(0, 0.2, 1.35);
  mesh(hub, new THREE.BoxGeometry(1.2, 0.34, 0.9), underside, 0, 0, 0);
  const hubTop = mesh(hub, new THREE.BoxGeometry(1.12, 0.08, 0.82), brightSilver, 0, 0.21, 0);
  hubTop.scale.set(0.98, 1, 0.98);
  for (const x of [-1.35, -0.45, 0.45, 1.35]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.2, 0.48),
      new THREE.Vector3(x * 0.55, 0.2, 0.9),
      new THREE.Vector3(0, 0.2, 1.35),
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
    const legAmount = 1;
    const kitAmount = smooth((progress - 0.61) / 0.09) * (1 - smooth((progress - 0.84) / 0.07));
    const baseDetail = smooth((progress - 0.43) / 0.09) * (1 - smooth((progress - 0.64) / 0.06));
    const sensing = reducedMotion ? 0 : smooth((progress - 0.07) / 0.06) * (1 - smooth((progress - 0.27) / 0.08));

    const units = [hero, ...satellites];
    for (const unit of units) {
      unit.root.rotation.y = THREE.MathUtils.degToRad(unit === hero ? yaw : yaw * (1 - kitAmount) + 360 * kitAmount);
      unit.legs.forEach((leg) => { leg.scale.x = legAmount; });
      unit.scanMaterial.opacity = unit === hero ? sensing * 0.32 : 0;
    }
    hero.root.scale.setScalar(1 - kitAmount * 0.38);
    hero.root.position.x = -1.35 * kitAmount;
    kit.visible = kitAmount > 0.02;
    kit.scale.setScalar(Math.max(0.001, kitAmount));
    camera.position.z = 7.2 - baseDetail * 3.0 - kitAmount * 0.8
      + (window.innerWidth < 800 ? baseDetail * 1.2 + kitAmount * 1.4 : 0);
    camera.position.y = 1.08 + baseDetail * 0.2;
    camera.lookAt(0, 1.02 - baseDetail * 0.5 - kitAmount * 0.12, 0);
    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return { update, resize, dispose() { observer.disconnect(); environment.dispose(); renderer.dispose(); renderer.domElement.remove(); host.classList.remove('has-webgl'); } };
}
