import { resolveNoahAgentArt } from './noah-agent-art';
import { drawNoahCardVideoFrame } from './noah-card-video-paint';

type VideoOptions = { id?: string; name: string; summary?: string; variation?: number; signal?: AbortSignal };
const duration = 4000;

export async function generateNoahAgentCardVideo({ id, name, summary, variation = 0, signal }: VideoOptions): Promise<Blob> {
  signal?.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 720;
  const ctx = canvas.getContext('2d', { alpha: false });
  const mimeType = typeof MediaRecorder !== 'undefined' && [
    'video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm',
  ].find(type => MediaRecorder.isTypeSupported(type));
  if (!ctx || !canvas.captureStream || !mimeType) throw new Error('このブラウザは動画の書き出しに対応していません。画像や動画のアップロードも利用できます。');
  const art = resolveNoahAgentArt(id ?? '', name, summary);
  if (variation) art.seed = (art.seed + Math.imul(variation, 2654435761)) >>> 0;
  drawNoahCardVideoFrame(ctx, art, 0, name, summary, variation);
  const stream = canvas.captureStream(24);
  try {
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_300_000 });
    return await new Promise<Blob>((resolve, reject) => {
      let frame = 0;
      const parts: BlobPart[] = [];
      const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      const abort = () => { reject(new DOMException('動画の生成を中止しました。', 'AbortError')); stop(); };
      const visibility = () => { if (document.hidden) abort(); };
      const timer = window.setTimeout(() => { reject(new Error('動画を書き出せませんでした。もう一度お試しください。')); stop(); }, duration + 8000);
      const clean = () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
        signal?.removeEventListener('abort', abort);
        document.removeEventListener('visibilitychange', visibility);
      };
      recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
      recorder.onerror = () => { clean(); reject(new Error('動画を書き出せませんでした。')); stop(); };
      recorder.onstop = () => {
        clean();
        const blob = new Blob(parts, { type: recorder.mimeType.split(';')[0] });
        if (blob.size) resolve(blob);
        else reject(new Error('動画が空です。もう一度お試しください。'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      document.addEventListener('visibilitychange', visibility);
      try { recorder.start(); } catch (error) { clean(); reject(error); return; }
      if (signal?.aborted || document.hidden) { abort(); return; }
      const start = performance.now();
      const draw = (now: number) => {
        if (recorder.state !== 'recording') return;
        try {
          const progress = Math.min(1, (now - start) / duration);
          drawNoahCardVideoFrame(ctx, art, progress, name, summary, variation);
          if (progress >= 1) stop();
          else frame = requestAnimationFrame(draw);
        } catch (error) { reject(error); stop(); }
      };
      frame = requestAnimationFrame(draw);
    });
  } finally { for (const track of stream.getTracks()) track.stop(); }
}
