'use client';

import { useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  MonitorUp,
  Send,
  ShieldCheck,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import type {
  SkyConnectionType,
  SkyExecutionTarget,
  SkyPermission,
  SkyPricing,
} from '@/lib/sky-submission';
import type { McpInspection } from '@/lib/mcp-inspection';
import { parseProductHuntUrl } from '@/lib/producthunt';

const targets: { value: SkyExecutionTarget; label: string }[] = [
  { value: 'device_local', label: 'RockstarOS端末内' },
  { value: 'pc', label: '利用者のPC' },
  { value: 'cloud', label: '提供者Cloud' },
];
const permissions: { value: SkyPermission; label: string }[] = [
  { value: 'read_user_input', label: '入力を読む' },
  { value: 'write_results', label: '結果を返す' },
  { value: 'network', label: '外部通信' },
  { value: 'external_account', label: '外部アカウント' },
  { value: 'selected_files', label: '本人が選んだファイル' },
  { value: 'long_running', label: '長時間実行' },
  { value: 'financial_action', label: '購入・金融操作' },
];

export default function SkyPublisherForm({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const searchParams = useSearchParams();
  const importedProductUrl = parseProductHuntUrl(
    searchParams.get('productUrl') ?? '',
  );
  const fromProductHunt = searchParams.get('source') === 'producthunt' && !!importedProductUrl;
  const [connectionType, setConnectionType] = useState<SkyConnectionType>(
    'mcp_streamable_http',
  );
  const [selectedTargets, setSelectedTargets] = useState<SkyExecutionTarget[]>([
    'cloud',
  ]);
  const [selectedPermissions, setSelectedPermissions] = useState<
    SkyPermission[]
  >(['read_user_input', 'write_results', 'network']);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [inspection, setInspection] = useState<
    (McpInspection & { endpointUrl: string }) | null
  >(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function toggle<T extends string>(items: T[], item: T, checked: boolean) {
    return checked ? [...items, item] : items.filter((value) => value !== item);
  }

  async function requestInspection(value: string) {
    const response = await fetch('/api/sky/mcp/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpointUrl: value }),
    });
    const result = (await response.json()) as McpInspection & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(result.error || 'MCPの接続を確認できませんでした。');
    const checked = { ...result, endpointUrl: value };
    setInspection(checked);
    return checked;
  }

  async function checkConnection() {
    setChecking(true);
    setError('');
    try {
      await requestInspection(endpointUrl.trim());
    } catch (cause) {
      setInspection(null);
      setError(
        cause instanceof Error
          ? cause.message
          : 'MCPの接続を確認できませんでした。',
      );
    } finally {
      setChecking(false);
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setError('');
    const form = new FormData(event.currentTarget);
    const optional = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() || null : null;
    };
    try {
      const response = await fetch('/api/sky/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name: form.get('name'),
          summary: form.get('summary'),
          providerName: form.get('providerName'),
          version: form.get('version'),
          connectionType,
          endpointUrl: optional('endpointUrl'),
          sourceUrl: optional('sourceUrl'),
          supportUrl: form.get('supportUrl'),
          license: form.get('license'),
          pricing: form.get('pricing') as SkyPricing,
          priceNote: form.get('priceNote'),
          dataUse: form.get('dataUse'),
          executionTargets: selectedTargets,
          permissions: selectedPermissions,
          rightsConfirmed: form.get('rightsConfirmed') === 'on',
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        mcpInspection?: McpInspection | null;
      };
      if (!response.ok)
        throw new Error(result.error || '申請を保存できませんでした。');
      event.currentTarget.reset();
      setEndpointUrl('');
      setInspection(null);
      setMessage(
        result.mcpInspection?.status === 'ready'
          ? `${result.mcpInspection.toolCount}件のMCPツールを確認し、掲載申請を審査キューへ保存しました。`
          : result.mcpInspection?.status === 'auth_required'
            ? '接続先の応答を確認しました。OAuth認証を含む審査後に公開します。'
            : '掲載申請を審査キューへ保存しました。公開や接続は、技術・権利・安全確認の後です。',
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '申請を保存できませんでした。',
      );
    } finally {
      setPending(false);
    }
  }

  const needsEndpoint =
    connectionType === 'mcp_streamable_http' || connectionType === 'https_api';
  const needsSource =
    connectionType === 'mcp_stdio' || connectionType === 'rock_recipe';
  const content = (
    <>
      <div className="sky-publish-heading">
        <div>
          <p className="rock-eyebrow">FOR TOOL PROVIDERS</p>
          <h1>自動化ツールを、Skyへ。</h1>
          <p>
            利用者が判断するための情報だけを入力。遠隔MCPは送信前にSkyが接続とツール一覧を確認します。
          </p>
        </div>
        {!embedded && (
          <Link href="/sky" className="rock-button rock-button-subtle">
            <ArrowLeft size={16} />
            Skyへ戻る
          </Link>
        )}
      </div>
      {fromProductHunt && (
        <div className="sky-producthunt-import sky-producthunt-import-banner">
          <strong>Product Huntから引き継ぎ中</strong>
          <span>
            掲載元URLをセットしました。提供者、接続先、ライセンス、権限を確認してから申請してください。
          </span>
          <a href={importedProductUrl} target="_blank" rel="noreferrer">
            Product Huntで元ページを確認
          </a>
        </div>
      )}
      <div className="sky-publish-layout">
        <form className="sky-publish-form" onSubmit={submit}>
          <Link href="/studio" className="rock-button rock-button-subtle">
            <MonitorUp size={17} />
            PCのコード・GitHub・OpenAPIから登録する
          </Link>
          <fieldset>
            <legend>
              <span>1</span>何を提供するか
            </legend>
            <label>
              ツール名
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="例：請求書チェック"
              />
            </label>
            <label>
              一言でできること
              <textarea
                name="summary"
                required
                minLength={20}
                maxLength={600}
                placeholder="誰の、どんな作業を、どう助けるか"
              />
            </label>
            <div className="sky-form-row">
              <label>
                提供者名
                <input
                  name="providerName"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <label>
                版
                <input
                  name="version"
                  required
                  defaultValue="1.0.0"
                  pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
                />
              </label>
            </div>
            <div className="sky-form-row">
              <label>
                ライセンス・利用規約
                <input
                  name="license"
                  required
                  placeholder="MIT / 商用利用規約など"
                />
              </label>
              <label>
                サポートURL
                <input
                  name="supportUrl"
                  required
                  type="url"
                  placeholder="https://…"
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>
              <span>2</span>どう接続するか
            </legend>
            <label>
              接続方式
              <select
                value={connectionType}
                onChange={(event) => {
                  setConnectionType(event.target.value as SkyConnectionType);
                  setInspection(null);
                }}
              >
                <option value="mcp_streamable_http">
                  MCP / Streamable HTTP
                </option>
                <option value="mcp_stdio">MCP / stdio package</option>
                <option value="rock_recipe">Rock recipe</option>
                <option value="https_api">HTTPS API</option>
              </select>
            </label>
            <label>
              接続先URL
              <input
                name="endpointUrl"
                required={needsEndpoint}
                disabled={!needsEndpoint}
                type="url"
                placeholder="https://example.com/mcp"
                value={endpointUrl}
                onChange={(event) => {
                  setEndpointUrl(event.target.value);
                  setInspection(null);
                }}
              />
              <small>
                認証キーは入力しません。MCP
                OAuthまたは外部の安全な認証画面を使います。
              </small>
            </label>
            {connectionType === 'mcp_streamable_http' && (
              <div className="sky-mcp-check">
                <button
                  type="button"
                  className="rock-button rock-button-subtle"
                  disabled={checking || pending || !endpointUrl.trim()}
                  onClick={() => void checkConnection()}
                >
                  <ShieldCheck size={16} />
                  {checking ? '接続を確認中…' : '接続とツールを確認'}
                </button>
                {inspection && (
                  <output
                    className={
                      inspection.status === 'unreachable'
                        ? 'sky-form-error'
                        : 'sky-form-success'
                    }
                  >
                    <CheckCircle2 size={18} />
                    <span>
                      {inspection.message}
                      {inspection.toolNames.length > 0 && (
                        <small>{inspection.toolNames.join(' · ')}</small>
                      )}
                    </span>
                  </output>
                )}
              </div>
            )}
            <label>
              ソース・配布元URL
              <input
                name="sourceUrl"
                required={needsSource}
                type="url"
                defaultValue={importedProductUrl ?? undefined}
                placeholder="https://github.com/… または package URL"
              />
              <small>
                公開可能な配布元だけを入力してください。秘密鍵やアクセストークンは不要です。
              </small>
            </label>
            <div className="sky-check-group">
              <strong>実行場所</strong>
              {targets.map((item) => (
                <label key={item.value}>
                  <input
                    type="checkbox"
                    checked={selectedTargets.includes(item.value)}
                    onChange={(event) =>
                      setSelectedTargets(
                        toggle(
                          selectedTargets,
                          item.value,
                          event.target.checked,
                        ),
                      )
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <div className="sky-check-group">
              <strong>必要な権限</strong>
              {permissions.map((item) => (
                <label key={item.value}>
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(item.value)}
                    onChange={(event) =>
                      setSelectedPermissions(
                        toggle(
                          selectedPermissions,
                          item.value,
                          event.target.checked,
                        ),
                      )
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>
              <span>3</span>利用条件を伝える
            </legend>
            <div className="sky-form-row">
              <label>
                料金方式
                <select name="pricing" defaultValue="free">
                  <option value="free">無料</option>
                  <option value="subscription">月額・年額</option>
                  <option value="usage">従量</option>
                  <option value="external_contract">外部契約</option>
                </select>
              </label>
              <label>
                料金の説明
                <input
                  name="priceNote"
                  required
                  defaultValue="無料。追加API料金なし。"
                />
              </label>
            </div>
            <label>
              扱うデータ
              <textarea
                name="dataUse"
                required
                minLength={10}
                maxLength={500}
                placeholder="入力、保存、外部送信、保持期間を具体的に"
              />
            </label>
            <label className="sky-rights-check">
              <input name="rightsConfirmed" type="checkbox" required />
              <span>
                このツールを掲載する権限があり、接続・料金・データ利用の記載が正確であることを確認します。
              </span>
            </label>
          </fieldset>
          {message && (
            <output className="sky-form-success">
              <CheckCircle2 size={19} />
              {message}
            </output>
          )}
          {error && <output className="sky-form-error">{error}</output>}
          <button
            className="rock-button rock-button-dark"
            disabled={
              pending ||
              selectedTargets.length === 0 ||
              selectedPermissions.length === 0
            }
          >
            <Send size={17} />
            {pending ? '保存中…' : '審査キューへ送る'}
          </button>
        </form>
        <aside className="sky-publish-review">
          <ShieldCheck size={25} />
          <h2>公開前にSkyが確認すること</h2>
          <ol>
            <li>MCPの初期化と能力一覧</li>
            <li>作者・版・配布元の対応</li>
            <li>権限、送信先、料金の差分</li>
            <li>認証情報をSkyへ直接入力させないこと</li>
            <li>停止、失敗、結果不明時の挙動</li>
          </ol>
          <p>
            申請は即時公開ではありません。危険な権限や未確認の費用は、ToCのタイムラインに「接続待ち」「確認が必要」と表示します。
          </p>
        </aside>
      </div>
    </>
  );
  if (embedded) return <div className="sky-publish-embedded">{content}</div>;
  return <WorkspaceShell title="Skyに掲載">{content}</WorkspaceShell>;
}
