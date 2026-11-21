'use client';
/* oxlint-disable react/react-compiler -- Synchronize owner-scoped asynchronous API state and clear it when the owner changes. */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  noahFormArgs,
  type NoahToolMenuItem,
  type NoahToolForm,
  type NoahFormField,
} from '@/lib/noah-form';
import {
  noahRemoteFetch,
  type NoahRemoteConnectionView,
} from '@/lib/noah-remote-client';
import styles from './noah-ready.module.css';
function fieldText(value:unknown):string{ if(typeof value==='string')return value;if(typeof value==='number'||typeof value==='boolean')return String(value);return value===undefined||value===null?'':JSON.stringify(value);}
type Tool = NoahToolMenuItem & { form?: NoahToolForm | null };
type Props = {
  connection: NoahRemoteConnectionView;
  ownerScope: string;
  onSubmitted: () => void;
};
export default function NoahAsk({
  connection,
  ownerScope,
  onSubmitted,
}: Props) {
  const [tools, setTools] = useState<Tool[]>([]),
    [selected, setSelected] = useState<Tool | null>(null),
    [values, setValues] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [fieldError, setFieldError] = useState<{
      field: string;
      message: string;
    } | null>(null),
    [review, setReview] = useState(false);
  const active = useRef(true),
    sending = useRef(false),
    pending = useRef<{ fingerprint: string; id: string } | null>(null);
  const select=useCallback((tool: Tool) => {
    setSelected(tool);
    setValues(
      Object.fromEntries(
        (tool.form?.usable ? tool.form.fields : [])
          .filter((f) => f.default !== undefined)
          .map((f) => [f.name, f.default]),
      ),
    );
    setReview(false);
    setFieldError(null);
    pending.current = null;
  },[]);
  const load=useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await noahRemoteFetch<{ tools: Tool[] }>(
        '/api/noah/connect/' + connection.id + '/tools',
      );
      if (!active.current) return;
      setTools(data.tools);
      const usable = data.tools.filter((t) => t.usable);
      if (usable.length === 1) select(usable[0]);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : '入力欄を読み込めませんでした。',
        );
    } finally {
      if (active.current) setLoading(false);
    }
  },[connection.id,select]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);
  async function choose(tool: Tool) {
    if (busy) return;
    if (tool.form) {
      select(tool);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await noahRemoteFetch<{ tools: Tool[] }>(
        '/api/noah/connect/' +
          connection.id +
          '/tools?tool=' +
          encodeURIComponent(tool.name),
      );
      if (active.current && data.tools[0]) select(data.tools[0]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '入力欄を読み込めませんでした。',
      );
    } finally {
      setLoading(false);
    }
  }
  function change(name: string, value: unknown) {
    setValues((old) => ({ ...old, [name]: value }));
    setReview(false);
    setFieldError(null);
  }
  async function submit(confirmed = false) {
    if (sending.current || !selected?.form?.usable) return;
    const args = noahFormArgs(selected.form, values);
    if (!args.ok) {
      setFieldError(args);
      return;
    }
    if (selected.needsConfirm && !confirmed) {
      setReview(true);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    const form = {
      tool: selected.name,
      toolSha256: selected.sha256,
      input: values,
      ...(confirmed ? { confirm: true } : {}),
    };
    const fingerprint = JSON.stringify(form);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await noahRemoteFetch('/api/noah/ask', {
        ownerScope,
        body: {
          id: pending.current.id,
          connectionId: connection.id,
          form,
          screen: window.innerWidth < 600 ? 'narrow' : 'wide',
        },
      });
      if (active.current) {
        setReview(false);
        pending.current = null;
        onSubmitted();
      }
    } catch (e) {
      if (active.current) {
        setError(
          e instanceof Error
            ? e.message
            : '依頼の受付を確認できませんでした。同じ内容の再試行は二重実行されません。',
        );
        onSubmitted();
      }
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }
  const visible = tools.filter((t) =>
      `${t.name} ${t.summary}`.toLowerCase().includes(search.toLowerCase()),
    ),
    form = selected?.form?.usable ? selected.form : null;
  const field = (f: NoahFormField) => (
    <div key={f.name} className={styles.field}>
      <label htmlFor={'noah-field-' + f.name}>
        {f.label}
        {f.required && <span className={styles.required}>必須</span>}
      </label>
      <Field
        field={f}
        value={values[f.name]}
        disabled={busy || review}
        onChange={(value) => change(f.name, value)}
      />
      {f.help && <p className={styles.fieldHelp}>{f.help}</p>}
      {fieldError?.field === f.name && (
        <p role="alert" className={styles.error}>
          {fieldError.message}
        </p>
      )}
    </div>
  );
  return (
    <section className={styles.ask}>
      <h2 className={styles.sectionTitle}>何を頼みますか？</h2>
      {error && (
        <div role="alert" className={styles.notice}>
          {error}
          <button type="button" disabled={loading} onClick={() => void load()}>
            入力欄を読み直す
          </button>
        </div>
      )}
      {loading && (
        <output className={styles.muted}>
          できることを確認しています…
        </output>
      )}
      {!loading && !tools.length && (
        <button className={styles.secondary} onClick={() => void load()}>
          入力欄を読み直す
        </button>
      )}
      {tools.filter((t) => t.usable).length > 1 && (
        <>
          <details open={!selected} className={styles.toolPicker}>
            <summary>
              {selected ? `選んだ道具：${selected.name}` : '道具を選ぶ'}
            </summary>
            {tools.length >= 13 && (
              <input
                className={styles.filterInput}
                aria-label="道具を絞り込む"
                placeholder="できることで絞る"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            {visible.map((t) => (
              <button
                key={t.name}
                className={styles.tool}
                disabled={!t.usable || busy}
                aria-pressed={selected?.name === t.name}
                onClick={() => void choose(t)}
              >
                <strong>{t.name}</strong>
                <span>{t.summary}</span>
                <small>
                  {!t.usable
                    ? '入力欄ではまだ使えません'
                    : t.readOnly
                      ? t.required === 0
                        ? '読み取りだけ · 押すだけ'
                        : '読み取りだけ'
                      : '初回に確認が必要'}
                </small>
              </button>
            ))}
          </details>
        </>
      )}
      {selected && form && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h3 className={styles.toolTitle}>{selected.name}</h3>
          {!review && (
            <>
              {form.fields.filter((f) => f.required).map(field)}
              {form.fields.some((f) => !f.required) || form.omitted > 0 ? (
                <details className={styles.optional}>
                  <summary>
                    細かい設定（{form.fields.filter((f) => !f.required).length}
                    ）
                  </summary>
                  {form.fields.filter((f) => !f.required).map(field)}
                  {form.omitted > 0 && (
                    <p>
                      ほかに{form.omitted}
                      個の設定があります（入力欄では使えません）。
                    </p>
                  )}
                </details>
              ) : null}
            </>
          )}
          {fieldError &&
            !form.fields.some((f) => f.name === fieldError.field) && (
              <p role="alert" className={styles.error}>
                {fieldError.message}
              </p>
            )}
          {review && (
            <div className={styles.confirmation}>
              <h3>送る前に確認</h3>
              <p>
                {selected.name}
                は「読み取りだけ」と宣言されていません。相手のサーバーで、何かを変えたり送ったりする可能性があります。
              </p>
              <dl>
                {Object.entries(values).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{fieldText(value).slice(0, 200)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <p className={styles.destination}>
            入力は <strong>{connection.host}</strong> へ送られます。
          </p>
          {review ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void submit(true)}
              >
                {busy ? '依頼を受け付けています…' : '確かめて頼む'}
              </button>
              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() => setReview(false)}
              >
                やめる
              </button>
            </div>
          ) : (
            <button className={styles.primary} type="submit" disabled={busy}>
              {busy ? '依頼を受け付けています…' : '頼む'}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
function Field({
  field: f,
  value,
  disabled,
  onChange,
}: {
  field: NoahFormField;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const common = {
    id: 'noah-field-' + f.name,
    name: f.name,
    disabled,
    required: f.required,
  };
  if (f.kind === 'boolean')
    return (
      <select
        {...common}
        value={value === undefined ? '' : fieldText(value)}
        onChange={(e) =>
          onChange(
            e.target.value === '' ? undefined : e.target.value === 'true',
          )
        }
      >
        <option value="">{f.required ? '選んでください' : '指定しない'}</option>
        <option value="true">はい</option>
        <option value="false">いいえ</option>
      </select>
    );
  if (f.kind === 'choice' && f.choices)
    return f.choices.length <= 7 ? (
      <div className={styles.choices}  aria-label={f.label}>
        {f.choices.map((v) => (
          <button
            key={String(v)}
            type="button"
            disabled={disabled}
            aria-pressed={value === v}
            onClick={() => onChange(!f.required && value === v ? undefined : v)}
          >
            {String(v)}
          </button>
        ))}
      </div>
    ) : (
      <select
        {...common}
        value={value === undefined ? '' : fieldText(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">選んでください</option>
        {f.choices.map((v) => (
          <option key={String(v)} value={String(v)}>
            {String(v)}
          </option>
        ))}
      </select>
    );
  if (f.kind === 'number')
    return (
      <input
        {...common}
        inputMode={f.integer ? 'numeric' : 'decimal'}
        value={value === undefined ? '' : fieldText(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (f.kind === 'text' && f.format)
    return (
      <input
        {...common}
        type={f.format === 'uri' ? 'url' : f.format}
        maxLength={f.maxLength}
        value={value === undefined ? '' : fieldText(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (f.kind === 'list' && f.choices)
    return (
      <div className={styles.choices}>
        {f.choices.map((choice) => (
          <label key={String(choice)}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={Array.isArray(value) && value.includes(choice)}
              onChange={(e) => {
                const list = Array.isArray(value) ? value : [];
                onChange(
                  e.target.checked
                    ? [...list, choice]
                    : list.filter((v) => v !== choice),
                );
              }}
            />
            {String(choice)}
          </label>
        ))}
      </div>
    );
  return (
    <textarea
      {...common}
      rows={f.kind === 'list' ? 4 : 2}
      maxLength={f.kind === 'text' ? f.maxLength : undefined}
      placeholder={f.kind === 'list' ? '1行に1つずつ入力' : undefined}
      value={
        Array.isArray(value)
          ? value.join('\n')
          : value === undefined
            ? ''
            : fieldText(value)
      }
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
