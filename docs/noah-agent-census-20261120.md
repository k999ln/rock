# 外にある Agent の実測（2026-11-20）

[Noah の設計](noah-agent-market-design.md) 3 章・4.3 の根拠。読み取りだけの調査で、道具は 1 回も呼んでいない。数字は 2026-11-20 03:30〜04:30（日本時間）の 1 時点。継続して測るのは [task 85・88](../codex/tasks/00-index.md)。

## 1. やったこと・やっていないこと

| やった | やっていない |
| --- | --- |
| 公式台帳の全件取得、握手（`initialize`）と道具の一覧（`tools/list`）、認可の公開情報の取得、Space の状態と定義の取得 | 道具の呼び出し（`tools/call`）、Space の実行、ログイン、package の導入と実行、寝ている Space を起こすこと |

名乗りは `noah-design-census/0.1`。1 接続先への握手は 1 回、再試行なし、待ちは 10 秒まで。

## 2. MCP の公式台帳

`GET https://registry.modelcontextprotocol.io/v0/servers?limit=100&version=latest` を cursor で 678 ページ。

| 項目 | 件数 |
| --- | --- |
| 最新版の記録 | 67,703（有効 66,608、非推奨 1,095） |
| リモートだけ／package だけ／両方／どちらも無し | 40,858／20,253／4,810／687 |
| リモートで呼べる | 45,668（接続先 47,142。Streamable HTTP 45,990、SSE 1,152。host 34,948） |
| package で配る | 25,063（npm 17,307、PyPI 5,392、MCPB 2,433、OCI 1,981、NuGet 183、Cargo 151。標準入出力 26,830） |
| リモートの宣言 | 鍵の宣言なし 37,700、必須の header 4,091、任意の header 3,514、URL に埋める値 363 |
| package の宣言 | 環境変数なし 12,649、任意だけ 7,186、必須あり 5,228（うち秘密の必須 4,660） |
| 提供者（名前空間） | 41,508。1 件だけの提供者 37,778。上位 5 提供者で 8,598（12.9%）、上位 100 で 23.7% |
| 名前空間の種類 | GitHub のログイン 36,570、ドメイン 30,037 |
| リポジトリの記載あり | 42,300 |

公開された月（有効な記録）: 2026-07 に 3,460、08 に 5,518、09 に 9,511、10 に 16,599、11（20 日まで）に 22,401。全体の 58% がこの 50 日で増えた。量産が混じる（1 つの host に 2,365 件を置く提供者がある）。

## 3. リモートの接続先の握手（標本 500 host）

母集団は、有効・HTTPS・Streamable HTTP・必須の header なし・URL に埋める値なしの 31,144 host。host を無作為に 500 選び（seed 20261120）、host ごとに 1 件。

| 結果 | host | 割合 |
| --- | --- | --- |
| 握手が通り、版を返した | 273 | 54.6% |
| 401（許可が要る） | 174 | 34.8% |
| 応答なし・404・402・5xx など | 53 | 10.6% |

握手が通った 273:

- 道具の一覧を返した 262。道具の数は中央値 6、90 パーセンタイル 24、最大 244。定義の大きさは中央値 6.0KB、90 パーセンタイル 38KB。
- 読み取りだけと宣言された道具が 1 つ以上ある 194。全部の道具がそうである 122（標本全体の 24.4%）。
- 握手の時間は中央値 0.54 秒、90 パーセンタイル 1.1 秒。
- 2026-07-28 の `server/discover` に結果を返した 8。

401 の 174:

- 保護された資源の公開情報を出す 167。認可サーバーの公開情報まで辿れた 166。
- 動的登録（DCR）あり 159。client 文書（CIMD）対応 62。どちらかあり 166。PKCE（S256）対応 166。

A2A: 同じ 500 host の `/.well-known/agent-card.json` にカードがあった 39（7.8%）。版は 0.3 系 23、1.0 が 3、記載なし 12、その他 1。署名付き 3。

402 が 4 件あった（呼び出しごとの支払いを求める接続先）。今回の設計では扱っていない。

## 4. Hugging Face の Space

`GET https://huggingface.co/api/spaces?filter=<tag>&limit=1000&expand[]=runtime&expand[]=sdk&expand[]=likes…`

| | `mcp-server` | `agent` |
| --- | --- | --- |
| 件数 | 12,856 | 37,388 |
| 動いている（RUNNING） | 4,331（33.7%） | 273（0.7%） |
| 寝ている（SLEEPING） | 2,755 | 28,167 |
| 実行時エラー | 3,146 | 6,782 |
| 止めてある（PAUSED） | 1,804 | 752 |
| build の失敗 | 772 | 1,406 |
| 同じ名前の最多 | `mcp-sentiment` 1,798 | `first_agent_template` 30,066（80.4%） |
| 名前の種類 | 6,247 | 2,761 |

- 動いている `mcp-server` のうち Gradio は 4,275（ZeroGPU 3,017、無料 CPU 1,269）。名前が重ならないように 200 件を選び、`/gradio_api/mcp/schema` を取得した。道具を 1 つ以上返した 164（82%）。道具の数は中央値 2。応答は中央値 0.2 秒。
- 動いている `agent` の 273 のうち 132 は静的ページ。いいねが 10 以上で動いている物は 5。
- 今の調査台帳にある Hugging Face の「agent」52,432 件は、別の検索条件で集めた物。上と同じく、ほとんどが動いていない教材のコピーと見てよい。

## 5. ACP の台帳

`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`（版 1.0.0）。46 件。配布は npx 23、binary 24、uvx 2 で、46 件全部が Linux で動く。ライセンスは非公開 18、Apache-2.0 15、MIT 11、GPL 系 2。公式の対応一覧は 51 件（うち 5 件は変換の adapter 経由: Claude、Codex CLI など）。

## 6. 調査した 85 件の分類

`data/noah-research-index.json` の kind=agent。GitHub の 46 件は README と manifest（45 件を取得）、Space の 21 件は Hub の API、SaaS の 18 件は公式台帳の検索と公開資料から分類した。**動かしていない。契約条件は確かめていない。**

| 種類 | 件数 | 名前 |
| --- | --- | --- |
| 対応済み | 13 | Anicca、Aider、Cline SDK、Codex、CowAgent、Data Analysis Agent、DeepSeek Harness、Goose、gptme、nanobot、OpenFang、OpenHands SDK、QwenPaw |
| ターミナル型 | 12 | Gemini CLI、Claude Code、Hermes Agent、GPT Researcher、plandex、aideml、NanoResearch、DeepTutor、oh-my-openagent、dexter-jp、makasero、ec-analytics-agent |
| サーバー型 | 5 | DeerFlow、AnythingLLM、JoyAgent-JDGenie、TradingAgents-CN、Lealone（要確認） |
| 常駐・チャット接続型 | 6 | TomoriBot、luna-chat、docgent、nanoclaw、phantom、xiaobei |
| 配備済みのデモ（Space） | 16 | 動いている 7: consilium_mcp、Tongyi-DeepResearch、ehr-navigator-agent、cuga-agent、jupyter-agent、agent-ui、jupyter-agent-2。止めてある 6: agentflow、ShallowCodeResearch、my_pi_agent、Heartsync/open-deep-research、m-ric/open_Deep-Research、V0ID-SHIELD-OPENMANUS。エラー 3: ScouterAI、CoI_Agent、agent-data-analyst |
| 画面やブラウザを操作する型 | 7 | smolagents/computer-agent、computer-use-agent、Fara-BrowserUse、browser-use-webui、my-browser-use-server（以上 Space。全部止まっている）、artemis（Android を操作）、Mika（本人のスマホのアプリを操作） |
| 画面が本体のアプリ | 4 | Cherry Studio、DeepWrite、OpenHuman、OneBox |
| 侵入試験 | 3 | PentAGI、sapper-v2、LuaN1aoAgent |
| 提供者の契約が要る | 19 | 11x、Artisan / Ava、Blip Go、Botpress、Devin、Dust、ElevenAgents、Fin、Harvey、Indigenius Agents Studio、JAPAN AI AGENT、Jio Haptik、Lindy、Manus、Sarvam、ServiceNow AI Agents、Sierra、Zenvia、m365-agent |

- Space の 21 件のうち、動いているのは 7。その 7 件で、Gradio の API の定義を今回の経路で読めたのは 1 件。
- ACP の対応一覧に名前がある物: 対応済みの Goose・Cline・OpenHands・Codex、残りの Gemini CLI・Hermes Agent・Claude・CUGA・Devin。
- 公式台帳に提供者自身の記録があった SaaS は ElevenLabs の 1 件。
- ターミナル型のうち、Claude Code・Gemini CLI・makasero は提供元のモデルに固定で、本人の契約か鍵が要る。

## 7. 限界

- 1 時点、1 回の標本。割合の 95% の幅は、500 件で ±4.4 ポイント、200 件で ±5.3 ポイント。
- 数えたのは host。量産の提供者は 1 host に多数を置くので、「件数」に直すと偏る。
- 応答したことは、役に立つこと・安全なこと・続くことを意味しない。
- 握手は 1 か所の雲から送った。データセンターからの接続を断る接続先は「応答なし」に入っている。
- 分類は公開資料からの一次判断。実行すれば変わる物がある。
- Space を他人のサービスから呼ぶ時の回数制限（ZeroGPU は未ログインで 1 日 2 分）と規約は、設計書 10 章の確認事項。
