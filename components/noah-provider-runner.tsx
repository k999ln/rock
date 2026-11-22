'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { ProviderPlan, ProviderField } from '@/lib/noah-gradio';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { prepareNoahConnectionSound } from '@/lib/noah-connection-sound';
import { noahHaptic } from '@/lib/noah-haptics';
import NoahLoading from './noah-loading';
import NoahWorkList from './noah-work-list';
import styles from './noah-provider-runner.module.css';
import { useNoahLocale } from './noah-locale';
export default function NoahProviderRunner({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useNoahLocale();
  const fieldPrefix = useId();
  const [plan, setPlan] = useState<ProviderPlan | null>(null),
    [scope, setScope] = useState(''),
    [api, setApi] = useState(''),
    [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null),
    flight = useRef(false),
    epoch = useRef(0);
  const invalidate = useCallback(() => {
    epoch.current++;
  }, []);
  const endpoint = plan?.endpoints.find((e) => e.name === api) ?? null;
  useEffect(() => () => invalidate(), [invalidate]);
  async function prepare() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const version = epoch.current,
      sound = prepareNoahConnectionSound();
    try {
      const r = await fetch(
          `/api/noah/provider?project=${encodeURIComponent(projectId)}`,
          { cache: 'no-store' },
        ),
        b = (await r.json()) as {
          plan?: ProviderPlan;
          ownerScope?: string;
          error?: string;
        };
      if (version !== epoch.current) {
        sound.dispose();
        return;
      }
      if (!r.ok || !b.plan || typeof b.ownerScope !== 'string')
        throw Error(b.error || '準備できませんでした。');
      setPlan(b.plan);
      setScope(b.ownerScope);
      setApi(b.plan.endpoints[0]?.name ?? '');
      setValues({});
      noahHaptic('success');
      sound.play();
    } catch (e) {
      if (version === epoch.current)
        setError(e instanceof Error && !(e instanceof TypeError) ? e.message : '接続できませんでした。');
      sound.dispose();
    } finally {
      if (version === epoch.current) {
        setBusy(false);
        flight.current = false;
      }
    }
  }
  async function submit() {
    if (!endpoint || !plan || !scope || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const version = epoch.current;
    pending.current ??= {
      id: crypto.randomUUID(),
      projectId,
      api: endpoint.name,
      digest: endpoint.digest,
      input: {
        ...Object.fromEntries(
          endpoint.fields
            .filter((f) => f.kind === 'boolean' && !f.optional)
            .map((f) => [f.name, false]),
        ),
        ...values,
      },
      confirm: true,
    };
    try {
      const r = await fetch('/api/noah/provider', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [OWNER_SCOPE_HEADER]: scope,
          },
          body: JSON.stringify(pending.current),
        }),
        b = (await r.json()) as {
          id?: string;
          ownerScope?: string;
          error?: string;
        };
      if (version !== epoch.current) return;
      if (!r.ok) {
        if (r.status < 500) {
          pending.current = null;
          setUncertain(false);
        }
        throw Error(b.error || '受付を確認できませんでした。');
      }
      if (b.ownerScope !== scope || typeof b.id !== 'string')
        throw Error('保存先を確認できませんでした。');
      window.location.assign(`/noah/tasks/${encodeURIComponent(b.id)}`);
    } catch (e) {
      if (version === epoch.current) {
        setUncertain(Boolean(pending.current));
        setError(
          e instanceof Error && !(e instanceof TypeError)
            ? e.message
            : '通信が途切れました。同じ依頼の受付を確認できます。',
        );
      }
    } finally {
      if (version === epoch.current) {
        setBusy(false);
        flight.current = false;
      }
    }
  }
  const inputField = (f: ProviderField) => {
    const value =
      values[f.name] ?? f.value ?? (f.kind === 'boolean' ? false : '');
    const display =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value)
        : Array.isArray(value) ? value.join('\n') : '';
    const label = f.label + (f.kind === 'list' ? t('（1行に1件）') : '');
    const change = (v: unknown) =>
      setValues((old) => ({ ...old, [f.name]: v }));
    return (
      <label
        key={f.name}
        htmlFor={`${fieldPrefix}-${f.name}`}
        className={styles.field}
      >
        <span>{label}</span>
        {f.kind === 'boolean' ? (
          <input
            id={`${fieldPrefix}-${f.name}`}
            aria-label={label}
            type="checkbox"
            checked={value === true}
            onChange={(e) => change(e.target.checked)}
          />
        ) : f.kind === 'choice' ? (
          <select
            id={`${fieldPrefix}-${f.name}`}
            aria-label={label}
            value={JSON.stringify(value)}
            required={!f.optional}
            onChange={(e) => change(JSON.parse(e.target.value))}
          >
            <option value='""' disabled>
              選んでください
            </option>
            {f.choices?.map((c) => (
              <option key={JSON.stringify(c)} value={JSON.stringify(c)}>
                {String(c)}
              </option>
            ))}
          </select>
        ) : f.kind === 'number' ? (
          <input
            id={`${fieldPrefix}-${f.name}`}
            aria-label={label}
            type="number"
            min={f.minimum}
            max={f.maximum}
            step={f.integer ? 1 : 'any'}
            required={!f.optional}
            value={display}
            onChange={(e) =>
              change(e.target.value === '' ? '' : Number(e.target.value))
            }
          />
        ) : (
          <textarea
            id={`${fieldPrefix}-${f.name}`}
            aria-label={label}
            rows={3}
            required={!f.optional}
            maxLength={8000}
            value={display}
            onChange={(e) => change(e.target.value)}
          />
        )}
      </label>
    );
  };
  return (
    <section className={styles.panel} aria-label="Noahで実行">
      <h2>{t('Noahで使う')}</h2>
      {!plan && (
        <>
          <p>{t('提供元の接続先を確認し、この画面で入力して実行できます。届いた成果はNoahに残ります。')}</p>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => void prepare()}
          >
            {busy ? t('準備中…') : t('使う')}
          </button>
        </>
      )}
      {busy && !plan && (
        <NoahLoading variant="connection" label={t('準備しています…')} />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {t(error)}
        </p>
      )}
      {plan && endpoint && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy || uncertain}>
            {endpoint.description && <p>{endpoint.description}</p>}
            {plan.endpoints.length > 1 && (
              <label className={styles.field}>
                <span>{t('何をしますか？')}</span>
                <select
                  value={api}
                  onChange={(e) => {
                    setApi(e.target.value);
                    setValues({});
                  }}
                >
                  {plan.endpoints.map((e) => (
                    <option key={e.name} value={e.name}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {endpoint.fields
              .filter((f) => !f.optional && f.kind !== 'fixed')
              .map(inputField)}
            {endpoint.fields.some((f) => f.optional && f.kind !== 'fixed') && (
              <details>
                <summary>{t('細かい設定')}</summary>
                {endpoint.fields
                  .filter((f) => f.optional && f.kind !== 'fixed')
                  .map(inputField)}
              </details>
            )}
          </fieldset>
          <p className={styles.destination}>
            {t('送信先')}: {new URL(plan.host).hostname}
            <br />
            {t('入力内容を送り、選んだ処理を実行します。')}
            <br />
            {t('成果が届くまで画面を開いたままにしてください。')}
          </p>
          <button className={styles.primary} type="submit" disabled={busy}>
            {busy
              ? t('受け付けています…')
              : uncertain
                ? t('同じ依頼の受付を確認')
                : t('送信して実行')}
          </button>
          {uncertain && <Link href="/noah/activity">{t('実行中を確認')}</Link>}
        </form>
      )}
      <NoahWorkList
        agentId={projectId}
        ownerScope={scope || null}
        refresh={0}
      />
    </section>
  );
}
