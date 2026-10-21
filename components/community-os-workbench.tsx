'use client';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { catalog } from '@/lib/catalog';
import { textModelProviders } from '@/lib/llm-providers';
import { skyAgentEvePath } from '@/lib/sky-agent-library';
import {
  communityOsDraft,
  defaultCommunityOsDesign,
  parseCommunityOsManifest,
  type CommunityOsDraft,
} from '@/lib/community-os';
import {
  communityFetch,
  exportCommunityKey,
  forgetCommunityKey,
  importCommunityKey,
  newCommunitySecret,
  prepareCommunityKey,
  saveCommunityKey,
} from '@/lib/community-key-client';
import type { SkyCommunity } from '@/lib/sky-social';
import type { communityOsStore } from '@/lib/community-os-store';
type Preview = Awaited<
  ReturnType<ReturnType<typeof communityOsStore>['edition']>
>;
export function communityDownload(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initial(c: SkyCommunity): CommunityOsDraft {
  return {
    name: c.name.slice(0, 40),
    rules: c.rules || 'お互いのアイデアと作品を尊重する。',
    postMode: 'members',
    design: defaultCommunityOsDesign,
    llm: { provider: 'ollama', model: 'qwen2.5:1.5b' },
    agents: [],
  };
}
export default function CommunityOsWorkbench({
  community,
  onChanged,
  initialVersion = 0,
}: {
  community: SkyCommunity;
  onChanged: () => void;
  initialVersion?: number;
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [draft, setDraft] = useState(() => initial(community)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [approved, setApproved] = useState(false),
    [recovery, setRecovery] = useState('');
  const id = community.id;
  const load = useCallback(
    async (version = 0) => {
      if (!community.unlocked) return;
      try {
        const v = await communityFetch<Preview>(
          `/api/sky/community-os?${new URLSearchParams({ community: id, version: String(version) })}`,
        );
        setPreview(v);
        if (v.edition) {
          const {
            schema: _schema,
            communityId: _community,
            version: _version,
            ...value
          } = v.edition.manifest;
          setDraft(value);
        }
        setApproved(false);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : '読み込めませんでした。');
      }
    },
    [id, community.unlocked],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => void load(initialVersion));
    return () => cancelAnimationFrame(frame);
  }, [load, initialVersion]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  async function publish(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    await action(async () => {
      await communityFetch('/api/sky/community-os', {
        action: 'publish',
        communityId: id,
        expectedVersion: preview?.versions[0]?.version ?? 0,
        draft: communityOsDraft(draft),
      });
      setNotice(
        '新しいOS構成を共有しました。既存の利用者には自動適用しません。',
      );
      await load();
      onChanged();
    });
  }
  async function apply() {
    await action(async () => {
      if (!preview?.edition || !approved) return;
      await communityFetch('/api/sky/community-os', {
        action: 'apply',
        communityId: id,
        version: preview.edition.manifest.version,
        digest: preview.edition.digest,
        revision: preview.installed?.revision ?? 0,
        expectedActive: preview.activeId,
        approve: true,
      });
      window.dispatchEvent(new Event('rockstar-community-changed'));
      window.dispatchEvent(new Event('sky-agents-changed'));
      setNotice('このOSを追加しました。標準LLMとAgentをEveで使えます。');
      await load(preview.edition.manifest.version);
    });
  }
  async function share() {
    await action(async () => {
      if (!preview?.edition) return;
      await communityFetch('/api/sky/social', {
        action: 'post',
        id: crypto.randomUUID(),
        communityId: id,
        content: `「${preview.edition.manifest.name}」v${preview.edition.manifest.version}を共有しました。内容を確認して自分のOSに追加できます。`,
        attachment: {
          kind: 'community-os',
          resource: `${id}:${preview.edition.manifest.version}`,
        },
      });
      setNotice('コミュニティーのタイムラインに共有しました。');
      onChanged();
    });
  }
  function keyImport(file: File | undefined) {
    if (!file) return;
    void action(async () => {
      if (file.size > 4096) throw new Error('鍵ファイルが大きすぎます。');
      importCommunityKey(await file.text());
      onChanged();
      setNotice('この端末に専用鍵を読み込みました。');
    });
  }
  return (
    <section className="community-os-workbench" aria-label="コミュニティーOS">
      <header>
        <span>YOUR COMMUNITY OS</span>
        <h3>{community.name}のOS</h3>
        <p>見た目も、ルールも、使うSIも。自分たちの構成を作って追加する。</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      <details className="community-key-controls" open={!community.unlocked}>
        <summary>専用鍵と端末の管理</summary>
        <p>
          アカウントと専用鍵の両方で入ります。自分の鍵ファイルは他人に共有せず、別の自分の端末へ移す時に使います。
        </p>
        <label>
          自分の専用鍵ファイルを読み込む
          <input
            type="file"
            accept=".json,.rockkey,application/json"
            onChange={(e) => keyImport(e.target.files?.[0])}
          />
        </label>
        {community.unlocked && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                try {
                  communityDownload(exportCommunityKey(id), `${id}.rockkey`);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : '書出しできません。',
                  );
                }
              }}
            >
              自分の鍵をバックアップ
            </button>
            <button
              disabled={busy}
              onClick={() => {
                forgetCommunityKey(id);
                onChanged();
              }}
            >
              この端末の鍵を外す
            </button>
          </>
        )}
        {community.bootstrap && (
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const key = prepareCommunityKey(id, true);
                await communityFetch('/api/sky/social', {
                  action: 'bootstrapKey',
                  id,
                  ...key,
                });
                setNotice(
                  '管理者の専用鍵を発行しました。バックアップしてください。',
                );
                onChanged();
                window.dispatchEvent(new Event('rockstar-community-changed'));
              })
            }
          >
            管理者の専用鍵を初回発行
          </button>
        )}
        {community.owned && !community.unlocked && !community.bootstrap && (
          <>
            <label>
              管理者の復旧鍵
              <input
                type="password"
                autoComplete="off"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                maxLength={64}
              />
            </label>
            <button
              disabled={busy || recovery.length !== 64}
              onClick={() =>
                void action(async () => {
                  const record = {
                    accessKey: newCommunitySecret(),
                    recoveryKey: newCommunitySecret(),
                  };
                  saveCommunityKey(id, record, false);
                  await communityFetch('/api/sky/social', {
                    action: 'recoverKey',
                    id,
                    token: recovery,
                    ...record,
                  });
                  setRecovery('');
                  onChanged();
                  window.dispatchEvent(new Event('rockstar-community-changed'));
                })
              }
            >
              復旧鍵でアクセス鍵を再発行
            </button>
          </>
        )}
      </details>
      {community.owned &&
        community.unlocked &&
        Boolean(preview?.members.length) && (
          <details>
            <summary>メンバーの鍵を管理</summary>
            {preview!.members.map((member) => (
              <div className="community-os-member" key={member.id}>
                <strong>{member.name}</strong>
                <span>
                  {member.revokedAt
                    ? '失効済み'
                    : member.joined
                      ? '参加中'
                      : '退出済み'}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await communityFetch('/api/sky/social', {
                        action: member.revokedAt
                          ? 'allowMember'
                          : 'removeMember',
                        id,
                        targetId: member.id,
                      });
                      await load();
                      onChanged();
                    })
                  }
                >
                  {member.revokedAt
                    ? '招待鍵での再参加を許可'
                    : '鍵を失効して参加を解除'}
                </button>
              </div>
            ))}
          </details>
        )}
      {!community.unlocked ? (
        <p>
          この端末には有効な専用鍵がありません。招待鍵で参加するか、自分の鍵ファイルを読み込んでください。
        </p>
      ) : (
        <>
          {community.owned && (
            <details open={!preview?.edition}>
              <summary>ルール・デザイン・LLM・Agentを編集</summary>
              <form onSubmit={(e) => void publish(e)}>
                <label>
                  OSの名前
                  <input
                    required
                    maxLength={40}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  みんなのルール
                  <textarea
                    required
                    maxLength={500}
                    value={draft.rules}
                    onChange={(e) =>
                      setDraft({ ...draft, rules: e.target.value })
                    }
                  />
                </label>
                <label>
                  投稿できる人
                  <select
                    value={draft.postMode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        postMode: e.target
                          .value as CommunityOsDraft['postMode'],
                      })
                    }
                  >
                    <option value="members">専用鍵を持つ参加者</option>
                    <option value="owner">作成者のみ</option>
                  </select>
                </label>
                <fieldset>
                  <legend>デザイン</legend>
                  <div className="community-os-fields">
                    {(['background', 'foreground', 'accent'] as const).map(
                      (key, i) => (
                        <label key={key}>
                          {['背景', '文字', 'アクセント'][i]}
                          <input
                            type="color"
                            value={draft.design[key]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                design: {
                                  ...draft.design,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          />
                          <input
                            aria-label={`${['背景', '文字', 'アクセント'][i]}カラーコード`}
                            value={draft.design[key]}
                            maxLength={7}
                            pattern="#[a-fA-F0-9]{6}"
                            required
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                design: {
                                  ...draft.design,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      ),
                    )}
                    <label>
                      レイアウト
                      <select
                        value={draft.design.layout}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            design: {
                              ...draft.design,
                              layout: e.target.value as 'stream' | 'cards',
                            },
                          })
                        }
                      >
                        <option value="stream">タイムライン</option>
                        <option value="cards">カード</option>
                      </select>
                    </label>
                    <label>
                      かたち
                      <select
                        value={draft.design.corners}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            design: {
                              ...draft.design,
                              corners: e.target.value as 'round' | 'square',
                            },
                          })
                        }
                      >
                        <option value="round">丸く</option>
                        <option value="square">四角く</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>標準LLM</legend>
                  <div className="community-os-fields">
                    <label>
                      接続先
                      <select
                        value={draft.llm.provider}
                        onChange={(e) => {
                          const p = textModelProviders.find(
                            (p) => p.id === e.target.value,
                          )!;
                          setDraft({
                            ...draft,
                            llm: { provider: p.id, model: p.defaultModel },
                          });
                        }}
                      >
                        {textModelProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      モデルID
                      <input
                        required
                        maxLength={120}
                        value={draft.llm.model}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            llm: { ...draft.llm, model: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>追加するAgent（最大6人）</legend>
                  {draft.agents.map((a, index) => (
                    <details key={a.id}>
                      <summary>{a.settings.name}</summary>
                      <label>
                        名前
                        <input
                          required
                          maxLength={80}
                          value={a.settings.name}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              agents: draft.agents.map((x, i) =>
                                i === index
                                  ? {
                                      ...x,
                                      settings: {
                                        ...x.settings,
                                        name: e.target.value,
                                      },
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        役割
                        <textarea
                          required
                          maxLength={600}
                          value={a.settings.instructions}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              agents: draft.agents.map((x, i) =>
                                i === index
                                  ? {
                                      ...x,
                                      settings: {
                                        ...x.settings,
                                        instructions: e.target.value,
                                      },
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        実行するSky Tool
                        <select
                          value={a.sourceTool ?? ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              agents: draft.agents.map((x, i) =>
                                i === index
                                  ? { ...x, sourceTool: e.target.value || null }
                                  : x,
                              ),
                            })
                          }
                        >
                          <option value="">文章・計画を担当</option>
                          {catalog.map((t) => (
                            <option value={t.id} key={t.id}>
                              {t.name} · {t.status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        このAgentのLLM
                        <select
                          value={a.settings.provider}
                          onChange={(e) => {
                            const p = textModelProviders.find(
                              (p) => p.id === e.target.value,
                            )!;
                            setDraft({
                              ...draft,
                              agents: draft.agents.map((x, i) =>
                                i === index
                                  ? {
                                      ...x,
                                      settings: {
                                        ...x.settings,
                                        provider: p.id,
                                        model: p.defaultModel,
                                      },
                                    }
                                  : x,
                              ),
                            });
                          }}
                        >
                          {textModelProviders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        モデルID
                        <input
                          required
                          maxLength={120}
                          value={a.settings.model}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              agents: draft.agents.map((x, i) =>
                                i === index
                                  ? {
                                      ...x,
                                      settings: {
                                        ...x.settings,
                                        model: e.target.value,
                                      },
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            agents: draft.agents.filter((_, i) => i !== index),
                          })
                        }
                      >
                        構成から外す
                      </button>
                    </details>
                  ))}
                  <button
                    type="button"
                    disabled={draft.agents.length >= 6}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        agents: [
                          ...draft.agents,
                          {
                            id: `agent-${crypto.randomUUID().slice(0, 8)}`,
                            sourceTool: null,
                            settings: {
                              name: '新しい担当',
                              instructions:
                                'このコミュニティーの制作を支援してください。',
                              ...draft.llm,
                              enabled: true,
                            },
                          },
                        ],
                      })
                    }
                  >
                    Agentを加える
                  </button>
                </fieldset>
                <div
                  className="community-os-preview"
                  style={{
                    background: draft.design.background,
                    color: draft.design.foreground,
                    borderColor: draft.design.accent,
                    borderRadius: draft.design.corners === 'round' ? 20 : 2,
                  }}
                >
                  <small>DESIGN PREVIEW</small>
                  <h4>{draft.name}</h4>
                  <p>{draft.rules}</p>
                  <span>
                    {draft.llm.model} · Eve＋{draft.agents.length} Agent
                  </span>
                </div>
                <p>
                  共有ファイルには設定だけを入れます。認証鍵・APIキー・会話・請求権限は含めません。
                </p>
                <button disabled={busy}>新しい版を共有する</button>
                <label>
                  OS構成ファイルから編集案を読み込む
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void action(async () => {
                          if (file.size > 64000)
                            throw new Error('構成ファイルは64KBまでです。');
                          const {
                            schema: _schema,
                            communityId: _id,
                            version: _version,
                            ...value
                          } = parseCommunityOsManifest(
                            JSON.parse(await file.text()),
                          );
                          setDraft(value);
                          setNotice(
                            '編集案に読み込みました。確認して共有すると、このコミュニティーの新しい版になります。',
                          );
                        });
                    }}
                  />
                </label>
              </form>
            </details>
          )}
          {preview?.edition ? (
            <div className="community-os-edition">
              <div>
                <strong>{preview.edition.manifest.name}</strong>
                <span>v{preview.edition.manifest.version}</span>
              </div>
              <div
                className="community-os-preview"
                style={{
                  background: preview.edition.manifest.design.background,
                  color: preview.edition.manifest.design.foreground,
                  borderColor: preview.edition.manifest.design.accent,
                  borderRadius:
                    preview.edition.manifest.design.corners === 'round'
                      ? 20
                      : 2,
                }}
              >
                <small>このOSのデザイン</small>
                <h4>{preview.edition.manifest.name}</h4>
                <p>
                  {preview.edition.manifest.design.layout === 'cards'
                    ? 'カード配置'
                    : 'タイムライン配置'}{' '}
                  ·{' '}
                  {preview.edition.manifest.design.corners === 'round'
                    ? '丸い形'
                    : '四角い形'}
                </p>
              </div>
              <label>
                共有された版
                <select
                  value={preview.edition.manifest.version}
                  onChange={(e) => void load(Number(e.target.value))}
                >
                  {preview.versions.map((v) => (
                    <option value={v.version} key={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
              <p className="community-os-rules">
                {preview.edition.manifest.rules}
              </p>
              <p>
                標準LLM: {preview.edition.manifest.llm.provider} /{' '}
                {preview.edition.manifest.llm.model}
              </p>
              <ul>
                {communityOsAgentTemplatesLabel(preview.edition.manifest).map(
                  (s) => (
                    <li key={s}>{s}</li>
                  ),
                )}
              </ul>
              <small>
                追加でモデル本体のダウンロードや有料実行は始まりません。実行先の接続・権限・料金はEveで確認します。
              </small>
              <label className="community-os-approval">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                ルール・見た目・LLM・Agentを確認して、このOSを使う
              </label>
              <div className="community-os-actions">
                <button
                  disabled={busy || !approved}
                  onClick={() => void apply()}
                >
                  このOSを追加して使う
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    communityDownload(
                      JSON.stringify(preview.edition!.manifest, null, 2),
                      `community-os-${id}-v${preview.edition!.manifest.version}.json`,
                    )
                  }
                >
                  構成を書き出す
                </button>
                <button disabled={busy} onClick={() => void share()}>
                  タイムラインに共有
                </button>
              </div>
              {preview.installed && (
                <div>
                  <p>
                    追加済み: v{preview.installed.version} ·{' '}
                    {preview.installed.active ? '使用中' : '保存中'}
                  </p>
                  {preview.installed.agents.map(
                    (r) =>
                      r.agent && (
                        <Link
                          key={r.templateId}
                          href={skyAgentEvePath(r.agent)}
                        >
                          {r.agent.name}をEveで使う →
                        </Link>
                      ),
                  )}
                  {preview.installed.active && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await communityFetch('/api/sky/community-os', {
                            action: 'deactivate',
                            communityId: id,
                            revision: preview.installed!.revision,
                          });
                          window.dispatchEvent(
                            new Event('rockstar-community-changed'),
                          );
                          await load();
                        })
                      }
                    >
                      標準のRockstarOSに戻す
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p>
              まだ共有されたOS構成がありません。作成者が最初の版を共有すると追加できます。
            </p>
          )}
        </>
      )}
    </section>
  );
}
function communityOsAgentTemplatesLabel(manifest: CommunityOsDraft) {
  return [
    '標準Eve',
    ...manifest.agents.map(
      (a) =>
        `${a.settings.name} · ${a.settings.model}${a.sourceTool ? ` · ${a.sourceTool}` : ''}`,
    ),
  ];
}
