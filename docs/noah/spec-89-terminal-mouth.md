# 仕様書 89 — ターミナルの口（端末で動かす配布: MCP の package・ACP）

task: [codex/tasks/89-noah-terminal-mouth.md](../../codex/tasks/89-noah-terminal-mouth.md)。先に要る物: 84（検査）、85（候補）。動かす所は専用の端末（今は本人の Mac の隔離環境。雲は 75 の後）。
型契約: [noah-intake-v1.ts](../contracts/noah-intake-v1.ts) の `draftFromRegistry`・`draftFromAcp`、[noah-mouth-v1.ts](../contracts/noah-mouth-v1.ts) の `noahLaunchPlan`。試験: [noah-intake.test.mjs](../design-validation/noah/noah-intake.test.mjs)、[noah-mouth.test.mjs](../design-validation/noah/noah-mouth.test.mjs) の「起動の型紙」。

**この仕様は、他の 7 本より確かめが浅い。** 命令の並びを作る所までは動かして確かめたが、配布を実際に導入して動かす確認はしていない（設計の検証で、外の package を実行しないため）。6 章の「確かめていない事」を、この task の最初にやる。

## 1. 完成の姿

- 公式台帳の「端末で動かす配布」（18,158 件）と、ACP の台帳の Agent（46 件）が、**Agent ごとのコードを足さずに**、専用の端末の隔離環境で動く。
- 動かすのは、Noah が中身を固定した版だけ。台帳の説明文や README から命令を作らない。
- 画面も、本人のファイルも、鍵も、隔離環境の中に無い（84 の検査が通る）。

## 2. この仕様で決めた事

| 決めた事 | 理由（公式台帳の有効な 66,608 件を参照実装に通した実測） |
| --- | --- |
| 起動は、口ごとの固定の型紙。使うのは、台帳の型の付いた項目（識別子・版・引数・環境変数の名前）だけ | 説明文を実行コードにしない決まり（`lib/noah-execution-contract.mjs`）。説明と題名を変えても下書きが変わらない事を、試験が確かめている |
| 中身の固定は、**取り込みの時に Noah が行う** | npm と PyPI は版が 1 つに決まっている（22,303/22,310）が、中身の hash は台帳に無い。OCI は 1,759 件のうち hash で固定されているのが 11 件だけ |
| 台帳の「実行器への引数」（`runtimeArguments`）は、そのまま渡さない。型紙の中の意味へ読み替えられる物だけを使う | 実物には `docker` の `-v`・`--mount`（本人のフォルダ）、`--network`、`--user`、`--privileged` 相当が含まれる。隔離の引数は Noah が決める |
| 読み替える書き方は 5 つ（4.2）。それ以外の必須の引数は「つなげない」 | 実行器への引数を持つ配布は 1,501 件。この 5 つで読めずに落ちるのは 22 件 |
| 本人の端末のファイルや mount が必須の配布は、つなげない | 199 件。隔離環境に本人のファイルは無い |
| 通信先は、台帳に宣言が無い。最初は全部閉じて動かし、求めた host を記録して、本人に確かめる | 配布の多くは、自社の API を呼ぶ包み。台帳の記録は通信先を書かない |
| MCP の package は、最初は「入力欄で頼む」（87 の `form`）だけ。「1 文で頼む」は後 | 道具を選ぶモデルと、端末の中の道具をつなぐ経路（中継 → 端末）が、もう 1 段要る |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `lib/noah-intake-pin.ts` | 無い | 新規。4.1 の固定。`pinDue()` を 85 の `sync()` から呼ぶ（1 回の呼び出しで 8 件まで） |
| `lib/noah-launch-plan.ts` | 無い | 型契約から `noahLaunchPlan` を移す |
| `scripts/noah-package-runtime.mjs` | 無い | 新規。端末の側。型紙のとおりに、導入・確かめ・起動・標準入出力のやり取りを行う（5 章）。`scripts/noah-terminal-runtime.mjs` と同じ隔離の引数を使う |
| `scripts/noah-mac-runner.mjs` | `payload.pin.kind` が `catalog`・`upload`・`release` の命令を実行する | `payload.pin.kind === 'package'` の分岐を足し、上の runtime を呼ぶ。今ある分岐は変えない |
| `lib/noah-instances.ts` の `NoahAgentPin` | `kind: 'upload' ｜ 'release' ｜ 'catalog' ｜ 'invite'` | `'package'` を足す（取り込んだ配布）。`agentId` は候補の ID、`digest` は `connect_sha256` |
| `lib/noah-launch.ts` の `binding()` | `kind` が `catalog`・`upload`・`release` 以外は 422 | `package` を足す。`noah_intake_checks` から接続要件を読み、`integrity` が null なら 409「中身を確かめている途中です。」 |
| `noah_runner_commands` | `kind` は `connect`・`run`（CHECK） | **表は変えない。** 道具の名前と入力は、`run` の `payload` に `call: { tool, input }` として入れる |
| 今の 13 件の実行器（`scripts/noah-*-runtime.mjs`） | Goose・Cline・OpenHands・Codex ほか | **消さない。** ACP に対応する 4 件を、この口でも動かして、同じ成果になるかを比べる（合格条件にはしない） |

## 4. 規則

### 4.1 中身の固定（取り込みの後、握手の前。読むだけ）

| 配布 | 読む所 | `integrity` に入れる値 | 実物の例（2026-11-20 に読んだ値） |
| --- | --- | --- | --- |
| npm | `GET https://registry.npmjs.org/<名前>/<版>` の `dist.integrity` | `sha512-…==` | `@modelcontextprotocol/server-memory@2.2.1` → `sha512-MMk597vx…T4iUTYI8A==`。bin は `mcp-server-memory`（package の名前と違う） |
| PyPI | `GET https://pypi.org/pypi/<名前>/<版>/json` の `urls[]`。`py3-none-any` の wheel があればそれ、無ければ sdist の `digests.sha256` | `sha256:…` | — |
| OCI | `HEAD https://<registry>/v2/<path>/manifests/<tag>`（`Accept` に manifest と index の型）。応答の `Docker-Content-Digest`。docker.io は、先に `https://auth.docker.io/token?service=registry.docker.io&scope=repository:<path>:pull` で読み取り用の token を取る | `sha256:…` | — |
| binary（ACP） | 台帳の `sha256` | `sha256:…` | `amp-acp` の `linux-aarch64` の archive |

固定できたら、候補の接続要件の `target.integrity` を書き換え、`connect_sha256` を計算し直す。固定できない（404、形が違う）候補は `unsupported`（理由 `bad_identifier`）。tag の指す中身が後で変わっても、Noah が動かすのは固定した hash の物。次の巡回で版が上がった時に、固定し直す（接続している本人には、`diffNoahConnect` が「差なし」なら自動で入る）。

### 4.2 台帳の引数の読み方（`draftFromRegistry`。正本は型契約）

実行器への引数（`runtimeArguments`）を、語の並びに直してから読む。

| # | 台帳の書き方 | 読み方 | 当てはまる配布の数（実行器への引数を持つ 1,501 件のうち。重なりあり） |
| --- | --- | --- | --- |
| 1 | npm: `-y`、`--yes`、package 自身の名前 | 捨てる（型紙が持っている） | 225 |
| 2 | npm: `-p`（`--package`）＋ package 自身 ＋ 語 | その語を、起動する bin の名前にする | 41 |
| 3 | npm・PyPI: 語 1 つ（`mcp`、`serve` など）や `--stdio`・`--mcp` | package への引数にする。PyPI で、package の名前で始まる別の語なら、bin の名前にする | 134 |
| 4 | PyPI: `--from <名前>[extras]`（`==版` 付きも可）。続く語、または package への最初の位置引数が package の名前で始まれば、それが bin の名前 | extras と bin の名前にする | 241 |
| 5 | OCI: `--rm`、`-i`、`--network`、`--user`、`-e` など | 全部捨てる（隔離の引数は Noah が決める）。`-v`・`--volume`・`--mount` が必須なら「つなげない」 | 776（うち、mount が必須で「つなげない」81） |
| — | それ以外で必須の物 | 「つなげない」（`needs_runtime_arguments`） | 22（最初に選ばれた配布では 20） |
| — | それ以外で任意の物 | 使わない（`--with`・`--python` など。握手が通らなければ、L1 が付かないだけ） | 174 |

package への引数（`packageArguments`）:

| 台帳の書き方 | 読み方 |
| --- | --- |
| 位置引数で、固定の値 | そのまま渡す（`[A-Za-z0-9@%_+=:,./-]` だけ。200 文字まで） |
| 名前付きで、固定の値 | 名前（`--…`）と値を渡す |
| 名前付きで、値が無く、任意 | 付けない |
| 必須で、値が無いか、差し込み（`{…}`） | 本人の入力が要る（`secrets` に「引数 <名前>」。印は「準備が必要」）。116 件 |
| 必須で、`format: filepath` | 「つなげない」（`needs_host_file`） |

環境変数: 必須で秘密、または固定の値が無い物 → 名前を `env` と `secrets` へ（値は Broker が入れる。鍵の入力は別の task）。必須で、秘密でない固定の値がある物 → `fixedEnv`。任意の物は使わない。名前が `[A-Za-z_][A-Za-z0-9_]*` でない必須の変数があれば「つなげない」（2 件）。

### 4.3 起動の型紙（`noahLaunchPlan`。argv の並び。shell を通さない）

| 配布 | 導入の時だけ開ける host | 導入 | 確かめ | 実行 |
| --- | --- | --- | --- | --- |
| npm | `registry.npmjs.org` | `npm install --prefix /opt/agent --no-audit --no-fund --no-update-notifier <名前>@<版>` | `/opt/agent/node_modules/.package-lock.json` の、その package の `integrity` が、固定した値と同じ | `npm exec --prefix /opt/agent --offline --no -- <bin か名前> <引数…>` |
| PyPI | `pypi.org`、`files.pythonhosted.org` | `uv pip compile --generate-hashes`（標準入力へ `<名前>[extras]==<版>`）→ `uv venv` → `uv pip sync --require-hashes` | 作った `requirements.txt` の、その package の hash の中に、固定した値がある | `/opt/agent/venv/bin/<bin か名前> <引数…>` |
| OCI | docker.io は `registry-1.docker.io`・`auth.docker.io`・`production.cloudflare.docker.com`。ghcr.io は `ghcr.io`・`pkg-containers.githubusercontent.com`。それ以外の registry は未対応 | `docker pull <名前>@<hash>` | 取れた image の hash | image そのものを、84 の隔離の引数で起動する（tag でなく hash で指す） |
| binary | archive の host と、GitHub の配布の host | 取って、`sha256` を確かめて、展開する | ファイルの `sha256` | `/opt/agent/<cmd> <引数…>` |

- 導入の時だけ、上の host への通信を開ける。実行の時は、接続要件の `egress`（最初は空）だけ。
- 導入した物は、層として保存する（Mac では、固定の hash を持つ image。雲では 75 の backup）。2 回目からは導入しない。層の hash を端末に記録し、違う物を実行しない。
- 環境変数は、`fixedEnv` と、Broker が持つ値だけを入れる。`DISPLAY` などは、今の `terminalContainerArgs` と同じく空で上書きする。

## 5. 端末でのやり取り

**接続**（`connect` の命令）: 導入 → 確かめ → 起動 → 標準入出力で握手（`initialize` → `notifications/initialized` → `tools/list`。1 行に 1 つの JSON）→ 止める。命令の `result` に `{ message, toolsSha256, toolCount, readOnly }` を入れる（道具の定義の hash の作り方は、リモートの口と同じ `noahToolsSha256`）。握手が 20 秒で通らなければ `failed`（「この配布は、端末で起動できませんでした。」）。

**頼む**（`run` の命令、`payload.call`）: 起動 → 握手 → 定義の hash が接続の時と同じかを確かめる → `tools/call` を 1 回 → 成果を今の `finish` の形（`result.text`、`exitCode: 0`）で返す → 止める。上限は今の `LIMITS`（240 秒、成果 131,072 bytes）。

**ACP の Agent**: 起動の型紙は同じ。やり取りは ACP（標準入出力の JSON-RPC。`initialize` → `session/new` → `session/prompt`。進み具合は `session/update` の通知、止めるのは `session/cancel`）。依頼は `run` の `payload.prompt`（今と同じ）。成果は、最後の応答の文と、作業領域にできたファイル（今の `LIMITS.files` の 12 個まで）。ACP の Agent は、提供元のモデルに固定の物が多いので、接続要件は `model.use='own_account'`・`places=['home']` にしてある（本人の契約のログインは、家の端末にだけ置く）。

**通信先**: 隔離環境の外向きの通信は閉じたまま動かす。package が外へつなごうとして失敗した host の名前を、端末が記録して `result` に入れる（取り方は 6 章）。接続の画面で「この Agent は <host> へ通信します。許可しますか」と 1 回聞き、許した host を `noah_connections.egress_granted_json` に入れる。次の実行から、その host だけを開ける。

## 6. 確かめていない事（この task の最初にやる）

| 事 | 確かめ方 | 駄目だった時 |
| --- | --- | --- |
| `npm exec --prefix … --offline --no -- <名前>` が、導入済みの package の bin を、通信なしで起動する | 隔離環境の中で、bin の名前が package の名前と違う物（例 `@modelcontextprotocol/server-memory`）と、bin が 2 つある物で試す | `node_modules/<名前>/package.json` の `bin` を読み、`node <そのファイル>` で起動する型紙に変える |
| `uv pip compile --generate-hashes` → `uv pip sync --require-hashes` が、registry だけへの通信で通る | extras のある物と無い物で試す | `pip download --no-deps` で本体だけを確かめ、依存は層の hash で固定する |
| 導入の時だけ、決めた host へ通信を開ける方法 | 隔離の VM の中に、host の名前で絞る中継（CONNECT だけを通す proxy）を置き、導入用の container をその中継だけにつなぐ。実行用の container は今のまま `--network none` | 導入を、通信のある別の VM で行い、層だけを隔離の VM へ運ぶ |
| 外へつなごうとした host の名前の記録 | 上の中継が、拒否した `CONNECT` の宛先を記録する。実行の時も、中継だけにつないで全部拒否する形にする（`--network none` だと、名前を引く所で落ちて、host が分からない） | 通信先を聞かず、「この Agent は、外への通信が要るので動きません」と出す |
| OCI の image が、root 以外・読み取り専用・権限なしで起動する割合 | 握手まで通った数を数える | 通らない image は L1 が付かない（そのまま） |
| 配布 20 件での握手の成功率 | 鍵の要らない npm 10 件・PyPI 10 件 | 落ちた理由を分けて、4.2 の読み方へ戻す |

## 7. 実測（参照実装に全件を通した結果）

端末で動かす配布として下書きができた 18,158 件: npm 12,671（入力なし 9,823、準備が必要 2,848）、PyPI 4,748（3,881、867）、OCI 739（428、311）。準備が必要の中身は、環境変数の鍵 5,589 個、引数 116 個。

下書きができなかった物のうち、この口に関わる物: 型紙の無い配布（mcpb 1,400 余り・cargo・nuget）1,654、本人の端末のファイルが必須 199、実行器への必須の引数が型紙の外 20、引数の形 7、版が 1 つに決まらない 6、環境変数の名前の形 2。

ACP の台帳 46 件の配布: npx 23、binary 24、uvx 2（重なりあり）。全部に Linux の配布がある。

## 8. 試験

| 試験 | 中身 | 今の状態 |
| --- | --- | --- |
| 台帳の読み方（移す） | 実記録 25 件＋合成 7 件。`--from` と bin の名前、`--package`、副コマンド、`--python`、OCI の tag、mount が必須、mcpb、`latest`、識別子と引数への記号の混入 | 通過 |
| 起動の型紙（移す） | npm・PyPI・OCI・binary の argv。固定の無い物を拒否。未対応の registry を拒否。argv に shell の記号が無い | 通過 |
| 中身の固定（足す）`tests/noah-intake-pin.test.mjs` | 試験用の fetcher が、npm・PyPI・OCI の応答を返す | `integrity` が入り、`connect_sha256` が変わる。404 は `unsupported` |
| 端末のやり取り（足す）`tests/noah-package-runtime.test.mjs` | 標準入出力で MCP を話す試験用の小さな program を、型紙の代わりに起動する | 握手・一覧・1 回の呼び出し・定義の hash の不一致で止まる・20 秒で諦める |
| 84 の検査 | 新しい runtime の起動引数 | 違反 0 |
| 実物（手で） | 6 章の表 | PR 本文に結果を書く |

## 9. 完了の定義

- 6 章の表の全部に、結果（通った／型紙を変えた／諦めた）が書いてある。
- ACP の台帳から選んだ 3 件と、鍵の要らない package 20 件が、Agent ごとのコードを足さずに、本人の Mac の隔離環境で握手まで通る。通った数と、落ちた理由を PR 本文に書く。
- 導入の後、registry への通信が閉じている。宣言していない host への通信が拒否される。
- `node scripts/check-noah-screenless.mjs`、`npm run typecheck`、`npm run lint:product`。今の 13 件の受入（`scripts/check-noah-agent-execution.mjs` など）が変わらず通る。
