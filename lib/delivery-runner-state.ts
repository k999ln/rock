/** In-memory only; File contents are never persisted by this session. */
export type DeliveryRunnerState = {
  review: string;
  files: File[];
  output: string;
  error: string;
  busy: boolean;
};
export type DeliveryRunnerSession = {
  getSnapshot: () => DeliveryRunnerState | undefined;
  subscribe: (listener: () => void) => () => void;
  patch: (value: Partial<DeliveryRunnerState>) => void;
  isActive?: () => boolean;
  onAuthenticationLost?: () => void;
};
export function createDeliveryRunnerState(): DeliveryRunnerState {
  return { review: '', files: [], output: '', error: '', busy: false };
}
export function hasDeliveryRunnerDraft(value: DeliveryRunnerState | undefined): boolean {
  return Boolean(value && (value.review.trim() || value.files.length || value.output.trim()));
}
export function createDeliveryRunnerSession(): DeliveryRunnerSession {
  let snapshot = createDeliveryRunnerState();
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    patch(value) { snapshot = { ...snapshot, ...value }; listeners.forEach((listener) => listener()); },
  };
}
