// This is an explicit development binding for the original immutable upload.
// It does not turn arbitrary Web definitions or uploaded ZIPs into executables.
export const NOAH_TEST_MANIFEST_SHA256 = '806066178fd7307637fa5e05ff2c38161bd66bfc32659da77090bcedad3bf99b';
export type NoahTestResult = { text: string; inputLines: number; uniqueLines: number; removedLines: number };
export type NoahTestRun = { requestId: string; state: 'running' | 'succeeded' | 'unknown' | 'skipped'; createdAt: number; completedAt?: number; result?: NoahTestResult; trigger?: 'scheduled'; operationId?: string; sequence?: number };
export type NoahTestOperation = { id: string; state: 'running' | 'stopped' | 'blocked' | 'interrupted'; text: string; intervalSeconds: number; sequence: number; succeededCount: number; startedAt: number; stoppedAt: number | null; nextRunAt: number | null; error: string | null };
export type NoahLocalConnection = {
  supported: true; adapter: string; state: 'disconnected' | 'connecting' | 'ready' | 'failed';
  connectionId: string | null; checkedAt: number | null; error: string | null; runs: NoahTestRun[];
  operation: NoahTestOperation | null;
};
