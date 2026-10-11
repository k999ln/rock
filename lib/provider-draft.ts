import type { SkyProviderConnection } from './operations.ts';
import type { SkyProvider } from './sky-connections.ts';

type Config = Record<string, string>;
type Baseline = { revision: number; config: Config; status: SkyProviderConnection['status'] };
export type ProviderDraftState = {
  config: Config; revision: number | null; profiles: SkyProviderConnection[];
  dirty: boolean; loading: boolean; saving: boolean; available: boolean;
  conflict: boolean; latest: Baseline | null; manualSave: boolean;
  error: string; message: string; unauthorized: boolean;
};
export type ProviderRequest = <T>(path: string, method?: string, value?: unknown) => Promise<T>;

// A session belongs to exactly one provider. Late responses from a closed session
// cannot update the next provider's draft or display a success there.
export class ProviderDraft {
  private state: ProviderDraftState;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private active = false;
  readonly provider: SkyProvider;
  private defaults: Config;
  private request: ProviderRequest;
  constructor(provider: SkyProvider, defaults: Config, request: ProviderRequest) {
    this.provider = provider; this.defaults = defaults; this.request = request;
    this.state = { config: { ...defaults }, revision: null, profiles: [], dirty: false,
      loading: true, saving: false, available: false, conflict: false, latest: null,
      manualSave: false, error: '', message: '', unauthorized: false };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(value: Partial<ProviderDraftState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((listener) => listener());
  }
  activate = () => { this.active = true; void this.refresh(); };
  deactivate = () => { this.active = false; this.epoch++; this.patch({ saving: false, loading: false, available: false }); };
  private current(epoch: number) { return this.active && this.epoch === epoch; }
  private failure(cause: unknown) {
    const status = cause && typeof cause === 'object' && 'status' in cause ? cause.status : null;
    if (status === 401) {
      this.patch({ config: { ...this.defaults }, revision: null, profiles: [], dirty: false,
        latest: null, conflict: false, available: false, unauthorized: true, message: '',
        error: 'サインインを確認してください。' });
    } else this.patch({ error: cause instanceof Error ? cause.message : '設定を確認できませんでした。' });
    return status;
  }
  refresh = async () => {
    if (!this.active || this.state.saving) return;
    const epoch = ++this.epoch;
    this.patch({ loading: true, saving: false, available: false, latest: null, error: '', message: '' });
    try {
      const profiles = await this.request<SkyProviderConnection[]>('/api/sky/provider-connections');
      if (!this.current(epoch)) return;
      if (!Array.isArray(profiles) || profiles.some((row) => !Number.isSafeInteger(row.revision) || row.revision < 1))
        throw new Error('設定の版を取得できません。画面とAPIを更新して再取得してください。');
      const row = profiles.find((item) => item.provider === this.provider);
      const latest: Baseline = { revision: row?.revision ?? 0, config: { ...this.defaults, ...row?.config }, status: row?.status ?? 'setup_required' };
      this.patch({ profiles, available: true, unauthorized: false,
        ...(this.state.conflict ? { latest } : {}),
        // A dirty draft keeps its original comparison version on every refresh.
        ...(!this.state.dirty ? { config: latest.config, revision: latest.revision } : {}),
      });
    } catch (cause) { if (this.current(epoch)) this.failure(cause); }
    finally { if (this.current(epoch)) this.patch({ loading: false }); }
  };
  edit = (config: Config) => {
    if (!this.active || this.state.loading || this.state.saving || !this.state.available) return;
    this.patch({ config: { ...config }, dirty: true, message: '' });
  };
  confirmLatest = () => {
    if (!this.active || this.state.loading || this.state.saving || !this.state.available || !this.state.latest) return;
    this.patch({ revision: this.state.latest.revision, conflict: false, latest: null,
      manualSave: true, error: '', message: '最新設定を確認しました。入力を残しています。保存ボタンで再保存してください。' });
  };
  save = async (status: 'setup_required' | 'ready') => {
    const draft = this.state;
    if (!this.active || draft.loading || draft.saving || !draft.available || draft.conflict || draft.revision === null) return;
    const epoch = ++this.epoch;
    this.patch({ saving: true, message: '', error: '' });
    try {
      const saved = await this.request<SkyProviderConnection>('/api/sky/provider-connections', 'PUT', {
        provider: this.provider, status, config: draft.config, expectedRevision: draft.revision,
      });
      if (!this.current(epoch)) return;
      if (saved.provider !== this.provider || saved.revision !== draft.revision + 1)
        throw new Error('保存結果の版を確認できません。最新設定を再取得してください。');
      this.patch({ config: { ...this.defaults, ...saved.config }, revision: saved.revision, dirty: false,
        profiles: [saved, ...draft.profiles.filter((row) => row.provider !== this.provider)],
        manualSave: false, message: '設定を保存しました。外部サービスのOAuth・実接続はまだ行っていません。' });
      return saved;
    } catch (cause) {
      if (!this.current(epoch)) return;
      const status = this.failure(cause);
      if (status === 409) this.patch({ conflict: true, latest: null, dirty: true, manualSave: true });
      else this.patch({ manualSave: true });
    } finally { if (this.current(epoch)) this.patch({ saving: false }); }
  };
}
