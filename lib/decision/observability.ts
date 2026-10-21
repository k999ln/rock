import { randomUUID } from 'node:crypto';
import { digestResult, requestInputDigest } from './digest.ts';
import type {
  DecisionEvent,
  DecisionObserver,
  DecisionReceipt,
  DecisionRequest,
  DecisionResult,
  DecisionRoute,
  ProviderId,
} from './types.ts';

export function eventId(): string {
  return `decision_event_${randomUUID()}`;
}

export function receiptId(): string {
  return `decision_receipt_${randomUUID()}`;
}

export function emitDecisionEvent(
  observer: DecisionObserver | undefined,
  event: DecisionEvent,
): void {
  if (!observer) return;
  try {
    observer(event);
  } catch {
    // Observability must never change the decision or expose provider data.
  }
}

export function buildReceipt(input: {
  request: DecisionRequest;
  route: DecisionRoute;
  status: DecisionReceipt['status'];
  reasonCodes: string[];
  attempt: number;
  latencyMs: number;
  provider?: ProviderId;
  fallbackFrom?: ProviderId;
  result?: DecisionResult;
  now: Date;
  id?: string;
}): DecisionReceipt {
  return {
    schemaVersion: 1,
    receiptId: input.id ?? receiptId(),
    requestId: input.request.requestId,
    ownerRef: input.request.ownerRef,
    workId: input.request.workId,
    route: input.route,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.fallbackFrom ? { fallbackFrom: input.fallbackFrom } : {}),
    status: input.status,
    reasonCodes: [...new Set(input.reasonCodes)],
    inputDigest: requestInputDigest(input.request),
    ...(input.result ? { outputDigest: digestResult(input.result) } : {}),
    policyVersion: input.request.policyVersion,
    attempt: input.attempt,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    ...(input.result?.usage ? { usage: { ...input.result.usage } } : {}),
    createdAt: input.now.toISOString(),
  };
}

export class InMemoryDecisionObserver {
  private readonly events: DecisionEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 2048) {
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 10_000)
      throw new Error('maxEvents must be a bounded positive integer');
    this.maxEvents = maxEvents;
  }

  readonly observe: DecisionObserver = (event) => {
    this.events.push(structuredClone(event));
    if (this.events.length > this.maxEvents) this.events.shift();
  };

  snapshot(): DecisionEvent[] {
    return structuredClone(this.events);
  }
}
