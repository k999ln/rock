'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './avocado-turntable.module.css';

function makeModel() {
  const model = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xb9c7cc, metalness: 0.82, roughness: 0.23 });
  const edgeSilver = new THREE.MeshStandardMaterial({ color: 0x7f929d, metalness: 0.75, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101d25, metalness: 0.48, roughness: 0.32 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x183e53, metalness: 0.18, roughness: 0.16, transparent: true, opacity: 0.91, clearcoat: 0.8 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x5be4ff, emissive: 0x159fc2, emissiveIntensity: 1.4, metalness: 0.25, roughness: 0.2 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x020a12, metalness: 0.25, roughness: 0.08, clearcoat: 1 });

  const box = (width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  };
  const cylinder = (radius: number, length: number, material: THREE.Material, x: number, y: number, z: number, horizontal = false) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), material);
    mesh.position.set(x, y, z);
    if (horizontal) mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    model.add(mesh);
    return mesh;
  };

  // Preliminary full-scale concept: work surface, four sensor viewpoints, and the compute core.
  box(5.25, 0.14, 2.68, dark, 0, 0, 0);
  box(5.06, 0.035, 2.48, glass, 0, 0.09, 0);
  for (let i = -5; i <= 5; i++) {
    box(0.006, 0.004, 2.46, cyan, i * 0.45, 0.111, 0);
  }
  for (let i = -2; i <= 2; i++) {
    box(5.04, 0.004, 0.006, cyan, 0, 0.112, i * 0.48);
  }
  box(5.34, 0.06, 0.09, silver, 0, -0.02, 1.36);
  box(5.34, 0.06, 0.09, silver, 0, -0.02, -1.36);
  box(0.09, 0.06, 2.74, silver, 2.67, -0.02, 0);
  box(0.09, 0.06, 2.74, silver, -2.67, -0.02, 0);

  for (const x of [-2.58, 2.58]) {
    for (const z of [-1.28, 1.28]) {
      cylinder(0.08, 0.92, silver, x, -0.53, z);
      cylinder(0.15, 0.08, edgeSilver, x, -1.02, z);
      cylinder(0.064, 1.36, silver, x, 0.75, z);
      cylinder(0.085, 0.11, edgeSilver, x, 1.46, z);

      const pod = cylinder(0.14, 0.76, silver, x, 1.56, z, true);
      pod.rotation.y = z > 0 ? -0.12 : 0.12;
      const inward = z > 0 ? -1 : 1;
      box(0.56, 0.16, 0.035, dark, x, 1.56, z + inward * 0.13);
      for (const offset of [-0.17, 0, 0.17]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 8), lens);
        eye.position.set(x + offset, 1.56, z + inward * 0.16);
        model.add(eye);
      }
      box(0.025, 0.12, 0.036, cyan, x + 0.27, 1.56, z + inward * 0.151);
    }
  }

  cylinder(0.25, 2.9, silver, 0, -0.6, 1.16, true);
  cylinder(0.28, 0.1, edgeSilver, -1.47, -0.6, 1.16, true);
  cylinder(0.28, 0.1, edgeSilver, 1.47, -0.6, 1.16, true);
  box(4.65, 0.045, 0.045, edgeSilver, 0, -0.77, -1.25);
  box(4.65, 0.045, 0.045, edgeSilver, 0, -0.77, 1.25);
  return model;
}

export function AvocadoTurntable() {
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef<HTMLSpanElement>(null);
  const [priceVisible, setPriceVisible] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!section || !viewport || !canvas) return;

    const updateFallback = () => {
      const distance = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / distance));
      const turn = Math.min(1, progress / 0.72);
      if (progressRef.current) progressRef.current.style.width = `${Math.round(turn * 100)}%`;
      if (angleRef.current) angleRef.current.textContent = '構想画像';
      setPriceVisible(turn >= 1);
    };
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { /* WebGL unavailable; show the design image below. */ }
    if (!renderer) {
      const fallbackFrame = window.requestAnimationFrame(() => {
        setFallback(true);
        updateFallback();
      });
      window.addEventListener('scroll', updateFallback, { passive: true });
      window.addEventListener('resize', updateFallback);
      return () => {
        window.cancelAnimationFrame(fallbackFrame);
        window.removeEventListener('scroll', updateFallback);
        window.removeEventListener('resize', updateFallback);
      };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
    camera.position.set(7.7, 4.7, 9.4);
    camera.lookAt(0, 0.18, 0);
    scene.add(new THREE.AmbientLight(0xdff5ff, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(-3, 9, 7);
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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.24 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.08;
    floor.receiveShadow = true;
    scene.add(floor);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const resize = () => {
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      camera.aspect = width / height;
      camera.position.set(7.7, width < 650 ? 5.8 : 4.7, width < 650 ? 12.9 : 9.4);
      camera.lookAt(0, 0.18, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };
    const update = () => {
      frame = 0;
      const distance = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / distance));
      const turn = Math.min(1, progress / 0.72);
      model.rotation.y = 0.5 + (reducedMotion.matches ? 0 : turn * Math.PI * 2);
      if (progressRef.current) progressRef.current.style.width = `${Math.round(turn * 100)}%`;
      if (angleRef.current) angleRef.current.textContent = reducedMotion.matches ? '静止表示' : `${Math.round(turn * 360)}°`;
      setPriceVisible((current) => current === (turn >= 1) ? current : turn >= 1);
      renderer.render(scene, camera);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(() => { resize(); schedule(); });
    observer.observe(viewport);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reducedMotion.addEventListener('change', schedule);
    resize();
    update();

    const onContextLost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener('webglcontextlost', onContextLost);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reducedMotion.removeEventListener('change', schedule);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (frame) window.cancelAnimationFrame(frame);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          geometries.add(child.geometry);
          const used = Array.isArray(child.material) ? child.material : [child.material];
          used.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  return <>
    <section className={styles.story} ref={sectionRef} aria-labelledby="avocado-mini-title">
      <div className={styles.sticky}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>AVOCADOMINI / PRODUCT CONCEPT</p>
          <h1 id="avocado-mini-title">発明を、手で考える。</h1>
          <p>四方向のセンサーで作業面を捉える、RockstarOS搭載を目指す空間発明端末。</p>
        </div>
        <div className={styles.viewport} ref={viewportRef}>
          <canvas ref={canvasRef} aria-hidden="true" className={fallback ? styles.hiddenCanvas : undefined} />
          {fallback && <Image className={styles.fallback} src="/rockstaros/avocado-mini-concept.png" alt="avocadoMiniの四方向センサーと作業面の構想画像" width={1680} height={940} priority />}
        </div>
        <div className={styles.bottomBar}>
          <div className={styles.angle}><span>DESIGN VIEW</span><strong ref={angleRef}>0°</strong></div>
          <div className={styles.progressTrack}><div ref={progressRef} /></div>
          <p>スクロールして製品を一周</p>
        </div>
        <div className={`${styles.pricePanel} ${priceVisible ? styles.priceVisible : ''}`} aria-hidden={!priceVisible}>
          <p className={styles.priceLabel}>一周した、その先へ。</p>
          <h2>avocadoMini</h2>
          <p className={styles.price}><span>希望参考価格</span><strong>¥410,000</strong></p>
          <button type="button" disabled aria-label="購入する。現在は販売前です">購入する <span>準備中</span></button>
          <Link href="/rockstaros/crowdfunding" tabIndex={priceVisible ? 0 : -1}>クラファン企画を見る ↗</Link>
          <small>設計中の参考価格です。購入・予約・決済はまだ受け付けていません。</small>
        </div>
      </div>
    </section>
    <section className={styles.osSection} aria-labelledby="os-install-title">
      <div>
        <p className={styles.eyebrow}>NEXT / ROCKSTAROS</p>
        <h2 id="os-install-title">発明の続きを、OSで。</h2>
        <p>高性能LLMの搭載を目指すRockstarOSで、作業をスムーズに。Skyで道具を選び、Zemaで仕事を進める。Developer Previewで、導入できる環境と現在の配布状況を確認できます。</p>
        <Link className={styles.osButton} href="/rockstaros/guide#install">OSを入れる <span aria-hidden="true">↗</span></Link>
        <small>現在の実機検証は固定モデルのDeveloper Previewです。正式署名済みの一般向けインストーラーは未公開です。</small>
      </div>
      <figure className={styles.conceptImage}>
        <Image src="/rockstaros/avocado-mini-concept.png" alt="avocadoMiniの四方向センサー、作業面、演算ユニットを示す構想参考画像" width={1680} height={940} loading="lazy" />
        <figcaption>構想参考画像。回転表示は設計イメージで、製造図や実機映像ではありません。</figcaption>
      </figure>
    </section>
  </>;
}
