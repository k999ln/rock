'use client';
import { useEffect, useRef, useState } from 'react';
import { useNoahLocale } from './noah-locale';
import styles from './noah-tiger-game.module.css';
import {
  CLOUD,
  DOT,
  GROUND,
  MAGIC_STAR,
  NOAH_TIGER_ACTIVE,
  STAGE_H,
  STAGE_W,
  TIGER_X,
  WIZARD_HAT,
  createNoahTigerGame,
  currentTigerSprite,
  pigeonFrame,
  pressNoahTigerJump,
  releaseNoahTigerJump,
  startNoahTigerGame,
  stepNoahTigerGame,
  type NoahTigerPreset,
  type Sprite,
} from '@/lib/noah-tiger-game';

const pad = (n: number) => String(Math.floor(n)).padStart(5, '0');
const isJumpKey = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, button, a'));

function readHi(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * 全画面の読み込み中に出す画面。上に「Noah」、その下で点のトラのスケボーゲーム。
 * 見本: design/references/components/noah-tiger-loading.html / noah-tiger-loading-hard.html
 */
export default function NoahTigerLoading({ offline = false, preset = NOAH_TIGER_ACTIVE }: { offline?: boolean; preset?: NoahTigerPreset }) {
  const { t } = useNoahLocale();
  const hint = t('{space} か {up}、またはタップでオーリー（板ごとジャンプ）。長く押すと高く跳びます。');
  return (
    <div className={styles.screen}>
      <span className={styles.brand} aria-hidden={offline ? undefined : true}>
        Noah{offline && <> · {t('オフラインです')}</>}
      </span>
      <NoahTigerGame preset={preset} />
      <p className={styles.hint}>
        {hint.split(/(\{space\}|\{up\})/).map((part, i) =>
          part === '{space}' ? <kbd key={i}>{t('スペース')}</kbd> : part === '{up}' ? <kbd key={i}>↑</kbd> : part,
        )}
      </p>
    </div>
  );
}

export function NoahTigerOffline() {
  const { t } = useNoahLocale();
  return (
    <main className={styles.offlinePage}>
      <NoahTigerLoading offline />
      <button className={styles.reload} type="button" onClick={() => window.location.reload()}>
        {t('再読み込み')}
      </button>
    </main>
  );
}

export function NoahTigerGame({ preset = NOAH_TIGER_ACTIVE }: { preset?: NoahTigerPreset }) {
  const { t } = useNoahLocale();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nowRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'run' | 'over'>(preset.autoStart ? 'run' : 'idle');
  const [hi, setHi] = useState(0);
  const [wizardSeconds, setWizardSeconds] = useState(0);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!stage || !canvas || !ctx) return;
    const game = createNoahTigerGame(preset);
    let best = readHi(preset.hiScoreKey);
    let lastWizardSeconds = 0;
    setHi(best);
    if (preset.autoStart) startNoahTigerGame(game);

    const colors: Record<string, string> = {};
    const readColors = () => {
      const cs = getComputedStyle(stage);
      for (const name of ['fg', 'tiger', 'hole', 'thing', 'cloud', 'magic']) colors[name] = cs.getPropertyValue('--tiger-' + name).trim();
    };
    readColors();

    let k = 1; // 端末の px ÷ 論理 px
    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      k = canvas.width / STAGE_W;
      draw();
    };
    // 端末の px にそろえて塗るので、どの大きさでも点がにじまない
    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      const x0 = Math.round(x * k), y0 = Math.round(y * k);
      ctx.fillStyle = c;
      ctx.fillRect(x0, y0, Math.round((x + w) * k) - x0, Math.round((y + h) * k) - y0);
    };
    const sprite = (rows: Sprite, x: number, y: number, palette: Record<string, string>) => {
      for (let j = 0; j < rows.length; j++) {
        for (let i = 0; i < rows[j].length; i++) {
          const c = palette[rows[j][i]];
          if (c) rect(x + i * DOT, y + j * DOT, DOT, DOT, c);
        }
      }
    };
    function draw() {
      if (!ctx || !colors.fg) return;
      // 地は塗らない。コーンの帯やハトの目の穴からも、画面の地がそのまま見える
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      for (const c of game.clouds) sprite(CLOUD, c.x, c.y, { '#': colors.cloud });
      rect(0, GROUND, STAGE_W, 2, colors.thing);
      for (const j of game.joints) rect(j.x, GROUND + 4, 2, 6, colors.thing);
      for (const p of game.dust) rect(p.x, p.y, 2, 2, colors.thing);
      const pigeon = pigeonFrame(game);
      for (const o of game.obstacles) {
        sprite(o.kind === 'thing' ? o.rows : pigeon, o.x, o.y, { '#': colors.thing });
      }
      for (const star of game.magicStars) sprite(MAGIC_STAR, star.x, star.y, { '#': colors.magic });
      sprite(currentTigerSprite(game), TIGER_X, game.y, { '#': colors.tiger, o: colors.hole, b: colors.fg });
      if (game.wizardFrames > 0) {
        sprite(WIZARD_HAT, TIGER_X + 14 * DOT, game.y - 5 * DOT, { '#': colors.magic });
      }
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastT = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(2.5, (now - lastT) / (1000 / 60)));
      lastT = now;
      const before = game.phase;
      const { crashed, milestone } = stepNoahTigerGame(game, dt, { reduceMotion: reduce.matches });
      const seconds = Math.ceil(game.wizardFrames / 60);
      if (seconds !== lastWizardSeconds) {
        lastWizardSeconds = seconds;
        setWizardSeconds(seconds);
      }
      if (before === 'run' && nowRef.current) nowRef.current.textContent = pad(game.score);
      if (milestone && scoreRef.current) {
        const el = scoreRef.current;
        el.classList.remove(styles.flash);
        void el.offsetWidth;
        el.classList.add(styles.flash);
      }
      if (crashed) {
        if (game.score > best) {
          best = Math.floor(game.score);
          try {
            localStorage.setItem(preset.hiScoreKey, String(best));
          } catch {
            /* ハイスコアは覚えられなくても遊べる */
          }
          setHi(best);
        }
        setPhase('over');
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const press = () => {
      if (pressNoahTigerJump(game) === 'started') {
        if (nowRef.current) nowRef.current.textContent = pad(0);
        setPhase('run');
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isJumpKey(e) || isTyping(e.target)) return;
      e.preventDefault();
      if (!e.repeat) press();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isJumpKey(e)) releaseNoahTigerJump(game);
    };
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      press();
    };
    const onPointerUp = () => releaseNoahTigerJump(game);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    stage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [preset]);

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      role="application"
      aria-label={t('トラがスケボーでコーンやハトをよけるゲーム。スペースキーかタップでオーリー（ジャンプ）します。')}
    >
      <canvas ref={canvasRef} className={styles.canvas} width={STAGE_W} height={STAGE_H} />
      <div ref={scoreRef} className={styles.score} aria-hidden="true">
        <span>{hi > 0 ? 'HI ' + pad(hi) : ''}</span>
        <span ref={nowRef} className={styles.now}>
          00000
        </span>
      </div>
      {wizardSeconds > 0 && <output className={styles.wizard}>
        {t('魔法使い・無敵')} <span aria-hidden="true">{wizardSeconds}s</span>
      </output>}
      {phase !== 'run' && (
        <div className={styles.callout}>
          {phase === 'over' ? t('ぶつかった！') : t('スペースキーかタップでスタート')}
          <small>{phase === 'over' ? t('スペースキーかタップで、もう一度') : t('待っている間、トラのスケボーをどうぞ')}</small>
        </div>
      )}
    </div>
  );
}
