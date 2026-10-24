'use client';
import {
  encodeWave,
  webmWithDuration,
  mediaKind,
  mediaOperation,
  type MediaOperation,
} from './eve-media-edit';
export type MediaEditResult = {
  blob: Blob;
  extension: string;
  width?: number;
  height?: number;
  duration?: number;
  app: string;
};
function check(signal: AbortSignal) {
  signal.throwIfAborted();
}
async function image(file: File) {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw Error('写真は4,000万画素以内にしてください。');
  }
  return bitmap;
}
async function audio(file: File, ctx: BaseAudioContext) {
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  if (decoded.duration > 60) throw Error('音楽は1本60秒以内にしてください。');
  return decoded;
}
export async function editMedia(
  a: File,
  b: File,
  operation: MediaOperation,
  amount: number,
  signal: AbortSignal,
  progress: (n: number) => void,
): Promise<MediaEditResult> {
  check(signal);
  const ak = mediaKind(a.type),
    bk = mediaKind(b.type);
  if (
    !ak ||
    !bk ||
    mediaOperation(ak, bk) !== operation ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 1 ||
    a.size > 100 * 1024 * 1024 ||
    b.size > 100 * 1024 * 1024
  )
    throw Error('素材と編集内容を確認してください。');
  if (operation === 'photo-layer') {
    const images: ImageBitmap[] = [];
    try {
      images.push(await image(a));
      images.push(await image(b));
      check(signal);
      const [first, second] = images,
        scale = Math.min(1, 2048 / Math.max(first.width, first.height)),
        canvas = document.createElement('canvas');
      canvas.width = Math.round(first.width * scale);
      canvas.height = Math.round(first.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('写真エディターを開けません。');
      ctx.drawImage(first, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = Math.max(0, Math.min(1, amount));
      const ratio = Math.min(
          canvas.width / second.width,
          canvas.height / second.height,
        ),
        w = second.width * ratio,
        h = second.height * ratio;
      ctx.drawImage(
        second,
        (canvas.width - w) / 2,
        (canvas.height - h) / 2,
        w,
        h,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (v) => (v ? resolve(v) : reject(Error('写真を書き出せません。'))),
          'image/png',
        ),
      );
      check(signal);
      progress(100);
      return {
        blob,
        extension: 'png',
        width: canvas.width,
        height: canvas.height,
        app: 'Eve Photo / Canvas',
      };
    } finally {
      images.forEach((v) => v.close());
    }
  }
  if (operation === 'audio-mix') {
    const ctx = new AudioContext();
    try {
      const first = await audio(a, ctx),
        second = await audio(b, ctx);
      check(signal);
      const rate = 44100,
        length = Math.ceil(Math.max(first.duration, second.duration) * rate),
        offline = new OfflineAudioContext(2, length, rate);
      for (const [buffer, gain] of [
        [first, 1 - amount],
        [second, amount],
      ] as const) {
        const source = offline.createBufferSource(),
          volume = offline.createGain();
        source.buffer = buffer;
        volume.gain.value = gain;
        source.connect(volume).connect(offline.destination);
        source.start();
      }
      const output = await offline.startRendering();
      check(signal);
      const blob = new Blob(
        [
          encodeWave(
            [output.getChannelData(0), output.getChannelData(1)],
            rate,
          ),
        ],
        { type: 'audio/wav' },
      );
      progress(100);
      return {
        blob,
        extension: 'wav',
        duration: output.duration,
        app: 'Eve Audio / Web Audio',
      };
    } finally {
      await ctx.close();
    }
  }
  return editVideo(a, b, operation, amount, signal, progress);
}
async function editVideo(
  a: File,
  b: File,
  operation: MediaOperation,
  amount: number,
  signal: AbortSignal,
  progress: (n: number) => void,
): Promise<MediaEditResult> {
  if (
    typeof MediaRecorder === 'undefined' ||
    !HTMLCanvasElement.prototype.captureStream
  )
    throw Error('このブラウザは動画書き出しに対応していません。');
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(
    (t) => MediaRecorder.isTypeSupported(t),
  );
  if (!mime) throw Error('対応する動画エンコーダーがありません。');
  const ctx = new AudioContext(),
    urls: string[] = [],
    videos: HTMLVideoElement[] = [],
    streams: MediaStream[] = [];
  let recorder: MediaRecorder | undefined;
  let frame = 0;
  try {
    await ctx.resume();
    const videoFiles =
      operation === 'video-sequence'
        ? [a, b]
        : [a.type.startsWith('video/') ? a : b];
    for (const file of videoFiles) {
      check(signal);
      const v = document.createElement('video');
      v.playsInline = true;
      v.preload = 'auto';
      const url = URL.createObjectURL(file);
      urls.push(url);
      v.src = url;
      videos.push(v);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => done(Error('動画の読み込みが時間切れです。')),
          15000,
        );
        function done(error?: Error) {
          clearTimeout(timer);
          v.onloadedmetadata = null;
          v.onerror = null;
          signal.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve();
        }
        const abort = () => done(Error('編集を中止しました。'));
        v.onloadedmetadata = () => done();
        v.onerror = () => done(Error('動画を読み込めません。'));
        signal.addEventListener('abort', abort, { once: true });
      });
      if (!Number.isFinite(v.duration) || v.duration <= 0 || v.duration > 60)
        throw Error('動画は1本60秒以内にしてください。');
    }
    const duration = videos.reduce((n, v) => n + v.duration, 0);
    if (duration > 60) throw Error('完成する動画は60秒以内にしてください。');
    const canvas = document.createElement('canvas'),
      first = videos[0],
      scale = Math.min(1, 1280 / Math.max(first.videoWidth, first.videoHeight));
    canvas.width = Math.max(2, Math.round((first.videoWidth * scale) / 2) * 2);
    canvas.height = Math.max(
      2,
      Math.round((first.videoHeight * scale) / 2) * 2,
    );
    const paint = canvas.getContext('2d');
    if (!paint) throw Error('動画エディターを開けません。');
    const destination = ctx.createMediaStreamDestination();
    for (const v of videos) {
      const source = ctx.createMediaElementSource(v),
        gain = ctx.createGain();
      gain.gain.value = operation === 'video-soundtrack' ? 1 - amount : 1;
      source.connect(gain).connect(destination);
    }
    let music: AudioBufferSourceNode | undefined;
    if (operation === 'video-soundtrack') {
      const musicFile = a.type.startsWith('audio/') ? a : b;
      const decoded = await audio(musicFile, ctx);
      check(signal);
      music = ctx.createBufferSource();
      music.buffer = decoded;
      music.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = amount;
      music.connect(gain).connect(destination);
    }
    const capture = canvas.captureStream(24);
    streams.push(capture, destination.stream);
    const stream = new MediaStream([
      ...capture.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    streams.push(stream);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 3_000_000,
    });
    const chunks: BlobPart[] = [];
    const finished = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder!.onerror = () => reject(Error('動画の書き出しに失敗しました。'));
      recorder!.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });
    recorder.start(250);
    music?.start();
    let elapsed = 0;
    for (const v of videos) {
      check(signal);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            finish(Error('動画の再生が停止したため書き出しを中止しました。')),
          Math.ceil((v.duration + 15) * 1000),
        );
        let settled = false;
        const abort = () => finish(Error('編集を中止しました。'));
        function finish(error?: Error) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          cancelAnimationFrame(frame);
          v.pause();
          v.onended = null;
          v.onerror = null;
          signal.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve();
        }
        const draw = () => {
          if (settled) return;
          if (document.hidden) {
            finish(Error('動画を書き出す間は、この作業台を表示してください。'));
            return;
          }
          paint.fillStyle = '#111';
          paint.fillRect(0, 0, canvas.width, canvas.height);
          const ratio = Math.min(
              canvas.width / v.videoWidth,
              canvas.height / v.videoHeight,
            ),
            w = v.videoWidth * ratio,
            h = v.videoHeight * ratio;
          paint.drawImage(
            v,
            (canvas.width - w) / 2,
            (canvas.height - h) / 2,
            w,
            h,
          );
          progress(
            Math.min(
              99,
              Math.round(((elapsed + v.currentTime) / duration) * 100),
            ),
          );
          frame = requestAnimationFrame(draw);
        };
        v.onended = () => finish();
        v.onerror = () => finish(Error('動画の再生に失敗しました。'));
        signal.addEventListener('abort', abort, { once: true });
        void v
          .play()
          .then(draw)
          .catch(() => finish(Error('動画を再生できません。')));
      });
      elapsed += v.duration;
    }
    check(signal);
    recorder.stop();
    let blob = await finished;
    if (mime.startsWith('video/webm'))
      blob = new Blob(
        [
          webmWithDuration(
            new Uint8Array(await blob.arrayBuffer()),
            duration * 1000,
          ) as Uint8Array<ArrayBuffer>,
        ],
        { type: mime },
      );
    if (!blob.size) throw Error('書き出した動画が空です。');
    progress(100);
    return {
      blob,
      extension: mime.startsWith('video/mp4') ? 'mp4' : 'webm',
      duration,
      width: canvas.width,
      height: canvas.height,
      app: 'Eve Video / Canvas + MediaRecorder',
    };
  } finally {
    cancelAnimationFrame(frame);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    videos.forEach((v) => {
      v.pause();
      v.removeAttribute('src');
      v.load();
    });
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    urls.forEach((u) => URL.revokeObjectURL(u));
    await ctx.close();
  }
}
