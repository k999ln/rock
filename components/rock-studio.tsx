'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Check,
  Clipboard,
  Code2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  PackagePlus,
  ShieldCheck,
} from 'lucide-react';

const skyOrigin = 'https://rockstaros-kaiya.noellesugar1.chatgpt.site';
const installCommand = `npm install ${skyOrigin}/toolkits/rockstaros-sky-tool-sdk-0.1.0.tgz`;
const integrationCode = `import { createSkyToolApp } from '@rockstaros/sky-tool-sdk';
import { run } from './your-tool.js'; // あなたの既存処理

const sky = createSkyToolApp({
  skyUrl: '${skyOrigin}',
  developerToken: process.env.SKY_DEVELOPER_TOKEN,
  developer: {
    id: 'your-developer-id',
    name: 'Your name',
    supportUrl: 'https://github.com/your-name'
  },
  app: {
    id: 'com.your-name.your-tool',
    name: 'Your Tool',
    version: '0.1.0',
    sourceUrl: 'https://github.com/your-name/your-tool',
    license: 'MIT',
    publicMcpUrl: 'https://your-tool.example.com/mcp'
  },
  autoPublish: true
});

sky.tool({
  name: 'run',
  title: 'Your Tool',
  description: 'このツールが完了する作業を一文で書く',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { input: {} }
  },
  handler: run
});

await sky.start({ port: 8787 });`;

type DeveloperTokenResponse = {
  token?: { token?: string };
  error?: string;
};

export default function RockStudio() {
  const [copied, setCopied] = useState('');
  const [developerToken, setDeveloperToken] = useState('');
  const [tokenPending, setTokenPending] = useState(false);
  const [tokenError, setTokenError] = useState('');

  async function copy(name: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(''), 1600);
  }

  async function issueDeveloperToken() {
    if (tokenPending) return;
    setTokenPending(true);
    setTokenError('');
    try {
      const response = await fetch('/api/sky/developer-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Rock Studio SDK' }),
      });
      const body = (await response.json().catch(() => ({}))) as DeveloperTokenResponse;
      if (!response.ok || !body.token?.token)
        throw new Error(body.error || '開発者キーを発行できませんでした。');
      setDeveloperToken(body.token.token);
    } catch (cause) {
      setTokenError(
        cause instanceof Error ? cause.message : '開発者キーを発行できませんでした。',
      );
    } finally {
      setTokenPending(false);
    }
  }

  const environmentLine = developerToken
    ? `SKY_DEVELOPER_TOKEN=${developerToken}`
    : 'SKY_DEVELOPER_TOKEN=発行したキー';

  return (
    <main className="studio-chat-shell studio-code-first">
      <header className="studio-chat-header">
        <div className="studio-chat-brand">
          <Link href="/sky" aria-label="Skyへ戻る"><ArrowLeft size={17} /></Link>
          <span className="studio-chat-logo"><Code2 size={18} /></span>
          <div><strong>Rock Studio</strong><span>Sky Tool SDK</span></div>
        </div>
        <div className="studio-chat-private"><ShieldCheck size={15} />ソースコードの送信なし</div>
      </header>

      <section className="studio-code-workspace" aria-label="Sky SDK組み込み">
        <div className="studio-code-main">
          <div className="studio-code-intro">
            <p className="studio-chat-kicker">ADD SKY TO YOUR TOOL</p>
            <h1>このコードを、<br />あなたのツールに付ける。</h1>
            <p>起動するとSkyへ自動登録され、MCPから利用できる状態になります。入力や出力の本文はSkyへ送らず、利用回数と成否だけを記録します。</p>
          </div>

          <div className="studio-install-row">
            <div><span>01</span><div><strong>SDKを追加</strong><small>プロジェクトのTerminalで1回実行</small></div></div>
            <button type="button" onClick={() => copy('install', installCommand)}>
              {copied === 'install' ? <Check size={15} /> : <Clipboard size={15} />}
              {copied === 'install' ? 'コピー済み' : 'コピー'}
            </button>
            <code>{installCommand}</code>
          </div>

          <div className="studio-primary-code">
            <div className="studio-primary-code-head">
              <div><span>02</span><div><strong>既存コードへ追加</strong><small>your- の箇所と説明だけ変更</small></div></div>
              <button type="button" onClick={() => copy('code', integrationCode)}>
                {copied === 'code' ? <Check size={15} /> : <Clipboard size={15} />}
                {copied === 'code' ? 'コピー済み' : 'コードをコピー'}
              </button>
            </div>
            <pre>{integrationCode}</pre>
          </div>
        </div>

        <aside className="studio-code-side">
          <div className="studio-setup-card studio-key-card">
            <div className="studio-setup-number">03</div>
            <span className="studio-setup-icon"><KeyRound size={18} /></span>
            <h2>開発者キー</h2>
            <p>キーは登録先をあなたのアカウントへ結び付けます。コードへ直書きせず、環境変数へ保存します。</p>
            {developerToken ? (
              <div className="studio-token-result">
                <code>{environmentLine}</code>
                <button type="button" onClick={() => copy('token', environmentLine)}>
                  {copied === 'token' ? <Check size={15} /> : <Clipboard size={15} />}
                  {copied === 'token' ? 'コピー済み' : '.envへコピー'}
                </button>
                <small>このキーはこの画面を離れると再表示できません。</small>
              </div>
            ) : (
              <button className="studio-key-button" type="button" onClick={issueDeveloperToken} disabled={tokenPending}>
                {tokenPending ? <LoaderCircle className="studio-spin" size={16} /> : <KeyRound size={16} />}
                {tokenPending ? '発行中…' : '開発者キーを発行'}
              </button>
            )}
            {tokenError && <p className="studio-chat-error">{tokenError}</p>}
          </div>

          <div className="studio-setup-card">
            <div className="studio-setup-number">04</div>
            <span className="studio-setup-icon"><PackagePlus size={18} /></span>
            <h2>起動すれば登録完了</h2>
            <ul>
              <li><Check size={14} />Tool Packageを自動生成</li>
              <li><Check size={14} />Sky Registryへ所有者登録</li>
              <li><Check size={14} />MCPの検索・実行に対応</li>
              <li><Check size={14} />Fund候補と利用実績を記録</li>
            </ul>
            <Link href="/sky"><Activity size={15} />登録後のSkyを確認<ExternalLink size={13} /></Link>
          </div>

          <div className="studio-safety-note">
            <ShieldCheck size={17} />
            <p><strong>外部送信や決済がある場合</strong><span>sideEffectsとauthorizeを追加し、実行ごとの確認を必須にします。未確認の金融操作は実行されません。</span></p>
          </div>
        </aside>
      </section>
    </main>
  );
}
