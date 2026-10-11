'use client';

import { CheckCircle2, CircleDashed, KeyRound, Link2, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ExecutionSignin, useExecutionAccess } from '@/components/execution-access';
import { ProviderDraftFeedback, useProviderDraft } from '@/components/provider-draft';
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

const emptyDefaults: Record<string, string> = {};

export default function SkyConnectionCenter({
  open,
  onOpenChange,
  initialProvider = 'instagram',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvider?: SkyProvider;
}) {
  const headingRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<SkyProvider>(initialProvider);
  const { executionBlocked, accessState, setNeedsSignin } = useExecutionAccess();
  const { session, state, disabled } = useProviderDraft(selected, selected === 'routing' ? routingDefaults : emptyDefaults, open && !executionBlocked);
  const { profiles, config: values, loading, saving } = state;
  const definition = useMemo(() => providerDefinition(selected), [selected]);
  const selectedProfile = profiles.find((profile) => profile.provider === selected);
  useEffect(() => { if (state.unauthorized) setNeedsSignin(true); }, [state.unauthorized, setNeedsSignin]);

  function choose(provider: SkyProvider) {
    if (provider === selected) return;
    session.deactivate();
    setSelected(provider);
  }
  async function save(status: 'setup_required' | 'ready') {
    const saved = await session.save(status);
    if (saved?.provider === 'routing') {
      window.localStorage.setItem('sky-provider-routing', JSON.stringify(saved.config));
      window.dispatchEvent(new Event('sky-provider-routing'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) session.deactivate(); onOpenChange(next); }}>
      <DialogContent className={styles.dialog} initialFocus={headingRef}>
        <header className={styles.header} ref={headingRef} tabIndex={-1}>
          <div className={styles.headerMark}><Link2 size={19} /></div>
          <div>
            <DialogTitle>Skyの接続管理</DialogTitle>
            <DialogDescription>保存した表示名や接続先は次回から再利用します。OAuth・実行接続は別途必要です。</DialogDescription>
          </div>
        </header>

        {executionBlocked && <ExecutionSignin state={accessState} />}
        {!executionBlocked && <div className={styles.layout}>
          <nav className={styles.providers} aria-label="接続先">
            <p className={styles.eyebrow}>接続先</p>
            {skyProviderDefinitions.map((provider) => {
              const profile = profiles.find((item) => item.provider === provider.id);
              return (
                <button
                  key={provider.id}
                  className={`${styles.provider} ${provider.id === selected ? styles.selected : ''}`}
                  aria-pressed={provider.id === selected}
                  disabled={saving || executionBlocked}
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
                <span>{field.label}{field.optional ? '（任意）' : ''}</span>
                {field.type === 'select' ? (
                  <select
                    disabled={disabled}
                    value={values[field.id] ?? ''}
                    onChange={(event) => {
                      session.edit({ ...values, [field.id]: event.target.value });
                    }}
                  >
                    <option value="">選択してください</option>
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      disabled={disabled}
                    value={values[field.id] ?? ''}
                      placeholder={field.placeholder}
                      list={field.suggestions?.length ? `suggestions-${field.id}` : undefined}
                      onChange={(event) => {
                      session.edit({ ...values, [field.id]: event.target.value });
                    }}
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
            {definition.setupSteps && (
              <div className={styles.detail}>
                <ol>{definition.setupSteps.map((step) => <li key={step}>{step}</li>)}</ol>
                <a href={definition.documentationUrl} target="_blank" rel="noreferrer">LiveKitの公式導入ガイド</a>
              </div>
            )}
            <div className={styles.notice}>
              <ShieldCheck size={17} />
              <span>パスワード・APIキー・トークンはここへ保存しません。公式OAuthやOSの安全な接続画面で認証します。</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.secondary} onClick={() => void save('setup_required')} disabled={disabled || state.conflict}><Save size={16} /> あとで続ける</button>
              <button className={styles.primary} onClick={() => void save('ready')} disabled={disabled || state.conflict}><KeyRound size={16} /> 設定を保存</button>
            </div>
            <ProviderDraftFeedback session={session} />
          </section>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
