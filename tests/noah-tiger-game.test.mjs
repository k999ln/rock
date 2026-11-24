import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOT,
  GROUND,
  TIGER,
  TIGER_X,
  HARD_GAP_FRAMES,
  HARD_HOLE_BOTTOMS,
  HARD_HOLE_HEIGHT,
  NOAH_TIGER_ACTIVE,
  NOAH_TIGER_HARD,
  NOAH_TIGER_NORMAL,
  createNoahTigerGame,
  hardWall,
  onGround,
  pressNoahTigerJump,
  releaseNoahTigerJump,
  startNoahTigerGame,
  stepNoahTigerGame,
} from '../lib/noah-tiger-game.ts';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

void test('トラは 24 × 10 点で、目・鼻・縞 4 本は点を抜いた穴', () => {
  for (const sprite of Object.values(TIGER)) {
    assert.equal(sprite.length, 10);
    for (const row of sprite) assert.equal(row.length, 24);
  }
  const ride = TIGER.ride;
  assert.equal(ride[2][17], 'o');
  assert.equal(ride[2][19], 'o');
  assert.equal(ride[3][18], 'o');
  for (const x of [3, 6, 9, 12]) {
    assert.equal(ride[3][x], 'o');
    assert.equal(ride[4][x], 'o');
  }
  assert.equal(TIGER.blink[2][17], '#', 'まばたきでは目の穴が埋まる');
  assert.match(ride[7], /^..b{21}/, '板は 2 点目から');
});

void test('今使う難しさは難しい版で、ふつう版はそのまま残っている', () => {
  assert.equal(NOAH_TIGER_ACTIVE, NOAH_TIGER_HARD);
  assert.equal(NOAH_TIGER_HARD.autoStart, true);
  assert.equal(NOAH_TIGER_NORMAL.autoStart, false);
  assert.equal(NOAH_TIGER_NORMAL.startSpeed, 5.2);
  assert.notEqual(NOAH_TIGER_HARD.hiScoreKey, NOAH_TIGER_NORMAL.hiScoreKey);
});

void test('難しい版の壁は、地面から上まで埋まっていて、穴が 1 つだけ', () => {
  for (const hb of HARD_HOLE_BOTTOMS) {
    const pieces = hardWall(300, hb);
    const covered = new Set();
    for (const p of pieces) {
      for (let h = GROUND - (p.y + p.h); h < GROUND - p.y; h++) covered.add(h);
    }
    for (let h = 0; h < GROUND; h++) {
      const inHole = h >= hb && h < hb + HARD_HOLE_HEIGHT;
      assert.equal(covered.has(h), !inHole, `穴 ${hb}: 高さ ${h}`);
    }
  }
});

void test('開いた瞬間に走り出し、何もしなければすぐぶつかる', () => {
  const game = createNoahTigerGame(NOAH_TIGER_HARD);
  const random = seeded(7);
  startNoahTigerGame(game, random);
  assert.equal(game.phase, 'run');
  let frames = 0;
  while (game.phase === 'run' && frames < 120) {
    stepNoahTigerGame(game, 1, { random });
    frames++;
  }
  // 地面の穴（跳ばなければ通れる壁）が最初に来た時だけは生き残る。それでも 2 枚目までにはぶつかる
  assert.equal(game.phase, 'over');
  assert.ok(frames <= 27 + HARD_GAP_FRAMES.max + 10, `${frames} フレームでぶつかった`);
});

// 壁を 1 枚だけ置いて、押すフレーム p と押す長さ h を全部試す
function throughOneWall(speed, hb, p, h) {
  const preset = { ...NOAH_TIGER_HARD, startSpeed: speed, maxSpeed: speed, acceleration: 0 };
  const game = createNoahTigerGame(preset);
  game.phase = 'run';
  game.obstacles = hardWall(300, hb);
  game.untilNextWall = Infinity;
  const contact = (300 - (TIGER_X + 22 * DOT)) / speed;
  for (let f = 0; f < 200; f++) {
    if (f === p) pressNoahTigerJump(game);
    if (f === p + h && game.holding) releaseNoahTigerJump(game);
    const { crashed } = stepNoahTigerGame(game, 1, { random: () => 0.5 });
    if (crashed) return null;
    if (game.obstacles.length === 0 || game.obstacles[0].x + game.obstacles[0].w < TIGER_X - 4) {
      // 通り抜けた。着地したフレームを数える
      let land = f;
      while (!onGround(game) && land < 300) {
        stepNoahTigerGame(game, 1, { random: () => 0.5 });
        land++;
      }
      return { press: p - contact, land: land - contact };
    }
  }
  return null;
}

void test('難しい版のどの穴も、通れる押し方がある（速さ 8.5 と 13）', () => {
  for (const speed of [8.5, 13]) {
    for (const hb of HARD_HOLE_BOTTOMS) {
      let ways = 0;
      for (let p = 0; p < 45; p++) for (let h = 1; h < 40; h++) if (throughOneWall(speed, hb, p, h)) ways++;
      assert.ok(ways >= 2, `速さ ${speed}・穴 ${hb}: ${ways} 通り`);
    }
  }
});

void test('壁が 2 つ続いても、間に合う間隔になっている', () => {
  for (const speed of [8.5, 13]) {
    const byHole = new Map();
    for (const hb of HARD_HOLE_BOTTOMS) {
      let earliestLanding = Infinity;
      let latestPress = -Infinity;
      for (let p = 0; p < 45; p++) {
        for (let h = 1; h < 40; h++) {
          const r = throughOneWall(speed, hb, p, h);
          if (!r) continue;
          earliestLanding = Math.min(earliestLanding, hb === 0 ? 0 : r.land);
          latestPress = Math.max(latestPress, r.press);
        }
      }
      byHole.set(hb, { earliestLanding, latestPress });
    }
    let need = -Infinity;
    for (const a of byHole.values()) for (const b of byHole.values()) need = Math.max(need, a.earliestLanding - b.latestPress);
    assert.ok(need < HARD_GAP_FRAMES.min, `速さ ${speed}: 最短 ${need} フレーム、間隔は ${HARD_GAP_FRAMES.min} から`);
  }
});

void test('ふつう版は押すまで待っていて、コーンから始まる', () => {
  const game = createNoahTigerGame(NOAH_TIGER_NORMAL);
  for (let f = 0; f < 60; f++) stepNoahTigerGame(game, 1);
  assert.equal(game.phase, 'idle');
  assert.equal(pressNoahTigerJump(game, seeded(3)), 'started');
  stepNoahTigerGame(game, 1, { random: seeded(3) });
  assert.equal(game.obstacles[0].kind, 'thing');
});
