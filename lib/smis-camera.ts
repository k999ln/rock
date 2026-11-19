import { observeSmisPixels, SMIS_VISUAL_SIDE } from './smis-visual-input.ts';

/** Browser input adapter only. Pixels stay in memory and never enter a URL or API. */
export function captureSmisCamera(video: HTMLVideoElement) {
  if (video.readyState < 2 || video.videoWidth < 64 || video.videoHeight < 64) throw Error('カメラの映像を待っています。少し待って再試行してください。');
  const canvas = document.createElement('canvas');
  canvas.width = SMIS_VISUAL_SIDE; canvas.height = SMIS_VISUAL_SIDE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw Error('このブラウザーでは映像を読み取れません。');
  const side = Math.min(video.videoWidth, video.videoHeight) * 0.68;
  context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, SMIS_VISUAL_SIDE, SMIS_VISUAL_SIDE);
  const pixels = context.getImageData(0, 0, SMIS_VISUAL_SIDE, SMIS_VISUAL_SIDE).data;
  const observation = observeSmisPixels(pixels, 'browser-camera', Date.now());
  context.clearRect(0, 0, SMIS_VISUAL_SIDE, SMIS_VISUAL_SIDE);
  return observation;
}
