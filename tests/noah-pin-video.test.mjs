// Noah のピンの動画（spec-115 の 10 章）: 1 本の記録の確かめ方と、Agent ごとに動画を選ぶ式。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOAH_PIN_VIDEO_MIN_MATCH, NOAH_PIN_VIDEO_REUSE_COST, noahPinVideoTags, parseNoahPinVideo, pickNoahPinVideo,
} from '../lib/noah-pin-video.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cropNoahPinVideo, makeNoahPinVideo, planNoahPinVideo, probeNoahPinVideo } from '../scripts/noah-pin-video.mjs';

const video = {
  url: '/api/noah/pin-video/9f2c.mp4', poster: '/api/noah/pin-video/9f2c.jpg', width: 480, height: 640, seconds: 6,
  source: 'higgsfield', sourceId: 'hf-123', sourceUrl: 'https://higgsfield.ai/seedance-2-5-community', ai: true,
};

void test('ピンの動画の記録は、mp4 と最初の絵・縦 3:4・5〜8 秒・出どころの記録だけを通す', () => {
  assert.deepEqual(parseNoahPinVideo(video), { video, error: null });
  assert.equal(parseNoahPinVideo({ ...video, url: 'https://cdn.example.com/pins/9f2c.webm' }).error, null);
  assert.equal(parseNoahPinVideo(null).error, 'not_object');
  assert.equal(parseNoahPinVideo([video]).error, 'not_object');
  assert.equal(parseNoahPinVideo({ ...video, credit: 'maker' }).error, 'unknown_key:credit');
  // 動画の場所: 同じサイトの道か https だけ。ほかのサイトへの「//」・http・中に ? や # や .. がある物・mp4 と webm 以外は通さない。
  for (const url of ['//evil.example/x.mp4', 'http://cdn.example.com/x.mp4', '/x.mp4?y=1', '/x.mp4#t', '/a/../x.mp4', '/x.gif', '/x', 'javascript:alert(1)//.mp4', 'https://u:p@cdn.example.com/x.mp4', '']) {
    assert.equal(parseNoahPinVideo({ ...video, url }).error, 'url', url);
  }
  assert.equal(parseNoahPinVideo({ ...video, poster: '/x.mp4' }).error, 'poster');
  assert.equal(parseNoahPinVideo({ ...video, width: 640, height: 480 }).error, 'ratio');
  assert.equal(parseNoahPinVideo({ ...video, width: 481, height: 641 }).error, 'ratio');
  assert.equal(parseNoahPinVideo({ ...video, width: 90, height: 120 }).error, 'size');
  assert.equal(parseNoahPinVideo({ ...video, width: 480.5 }).error, 'size');
  assert.equal(parseNoahPinVideo({ ...video, seconds: 4.9 }).error, 'seconds');
  assert.equal(parseNoahPinVideo({ ...video, seconds: 8.1 }).error, 'seconds');
  assert.equal(parseNoahPinVideo({ ...video, seconds: Number.NaN }).error, 'seconds');
  assert.equal(parseNoahPinVideo({ ...video, source: 'youtube' }).error, 'source');
  assert.equal(parseNoahPinVideo({ ...video, sourceId: ' hf-123' }).error, 'sourceId');
  assert.equal(parseNoahPinVideo({ ...video, sourceId: 'a\nb' }).error, 'sourceId');
  assert.equal(parseNoahPinVideo({ ...video, sourceUrl: 'http://higgsfield.ai/x' }).error, 'sourceUrl');
  assert.equal(parseNoahPinVideo({ ...video, ai: 'yes' }).error, 'ai');
});

void test('言葉は、全角と大文字と空白をそろえ、空の物と重なりを落とす', () => {
  assert.deepEqual(noahPinVideoTags(['Receipt', ' receipt ', 'ＬＥＤＧＥＲ', 'office  desk', '', '  ']), ['receipt', 'ledger', 'office desk']);
});

void test('動画は、合う割合が 3 つに 1 つ以上の物から、AI で作った物を先に選ぶ', () => {
  const library = [
    { id: 'real-receipt', tags: ['receipt', 'ledger', 'calculator', 'desk'], ai: false },
    { id: 'ai-receipt', tags: ['receipt', 'neon', 'floating paper'], ai: true },
    { id: 'ai-ocean', tags: ['ocean', 'wave'], ai: true },
  ];
  // 実写の方が多く合っても、合う AI の動画があれば AI を選ぶ（本人の決定「AI 中心、足りない所は実写」）。
  assert.deepEqual(pickNoahPinVideo(['receipt', 'ledger', 'tax'], library), { id: 'ai-receipt', match: 1 / 3 });
  // 合う AI の動画が無い時は、実写から選ぶ。
  assert.deepEqual(pickNoahPinVideo(['calculator', 'desk'], library), { id: 'real-receipt', match: 1 });
  // どれも合わない時は選ばない（図解のまま）。
  assert.equal(pickNoahPinVideo(['guitar', 'stage', 'music'], library), null);
  assert.equal(pickNoahPinVideo([], library), null);
  assert.equal(pickNoahPinVideo(['receipt'], []), null);
  assert.equal(NOAH_PIN_VIDEO_MIN_MATCH, 1 / 3);
});

void test('同じ動画は、使った回数だけ点を引いて、なるべく使い回さない', () => {
  const library = [
    { id: 'b', tags: ['city', 'night', 'rain'], ai: true },
    { id: 'a', tags: ['city', 'night'], ai: true },
  ];
  assert.deepEqual(pickNoahPinVideo(['city', 'night'], library), { id: 'a', match: 1 }, '同じ点なら id の順');
  assert.equal(pickNoahPinVideo(['city', 'night'], library, new Map([['a', 1]])).id, 'b');
  // 合う割合の差が、使った回数の重さより大きければ、使った物でも選ぶ。
  const wide = [{ id: 'exact', tags: ['map', 'route', 'train'], ai: true }, { id: 'loose', tags: ['map'], ai: true }];
  assert.equal(pickNoahPinVideo(['map', 'route', 'train'], wide, new Map([['exact', 1]])).id, 'exact');
  assert.ok(1 - NOAH_PIN_VIDEO_REUSE_COST > 1 / 3);
  // 選ぶ式は、渡した表を書き換えない。
  const before = JSON.stringify(library);
  pickNoahPinVideo(['city'], library, new Map([['a', 3]]));
  assert.equal(JSON.stringify(library), before);
});

// 変換の道具（scripts/noah-pin-video.mjs）。ffmpeg が無い所では飛ばす（GitHub Actions の Ubuntu には入っている）。

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

void test('使う所の決め方: 5〜8 秒に収め、つなぎの 0.5 秒が入らなければ短くし、5 秒に足りなければ使わない', () => {
  assert.deepEqual(planNoahPinVideo(30), { start: 0, seconds: 6, blend: 0.5 });
  assert.deepEqual(planNoahPinVideo(30, { seconds: 12 }), { start: 0, seconds: 8, blend: 0.5 });
  assert.deepEqual(planNoahPinVideo(30, { seconds: 2 }), { start: 0, seconds: 5, blend: 0.5 });
  assert.deepEqual(planNoahPinVideo(6.2), { start: 0, seconds: 5.7, blend: 0.5 });
  assert.deepEqual(planNoahPinVideo(5.3), { start: 0, seconds: 5.3, blend: 0 });
  assert.deepEqual(planNoahPinVideo(20, { start: 13 }), { start: 13, seconds: 6, blend: 0.5 });
  assert.throws(() => planNoahPinVideo(4.9), { code: 'too_short' });
  assert.throws(() => planNoahPinVideo(20, { start: 16 }), { code: 'too_short' });
  assert.throws(() => planNoahPinVideo(20, { start: 20 }), { code: 'bad_start' });
  assert.throws(() => planNoahPinVideo(Number.NaN), { code: 'no_duration' });
});

void test('縦 3:4 の切り出し: 横長は x の位置で横を、縦長は真ん中で縦を切る（偶数の画素）', () => {
  assert.deepEqual(cropNoahPinVideo(1920, 1080), { w: 810, h: 1080, x: 554, y: 0 });
  assert.deepEqual(cropNoahPinVideo(1920, 1080, 0), { w: 810, h: 1080, x: 0, y: 0 });
  assert.deepEqual(cropNoahPinVideo(1920, 1080, 1), { w: 810, h: 1080, x: 1110, y: 0 });
  assert.deepEqual(cropNoahPinVideo(1080, 1920), { w: 1080, h: 1440, x: 0, y: 240 });
  assert.deepEqual(cropNoahPinVideo(720, 960), { w: 720, h: 960, x: 0, y: 0 });
});

void test('横長の動画から、音なし・縦 3:4・6 秒の mp4 と最初の絵と GIF を作り、終わりが始めの絵へつながる', { skip: !hasFfmpeg && 'ffmpeg がありません' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'noah-pin-video-'));
  try {
    const input = join(dir, 'wide.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input]);
    const out = join(dir, 'out');
    const record = makeNoahPinVideo({ input, outDir: out, start: 1, gif: true });
    assert.match(record.file, /^[0-9a-f]{32}\.mp4$/);
    assert.equal(record.poster, record.file.replace('.mp4', '.jpg'));
    assert.equal(record.gif, record.file.replace('.mp4', '.gif'));
    for (const name of [record.file, record.poster, record.gif]) assert.ok(existsSync(join(out, name)), name);
    assert.deepEqual([record.width, record.height], [480, 640]);
    assert.ok(Math.abs(record.seconds - 6) < 0.1, String(record.seconds));
    const made = probeNoahPinVideo(join(out, record.file));
    assert.equal(made.audio, false, '音は消す');
    assert.deepEqual([made.width, made.height], [480, 640]);
    // 同じ動画と同じ指定からは、同じ名前になる。
    assert.equal(makeNoahPinVideo({ input, outDir: out, start: 1 }).file, record.file);
    // つなぎ目: 最後のコマは、真ん中のコマより、ずっと最初のコマに近い（16×16 の灰色で比べる）。
    const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', join(out, record.file), '-vf', 'scale=16:16,format=gray', '-f', 'rawvideo', '-']);
    const frames = raw.length / 256, frame = (i) => raw.subarray(i * 256, (i + 1) * 256);
    const diff = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / 256;
    assert.ok(frames >= 140, String(frames));
    assert.ok(diff(frame(0), frame(frames - 1)) * 3 < diff(frame(0), frame(Math.floor(frames / 2))), 'つなぎ目が見えない');
    // 短すぎる動画は使わない。
    const short = join(dir, 'short.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', short]);
    assert.throws(() => makeNoahPinVideo({ input: short, outDir: out }), { code: 'too_short' });
    assert.throws(() => makeNoahPinVideo({ input, outDir: out, width: 500 }), { code: 'bad_width' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
