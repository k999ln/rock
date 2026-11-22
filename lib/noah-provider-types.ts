/** Durable transport state; this is never an executable script supplied by a provider. */
export type NoahProviderRun = {
  protocol: 'gradio' | 'mcp';
  projectId: string;
  repository: string;
  origin: string;
  prefix: '' | '/gradio_api';
  api: string;
  data: unknown[];
  phase: 'queued' | 'dispatching' | 'waiting' | 'done';
  eventId?: string;
  leaseUntil: number;
  nextPollAt: number;
  deadline: number;
};
