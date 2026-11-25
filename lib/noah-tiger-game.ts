/**
 * Noah のマスコット「点のトラ」のスケボーゲーム（読み込み中に遊ぶ）。描画以外の計算だけを持つ。
 *
 * 見本は design/references/components/noah-tiger-loading.html（ふつう版）と
 * noah-tiger-loading-hard.html（難しい版）。点の絵・物理・障害物・当たり判定はそこから移した。
 * 座標は横 480 × 縦 160 の論理 px。1 点は 3 px。
 */

export const DOT = 3;
export const STAGE_W = 480;
export const STAGE_H = 160;
export const GROUND = 140;
export const TIGER_X = 22;
export const TIGER_W = 24 * DOT;
export const TIGER_H = 10 * DOT;
export const TIGER_GROUND_Y = GROUND - TIGER_H;

const JUMP_VELOCITY = -8.6;
const RELEASE_VELOCITY = -4;
const GRAVITY = 0.62;
const GRAVITY_HOLDING = 0.42;

/** '#' トラのオレンジ, 'o' 穴（縞・目・鼻・コーンの帯・ハトの目）, 'b' スケボー, '.' 何もない */
export type Sprite = readonly string[];

/** トラは 4 本の足でスケボーに乗る。24 × 10 点。目・鼻・縞 4 本は点を抜いた穴。 */
export function tigerSprite({
  pose = 'ride',
  eyesOpen = true,
  board = 'flat',
}: { pose?: 'ride' | 'push'; eyesOpen?: boolean; board?: 'flat' | 'pop' } = {}): Sprite {
  const width = 24;
  const height = 10;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const on = (x: number, y: number, c = '#') => {
    if (y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = c;
  };
  for (const [x, y] of [[0, 0], [0, 1], [1, 2]]) on(x, y); // 尻尾
  for (let x = 3; x <= 14; x++) on(x, 2); // 背中
  for (let y = 3; y <= 5; y++) for (let x = 2; x <= 14; x++) on(x, y); // 体
  for (const x of [3, 6, 9, 12]) {
    on(x, 3, 'o');
    on(x, 4, 'o');
  } // 縞
  for (let y = 1; y <= 3; y++) for (let x = 15; x <= 21; x++) on(x, y); // 頭
  for (let x = 16; x <= 20; x++) on(x, 4); // あご
  on(16, 0);
  on(20, 0); // 耳
  if (eyesOpen) {
    on(17, 2, 'o');
    on(19, 2, 'o');
  } // 目
  on(18, 3, 'o'); // 鼻
  // 足は板の上。地面を蹴る時は、後ろ足が 1 本だけ道まで伸びる
  const paws = pose === 'push' ? [6, 10, 13] : [3, 6, 10, 13];
  for (const x0 of paws) {
    on(x0, 6);
    on(x0 + 1, 6);
  }
  if (pose === 'push') {
    on(2, 6);
    on(1, 7);
    on(1, 8);
    on(0, 9);
  }
  // スケボー：板・反った先・車輪 2 つ。"pop" はオーリーで板の後ろを踏み込んだ形
  for (let x = 2; x <= 22; x++) on(x, 7, 'b');
  on(23, 6, 'b');
  if (board === 'pop') {
    on(2, 7, '.');
    on(3, 7, '.');
    on(2, 8, 'b');
    on(3, 8, 'b');
  }
  for (const x0 of [4, 18]) {
    for (const y of [8, 9]) {
      on(x0, y, 'b');
      on(x0 + 1, y, 'b');
    }
  }
  return grid.map((row) => row.join(''));
}

export const TIGER = {
  ride: tigerSprite(),
  push: tigerSprite({ pose: 'push' }),
  blink: tigerSprite({ eyesOpen: false }),
  ollie: tigerSprite({ board: 'pop' }),
  air: tigerSprite(),
  down: tigerSprite({ eyesOpen: false }),
} as const;

// 街の物。灰色 1 色で描く。'o' は穴（コーンの反射の帯、ハトの目）
export const CONE: Sprite = ['...#...', '..###..', '..ooo..', '.#####.', '.#####.', '#######'];
export const CONE_TALL: Sprite = ['...#...', '..###..', '..###..', '..ooo..', '.#####.', '.#####.', '.#####.', '#######'];
export const BENCH: Sprite = ['############', '############', '.#........#.', '.#........#.', '.#........#.'];
export const PIGEON: readonly [Sprite, Sprite] = [
  ['....##..', '...##...', '##o####.', '.######.', '....##..'],
  ['........', '........', '##o####.', '.#######', '...###..'],
];
export const CLOUD: Sprite = ['...####...', '.########.', '##########'];

export type NoahTigerPreset = {
  id: 'normal' | 'hard';
  startSpeed: number;
  maxSpeed: number;
  acceleration: number;
  /** 開いた瞬間に走り出すか */
  autoStart: boolean;
  /** ぶつかる範囲を少し小さくして、やさしくするか */
  forgivingHits: boolean;
  hiScoreKey: string;
};

export const NOAH_TIGER_NORMAL: NoahTigerPreset = {
  id: 'normal',
  startSpeed: 5.2,
  maxSpeed: 11.5,
  acceleration: 0.0016,
  autoStart: false,
  forgivingHits: true,
  hiScoreKey: 'noah-tiger-hi',
};

export const NOAH_TIGER_HARD: NoahTigerPreset = {
  id: 'hard',
  startSpeed: 8.5,
  maxSpeed: 13,
  acceleration: 0.002,
  autoStart: true,
  forgivingHits: false,
  hiScoreKey: 'noah-tiger-hi-hard',
};

/**
 * 今使う難しさ。本人の指示（2026-11-24 07:05）「めちゃめちゃ難しくして…今の状態は保存して後で復旧できる状態で」。
 * ふつう版へ戻す時は、ここを NOAH_TIGER_NORMAL にするだけでよい。
 */
export const NOAH_TIGER_ACTIVE: NoahTigerPreset = NOAH_TIGER_HARD;

/** 難しい版の壁の穴。高さ 44 px。下端は地面（0 = 跳ぶと死ぬ）か 18〜60 px。 */
export const HARD_HOLE_HEIGHT = 44;
export const HARD_HOLE_BOTTOMS = [0, 18, 24, 30, 36, 42, 48, 54, 60] as const;
/** 壁と壁の間（フレーム数）。2 つ続けて通るのに最短 28 フレーム要るので、30 から。 */
export const HARD_GAP_FRAMES = { min: 30, max: 40 } as const;

export type NoahTigerObstacle =
  | { kind: 'thing'; rows: Sprite; x: number; y: number; w: number; h: number }
  | { kind: 'pigeon'; x: number; y: number; w: number; h: number };

export type NoahTigerGame = {
  preset: NoahTigerPreset;
  phase: 'idle' | 'run' | 'over';
  y: number;
  vy: number;
  holding: boolean;
  speed: number;
  distance: number;
  score: number;
  frame: number;
  blinkAt: number;
  pushAt: number;
  milestone: number;
  obstacles: NoahTigerObstacle[];
  clouds: { x: number; y: number }[];
  joints: { x: number }[];
  dust: { x: number; y: number; life: number }[];
  untilNextWall: number;
};

export type Random = () => number;

export function createNoahTigerGame(preset: NoahTigerPreset = NOAH_TIGER_ACTIVE): NoahTigerGame {
  const game = { preset, phase: 'idle' } as NoahTigerGame;
  resetNoahTigerGame(game);
  return game;
}

export function resetNoahTigerGame(game: NoahTigerGame): void {
  game.y = TIGER_GROUND_Y;
  game.vy = 0;
  game.holding = false;
  game.speed = game.preset.startSpeed;
  game.distance = 0;
  game.score = 0;
  game.frame = 0;
  game.blinkAt = 120;
  game.pushAt = 40;
  game.milestone = 0;
  game.obstacles = [];
  game.dust = [];
  game.clouds = [
    { x: 110, y: 30 },
    { x: 280, y: 52 },
    { x: 420, y: 22 },
  ];
  // 歩道の目地：道の線の下に、同じ間隔で短い印
  game.joints = Array.from({ length: 11 }, (_, i) => ({ x: i * 48 + 10 }));
  game.untilNextWall = 0;
}

export function onGround(game: NoahTigerGame): boolean {
  return game.y >= TIGER_GROUND_Y - 0.5;
}

export function startNoahTigerGame(game: NoahTigerGame, random: Random = Math.random): void {
  resetNoahTigerGame(game);
  game.phase = 'run';
  if (game.preset.id === 'hard') {
    // 最初の壁は、開いてから約 0.45 秒でトラに届く
    const x = TIGER_X + 22 * DOT + 27 * game.speed;
    game.obstacles.push(...hardWall(x, pick(HARD_HOLE_BOTTOMS, random)));
    game.untilNextWall = x + hardGap(random) * game.speed - (STAGE_W + 10);
  }
}

/** 押した時。止まっていれば始め、走っていて地面にいれば跳ぶ。 */
export function pressNoahTigerJump(game: NoahTigerGame, random: Random = Math.random): 'started' | 'jumped' | 'none' {
  if (game.phase !== 'run') {
    startNoahTigerGame(game, random);
    return 'started';
  }
  if (!onGround(game)) return 'none';
  game.vy = JUMP_VELOCITY;
  game.holding = true;
  return 'jumped';
}

/** 離した時。早く離すほど低く跳ぶ。 */
export function releaseNoahTigerJump(game: NoahTigerGame): void {
  game.holding = false;
  if (game.vy < RELEASE_VELOCITY) game.vy = RELEASE_VELOCITY;
}

/** コーンの上にハトを縦に積んだ壁。穴は [holeBottom, holeBottom + 44] の高さに 1 つだけ。 */
export function hardWall(x: number, holeBottom: number): NoahTigerObstacle[] {
  const pieces: NoahTigerObstacle[] = [];
  const pigeonW = 8 * DOT;
  const pigeonH = 5 * DOT;
  const pigeon = (bottom: number) => pieces.push({ kind: 'pigeon', x, y: GROUND - bottom - pigeonH, w: pigeonW, h: pigeonH });
  if (holeBottom > 0) {
    const rows = holeBottom >= 8 * DOT ? CONE_TALL : CONE;
    const coneH = rows.length * DOT;
    pieces.push({ kind: 'thing', rows, x, y: GROUND - coneH, w: rows[0].length * DOT, h: coneH });
    for (let top = holeBottom; top > coneH; top -= pigeonH) pigeon(top - pigeonH);
  }
  for (let bottom = holeBottom + HARD_HOLE_HEIGHT; bottom < GROUND + pigeonH; bottom += pigeonH) pigeon(bottom);
  return pieces;
}

/** トラの当たり判定：体・頭・足と板と車輪 */
export function tigerBoxes(y: number): [number, number, number, number][] {
  return [
    [TIGER_X + 2 * DOT, y + 2 * DOT, 13 * DOT, 4 * DOT],
    [TIGER_X + 15 * DOT, y + 1 * DOT, 7 * DOT, 4 * DOT],
    [TIGER_X + 3 * DOT, y + 6 * DOT, 19 * DOT, 4 * DOT],
  ];
}

export function hitsObstacle(game: NoahTigerGame, obstacle: NoahTigerObstacle): boolean {
  const inset = game.preset.forgivingHits;
  const ox = inset ? obstacle.x + DOT : obstacle.x;
  const oy = inset ? obstacle.y + DOT : obstacle.y;
  const ow = inset ? obstacle.w - 2 * DOT : obstacle.w;
  const oh = inset ? obstacle.h - DOT : obstacle.h;
  return tigerBoxes(game.y).some(([x, y, w, h]) => x < ox + ow && x + w > ox && y < oy + oh && y + h > oy);
}

/** 1 フレーム進める（dt は 60 fps を 1 とした長さ）。ぶつかったら crashed。 */
export function stepNoahTigerGame(
  game: NoahTigerGame,
  dt: number,
  { random = Math.random, reduceMotion = false }: { random?: Random; reduceMotion?: boolean } = {},
): { crashed: boolean; milestone: boolean } {
  game.frame += dt;
  if (game.phase === 'idle') {
    if (!reduceMotion && game.frame > game.blinkAt + 8) game.blinkAt = game.frame + 140 + random() * 160;
    return { crashed: false, milestone: false };
  }
  if (game.phase !== 'run') return { crashed: false, milestone: false };
  const { preset } = game;
  game.speed = Math.min(preset.maxSpeed, game.speed + preset.acceleration * dt);
  game.distance += game.speed * dt;
  game.score = game.distance * 0.025;
  let milestone = false;
  if (Math.floor(game.score / 100) > game.milestone) {
    game.milestone = Math.floor(game.score / 100);
    milestone = true;
  }
  game.vy += (game.holding && game.vy < 0 ? GRAVITY_HOLDING : GRAVITY) * dt;
  game.y += game.vy * dt;
  if (game.y > TIGER_GROUND_Y) {
    game.y = TIGER_GROUND_Y;
    game.vy = 0;
  }
  for (const o of game.obstacles) o.x -= game.speed * dt;
  game.obstacles = game.obstacles.filter((o) => o.x + o.w > -10);
  if (preset.id === 'hard') spawnHard(game, dt, random);
  else spawnNormal(game, random);
  for (const c of game.clouds) {
    c.x -= game.speed * 0.18 * dt;
    if (c.x < -40) {
      c.x = STAGE_W + random() * 120;
      c.y = 18 + random() * 44;
    }
  }
  for (const j of game.joints) {
    j.x -= game.speed * dt;
    if (j.x < -4) j.x += 48 * game.joints.length;
  }
  // 転がっている間、後ろの車輪から砂ぼこり
  const grounded = onGround(game);
  if (grounded && Math.floor(game.frame) % 5 === 0) game.dust.push({ x: TIGER_X + 3 * DOT, y: GROUND - 2 - random() * 4, life: 16 });
  for (const p of game.dust) {
    p.x -= game.speed * 0.7 * dt;
    p.life -= dt;
  }
  game.dust = game.dust.filter((p) => p.life > 0);
  if (grounded && game.frame > game.pushAt + 14) game.pushAt = game.frame + 70 + random() * 70;
  if (game.obstacles.some((o) => hitsObstacle(game, o))) {
    game.phase = 'over';
    game.holding = false;
    return { crashed: true, milestone };
  }
  return { crashed: false, milestone };
}

/** 今描くトラの形 */
export function currentTigerSprite(game: NoahTigerGame): Sprite {
  if (game.phase === 'over') return TIGER.down;
  if (game.phase === 'idle') return game.frame > game.blinkAt && game.frame < game.blinkAt + 8 ? TIGER.blink : TIGER.ride;
  if (!onGround(game)) return game.vy < -5 ? TIGER.ollie : TIGER.air;
  return game.frame > game.pushAt && game.frame < game.pushAt + 14 ? TIGER.push : TIGER.ride;
}

export function pigeonFrame(game: NoahTigerGame): Sprite {
  return PIGEON[Math.floor(Math.max(0, game.frame) / 10) % 2];
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function hardGap(random: Random): number {
  return HARD_GAP_FRAMES.min + random() * (HARD_GAP_FRAMES.max - HARD_GAP_FRAMES.min);
}

function spawnHard(game: NoahTigerGame, dt: number, random: Random): void {
  game.untilNextWall -= game.speed * dt;
  if (game.untilNextWall <= 0) {
    game.obstacles.push(...hardWall(STAGE_W + 10 + game.untilNextWall, pick(HARD_HOLE_BOTTOMS, random)));
    game.untilNextWall += hardGap(random) * game.speed;
  }
}

function spawnNormal(game: NoahTigerGame, random: Random): void {
  const last = game.obstacles[game.obstacles.length - 1];
  const gap = 230 + game.speed * 14 + random() * (160 + game.speed * 20);
  if (last && last.x > STAGE_W - gap) return;
  if (game.score > 250 && random() < 0.28) {
    // ハト：高いのは下をくぐれる。低いのはオーリーでよける
    const high = random() < 0.45;
    game.obstacles.push({ kind: 'pigeon', x: STAGE_W + 10, y: high ? GROUND - 60 : GROUND - 36, w: 8 * DOT, h: 5 * DOT });
    return;
  }
  const add = (rows: Sprite, x: number) =>
    game.obstacles.push({ kind: 'thing', rows, x, y: GROUND - rows.length * DOT, w: rows[0].length * DOT, h: rows.length * DOT });
  const r = random();
  if (r < 0.4) add(CONE, STAGE_W + 10);
  else if (r < 0.65) add(CONE_TALL, STAGE_W + 10);
  else if (r < 0.85 || game.speed < 6.5) {
    add(CONE, STAGE_W + 10);
    add(CONE, STAGE_W + 10 + 8 * DOT);
  } else add(BENCH, STAGE_W + 10);
}
