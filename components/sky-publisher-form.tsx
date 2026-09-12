'use client';

import { useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Send, ShieldCheck } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import type {
  SkyConnectionType,
  SkyCodexRole,
  SkyCloudDependency,
  SkyDataResidency,
  SkyExecutionTarget,
  SkyHostOperator,
  SkyPermission,
  SkyPowerClass,
  SkyPricing,
} from '@/lib/sky-submission';

const targets: { value: SkyExecutionTarget; label: string }[] = [
  { value: 'device_local', label: 'RockstarOS端末内' },
  { value: 'pc', label: '利用者のPC' },
  { value: 'self_hosted', label: '利用者の自前サーバー' },
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

export default function SkyPublisherForm() {
  const [connectionType, setConnectionType] = useState<SkyConnectionType>(
    'mcp_streamable_http',
  );
  const [selectedTargets, setSelectedTargets] = useState<SkyExecutionTarget[]>([
    'cloud',
  ]);
  const [primaryTarget, setPrimaryTarget] =
    useState<SkyExecutionTarget>('cloud');
  const [selectedPermissions, setSelectedPermissions] = useState<
    SkyPermission[]
  >(['read_user_input', 'write_results', 'network']);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function toggle<T extends string>(items: T[], item: T, checked: boolean) {
    return checked ? [...items, item] : items.filter((value) => value !== item);
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
          runtimeProfile: {
            primaryTarget,
            hostOperator: form.get('hostOperator') as SkyHostOperator,
            cloudDependency: form.get('cloudDependency') as SkyCloudDependency,
            codexRole: form.get('codexRole') as SkyCodexRole,
            dataResidency: form.get('dataResidency') as SkyDataResidency,
            unattended: form.get('unattended') === 'on',
            offlineCapable: form.get('offlineCapable') === 'on',
            powerClass: form.get('powerClass') as SkyPowerClass,
          },
          permissions: selectedPermissions,
          rightsConfirmed: form.get('rightsConfirmed') === 'on',
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || '申請を保存できませんでした。');
      event.currentTarget.reset();
      setMessage(
        '掲載申請を審査キューへ保存しました。公開や接続は、技術・権利・安全確認の後です。',
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
  return (
    <WorkspaceShell title="Skyに掲載">
      <div className="sky-publish-heading">
        <div>
          <p className="rock-eyebrow">FOR TOOL PROVIDERS</p>
          <h1>自動化ツールを、Skyへ。</h1>
          <p>
            利用者が判断するための情報だけを入力。MCPの能力一覧や認証方式は、申請後にSkyが接続先から取得して照合します。
          </p>
        </div>
        <Link href="/" className="rock-button rock-button-subtle">
          <ArrowLeft size={16} />
          Skyへ戻る
        </Link>
      </div>
      <div className="sky-publish-layout">
        <form className="sky-publish-form" onSubmit={submit}>
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
                onChange={(event) =>
                  setConnectionType(event.target.value as SkyConnectionType)
                }
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
              />
              <small>
                認証キーは入力しません。MCP
                OAuthまたは外部の安全な認証画面を使います。
              </small>
            </label>
            <label>
              ソース・配布元URL
              <input
                name="sourceUrl"
                required={needsSource}
                type="url"
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
                    onChange={(event) => {
                      const next = toggle(
                        selectedTargets,
                        item.value,
                        event.target.checked,
                      );
                      setSelectedTargets(next);
                      if (!next.includes(primaryTarget) && next[0])
                        setPrimaryTarget(next[0]);
                    }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <div className="sky-runtime-declaration">
              <strong>実行パスポート</strong>
              <p>利用者には、この申告とSkyの接続確認を分けて表示します。</p>
              <div className="sky-form-row">
                <label>
                  主に動かす場所
                  <select
                    value={primaryTarget}
                    onChange={(event) =>
                      setPrimaryTarget(event.target.value as SkyExecutionTarget)
                    }
                  >
                    {targets
                      .filter((item) => selectedTargets.includes(item.value))
                      .map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  実行先を管理する人
                  <select name="hostOperator" defaultValue="provider">
                    <option value="rockstaros">RockstarOS</option>
                    <option value="user">利用者本人</option>
                    <option value="provider">ツール提供者</option>
                  </select>
                </label>
              </div>
              <div className="sky-form-row">
                <label>
                  クラウド依存
                  <select name="cloudDependency" defaultValue="required">
                    <option value="none">使わない</option>
                    <option value="optional">機能により任意</option>
                    <option value="required">必須</option>
                  </select>
                </label>
                <label>
                  Codexの役割
                  <select name="codexRole" defaultValue="not_required">
                    <option value="not_required">不要</option>
                    <option value="optional_client">任意の操作窓口</option>
                    <option value="required">必須</option>
                  </select>
                </label>
              </div>
              <div className="sky-form-row">
                <label>
                  データ保存先
                  <select name="dataResidency" defaultValue="provider_cloud">
                    <option value="device">RockstarOS端末</option>
                    <option value="pc">利用者のPC</option>
                    <option value="self_hosted">利用者の自前サーバー</option>
                    <option value="provider_cloud">提供者Cloud</option>
                    <option value="mixed">端末と外部の両方</option>
                  </select>
                </label>
                <label>
                  必要な処理能力
                  <select name="powerClass" defaultValue="standard">
                    <option value="low">小</option>
                    <option value="standard">標準</option>
                    <option value="accelerated">GPU等が必要</option>
                  </select>
                </label>
              </div>
              <div className="sky-check-group">
                <label>
                  <input name="offlineCapable" type="checkbox" />
                  通信なしでも実行可能
                </label>
                <label>
                  <input name="unattended" type="checkbox" />
                  画面を閉じても継続可能
                </label>
              </div>
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
            <li>実行パスポートの申告と実接続の一致</li>
            <li>認証情報をSkyへ直接入力させないこと</li>
            <li>停止、失敗、結果不明時の挙動</li>
          </ol>
          <p>
            申請は即時公開ではありません。危険な権限や未確認の費用は、ToCのタイムラインに「接続待ち」「確認が必要」と表示します。
          </p>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
