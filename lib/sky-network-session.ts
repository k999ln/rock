export type NetworkState = {
  status: 'idle' | 'checking' | 'connecting' | 'connected' | 'failed' | 'offline';
  pending: boolean;
  message: string;
};

/** UI observation only; this controller never creates or restores device rights. */
export function createNetworkSession(deps: {
  online: () => boolean;
  hasToken: () => boolean;
  verify: () => Promise<unknown>;
  connect: () => Promise<unknown>;
  changed: (state: NetworkState) => void;
}) {
  let generation = 0;
  let disposed = false;
  let state: NetworkState = { status: 'idle', pending: false, message: '' };
  const publish = (patch: Partial<NetworkState>) => {
    state = { ...state, ...patch };
    if (!disposed) deps.changed({ ...state });
  };
  const current = (id: number) => !disposed && id === generation && deps.online();
  const offline = () => {
    generation++;
    publish({ status: 'offline', message: 'インターネット接続が切れました。接続を戻してから再試行してください。' });
  };
  async function run(kind: 'check' | 'connect') {
    if (disposed || state.pending) return;
    if (!deps.online()) { offline(); return; }
    if (kind === 'check' && !deps.hasToken()) {
      publish({ status: 'idle', message: '' });
      return;
    }
    const id = ++generation;
    publish({ status: kind === 'check' ? 'checking' : 'connecting', pending: true, message: '' });
    try {
      await (kind === 'check' ? deps.verify() : deps.connect());
      if (current(id)) publish({ status: 'connected', message: '端末と接続できました。使いたいツールを選べます。' });
    } catch (error) {
      if (current(id)) publish({ status: 'failed', message: error instanceof Error ? error.message : '接続を確認できませんでした。もう一度お試しください。' });
    } finally {
      if (!disposed) {
        // A late completion must not overwrite an offline event or a newer view.
        if (id !== generation && deps.online()) publish({ status: 'idle', message: '接続状態が変わりました。もう一度確認してください。' });
        publish({ pending: false });
      }
    }
  }
  return {
    check: () => run('check'),
    connect: () => run('connect'),
    offline,
    dispose: () => { disposed = true; generation++; },
  };
}
