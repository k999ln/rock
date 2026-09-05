'use client';
import { useEffect, useState } from 'react';
import { Play, FolderOpen, Copy } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { deviceToken, runDevice, recordRun } from '@/lib/device';
export function DeliveryRunner() {
  const [connected, setConnected] = useState(false),
    [review, setReview] = useState(''),
    [files, setFiles] = useState<File[]>([]),
    [output, setOutput] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setConnected(!!deviceToken());
    update();
    window.addEventListener('loop-device', update);
    return () => window.removeEventListener('loop-device', update);
  }, []);
  async function run(sample = false) {
    setBusy(true);
    window.dispatchEvent(new CustomEvent('loop-run-state',{detail:'mr-delivery'}));
    setError('');
    setOutput('');
    const started = performance.now();
    let completed = false;
    try {
      let args: Record<string, unknown> = { sample: true };
      if (!sample) {
        if (
          files.length > 120 ||
          files.reduce((n, f) => n + f.size, 0) > 10_000_000
        )
          throw new Error(
            'フォルダは120ファイル・合計10 MB以下にしてください。',
          );
        const entries = [];
        for (const f of files) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const relative = f.webkitRelativePath;
          entries.push({
            path: relative ? relative.slice(relative.indexOf('/') + 1) : f.name,
            base64: btoa(binary),
          });
        }
        args = { review: JSON.parse(review), files: entries };
      }
      const result = await runDevice('verify_delivery', args);
      completed = true;
      setOutput(result.output);
      await recordRun('mr-delivery', 'local-mcp', 'completed', started, sample);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力を確認してください。');
      if (!completed)
        try {
          await recordRun(
            'mr-delivery',
            'local-mcp',
            'failed',
            started,
            sample,
          );
        } catch {}
    } finally {
      setBusy(false);
      window.dispatchEvent(new CustomEvent('loop-run-state',{detail:''}));
    }
  }
  return (
    <section className="mr-workbench">
      <fieldset disabled={busy}>
        <div className="bench-heading">
          <h3>PCで納品記録を照合</h3>
          <span className="outline-tag">
            {connected ? 'PC · MCP接続中' : 'PC接続が必要'}
          </span>
        </div>
        <p className="subnote">
          契約条件・成果物・制作記録・別の担当によるレビューを照合します。処理後、一時コピーは自動で消去します。
        </p>
        {!connected && (
          <p className="notice">
            「PC・MCP接続」タブでこのPCを接続してください。一度つなぐと、ここからワンボタンで実行できます。
          </p>
        )}
        <label htmlFor="delivery-review" className="bench-field">
          <span>
            レビューJSON（execution_receipt / reviewer_context_id / review）
          </span>
          <Textarea
            id="delivery-review"
            value={review}
            maxLength={1000000}
            rows={5}
            onChange={(e) => {
              setReview(e.target.value);
              setOutput('');
            }}
            placeholder="レビュー記録のJSONを貼り付ける"
          />
        </label>
        <label className="folder-picker">
          <FolderOpen size={20} />
          <span>成果物・requirements・receiptsを含む作業フォルダを選ぶ</span>
          <input
            type="file"
            multiple
            {...({ webkitdirectory: '' } as Record<string, string>)}
            onChange={(e) => {
              setFiles(Array.from(e.target.files || []));
              setOutput('');
            }}
          />
        </label>
        <p className="subnote">
          {files.length
            ? `${files.length}ファイルを選択 / 合計 ${(files.reduce((n, f) => n + f.size, 0) / 1000).toFixed(1)} KB`
            : '選択したフォルダ内だけをPC接続アプリに渡します。合計10 MBまで。'}
        </p>
        <div className="dialog-actions">
          <button
            className="black-button"
            disabled={!connected || busy || !review || !files.length}
            onClick={() => void run()}
          >
            <Play size={16} />
            {busy ? 'PCで照合中…' : 'PCで実行する'}
          </button>
          <button
            className="secondary-button"
            disabled={!connected || busy}
            onClick={() => void run(true)}
          >
            サンプルをワンボタンで試す
          </button>
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {output && (
          <div className="bench-output" aria-live="polite">
            <div className="bench-heading">
              <h3>PCから結果が届きました</h3>
              <button
                className="text-link"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(output)
                    .catch(() =>
                      setError(
                        'コピーできませんでした。結果欄から選択してください。',
                      ),
                    )
                }
              >
                <Copy size={15} />
                コピー
              </button>
            </div>
            <Textarea
              readOnly
              rows={10}
              aria-label="納品記録の照合結果"
              value={output}
            />
            <p className="subnote">
              PASSは記録が整合したという照合結果です。納品内容の品質・受注・送信許可を保証せず、納品送信も行いません。
            </p>
          </div>
        )}
      </fieldset>
    </section>
  );
}
