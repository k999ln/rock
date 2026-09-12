'use client';
import { useEffect, useState } from 'react';
import { Check, Cable, Download, Terminal, Unplug } from 'lucide-react';
import {
  connectDevice,
  deviceToken,
  disconnectDevice,
  DEVICE_URL,
} from '@/lib/device';
export function DeviceConnection() {
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setConnected(!!deviceToken());
    update();
    window.addEventListener('loop-device', update);
    return () => window.removeEventListener('loop-device', update);
  }, []);
  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      const connection = await connectDevice();
      setConnected(true);
      setMessage(
        `PCで使える${connection.toolCount}件の機能を確認しました。ツールの実行ボタンから処理できます。`,
      );
    } catch (cause) {
      setConnected(!!deviceToken());
      setMessage(
        cause instanceof Error && cause.message.startsWith('PC接続アプリを更新')
          ? cause.message
          : 'PCに接続できませんでした。接続アプリが起動しているか確認し、ブラウザにローカルネットワークの許可が出た場合は許可してから再接続してください。',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="device-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE CONNECTION. FOUR TOOLS.</span>
          <h1>つないだら、あとはワンボタン。</h1>
          <p>PCが必要な処理も、接続アプリが自動で引き受けます。</p>
        </div>
        <Cable size={35} />
      </div>
      <div className="fund-columns">
        <section className="panel device-card">
          <Cable size={28} />
          <h2>このサイトとPCをつなぐ</h2>
          <p>
            初回だけ接続アプリを開きます。接続後は、ツールの「実行」を押すだけで同じPC内の処理結果を受け取れます。
          </p>
          <button
            className="black-button"
            disabled={busy}
            onClick={() => void connect()}
          >
            {connected ? <Check size={16} /> : <Cable size={16} />}{' '}
            {busy
              ? '接続を確認中…'
              : connected
                ? '接続を確認する'
                : 'このPCを接続'}
          </button>
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
              接続を解除
            </button>
          )}
          <p className="connection-state">
            <span className={connected ? 'status-dot' : 'offline-dot'} />
            {connected ? 'このタブはPCに接続中' : 'PC未接続'}
          </p>
          {message && <output className="notice">{message}</output>}
          <details>
            <summary>初めて使うPCの準備</summary>
            <ol className="local-steps">
              <li>
                <a
                  href="/toolkits/mr-toolkit.zip"
                  download
                  className="text-link"
                >
                  <Download size={15} />
                  接続アプリをダウンロード
                </a>
              </li>
              <li>
                展開したフォルダの「Rock star接続.command」を開く（macOS /
                Python 3.13以上）。
              </li>
              <li>
                この画面で「このPCを接続」を押す。2回目からも、接続アプリの起動だけで使えます。
              </li>
            </ol>
            <p className="subnote">
              このPCのアプリが動いている間だけ接続できます。OSの自動起動は設定しません。LinuxはPython
              3.10以上が必要です。Windowsでは出典整理のPC実行に未対応です。詳しい対応範囲は同梱READMEで確認してください。
            </p>
          </details>
        </section>
        <section className="panel device-card">
          <Terminal size={28} />
          <h2>Codexから、MCPで使う</h2>
          <p>
            一度MCPに登録すると、Codexが必要なときに自動で起動します。毎回ターミナルにコマンドを貼る必要はありません。
          </p>
          <div className="mcp-tools">
            <span>coconala_check</span>
            <span>format_citations</span>
            <span>make_free_article</span>
            <span>verify_delivery</span>
          </div>
          <div className="prompt-example">
            「Rock starのMCPで、この原稿の出典を整理して」
          </div>
          <p className="subnote">
            Codexの接続状態は、このサイトからは読み取れません。PC接続とCodexのMCP登録は別々に確認します。
          </p>
          <details>
            <summary>別の環境へのMCP登録</summary>
            <p className="subnote">
              無料パックを展開し、CodexのMCP設定に次を追加。パスは展開先に置き換えます。
            </p>
            <pre>
              {
                '[mcp_servers.rock_star_mr]\ncommand = "python3"\nargs = ["/展開先/rock-star-mr-tools/mcp_server.py"]'
              }
            </pre>
          </details>
        </section>
      </div>
      <div className="quiet-note">
        <Cable size={18} />
        <p>
          接続先は自分のPC（{DEVICE_URL}
          ）だけです。原稿やファイルはPC内で処理し、サイトには実行履歴・処理量などのメタデータだけを記録します。利用するブラウザによっては初回の接続許可が必要です。
        </p>
      </div>
    </section>
  );
}
