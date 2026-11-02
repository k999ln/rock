export class CameraSession {
  constructor(options: {
    video: HTMLVideoElement; mediaDevices: MediaDevices;
    createWorker: () => Worker; bitmap: (video: HTMLVideoElement) => Promise<ImageBitmap>;
    schedule: (callback: FrameRequestCallback) => number; cancelSchedule: (id: number) => void;
    clock?: () => number; onFrame?: (frame: { timestampMs: number; hands: unknown }) => void;
    onStatus?: (status: string) => void; fps?: number; maxFrames?: number;
    maxDurationMs?: number; frameTimeoutMs?: number;
  });
  start(): Promise<void>;
  stop(reason?: string): void;
}
