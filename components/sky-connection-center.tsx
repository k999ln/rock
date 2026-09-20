'use client';

import { CheckCircle2, CircleDashed, KeyRound, Link2, Save, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ExecutionSignin, useExecutionAccess } from '@/components/execution-access';
import { operationRequest, OperationRequestError } from '@/lib/operations-client';
import {
  providerDefinition,
  skyProviderDefinitions,
  type SkyProvider,
} from '@/lib/sky-connections';
import type { SkyProviderConnection } from '@/lib/operations';
import styles from '@/components/sky-connection-center.module.css';

function labelFor(status: SkyProviderConnection['status'] | undefined) {
  if (status === 'ready') return '設定保存済み';
  if (status === 'reauth_required') return '再接続が必要';
  return '未登録';
}

const routingDefaults: Record<string, string> = {
  imageGeneration: 'higgsfield',
  videoGeneration: 'higgsfield',
  textGeneration: 'local-model',
  textGenerationModel: 'Qwen3-0.6B-Q8_0-GGUF',
  localLlmBaseUrl: 'http://127.0.0.1:4317/v1',
  workflow: 'make',
  socialPublish: 'make',
  gameDelivery: 'roblox',
};

function valuesFor(provider: SkyProvider, config: Record<string, string> | undefined) {
  if (provider === 'routing') return { ...routingDefaults, ...config };
  return config ?? {};
}

export default function SkyConnectionCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<SkyProviderConnection[]>([]);
  const [selected, setSelected] = useState<SkyProvider>('instagram');
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();

  const definition = useMemo(() => providerDefinition(selected), [selected]);
  const selectedProfile = profiles.find((profile) => profile.provider === selected);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await operationRequest<SkyProviderConnection[]>('/api/sky/provider-connections');
      setProfiles(next);
      const profile = next.find((item) => item.provider === selected);
      setValues(valuesFor(selected, profile?.config));
    } catch (cause) {
      if (cause instanceof OperationRequestError && cause.status === 401) setNeedsSignin(true);
      else setError(cause instanceof Error ? cause.message : '接続情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [selected, setNeedsSignin]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [open, refresh]);

  function choose(provider: SkyProvider) {
    setSelected(provider);
    setMessage('');
    setError('');
    setValues(valuesFor(provider, profiles.find((profile) => profile.provider === provider)?.config));
  }

  async function save(status: 'setup_required' | 'ready') {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const saved = await operationRequest<SkyProviderConnection>('/api/sky/provider-connections', 'PUT', {
        provider: selected,
        status,
        config: values,
      });
      setProfiles((current) => [saved, ...current.filter((profile) => profile.provider !== selected)]);
      if (selected === 'routing') {
        window.localStorage.setItem('sky-provider-routing', JSON.stringify(saved.config));
        window.dispatchEvent(new Event('sky-provider-routing'));
      }
      setMessage(
        status === 'ready'
          ? '設定を保存しました。外部サービスのOAuth・実接続はまだ行っていません。'
          : '途中まで保存しました。',
      );
    } catch (cause) {
      if (cause instanceof OperationRequestError && cause.status === 401) setNeedsSignin(true);
      else setError(cause instanceof Error ? cause.message : '接続情報を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialog}>
        <header className={styles.header}>
          <div className={styles.headerMark}><Link2 size={19} /></div>
          <div>
            <DialogTitle>Skyの接続管理</DialogTitle>
            <DialogDescription>保存した表示名や接続先は次回から再利用します。OAuth・実行接続は別途必要です。</DialogDescription>
          </div>
        </header>

        {needsSignin && <ExecutionSignin />}
        <div className={styles.layout}>
          <nav className={styles.providers} aria-label="接続先">
            <p className={styles.eyebrow}>接続先</p>
            {skyProviderDefinitions.map((provider) => {
              const profile = profiles.find((item) => item.provider === provider.id);
              return (
                <button
                  key={provider.id}
                  className={`${styles.provider} ${provider.id === selected ? styles.selected : ''}`}
                  onClick={() => choose(provider.id)}
                >
                  <span className={styles.providerIcon}>{profile?.status === 'ready' ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}</span>
                  <span><strong>{provider.name}</strong><small>{labelFor(profile?.status)}</small></span>
                </button>
              );
            })}
          </nav>

          <section className={styles.form} aria-label={`${definition.name}の登録`}>
            <div className={styles.formHeading}>
              <div><p className={styles.eyebrow}>登録情報</p><h3>{definition.name}</h3></div>
              {selectedProfile?.status === 'ready' && <span className={styles.ready}><CheckCircle2 size={15} /> 設定保存済み</span>}
            </div>
            <p className={styles.detail}>{definition.detail}</p>
            {loading ? <p className={styles.muted}>接続情報を確認中…</p> : definition.fields.map((field) => (
              <label key={field.id} className={styles.field}>
                <span>{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    value={values[field.id] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  >
                    <option value="">選択してください</option>
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      value={values[field.id] ?? ''}
                      placeholder={field.placeholder}
                      list={field.suggestions?.length ? `suggestions-${field.id}` : undefined}
                      onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    />
                    {field.suggestions?.length ? (
                      <datalist id={`suggestions-${field.id}`}>
                        {field.suggestions.map((suggestion) => (
                          <option key={suggestion.value} value={suggestion.value}>
                            {suggestion.label}
                          </option>
                        ))}
                      </datalist>
                    ) : null}
                  </>
                )}
              </label>
            ))}
            <div className={styles.notice}>
              <ShieldCheck size={17} />
              <span>パスワード・APIキー・トークンはここへ保存しません。公式OAuthやOSの安全な接続画面で認証します。</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.secondary} onClick={() => void save('setup_required')} disabled={saving || loading}><Save size={16} /> あとで続ける</button>
              <button className={styles.primary} onClick={() => void save('ready')} disabled={saving || loading}><KeyRound size={16} /> 設定を保存</button>
            </div>
            {message && <output className={styles.message}>{message}</output>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
