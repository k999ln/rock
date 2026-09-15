'use client';

import { useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Clipboard,
  Code2,
  FileCode2,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  analyzeSkyCodeIntake,
  SKY_CODE_MAX_BYTES,
  type SkyCodeIntake,
} from '@/lib/sky-code-intake';

type Attachment = { name: string; size: number; code: string };
type RegistrationState = 'registered' | 'already_registered' | 'package_ready';
type Result = { intake: SkyCodeIntake; state: RegistrationState; note: string };

const acceptedFiles =
  '.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.rb,.php,.go,.rs,.java,.kt,.swift,.json,.txt';

function kilobytes(bytes: number) {
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

export default function RockStudio() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const source = attachment?.code ?? code;

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    setResult(null);
    if (!file) return;
    if (file.size > SKY_CODE_MAX_BYTES) {
      setError('ファイルは512 KB以下にしてください。');
      event.target.value = '';
      return;
    }
    try {
      const fileCode = await file.text();
      setAttachment({ name: file.name, size: file.size, code: fileCode });
      setCode('');
    } catch {
      setError('ファイルを読み込めませんでした。テキスト形式のコードを選んでください。');
      event.target.value = '';
    }
  }

  function removeAttachment() {
    setAttachment(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source.trim() || pending) return;
    setPending(true);
    setError('');
    setResult(null);
    try {
      const intake = await analyzeSkyCodeIntake({
        code: source,
        fileName: attachment?.name,
      });
      let state: RegistrationState = 'package_ready';
      let note = 'Sky Packageを生成しました。サインイン後、自動でRegistryへ追加できます。';
      const response = await fetch('/api/sky/tool-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifest: intake.manifest,
          confirmations: { rights: true, pricing: true, sideEffects: true, tests: true },
        }),
      });
      if (response.ok) {
        state = 'registered';
        note = 'Sky Registryへの追加が完了しました。Fundから利用候補にできます。';
      } else if (response.status === 409) {
        state = 'already_registered';
        note = '同じToolとバージョンは登録済みです。既存のPackageを利用できます。';
      } else {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        note = body.error || note;
      }
      setResult({ intake, state, note });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'コードを解析できませんでした。');
    } finally {
      setPending(false);
    }
  }

  async function copyIntegrationCode() {
    if (!result) return;
    await navigator.clipboard.writeText(result.intake.integrationCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function reset() {
    setCode('');
    setAttachment(null);
    setResult(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <main className="studio-chat-shell">
      <header className="studio-chat-header">
        <div className="studio-chat-brand">
          <Link href="/sky" aria-label="Skyへ戻る"><ArrowLeft size={17} /></Link>
          <span className="studio-chat-logo"><Code2 size={18} /></span>
          <div><strong>Rock Studio</strong><span>Sky Tool Builder</span></div>
        </div>
        <div className="studio-chat-private"><ShieldCheck size={15} />コードは端末内で解析</div>
      </header>

      <section className="studio-chat-workspace" aria-label="Sky Tool作成チャット">
        <div className="studio-chat-scroll" aria-live="polite">
          <div className="studio-chat-intro">
            <span><Sparkles size={18} /></span>
            <div>
              <p className="studio-chat-kicker">SKY DEVELOPER INTAKE</p>
              <h1>自動化したコードを、<br />そのまま貼ってください。</h1>
              <p>Tool名、用途、Schema、権限、Adapter、テストをSkyが組み立てます。細かい登録フォームは必要ありません。</p>
            </div>
          </div>

          {(attachment || (pending && code)) && (
            <div className="studio-message studio-message-user">
              <div className="studio-message-label">YOU</div>
              {attachment ? (
                <div className="studio-upload-card">
                  <FileCode2 size={20} />
                  <div><strong>{attachment.name}</strong><span>{kilobytes(attachment.size)}</span></div>
                </div>
              ) : (
                <pre>{code.slice(0, 520)}{code.length > 520 ? '\n…' : ''}</pre>
              )}
            </div>
          )}

          {pending && (
            <div className="studio-message studio-message-sky studio-thinking">
              <span className="studio-avatar"><Sparkles size={16} /></span>
              <div><strong>SkyがToolを組み立てています</strong><span><LoaderCircle size={14} />入口・Schema・副作用を解析中</span></div>
            </div>
          )}

          {result && (
            <div className="studio-message studio-message-sky">
              <span className="studio-avatar"><Sparkles size={16} /></span>
              <div className="studio-result">
                <div className="studio-result-head">
                  <div>
                    <span className={`studio-state studio-state-${result.state}`}><Check size={13} />{result.state === 'registered' ? '登録完了' : result.state === 'already_registered' ? '登録済み' : 'Package完成'}</span>
                    <h2>{result.intake.manifest.name}</h2>
                    <code>{result.intake.manifest.id}@{result.intake.manifest.version}</code>
                  </div>
                  <button type="button" className="studio-reset" onClick={reset}><RotateCcw size={14} />別のコード</button>
                </div>
                <p className="studio-result-note">{result.note}</p>
                <div className="studio-findings">
                  {result.intake.findings.map((finding) => <span key={finding}><Check size={12} />{finding}</span>)}
                </div>
                <div className="studio-generated-grid">
                  <div><small>実行場所</small><strong>{result.intake.manifest.capabilities.executionTargets.join(' / ')}</strong></div>
                  <div><small>通信</small><strong>{result.intake.manifest.capabilities.connectivity}</strong></div>
                  <div><small>確認</small><strong>{result.intake.manifest.execution.confirmation}</strong></div>
                  <div><small>Fund分類</small><strong>{result.intake.manifest.fund.categories.join(' / ')}</strong></div>
                </div>
                <details className="studio-details">
                  <summary>追加したSkyコードを確認 <ChevronDown size={15} /></summary>
                  <div className="studio-code-block">
                    <button type="button" onClick={copyIntegrationCode}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'コピー済み' : 'コピー'}</button>
                    <pre>{result.intake.integrationCode}</pre>
                  </div>
                </details>
                <details className="studio-details">
                  <summary>生成されたTool Packageを確認 <ChevronDown size={15} /></summary>
                  <div className="studio-code-block"><pre>{JSON.stringify(result.intake.manifest, null, 2)}</pre></div>
                </details>
              </div>
            </div>
          )}
        </div>

        {!result && (
          <form className="studio-composer" onSubmit={submit}>
            {attachment && (
              <div className="studio-attachment">
                <FileCode2 size={16} /><span>{attachment.name}</span><small>{kilobytes(attachment.size)}</small>
                <button type="button" onClick={removeAttachment} aria-label="添付を外す">×</button>
              </div>
            )}
            <textarea
              value={code}
              onChange={(event) => { setCode(event.target.value); setError(''); }}
              disabled={Boolean(attachment) || pending}
              placeholder={attachment ? 'ファイルを添付しました' : 'ここにコードを貼り付ける…'}
              aria-label="自動化コード"
            />
            <div className="studio-composer-actions">
              <div>
                <input ref={fileInput} type="file" accept={acceptedFiles} onChange={selectFile} id="studio-file" />
                <button type="button" onClick={() => fileInput.current?.click()} disabled={pending}><Paperclip size={17} />ファイル</button>
                <span>最大 512 KB</span>
              </div>
              <button className="studio-send" type="submit" disabled={!source.trim() || pending} aria-label="Skyへ送る"><ArrowUp size={18} /></button>
            </div>
            {error && <p className="studio-chat-error">{error}</p>}
          </form>
        )}
      </section>
      <p className="studio-chat-footnote">コード本文はRegistryへ送りません。ブラウザ内でPackage化し、必要な情報だけを登録します。</p>
    </main>
  );
}
