# 自社クラウドの設計と、計算の置き場所（2026-11-21）

決めの出典は [07](structure/07-decisions-from-minutes.md) の 2026-11-21。eSIM の決めは [03 の 0 章](structure/03-esim.md)。料率・月額の候補は [05](structure/05-business.md) のまま変えない。

## 0. 自社クラウドの設計（2026-11-21 22:31 の本人の言葉「自社のクラウドをどう回すかと設計はどうするのかがまだ決まってない」→ 22:54「規定で進めて」で決定）

### 0.1 自社クラウドが利用者に出す物

「自社クラウド」は、avokado が利用者に出す 1 つのクラウドのこと。iCloud と同じ役を持つ（[02 §1](structure/02-rockstaros.md)）。中身は次の 9 つ。

| # | 出す物 | 今ある物 |
| --- | --- | --- |
| 1 | account（本人・パスキー・端末と eSIM の束縛） | `lib/rockstar-account.ts`、`lib/jennifer-passkey.ts`、`lib/rockstar-entitlement-*.ts` |
| 2 | 仕事の台帳（Work・Job・Receipt、進行、停止） | `lib/workflow.ts`、`lib/work-*.ts`、Workflows |
| 3 | 鍵と許可（Broker）・財布（Wallet）・請求 | `lib/a2a-broker-*.ts`、`lib/wallet*.ts`、`services/sky-billing` |
| 4 | Noah の台帳（取り込み・握手・巡回・タイムライン） | task 85〜88、`services/noah-patrol-wake` |
| 5 | 保存（成果・ファイル・Memory）と、端末をまたぐ続き | D1・R2 |
| 6 | 実行（仕事ごとの隔離環境・常駐・中のブラウザ） | Mac の runner、`services/noah-test-runtime` |
| 7 | モデル（中継・自前のモデル） | Mac のローカルモデル。中継の `services/noah-relay` は計画だけ（[mvp-launch.md](noah/mvp-launch.md) D3） |
| 8 | 回線の終端（eSIM の通信が入る所） | 無し |
| 9 | 運用（見張り・障害・更新・費用の上限・バックアップ） | `docs/sky-cloud-operations-runbook.md` |

### 0.2 4 つの案

| | 案 A Cloudflare だけ | **案 B Cloudflare ＋ 黒殿（既定）** | 案 C 自前クラウド（黒殿が本体） | 案 D 家の端末が本体 |
| --- | --- | --- | --- | --- |
| 1〜5 | Cloudflare（Workers・D1・Durable Objects・Workflows・R2） | Cloudflare | 黒殿（PostgreSQL を 2 台で複製、MinIO、自前の認証） | 雲は待ち合わせ・バックアップ・請求だけ。中身は各家の Hub・Mac |
| 6 実行 | Cloudflare Containers（単発だけ。常駐は家の端末へ） | 単発は Cloudflare。常駐・重い物は黒殿 | 黒殿（k3s ＋ Firecracker か Kata で仕事ごとに VM） | 各家の Hub・Mac。端末が無い人は案 B の黒殿 |
| 7 モデル | Workers AI | Workers AI → 引き金の後に黒殿（vLLM か SGLang） | 黒殿 | Hub の中の小さいモデル ＋ 黒殿 |
| 8 回線の終端 | N1 | N1 → Hub が増えたら N2 | N2 | N1・N2 |
| 黒殿とのつなぎ | 無し | 黒殿から外向きだけ（Cloudflare Tunnel。Workers からは Workers VPC で呼ぶ）。runner は今と同じ「取りに来る」 | Cloudflare は DNS・WAF・CDN・Tunnel だけ | 同左 |
| 月の固定費 | $5 | $5 ＋ 黒殿の電気代（1 ノード満載で 2.7〜3.4 万円） | 黒殿の電気代 ＋ 回線 ＋ 2 か所目（災害対策） | 雲はほぼ 0 |
| 運用の重さ | ほぼ 0 | 黒殿の機械を見る人が要る | 24 時間の障害対応・更新・故障の交換。2 人では回らない | 端末の更新の配布と故障の窓口 |
| 強い所 | 0 人なら 0 円。今のコードのまま | GPU と常駐が安い。落ちたら案 A へ戻せる | データ・鍵・モデルを全部自社で握れる。「日本の中だけ」「抜かれない」と言える | 雲の原価が人数に比例しない。プライバシーが一番強い。mii の売りになる |
| 弱い所 | GPU なし。常駐が 1 体月 $7.9。日本だけに置けない（D1 の jurisdiction は eu・us・fedramp だけ。apac は hint で保証なし） | 黒殿が 1 か所（冗長なし） | 今のコード（D1・Workers・Workflows 前提）の移植が大きい。2 か所目が要る | mii が出るまで成り立たない |
| 向く時期 | 0〜500 人 | 500〜2 万人 | 2 万人を超えた後か、「データを外に出さない」が売り物になる時（企業・医療・教育） | mii の出荷後 |

**決め（K1）: A（今）→ B（4 章の引き金）→ D（mii の出荷に合わせて）。C は、主権が売り物になる部分（企業の利用者、本人の鍵）だけ取り入れる。**

### 0.3 回線の終端（eSIM の通信の入り方）

| 案 | 道 | 費用（SORACOM の定価、2026-11-21） | 向く物 |
| --- | --- | --- | --- |
| **N1 インターネット経由 ＋ SIM の証明（決め。実装は [task 102](../codex/tasks/102-sim-proof-endorse.md)）** | eSIM → SORACOM → インターネット → Workers。SIM の証明は Endorse（SORACOM の鍵で署名したトークン。IMSI・IMEI 入り。取った後は Wi-Fi でも使える）か Beam（HTTPS への変換） | Beam は 1 リクエスト 0.00099 円、月 10 万リクエストまで無料（転送先へのリクエストも 1 と数える）。Endorse の料金は未確認 | スマホの型 S、少ない数の Hub |
| N2 閉域（インターネットを通らない） | eSIM → SORACOM VPG → IPsec（Door）→ 黒殿 | VPG Type-F（日本）1 時間 60.5 円 ≒ 月 45,012 円 ＋ Door 1 時間 12.1 円 ≒ 月 9,002 円 ＝ **月 約 5.4 万円の固定**。VPG を通る Beam は無料 | Hub が多くなった時、企業・施設の利用者 |
| N3 自社 MVNO（自社のコア網） | 自社で加入者の管理と網の出口を持つ | 大きな投資。今は見積もらない | やらない |

スマホの専用パッケージでは、EndorseはSIMと端末の本人確認に使う。保護対象の各要求には、現在の専用回線を示す事業者側の証拠と有効な利用権の照合も必要になる。Wi-Fi上で以前のトークンを提示しても、この専用入口の条件は満たせない。[専用回線での利用条件](structure/03-esim.md#専用回線での利用条件)

### 0.4 本人の鍵で暗号化する（案 K。どの案にも足せる）

成果・Memory・ファイルを、本人のパスキーから作った鍵（WebAuthn の PRF 拡張）で暗号化する。運営は中身を読めない。

- **使える所**: iOS・macOS の Safari 18 以降（iCloud キーチェーン）、Android の Chrome（Google パスワードマネージャー）、Windows Hello（2026-02 の更新以降）。
- **使えない所**: 他社のパスワード管理（Bitwarden など）は PRF の値を返さないことが多い。
- PRF は「あれば使う」扱いにし、無い人には復旧コードの鍵を出す。
- **引き換え**: 推薦や検索に中身を使えない。鍵と復旧コードを両方無くすと戻せない。
- 決め（K3）: Memory と成果のファイルだけ。仕事の状態と請求は、運営が読める形のまま。実装は [task 104](../codex/tasks/104-owner-key-encryption.md)。

### 0.5 回し方（運用の設計。実装は [task 105](../codex/tasks/105-cloud-operations.md)）

| 項目 | 決め（案） |
| --- | --- |
| 体制 | 人は 2 人（ノエル・かいや）。見張りは Spider（読むだけ）、判定は Jev、手順書の実行は Codex か Claude。壊す操作・お金・本番の DB は人が承認する（AGENTS.md §6） |
| 約束（SLO） | 受付の API は月 99.5%（月 3.6 時間まで止まってよい）。最初の成果は 95% が 30 秒以内。預かったデータの消失は 0 |
| 見張る数 | エラー率、待ち行列の長さ、最初の成果までの秒数、従量の請求（日ごと）、黒殿の温度・電力・GPU |
| 知らせ方 | スマホへの通知。夜中に起こすのは「データの消失・お金・安全」の 3 つだけ。他は朝 |
| 変える手順 | PR → `npm run verify` → 試験の環境 → 本番（flag で少しずつ開ける）。戻す手順を先に書く |
| 落ちた時 | 黒殿が落ちたら、仕事は lease が切れて結果不明になり、再実行しない。新しい仕事は Cloudflare へ回す。Cloudflare が落ちたら、受付を止めて端末側で待ち、状態のページに出す |
| バックアップ | D1 の Time Travel（30 日）＋ 毎日 R2 へ書き出して黒殿へ写す。黒殿から R2 へは暗号化して写す。月 1 回、戻す練習をする |
| 費用の上限 | 全体の月の上限（MVP $30、「1 文で頼む」を開ける時 $150）と、1 人あたりの上限。超えたら新しい実行を止めて知らせる |
| 守り | 仕事ごとに別の VM。外向きは宣言した host だけ。鍵は中継が付ける。黒殿へ外から入る口は開けない（Tunnel は外向きだけ） |
| 法務 | 個人情報を外国の事業者（Cloudflare）に預けることの説明。eSIM の届出の確認（[03 の 0.5](structure/03-esim.md)） |

### 0.6 決めたこと（2026-11-21 22:54 本人「規定で進めて」。変える時は本人が 07 に 1 行足す）

| # | 決めること | 決め |
| --- | --- | --- |
| K1 | 「自社のクラウド」は、自分たちの機械で全部回す（案 C）ことか、avokado が利用者に出すクラウドで中身は借り物でもいいか | 借り物でもいい（A → B → D） |
| K2 | データを日本の中だけに置く必要があるか | 無い（必要なら C か、日本に置ける大手クラウド） |
| K3 | 「運営も中身を読めない」（案 K）を売りにするか | Memory と成果のファイルだけ |
| K4 | 黒殿を何ノード avokado に回すか（かいやの OK） | 1 ノード |
| K5 | 止まっていい時間 | 月 3.6 時間（99.5%） |
| K6 | 夜中の障害で誰が起きるか | 3 つ（消失・お金・安全）だけ起こす |
| K7 | AI の運用担当にどこまで任せるか | 見る・知らせる・戻すまで |
| K8 | 自前のモデルを動かす理由（安さ／検閲なし／データを出さない） | 安さ（引き金の後） |
| K9 | 最初の 1 年のクラウドの月の上限 | $30 → $150 |
| K10 | 閉域（N2、月 約 5.4 万円）を始める時 | Hub が 100 台を超えた時か、企業の利用者が付いた時 |

## 1. 一言で（案 B の中身）

**新しく買う・借りるサーバーは 0 台。** 受付・保存・単発の実行は Cloudflare の従量で始める。常駐とモデルは、引き金（4 章）を越えたら黒殿の 1 ノードへ移す。計算の原価は、1 人あたり月 45〜60 円に保つ（11-22 に、利用者から月額は取らない形へ変わった。[07](structure/07-decisions-from-minutes.md) の 2026-11-22）。

## 2. 層ごとの置き場所

| 層 | 置く所 | 理由 |
| --- | --- | --- |
| 受付・保存・進行管理（Work / Job / Receipt、Broker、Wallet） | Cloudflare Workers・D1・Workflows（今の実装） | Workers Paid 月 $5 から。持つ意味が無い |
| 単発の実行（隔離環境） | Cloudflare Containers / Sandbox（従量） | 動いた秒だけ払う。0 人なら 0 円 |
| モデル | Workers AI の従量（例 `qwen3-30b-a3b-fp8`） → 引き金の後に黒殿 | 300 人まで月 $50 以下 |
| 常駐する Agent | 家の端末（本人の Mac → mii の Hub、Pro）。家の端末が無い人は黒殿 | Cloudflare だと 1 体月 約 $7.9（約 1,231 円）で、月額を超える |
| 本人の月額契約で動く Agent（Codex など） | 家の端末だけ | 本人のログインを運営の計算機へ運ばない（[noah-own-device.md](services/noah-own-device.md)） |

置き場所の値は今の契約のまま（`provider`・`home`・`cloud`・`pocket`）。黒殿は `cloud` の実装の 1 つで、契約に機種名や場所の名前を書かない。

## 3. 数字（2026-11-21 取得の定価。1 ドル 156.8 円、1 ユーロ 1.099 ドル）

### 3.1 1 回あたり

| 仕事 | 中身 | 1 回 |
| --- | --- | --- |
| ふつう | basic（1/4 vCPU・1GiB・4GB）を 60 秒 ＋ 入力 3,000・出力 1,000 トークン（qwen3-30b） | 隔離 $0.00047 ＋ モデル $0.00049 ＝ **約 $0.001（0.15 円）** |
| 道具を持つ担当 | 隔離なし。入力 15,000・出力 1,500 トークン | **約 $0.0013** |
| 重い仕事 | 入力 32,000・出力 2,048 トークン（kimi-k2.6、入力 $0.95・出力 $4.00 ／ 100 万） | **約 $0.039（約 6 円）** |

### 3.2 人数ごとの月額（全部を従量のまま。1 人 1 日 10 回）

| 人数 | ふつう | 道具を持つ担当 |
| --- | --- | --- |
| 300 | $86（1.3 万円） | $114（1.8 万円） |
| 1,000 | $286（4.5 万円） | $380（6.0 万円） |
| 5,000 | $1,432（22.5 万円） | $1,901（29.8 万円） |
| 20,000 | $5,729（89.8 万円） | $7,605（119.2 万円） |
| 30,000 | $8,593（134.7 万円） | $11,408（178.9 万円） |

1 人あたり月 45〜60 円。月額 600 円の 1 割以下。1 日 30 回でも 3 割以下。

### 3.3 月額の中身（11-21 時点の計算。11-22 に月額を取らない形へ変わったので、記録として残す）

| 形 | 月額 | 回線 | 決済（3.6%） | 計算（1 日 10 回） | 残り |
| --- | --- | --- | --- | --- | --- |
| スマホ（eSIM なし） | 600 円 | 0 | 22 円 | 45 円 | **533 円** |
| スマホ（eSIM なし） | 800 円 | 0 | 29 円 | 45 円 | **726 円** |
| スマホ ＋ eSIM（型 S。SORACOM planX1 の基本 $1.8 で計算） | 800 円 | 282 円 | 29 円 | 45 円 | **444 円** |
| Hub（回線あり） | 800 円 | 385 円 | 29 円 | 23 円（モデルだけ） | 363 円 |
| Hub（回線なし） | 800 円 | 0 | 29 円 | 23 円 | 748 円 |

月額に常駐を入れると、Cloudflare では 1 体 1,231 円で赤字（約 −890 円）。だから**月額に含めるのは「頼んだ時だけ動く」まで**。常駐は家の端末か黒殿。

### 3.4 従量の粗利（実費 ＋ 30%）

| 仕事 | 1 人月の実費 | 30% の粗利 |
| --- | --- | --- |
| ふつう | 45 円 | 13 円 |
| 道具を持つ担当 | 60 円 | 18 円 |
| 重い仕事（1 日 10 回） | 1,837 円 | 551 円 |

小さいモデルの従量では利益にならない。従量が利益になるのは重いモデルの仕事だけ。料率（実費 ＋ 30%）は変えない。

### 3.5 台で持つ場合との分かれ目

| 比べる物 | 台で持つ値段 | 分かれ目 |
| --- | --- | --- |
| 単発の実行 | 専用機 64GB（Hetzner AX42、月 €97.30 ≒ $107、設置 €49） | 月 23 万回 ≒ 760 人 |
| 常駐（1GiB） | 同じ専用機に約 56 体（1 体 約 $1.9 ≒ 299 円） | 約 14 体 |
| 常駐（東京の大手クラウド） | AWS m6i.4xlarge（16 vCPU・64GiB）月 約 $724 | 約 92 体 |
| モデル | GPU 1 枚を月で借りる（A40 $0.59／時 〜 RTX 4090 $0.89／時） | 月 90〜130 万回 ≒ 3,000〜4,400 人 |
| **黒殿の 1 ノード（既にある）** | 電気代だけ。満載 1.2〜1.5kW で月 2.7〜3.4 万円（31 円/kWh の仮定） | 常駐 22〜28 体。モデルは GPU 1 枚 300W（月 約 6,800 円）で 114〜296 人 |

Hetzner は 2026 年に値上げが続いた（第三者の集計。契約前に取り直す）。

## 4. 引き金

**従量の請求（Containers ＋ Workers AI）が、黒殿 1 ノードの電気代（月 約 3 万円 ≒ $190）を 2 か月続けて超えた時**に、黒殿へ移し始める。およそ 500〜670 人、常駐なら約 25 体。

移す順: ① モデル（GPU の入出力だけで、隔離が簡単） → ② 常駐（家の端末が無い人の分） → ③ 単発の実行。受付・保存・進行管理は Cloudflare に残す。

## 5. 黒殿の 1 ノードの使い方

前提の構成（2026-07 の機材リスト）: 1 ノード ＝ Threadripper PRO 9995WX（96 コア）・DDR5 512GB・RTX PRO 6000 Blackwell Max-Q ×2（192GB）・NVMe 2TB。4 ノード。

| 役 | 容量の目安 |
| --- | --- |
| 単発の実行（1GiB を 384 枠） | 1 日 約 55 万回。山を 3 倍として 約 1.8 万人 |
| モデル（GPU 1 枚 毎秒 1,000 トークンの**仮定**） | GPU 1 枚 約 2,900 人、2 枚 約 5,800 人、4 ノード 8 枚 約 2.3 万人 |
| 常駐 | メモリで決まる。1GiB なら数百体 |

守り:

1. 1 ノードを avokado 専用にする。他の事業（切り売り・占い・動画生成）のデータと同居させない。
2. ネットワークを分ける。外向きは全閉から始め、接続要件の `egress` だけ開ける（[noah-own-device.md](services/noah-own-device.md) と同じ）。
3. Cloudflare からは runner と同じ「取りに来る」受け渡し（`/api/noah/runner`、lease・heartbeat・finish）で話す。黒殿へ外から入る口を開けない。
4. 落ちた時・止めた時は Cloudflare の従量へ戻す。戻す時も同じ要求 ID で照合し、結果不明を再実行しない。
5. 黒殿で動かした分は**定価（Workers AI・Containers の単価）を実費として記録**し、利用者には実費 ＋ 30% で請求する。差額は黒殿の稼働の売上として社内で精算する。料率は変えない。

task 95（Linux 版 runner）の検証機に、この 1 ノードを使う。Hub 用の Linux の検証機はどうせ要るので、`cloud` の置き場所が副産物で手に入る。

## 6. 引き金の前にやる確認（本人・かいや）

| # | 確認 | 誰 | 結果で変わる物 |
| --- | --- | --- | --- |
| C1 | 黒殿の 1 ノードを avokado に回してよいか | 本人・かいや（K4 で 1 ノードと決めた。OK の確認が残る） | ダメなら、引き金の時に専用機（AX42 級）を 1 台借りる |
| C2 | 黒殿の電源（単相 200V、ノードごとに専用 20A 回路が引けるか） | 本人（電気工事士） | 足りないなら C1 と同じ |
| C3 | GPU 1 枚で、ふつうの仕事のモデル（30B 級 MoE）が毎秒何トークン出るか | Codex（task 101） | 半分なら、1 ノードの上限が約 2,900 人に下がる |
| C4 | Cloudflare Workers Paid（月 $5）の契約 | 本人 | MVP の巡回の前提（[mvp-launch.md](noah/mvp-launch.md) D5） |
| C5 | 雲の月の上限額 | 決めた（K9） | MVP $30、「1 文で頼む」を開ける時 $150 |

## 7. 測る値

- 従量の請求（Containers・Workers AI・Workers・D1 を分けて）を月ごとに。引き金の判定に使う。
- 1 人あたりの月の実費と、月額に対する割合（目標: 1 割以下）。
- 常駐の体数（家の端末で動いている数と、家の端末が無い人の数）。
- 黒殿へ移した後: 1 回あたりの電気代換算、落ちた時間、Cloudflare へ戻した回数。

## 8. 出典（2026-11-21 取得）

- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/) — vCPU 秒 $0.000020、GiB 秒 $0.0000025、GB 秒 $0.00000007。CPU は動いた分だけ。
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) — qwen3-30b-a3b-fp8 入力 $0.051・出力 $0.335、kimi-k2.6 入力 $0.95・出力 $4.00（100 万トークンあたり）。
- [Hetzner の 2026 年の価格（AgentDeals）](https://agentdeals.dev/hetzner-pricing-2026) — AX42 €97.30、設置 €49。第三者の集計。
- [RunPod GPU pricing](https://www.runpod.io/pricing) — A40 $0.59、L4 $0.69、RTX 4090 $0.89、H100 PCIe $2.89（1 時間）。
- [AWS 東京 m6i.4xlarge（DoiT）](https://www.doit.com/compute/spot/ap-northeast-1/m6i.4xlarge) — $0.992／時。
- [SORACOM 日本カバレッジ IoT SIM](https://soracom.jp/services/air/japan_coverage/) — plan-K2 K2-500MB 月 385 円（税込）。
- [SORACOM IoT SIM（eSIM プロファイル）](https://soracom.jp/services/air/cellular/pricing/price_iot_sim_esim_profile_download/) — planX1 基本 $1.8／月、日本 $0.02／MiB、承認制。
- [SORACOM VPG の料金](https://soracom.jp/services/vpg/price/) — Type-F（日本）1 時間 60.5 円、Door 1 時間 12.1 円。
- [SORACOM Beam](https://soracom.jp/services/beam/) — 1 リクエスト 0.00099 円、月 10 万リクエスト無料。[SORACOM Endorse](https://soracom.jp/services/endorse/) — SIM の認証トークン。
- [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel) — 外向きの接続だけ。Workers からは Workers VPC。
- [D1 の data location](https://developers.cloudflare.com/d1/configuration/data-location/) — jurisdiction は eu・us・fedramp。apac は hint で保証なし。
- [WebAuthn PRF の対応（Corbado）](https://www.corbado.com/blog/passkeys-prf-webauthn)。
- 為替: [Wise USD/JPY](https://wise.com/us/currency-converter/usd-to-jpy-rate)、[Wise EUR/USD](https://wise.com/us/currency-converter/eur-to-usd-rate)。
