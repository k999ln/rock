# Sky NFCカード — Columbia大学の学生向け入口（設計）

状態: 設計（2026-10-12、owner指示）。実装はCodexへ依頼する（[依頼文](prompts/sky-nfc-columbia-codex.md)）。カードの印刷・書き込み・配布はまだ行っていない。

関連: [Campusレイヤー](campus-layer.md)（NFC／QR入口 `/t/[tagId]` とタグ台帳の正本）、[Sky](sky.md)、[製品ベース 2026-10-12](product-baseline.md)。

## 1. ownerが決めたこと（2026-10-12）

| 項目 | 決定 |
| --- | --- |
| タッチで起きること | SkyのTool／Agentを開く |
| 使う人 | Columbia大学の学生 |
| 書き込み | avokadoがカードに書き込んで配る（利用者は書き込まない） |
| カードの単位 | 1枚＝「Columbia用Sky」の入口。タッチすると学生向けに選んだToolの一覧が開く。Toolごとのカードは作らない |
| 最初のTool | 出典整理（`mr-citations`）、AMC（`rockstar-amc`）、特許アシスタント（`rockstar-patent-assistant`） |
| 言語 | タッチで開く入口と、上の3つのToolの画面を英語にする |
| 特許アシスタントのsi調査 | カードから来た学生には最初は使えなくする（下書きは無料で使える）。si調査は課金開始後に決め直す |
| 特許の国 | 英語版に米国（USPTO）の検索先と、米国の仮出願（provisional application）の案内を加える |
| Columbiaの名前 | カードと入口ページに「Columbia」と書く（下の §8 のリスクをownerが承知のうえで決定） |
| 実装 | Codexが行う |

## 2. 学生から見た流れ

1. 学生がカードをスマホの背面に当てる。
   - iPhone（XS以降）は画面が点いていれば読み取り、通知を出す。通知を押すとSafariで開く。Wallet・カメラの使用中や機内モードでは読まない。
   - Androidは画面のロックを解除してNFCがオンなら、ブラウザで開く。
   - NFCが使えない、または読めないときは、カードのQRコードを読む。同じ入口に行く。
2. `https://avocadomini.si/t/columbia-sky-0001` のような短いURLが開き、すぐに英語の入口ページ「Sky for Columbia students」へ移る。
3. 入口ページには3つのTool（Citations、AMC、Patent Assistant）が並ぶ。それぞれ何ができるか、費用がかからないこと、データがどこで処理されるかを1画面で読める。
4. Toolを選ぶと英語の画面が開く。入口ページと各Toolの説明は、サインインしなくても読めるようにする（今そうなっていない画面があれば直す）。保存や続きの作業にはavokadoアカウント（無料）を作る。サインインはSkyの決定どおり自前のpasskeyを使う（実装が先に入っていればそれを、無ければ既存のサインインを使う）。
5. 作業はZemaに残り、あとで同じアカウントで続きができる。

## 3. カードの中身

カードのNFCチップに書くのは **URLが1つだけ**（NDEFのURIレコード）。

```text
NFC: https://avocadomini.si/t/columbia-sky-0001
QR : https://avocadomini.si/t/columbia-sky-0001?source=qr
```

- 個人情報、アカウント、利用権、合言葉、鍵は書かない。カードを複製されても、公開の入口が開くだけにする。
- `columbia-sky-0001` はカード1枚ごとの番号（Campusのタグ台帳の規則どおり、Campus IDで始まり4桁の連番）。どのカードが何回開かれたかを匿名で数えるためで、持ち主とは結び付けない。
- URLは印刷後に変えられないので、avokadoが持ち続けるドメイン `avocadomini.si` に置く。行き先はサーバー側で変えられる（入口ページを差し替える、カードを無効にする、など）。
- 書き込んだら読み返して確かめ、チップを **書き込み禁止（ロック）** にする。第三者が書き換えられないようにするため。

### チップとカード

| 項目 | 推奨 | 理由 |
| --- | --- | --- |
| チップ | NTAG213（144 byte）。NTAG215でもよい | URLは40文字ほどで足りる。iPhone・Androidの両方が読める |
| 偽造対策チップ（NTAG 424 DNAなど） | 今回は使わない | 公開の入口を開くだけなので不要。将来、出席や特典など「本物のカード」を確かめたい用途で検討する |
| 形 | 名刺サイズのPVCカード（CR80） | 財布やスマホケースに入る。シールでもよい |
| 表 | avokado・Sky・「Tap or scan to open Sky for Columbia students」・NFCマーク・QR | QRはNFCが使えない人の予備 |
| 裏 | 短いURLの文字列、「This card only opens a web page. It holds no personal data.」、問い合わせ先 | 不安を減らす |

## 4. 仕組み

```text
カード ──NFC/QR──▶ avocadomini.si/t/<tagId>
                     │ 製品サイトのWorkerが、Skyの置き場所へ転送（?source を保つ）
                     ▼
              <Skyの置き場所>/t/<tagId>        既存の Campus タグ入口
                     │ 台帳で行き先を引く・匿名で1件数える
                     ▼
              /sky/campus/columbia（英語の入口）
                     │
          ┌──────────┼───────────────┐
          ▼          ▼               ▼
   Citations       AMC        Patent Assistant
  （端末内処理） （計画のみ）  （下書きのみ・si調査なし）
```

### 4.1 `avocadomini.si/t/*` の転送（製品サイトのWorker）

- `sites/avocado-mini/worker/index.js` に `/t/<tagId>` を足し、環境変数 `SKY_TAG_ORIGIN`（Skyの置き場所）の `/t/<tagId>` へ302で転送する。`source` などのクエリは保つ。
- `tagId` は既存の形式（英小文字・数字・ハイフン）だけを通す。形式外は404。
- `SKY_TAG_ORIGIN` が未設定なら、転送せずに「このカードはまだ使えません」という静的ページを返す（壊れたリンクにしない）。
- SkyがSkyの決定どおり `avocadomini.si/sky` へ移ったら、転送先を同じドメインへ変えるだけでよい。カードのURLは変わらない。

### 4.2 タグ台帳と行き先

- 既存の `sky_campus_tags` と `/t/[tagId]` をそのまま使う（[Campus §NFC / QR](campus-layer.md#nfc--qr-physical-entry)）。
- 今は行き先が `/campus` で始まるものに限られている。これに `/sky/campus/<campusId>`（今回は `/sky/campus/columbia`）を許可リストとして加える。任意のURLは許さない。
- 最初のbatchは `campus: columbia`、`prefix: columbia-sky`、`count` はカード枚数、行き先は `/sky/campus/columbia`。
- 書き込み用に、batchの「tag ID・NFC用URL・QR用URL」をCSVで書き出せるようにする。QRの画像（SVG）も同じ一覧から作れるようにする。
- 匿名の集計（tag ID・source・時刻だけ）、カードごとの有効／無効、集計の削除は既存のまま使う。IPアドレス、User-Agent、位置、メールは保存しない。

### 4.3 英語の入口ページ `/sky/campus/columbia`

- 見出しは「Sky for Columbia students」。3つのToolを並べ、それぞれに「何ができるか」「お金がかかるか（どれも無料）」「データがどこで処理されるか」を書く。
- 各Toolへは `?lang=en&entry=columbia-card` を付けて開く。
- アカウントを作る・サインインする導線と、プライバシーの説明へのリンクを置く。
- ページの言語属性を英語（`lang="en"`）にする。今の全体は `lang="ja"` なので、英語の部分には正しい言語属性を付ける。
- 他の大学（`/sky/campus/nyu` など）にも同じ形で広げられるようにするが、今回はColumbiaだけを公開する。

### 4.4 3つのToolの英語版

`lang=en` のときだけ英語にし、今の日本語の画面と動きは変えない。

| Tool | 英語版でやること | 費用 |
| --- | --- | --- |
| 出典整理（Citations） | 画面の文言、エラー、出力の見出し（「## 出典」→「## Sources」）を英語にする | 端末内の処理だけ。外部へ送らない |
| AMC | 目標・計画・作業・確認待ちの画面を英語にする。テンプレートの文言も英語版を用意する | LLMや有料の外部実行を呼ばない |
| 特許アシスタント（Patent Assistant） | 画面と下書きのひな形（明細書・請求項・要約）を英語にする。米国の案内（USPTO Patent Public Search、仮出願、要約は150語以内など）を加える。Columbiaの知的財産の注意（下）を表示する | 下書きはブラウザ内で無料。si調査は出さない |

- 特許アシスタントのsi調査は、`entry=columbia-card` で開いたときは **画面に出さず、APIでも断る**（画面で隠すだけにしない）。他の入口からの利用は今までどおり。
- si調査の公式情報源の一覧に米国特許商標庁（`uspto.gov`）を加える。si調査を後で開放するときにそのまま使えるようにするため。
- Columbiaの知的財産についての注意を英語版の特許アシスタントに表示する。要旨: Columbiaの研究の中で生まれた発明や、大学の設備・資金を付随的な範囲を超えて使った発明は、大学のものになることがある。研究室での発明は、大学の外へ出す前にColumbia Technology Ventures（CTV）へ相談する。授業だけで学部生が作ったものは、申し出れば大学が権利を放棄することが多い。これは法律相談ではない。
- 日本語の文字が英語版に残っていないことを試験で確かめる（表示される文字列にひらがな・カタカナ・漢字が含まれないこと）。

### 4.5 アカウントと費用

- アカウントは無料。カードから来たことで特別な権利は付けない（カードは入口だけ）。
- 3つのToolはどれも、カード経由ではavokadoに外部APIの費用がかからない構成にする（出典整理とAMCはもともと無料、特許はsi調査を止める）。
- 本番の課金はまだ始まっていない。課金が始まったら、si調査を学生にどう出すかをownerが決め直す。

## 5. avokado側の作業（印刷・書き込み・配布）

1. Skyで `columbia-sky` のbatchを作り、CSVを書き出す。
2. カードを印刷する（表にQR、裏にURL文字列）。QRはbatchのCSVから作り、カードごとに番号を合わせる。
3. NFC書き込みアプリ（iPhoneのNFC書き込みアプリ、またはNXP TagWriterなど）で、CSVの順にURLを書き込む。
4. 1枚ずつ読み返して、URLが正しいことを確かめてからロックする。
5. iPhoneとAndroidで実際にタッチして、入口ページが英語で開くことを確かめる（下の §7）。
6. 配る。配った場所や日付は、台帳の `placement` に自分で書く（端末の位置から自動では取らない）。

## 6. 安全とプライバシー

- カードには公開のURLしか入っていないので、なくしても個人情報は漏れない。止めたいカードは台帳で無効にする。
- カードの上に別のNFCシールを貼られる「すり替え」に備え、入口ページのドメインが `avocadomini.si` であることを裏面に書く。無効なカードや未登録の番号は、安全なページへ戻す（既存の動き）。
- 集計は匿名。誰がタッチしたかは記録しない。
- 特許の下書きはブラウザ内で作り、si調査を止めているのでカード経由では外部へ送らない。

## 7. 受け入れの条件

| # | 確かめること | 方法 |
| --- | --- | --- |
| A1 | `avocadomini.si/t/<tagId>` がSkyの `/t/<tagId>` へ `source` を保って転送される。形式外のIDは404。転送先が未設定なら静的ページ | 製品サイトWorkerの試験 |
| A2 | `/t/columbia-sky-0001` が `/sky/campus/columbia` へ移り、匿名で1件数えられる。許可リスト外の行き先は登録できない | Campus試験に追加 |
| A3 | 入口ページが英語（`lang="en"`）で、3つのToolが並び、各Toolへ `lang=en&entry=columbia-card` で移れる | 画面の試験 |
| A4 | 3つのToolの英語版に日本語の文字列が残っていない。日本語版は今までどおり | 文字列の試験＋既存の試験 |
| A5 | `entry=columbia-card` の特許アシスタントでsi調査が出ず、APIも断る | APIの試験 |
| A6 | 特許アシスタント英語版にUSPTOと仮出願の案内、Columbiaの知的財産の注意が出る。公式情報源に `uspto.gov` がある | 画面とAPIの試験 |
| A7 | batchのCSV（tag ID・NFC URL・QR URL）とQR画像を書き出せる | 試験 |
| A8 | 実物のカードをiPhoneとAndroidで読み、英語の入口が開く | avokadoが実機で確認（Codexの合格とは分ける） |
| A9 | `npm run verify` が通る | CI |

## 8. リスクとまだ決めていないこと

- **Columbiaの名前の使用**: Columbiaの規則では、大学の外の会社や団体は大学の名前・マークを宣伝物に使えず、商品への使用には大学の許諾が要る（[Guidelines for Use of Columbia Marks](https://cufo.columbia.edu/node/1016)）。ownerは2026-10-12に、カードと入口ページに「Columbia」と書くと決めた。紋章やロゴは使わず、文字だけにする。大学から問い合わせが来たら、表示を「For students」などに変えられるよう、名前は入口ページの設定1か所にまとめる。
- **配る場所**: 学内での掲示やテーブル出展には、それぞれの場所の許可が要る。配る場所と方法は未定。
- **枚数と費用**: カードの枚数、印刷・チップの費用、予算は未定。
- **他のTool**: 他のToolを入口に足すか、他の大学へ広げるかは、最初の反応を見てから決める。
- **si調査の開放**: 課金開始後に決める。

## 9. 参考

- Apple, [Core NFC Enhancements（Tech Talk 702）](https://developer.apple.com/videos/play/tech-talks/702)（iPhoneのバックグラウンドでのタグ読み取り）
- Columbia University, [Guidelines for Use of Columbia Marks](https://cufo.columbia.edu/node/1016)
- Columbia Technology Ventures, [Inventor's Guide (2023)](https://techventures.columbia.edu/sites/default/files/content/CTV_Inventors-GuideSept2023.pdf)
