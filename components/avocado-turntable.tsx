'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './avocado-turntable.module.css';

function makeModel() {
  const model = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xf0f5f6, metalness: 0.36, roughness: 0.23 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0xbecdd3, metalness: 0.42, roughness: 0.28 });
  const underside = new THREE.MeshStandardMaterial({ color: 0x40525d, metalness: 0.38, roughness: 0.33 });
  const sensor = new THREE.MeshPhysicalMaterial({ color: 0x07121b, metalness: 0.15, roughness: 0.08, clearcoat: 1 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x75efff, emissive: 0x1bc6eb, emissiveIntensity: 1.6 });
  const cylinder = (top: number, bottom: number, height: number, y: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 64), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  };

  // The supplied full-scale concept is a single telescopic sensor tower, not a worktable.
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
    camera.position.set(3.1, 1.8, 11);
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

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const resize = () => {
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      camera.aspect = width / height;
      camera.position.set(3.1, width < 650 ? 1.5 : 1.8, width < 650 ? 12.1 : 10.5);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);
    };
    const update = () => {
      frame = 0;
      const distance = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / distance));
      const turn = Math.min(1, progress / 0.72);
      model.rotation.y = reducedMotion.matches ? 0 : turn * Math.PI * 2;
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
    <section className={styles.story} id="design" ref={sectionRef} aria-labelledby="avocado-mini-title">
      <div className={styles.sticky}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>AVOCADOMINI / FULL SCALE CONCEPT</p>
          <h1 id="avocado-mini-title">avocadoMini</h1>
          <p>伸びる。見つめる。ひらめく。<br />伸縮式センサータワーの全周を、スクロールで。</p>
        </div>
        <div className={styles.viewport} ref={viewportRef}>
          <canvas ref={canvasRef} aria-hidden="true" className={fallback ? styles.hiddenCanvas : undefined} />
          {fallback && <Image className={styles.fallback} src="/rockstaros/avocado-mini-tower-concept.png" alt="avocadoMiniの伸縮式センサータワーの構想画像" width={1672} height={941} priority />}
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
        <div className={styles.specs} aria-label="製品構想の主な寸法">
          <p><strong>850 → 1,800 <span>mm</span></strong><small>収納時 → 伸長時</small></p>
          <p><strong>Ø160 <span>mm</span></strong><small>ベースの構想寸法</small></p>
          <p><strong>3 <span>段</span></strong><small>伸縮するセンサータワー</small></p>
        </div>
        <p className={styles.controlNote}>操作構想：ベースのボタンを長押しして、自動で伸長・収納。</p>
      </div>
      <figure className={styles.conceptImage}>
        <Image src="/rockstaros/avocado-mini-tower-concept.png" alt="avocadoMiniの伸縮式センサータワー、ボタン、内部構造を示す構想参考画像" width={1672} height={941} loading="lazy" />
        <figcaption>構想参考画像。回転表示は設計イメージで、製造図や実機映像ではありません。</figcaption>
      </figure>
    </section>
  </>;
}
