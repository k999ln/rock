'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './avocado-turntable.module.css';

function makeModel() {
  const model = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xd7dce0, metalness: 0.78, roughness: 0.25 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0xaeb8c0, metalness: 0.75, roughness: 0.34 });
  const underside = new THREE.MeshStandardMaterial({ color: 0x171b1e, metalness: 0.35, roughness: 0.5 });
  const collar = new THREE.MeshStandardMaterial({ color: 0x15191d, metalness: 0.22, roughness: 0.23 });
  const sensor = new THREE.MeshPhysicalMaterial({ color: 0x080d14, metalness: 0.2, roughness: 0.08, clearcoat: 1 });
  const cylinder = (top: number, bottom: number, height: number, y: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 64), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  };

  // One free-standing tower from the four-tower kit, using P0.2 proportions.
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
    camera.position.set(3.1, 1.8, 12);
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
      camera.position.set(3.1, width < 650 ? 1.5 : 1.8, width < 650 ? 13.5 : 12);
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
          <p className={styles.heroLine}>空間を変える。<br />作業が、変わる。</p>
          <p className={styles.heroDescription}>4本のMotion Towerと1台のEdge Hubからなるキット。<br />まずは1本をスクロールで一周し、その形を見てください。</p>
        </div>
        <div className={styles.viewport} ref={viewportRef}>
          <canvas ref={canvasRef} aria-hidden="true" className={fallback ? styles.hiddenCanvas : undefined} />
          {fallback && <Image className={styles.fallback} src="/rockstaros/avocado-mini-kit-p0.png" alt="4本のMotion TowerとEdge HubからなるavocadoMiniキットの構想画像" width={1672} height={941} priority />}
        </div>
        <div className={styles.bottomBar}>
          <div className={styles.angle}><span>DESIGN VIEW</span><strong ref={angleRef}>0°</strong></div>
          <div className={styles.progressTrack}><div ref={progressRef} /></div>
          <p>スクロールして製品を一周</p>
        </div>
        <div className={`${styles.pricePanel} ${priceVisible ? styles.priceVisible : ''}`} aria-hidden={!priceVisible}>
          <p className={styles.priceLabel}>一周した、その先へ。</p>
          <h2>avocadoMini</h2>
          <p className={styles.price}><span>4本＋Edge Hubのキット目標価格（税込）</span><strong>¥410,000</strong></p>
          <button type="button" disabled aria-label="購入する。現在は販売前です">購入する <span>準備中</span></button>
          <Link href="/rockstaros/crowdfunding" tabIndex={priceVisible ? 0 : -1}>クラファン企画を見る ↗</Link>
          <small>P0.2設計中のキット目標です。購入・予約・決済はまだ受け付けていません。</small>
        </div>
      </div>
    </section>
    <section className={styles.designDetails} aria-labelledby="design-details-title">
      <div>
        <p className={styles.eyebrow}>AVOCADOMINI / DESIGN STUDY</p>
        <h2 id="design-details-title">4本で、空間を捉える。</h2>
        <p>avocadoMiniは4本の伸縮式Motion TowerとEdge Hubのキット構想。各タワーに3基のカメラと独立した安全制御を備えるP0.2設計です。</p>
        <div className={styles.specs} aria-label="製品構想の主な寸法">
          <p><strong>4 <span>本</span></strong><small>Motion Tower＋Edge Hub</small></p>
          <p><strong>850 → 1,200 <span>mm</span></strong><small>収納時 → 自立時上限</small></p>
          <p><strong>1,800 <span>mm</span></strong><small>ドックまたは床ラッチの検出時のみ</small></p>
        </div>
        <p className={styles.controlNote}>P0.2のベース径は220 mm、展開脚の外径は520 mm。量産仕様ではありません。</p>
      </div>
      <figure className={styles.conceptImage}>
        <Image src="/rockstaros/avocado-mini-kit-p0.png" alt="4本のMotion TowerとEdge Hubの構想レンダリング" width={1672} height={941} loading="lazy" />
        <figcaption>P0.2設計に基づく構想レンダリング。実機写真や量産仕様ではありません。</figcaption>
      </figure>
    </section>
    <section className={styles.experience} aria-labelledby="experience-title">
      <p className={styles.eyebrow}>02 / THE EXPERIENCE</p>
      <h2 id="experience-title">使う場所に、<br />知性が立ち上がる。</h2>
      <p>4本が作業領域を囲み、Edge Hubがデータを束ねる。AR表示は外部のメガネ、タブレット、PCなどへ届ける設計です。</p>
      <div className={styles.experienceGrid}>
        <div><span>01</span><strong>4本を配置する。</strong><p>起動時の前方180度走査で、各タワーの位置と床面を校正する設計です。</p></div>
        <div><span>02</span><strong>作業を支える。</strong><p>LLMは案内と説明を担当し、動作、録画、安全解除の許可は行いません。</p></div>
        <div><span>03</span><strong>安全に収める。</strong><p>脚、傾き、ドックの状態を確認し、条件が外れたときは安全制御が動作を止めます。</p></div>
      </div>
      <small>このセクションは製品構想です。実機性能や一般向け提供を確約するものではありません。</small>
    </section>
    <section className={styles.osSection} aria-labelledby="os-install-title">
      <div>
        <p className={styles.eyebrow}>NEXT / ROCKSTAROS</p>
        <h2 id="os-install-title">RockstarOSを知る。</h2>
        <p>製品の先にあるOSの導入条件と現在の配布状況は、専用ガイドで確認できます。</p>
        <Link className={styles.osButton} href="/rockstaros/guide#install">OSを入れる <span aria-hidden="true">↗</span></Link>
        <small>現在はDeveloper Previewの案内です。正式署名済みの一般向けインストーラーは未公開です。</small>
      </div>
    </section>
  </>;
}
