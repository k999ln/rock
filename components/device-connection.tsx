'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Cable,
  Download,
  FolderOpen,
  Play,
  ShieldCheck,
  Terminal,
  Unplug,
} from 'lucide-react';
import {
  connectDevice,
  deviceToken,
  disconnectDevice,
  DEVICE_URL,
} from '@/lib/device';

export function DeviceConnection() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const update = () => setConnected(Boolean(deviceToken()));
    update();
    window.addEventListener('loop-device', update);
    return () => window.removeEventListener('loop-device', update);
  }, []);

  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      await connectDevice();
      setConnected(true);
      setMessage(
        'Connectorへ接続しました。基本4機能を確認済みです。MCP画面から他の自動化も接続できます。',
      );
    } catch {
      setConnected(Boolean(deviceToken()));
      setMessage(
        '接続できませんでした。先に接続アプリを起動し、ブラウザのローカルネットワーク許可を確認してください。',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="device-page">
      <div className="page-heading device-heading">
        <div>
          <span className="eyebrow">SKY MCP / LOCAL</span>
          <h1>3ステップで、Skyに接続</h1>
          <p>
            初回だけ準備すれば、次からは接続アプリを起動してSkyを開くだけです。
          </p>
        </div>
        <Cable size={35} />
      </div>

      <section className="panel device-card device-install-card">
        <ol className="device-install-steps">
          <li>
            <span className="device-step-number">1</span>
            <div className="device-step-icon">
              <Download size={20} />
            </div>
            <div>
              <h2>無料パックをダウンロード</h2>
              <p>
                追加アカウント、APIキー、有料の依存サービスは必要ありません。
              </p>
              <a
                href="/toolkits/sky-mcp-connector.zip"
                download
                className="black-button device-download"
              >
                <Download size={16} />
                Sky MCP Connectorをダウンロード
              </a>
            </div>
          </li>
          <li>
            <span className="device-step-number">2</span>
            <div className="device-step-icon">
              <FolderOpen size={20} />
            </div>
            <div>
              <h2>展開して接続アプリを起動</h2>
              <p>
                macOSはフォルダ内の「Sky
                MCP接続.command」を開きます。起動したターミナルは、利用中そのままにします。
              </p>
              <small>
                開けない場合はControlキーを押しながらクリックし、「開く」を選びます。
              </small>
              <small>macOS / Linux: Node.js 22.13以上・Python 3.13以上</small>
            </div>
          </li>
          <li>
            <span className="device-step-number">3</span>
            <div className="device-step-icon">
              <Play size={20} />
            </div>
            <div>
              <h2>この画面から接続を確認</h2>
              <p>
                Skyが共通Connectorを確認します。その後、MCP画面から各自動化をワンタップ接続できます。
              </p>
              <button
                className="black-button"
                disabled={busy}
                onClick={() => void connect()}
              >
                {connected ? <Check size={16} /> : <Cable size={16} />}
                {busy
                  ? '接続を確認中…'
                  : connected
                    ? 'もう一度接続を確認'
                    : 'このPCを接続'}
              </button>
            </div>
          </li>
        </ol>

        <div
          className={`device-connection-result ${connected ? 'is-connected' : ''}`}
          aria-live="polite"
        >
          <span className={connected ? 'status-dot' : 'offline-dot'} />
          <div>
            <strong>{connected ? 'このPCは接続済み' : 'PC未接続'}</strong>
            <p>
              {connected
                ? 'Skyの対応ツールからMCP実行できます。'
                : '手順2まで終えたら「このPCを接続」を押してください。'}
            </p>
          </div>
          {connected && (
            <button
              className="text-link disconnect-button"
              onClick={() => {
                disconnectDevice();
                setConnected(false);
                setMessage('このタブのPC接続を解除しました。');
              }}
            >
              <Unplug size={15} />
              解除
            </button>
          )}
        </div>

        {message && <output className="notice">{message}</output>}

        <details className="device-advanced">
          <summary>Linuxでの起動・Codexへの登録</summary>
          <div className="device-advanced-grid">
            <section>
              <Terminal size={19} />
              <h3>Linuxから接続</h3>
              <p>展開したフォルダで次を実行します。</p>
              <pre>node sky-mcp-connector/server.mjs</pre>
            </section>
            <section>
              <Terminal size={19} />
              <h3>Codexから直接使う</h3>
              <p>設定のパスを実際の展開先へ置き換えます。</p>
              <pre>
                {
                  '[mcp_servers.rock_star_mr]\ncommand = "python3"\nargs = ["/展開先/rock-star-mr-tools/mcp_server.py"]'
                }
              </pre>
            </section>
          </div>
        </details>
      </section>

      <div className="quiet-note device-privacy-note">
        <ShieldCheck size={18} />
        <p>
          Connectorは自分のPC（{DEVICE_URL}
          ）だけで待ち受けます。MCPごとの送信先・機能・引数を確認してから一回だけ実行し、送信後の結果不明時は自動再送しません。
        </p>
      </div>
    </section>
  );
}
