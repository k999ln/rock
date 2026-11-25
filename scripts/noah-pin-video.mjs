#!/usr/bin/env node
/**
 * ピンの動画を作る道具（spec-115 の 10 章）。集めた動画 1 本を、GIF と同じ見た目の短いループにする。
 * 本人の指示（2026-11-25）「こういう動画をgifにしてピン画像にする」「かっこいい動画収集してそれをgifに変換する」「説明動画５〜8秒とか」。
 *
 * 作る物（名前は、できた mp4 の SHA-256 の頭 32 字。同じ動画からは同じ名前になる）:
 * - <hash>.mp4: 5〜8 秒・縦 3:4・音なし・24 コマ/秒の H.264。終わりの 0.5 秒で始めの絵へ溶けるので、繰り返してもつなぎ目が見えない。
 * - <hash>.jpg: 最初の絵（読み込む前と、動きを減らす設定の人に見せる）。
 * - <hash>.gif（--gif の時だけ）: 本物の GIF（保存や共有に使う。画面では mp4 を使う。mp4 の方がずっと軽く、色もきれい）。
 *
 * 使い方: node scripts/noah-pin-video.mjs --in 元の動画 --out 出す所 [--start 秒] [--seconds 6] [--x 0.5] [--width 480] [--gif]
 * --x は、横長の動画から縦 3:4 を切り出す時の横の位置（0 = 左端、1 = 右端）。結果の記録（JSON）を標準出力に書く。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/** 長さ（秒）・つなぎの長さ・コマの数・画質。長さの範囲は lib/noah-pin-video.ts の NOAH_PIN_VIDEO_SECONDS と同じ。 */
export const NOAH_PIN_VIDEO_MAKE = { min: 5, max: 8, seconds: 6, blend: 0.5, fps: 24, width: 480, crf: 28 };

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const floor = (value) => Math.floor(value * 10 + 1e-9) / 10;
const even = (value) => Math.max(2, 2 * Math.floor(value / 2));
/** 枠の位置（偶数の画素。0 から）。 */
const offset = (value) => 2 * Math.floor(Math.max(0, value) / 2);

/** 動画の長さ・幅・高さ・音の有無を読む。 */
export function probeNoahPinVideo(file, { ffprobe = 'ffprobe' } = {}) {
  const info = JSON.parse(run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]));
  const video = info.streams?.find((stream) => stream.codec_type === 'video');
  if (!video) throw Object.assign(new Error('動画の絵がありません。'), { code: 'no_video' });
  return { duration: Number(info.format?.duration), width: video.width, height: video.height, audio: info.streams.some((stream) => stream.codec_type === 'audio') };
}

/**
 * どこから何秒を使うかを決める。始めから avail 秒あるとして、望む長さ（5〜8 に収める）とつなぎ 0.5 秒が入れば、そのまま。
 * 入らなければ、つなぎを残して短くする。それでも 5 秒に足りなければ、つなぎを無くす。5 秒も無ければ使えない。
 */
export function planNoahPinVideo(duration, { start = 0, seconds = NOAH_PIN_VIDEO_MAKE.seconds } = {}) {
  const { min, max, blend } = NOAH_PIN_VIDEO_MAKE;
  if (!Number.isFinite(duration) || duration <= 0) throw Object.assign(new Error('動画の長さを読めません。'), { code: 'no_duration' });
  if (!Number.isFinite(start) || start < 0 || start >= duration) throw Object.assign(new Error('始めの秒が動画の外です。'), { code: 'bad_start' });
  const want = Math.min(max, Math.max(min, Number.isFinite(seconds) ? seconds : NOAH_PIN_VIDEO_MAKE.seconds));
  const avail = duration - start;
  if (avail >= want + blend) return { start, seconds: want, blend };
  if (floor(avail - blend) >= min) return { start, seconds: floor(avail - blend), blend };
  if (floor(avail) >= min) return { start, seconds: Math.min(max, floor(avail)), blend: 0 };
  throw Object.assign(new Error(`使える長さが ${min} 秒に足りません。`), { code: 'too_short' });
}

/** 縦 3:4 に切り出す枠（偶数の画素）。横長なら x の位置で横を切り、縦長なら真ん中で縦を切る。 */
export function cropNoahPinVideo(width, height, x = 0.5) {
  const across = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0.5));
  if (width * 4 > height * 3) {
    const w = even(height * 3 / 4), h = even(height);
    return { w, h, x: offset((width - w) * across), y: 0 };
  }
  const w = even(width), h = even(width * 4 / 3);
  return { w, h, x: 0, y: offset((height - h) / 2) };
}

/** 1 本を作る。出す所に <hash>.mp4・<hash>.jpg（と --gif なら <hash>.gif）を置き、記録を返す。 */
export function makeNoahPinVideo({ input, outDir, start, seconds, x, width = NOAH_PIN_VIDEO_MAKE.width, gif = false, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' }) {
  const source = probeNoahPinVideo(input, { ffprobe });
  const plan = planNoahPinVideo(source.duration, { start, seconds });
  const crop = cropNoahPinVideo(source.width, source.height, x);
  const W = even(width), H = even(W * 4 / 3);
  if (W * 4 !== H * 3) throw Object.assign(new Error('幅は 6 の倍数にしてください（縦 3:4 の偶数の画素にするため）。'), { code: 'bad_width' });
  const { fps, crf } = NOAH_PIN_VIDEO_MAKE;
  const base = `[0:v]trim=start=${plan.start}:duration=${plan.seconds + plan.blend},setpts=PTS-STARTPTS,`
    + `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${W}:${H}:flags=lanczos,fps=${fps},format=yuv420p`;
  const graph = plan.blend > 0
    ? `${base},split[a][b];[a]trim=start=${plan.blend}:duration=${plan.seconds},setpts=PTS-STARTPTS[main];`
      + `[b]trim=start=0:duration=${plan.blend},setpts=PTS-STARTPTS[head];`
      + `[main][head]xfade=transition=fade:duration=${plan.blend}:offset=${floor(plan.seconds - plan.blend)},format=yuv420p[v]`
    : `${base}[v]`;
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(outDir, '.making-'));
  try {
    const mp4 = join(work, 'pin.mp4');
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-filter_complex', graph, '-map', '[v]', '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(plan.seconds), mp4]);
    const made = probeNoahPinVideo(mp4, { ffprobe });
    if (made.audio || made.width !== W || made.height !== H || made.duration < NOAH_PIN_VIDEO_MAKE.min - 0.05 || made.duration > NOAH_PIN_VIDEO_MAKE.max + 0.05) {
      throw Object.assign(new Error('できた動画の形が決まりと違います。'), { code: 'bad_output', made });
    }
    const hash = createHash('sha256').update(readFileSync(mp4)).digest('hex').slice(0, 32);
    const jpg = join(work, 'pin.jpg');
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-frames:v', '1', '-q:v', '4', jpg]);
    const record = { file: `${hash}.mp4`, poster: `${hash}.jpg`, width: W, height: H, seconds: Math.round(made.duration * 100) / 100, bytes: statSync(mp4).size };
    if (gif) {
      const out = join(work, 'pin.gif');
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-filter_complex',
        `fps=12,scale=${even(W * 3 / 4)}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', out]);
      renameSync(out, join(outDir, `${hash}.gif`));
      Object.assign(record, { gif: `${hash}.gif`, gifBytes: statSync(join(outDir, `${hash}.gif`)).size });
    }
    renameSync(mp4, join(outDir, record.file));
    renameSync(jpg, join(outDir, record.poster));
    return record;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: {
    in: { type: 'string' }, out: { type: 'string' }, start: { type: 'string' }, seconds: { type: 'string' },
    x: { type: 'string' }, width: { type: 'string' }, gif: { type: 'boolean', default: false },
  } });
  if (!values.in || !values.out) {
    console.error('使い方: node scripts/noah-pin-video.mjs --in 元の動画 --out 出す所 [--start 秒] [--seconds 6] [--x 0.5] [--width 480] [--gif]');
    process.exit(2);
  }
  const number = (text) => (text === undefined ? undefined : Number(text));
  try {
    const record = makeNoahPinVideo({ input: resolve(values.in), outDir: resolve(values.out), start: number(values.start), seconds: number(values.seconds), x: number(values.x), width: number(values.width), gif: values.gif });
    console.log(JSON.stringify(record));
  } catch (error) {
    console.error(`${error.code ?? 'error'}: ${error.message}`);
    process.exit(1);
  }
}
