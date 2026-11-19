# Noah — 1 クリック接続（接続要件・接続計画・Passport）

- 本人が言う一言: 「タップして『接続』を押すと接続される」（10-07）「ワンクリックで接続がされるように工夫してほしい」「登録が面倒でユーザーが離れる」（11-20）
- Goal（Eveが作る）: 目的＝カードの「接続」1 回で、最初の成果まで進める / 入力＝Agent の版、本人の今の状態 / 期待成果＝Connection Passport、「頼む」に変わったカード、見本の成果 / 予算上限＝無料枠、または本人の月の上限 / 要る権限＝その版が宣言した権限だけ
- Noaがつなぐもの: 接続要件 `noah-connect/1`（新規の sidecar）、`noah_instances`、`sky_connections`、`sky_provider_connections`、`authorizedNoahRelease`、実行先（クラウド・runner・提供者）、`rockstar-account` の `returnTo`
- AMCの工程:
  1. 計画（担当: Noa）— 合格条件: 接続計画が `blocked` でない。
  2. 本人確認（担当: Broker）— 合格条件: サインイン済み。未サインインは、その場のパスキーの後に同じ操作 ID で続ける。
  3. 利用権（担当: Wallet）— 合格条件: 作者本人・無料・試用の残りあり・支払い済みのどれか。
  4. 実行先の準備（担当: Work）— 合格条件: 選んだ場所で固定版の準備が終わる。
  5. 疎通（担当: Jev）— 合格条件: nonce 付きの往復が期限内に返る。
  6. Passport の保存（担当: Broker）— 合格条件: 版・場所・権限・料金・同意の版を固定して保存する。
  7. 見本の実行（担当: Work）— 合格条件: 見本の入力がある時、成果が Work に残る。
- Jevの合格条件: 全段が自動の状態からの操作 1 回。計画が「1 クリック」と返した接続の、条件不足による失敗 0 件。未購入・返金済み・審査失効・撤回済みの版での新規接続 0 件。別 owner の取得・停止 0 件。同じ操作 ID の接続 1 回以下。疎通前の「接続済み」表示 0 件。接続後の実行先の無断変更 0 件。
- 出力先: スマホ（カード、接続のシート）。Pro・mii でも同じ契約。phone でも可。
- Wallet: 接続そのものは 0 円。有料は [noah-agent-purchase.md](noah-agent-purchase.md)。新しい課金型は作らない。
- hardware profile 依存: 全部。実行先の候補だけが profile で変わる。
- 失敗時: 足りない段を 1 つだけ見せて止める（終わった段はやり直さない）。疎通の失敗は「未接続」へ戻し、入力を保持する。結果不明は同じ操作 ID で照合し、自動で再接続しない。
- 記録: Passport に、owner、Agent の系列と版 hash、接続要件の hash、実行先、権限と同意の版、料金条件、疎通の時刻と秒数、接続の手数。鍵と本文は残さない。

## 接続要件 `noah-connect/1`

公開仕様の版ごとに 1 つ。Eve のビルドが下書きし、作者が確かめ、審査が接続試験の観測と照合する。`sky-tool-package/1` の中には入れず、Package の hash を指す sidecar にする。未知の項目は拒否し、秘密値は書けない。

```json
{
  "schema": "noah-connect/1",
  "packageKey": "example.summarizer@1.2.0",
  "manifestSha256": "<64 hex>",
  "places": ["cloud", "mac", "pixel"],
  "codeDelivery": "cloud_only",
  "model": { "use": "relay", "needs": ["text"], "minContextTokens": 4000 },
  "egress": ["api.github.com"],
  "services": [{ "id": "github", "method": "oauth", "required": true, "purpose": "リポジトリを読む" }],
  "secrets": [],
  "uses": ["sky.citations@1.0.0"],
  "try": { "input": "この記事の出典を整理して" }
}
```

| 項目 | 値 |
| --- | --- |
| `places` | `cloud` / `provider` / `mac` / `pixel` |
| `codeDelivery` | `cloud_only`（コードを利用者へ渡さない）/ `device_allowed` |
| `model.use` | `relay`（host が渡す）/ `none` / `provider`（提供者側で動く） |
| `services[].method` | `oauth` / `official_login` / `none` |
| `secrets` | 利用者が貼る鍵の名前。1 つでもあれば「準備が必要」になる |
| `uses` | 一緒につなぐ他の Agent・Tool の packageKey |

権限は Package の `capabilities.permissions` を正本にし、ここへ重ねて書かない。

## 接続計画（純関数 `planNoahConnection`）

入力は、接続要件、本人の状態（サインイン、利用権、端末、接続済みのサービス、同意済みの版、支払い方法の有無、実行先の希望）。出力は次の形。権限も利用権も与えない。

```json
{ "badge": "one_click", "cost": { "taps": 0, "typed": 0 }, "place": "cloud",
  "steps": [{ "kind": "entitlement", "fill": "auto", "state": "satisfied" }] }
```

- `fill`: `auto` / `tap` / `typed`。`state`: `satisfied` / `needed` / `blocked`。
- `badge`: `one_click`（taps 0・typed 0）/ `taps`（typed 0）/ `setup`（typed 1 以上）/ `blocked`。
- 段の順は固定: account → entitlement → place → runtime → model → services → secrets → consent。
- 実行先: 本人の希望（おまかせ / 自分の端末だけ / クラウドだけ）で絞り、手数が最も少ない場所を選ぶ。同じなら cloud → provider → 今使っている端末 → 他の端末。
- consent: 権限が `read_user_input`・`write_results` だけで無料なら `auto`（接続のクリックが同意）。それ以外は `tap`。外部への書き込みと金融の実行前確認（Broker）は別に残る。

## API

- `GET /api/noah/connect-plan?agent=<id>&digest=<版>`: 計画を返す。未サインインでも返す（本人の状態なし）。書き込まない。
- `POST /api/noah/connect`: `{ id, agentId, digest, planSha256, place? }`。同一 Origin と ownerScope が必須。見た計画と今の計画が違えば 409 と新しい計画。同じ `id` の再送は同じ結果。
- `POST /api/noah/connect/[id]`: `{ action: "disconnect" | "change_place", revision }`。
- 状態: `planned → entitling → preparing → probing → connected`。不足は `needs_action`、不可は `blocked`、失敗は `failed`、不明は `unknown`。
- 既存の `/api/noah/launch`（connect / run / stop / revoke）と `/api/noah/instances` は変えない。新しい API は内側でこれらを呼ぶ。

## 計画の試験（最低限）

| 状態 | 期待 |
| --- | --- |
| サインイン済み、無料、cloud 可、権限は入力と成果だけ | `one_click`、place=cloud |
| 未サインイン、他は同じ | taps 1（account） |
| 有料、支払い方法あり、試用の残り 0 | taps 1（entitlement） |
| 有料、支払い方法なし、試用の残りあり | `one_click` |
| 有料、支払い方法なし、試用の残り 0 | `setup`（typed 1） |
| services に未接続の oauth が 1 つ | taps 1。接続済みなら auto |
| secrets が 1 つ | `setup` |
| places=[mac]、端末なし | `setup`（place） |
| places=[mac]、応答中の Mac あり | `one_click`、place=その Mac |
| 審査失効・撤回 | `blocked` |
| 希望が「自分の端末だけ」、places=[cloud] | `blocked`（希望と合わない） |
