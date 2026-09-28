# Avocado Campus layer

更新: 2026-09-27

Avocado Campusは、既存のRockstarOS / Sky / Zema / Walletを置き換えず、その上に大学ごとの**人・プロジェクト・機会・イベント・コミュニティ・ポートフォリオ・資料**と、NFC / QRからの物理入口を追加するWebレイヤーです。

Campusは大学の公式サービスではありません。大学名は利用者がどのCampus空間を開いているかを示す文脈です。大学・学生団体・雇用主・イベント主催者との公式提携、承認、推薦を示しません。Campus内の投稿は、投稿に外部の一次情報URLが明示されている場合を除き、コミュニティ投稿として扱います。

## 対応Campus

| Campus | 主な入口 | 大学向けの使い方 |
| --- | --- | --- |
| NYU | Creative / Social / Events | 映画、AI、スタートアップ、アートの共同制作者を探す。プロジェクトを立てる。学生投稿のイベントや機会を見る |
| FIT | Creative / Portfolio / Opportunities | ファッション、写真、デザイン、ブランド、コンテンツの作品を公開し、モデル・撮影・スタイリング等の共同制作者やgigを探す |
| Columbia | Research / Resources / Projects | 研究チームを作り、論文・政策資料・データセット等の出典付き資料を共有し、必要な専門性を持つ人を探す |
| Fordham | Career / Opportunities / Projects | インターン、fellowship、仕事、startup、business、leadershipの機会と共同制作者を探す |
| John Jay | Justice / Resources / Projects | case、policy、paper、dataset等を出典付きで共有し、justice / policy / cybersecurity / forensics / civic techのプロジェクトを作る |

Campus固有の表現は `lib/campus.ts` の `CAMPUSES` が正本です。

## 画面

- `/campus?campus=nyu`: Campusホーム。
- People: 公開プロフィール、検索、skill / interest / looking-forを使うマッチング。
- Projects: チーム募集、分野、必要role、外部URL。
- Opportunities: internship、gig、job、fellowship、research、volunteer、competition。
- Events: 開始/終了時刻、場所、主催、登録URL。
- Communities: open参加またはowner承認。
- Portfolio: project、film、photo、fashion、design、writing、code、research。
- Resources: case、paper、policy、dataset、reference、guide。citationと原典URLを保存できる。
- NFC / QR: タグbatch登録、mode、placement、NFC/QR別の匿名open件数、active切替、analytics削除。

Homeの `Campus` アイコンからも開けます。

## Campus profileと所属表示

プロフィールには次だけを保存します。

- 表示名、handle、自己申告のaffiliation
- headline / bio
- skills / interests / looking-for
- 利用者が自分で公開したWebリンク
- 公開/非公開
- Campus ID
- affiliation status

サインイン時の認証済みemailが、Campusごとの許可domainに一致した場合だけ `domain_verified` を表示します。emailそのものはCampus tableへ保存しません。

`domain_verified` は**その認証emailのdomainが一致した**という意味だけです。在籍中であること、本人の肩書き、大学の公式承認、特定学部所属を証明しません。

## People matching

`matchCampusProfiles` は同一Campusの公開プロフィールだけを対象にし、次を点数化します。

- 自分の `lookingFor` と相手の `skills` の一致
- 相手の `lookingFor` と自分の `skills` の一致
- `interests` の共通項

人物の学歴、能力、性格、人気、社会属性等を推測して順位付けしません。プロフィールに本人が入力したfield以外から推定しません。scoreは共同作業候補を並べるための内部ヒューリスティックで、品質・適性・採用可能性の評価ではありません。

## Social graph

`sky_campus_edges` は以下を同じモデルで保存します。

- `follow`
- `save`
- `collaborator_request`
- `join`
- `block`

follow / save / blockは即時反映します。collaborator requestは相手がaccept / declineできます。communityのjoinは、`joinPolicy=open`なら即時、`approval`ならowner承認です。

blockは対象プロフィールを自分のPeople一覧から除外します。reportは別tableへ保存し、social edgeと混同しません。

## Post model

全投稿は `sky_campus_items` に共通fieldを持ちます。

- `campus_id`
- `kind`
- `title`
- `summary`
- `tags_json`
- `details_json`
- `visibility`
- `starts_at / ends_at`
- `status`
- owner / timestamps

kindごとの詳細は `lib/campus.ts` でallowlistします。未知fieldを自由に保存しません。

匿名閲覧者は `visibility=public` のactive投稿だけを取得します。サインイン利用者のCampus画面では `campus` 投稿も取得できます。ownerは自分の投稿をupdate / archiveできます。

## Opportunity / eventの真偽境界

Campusは、投稿されたinternship、gig、job、fellowship、event等が実在・募集中・安全であると自動保証しません。

投稿には可能な限り元の募集ページ、主催者ページ、申込ページを `externalUrl` / `registrationUrl` として付けます。UIは外部URLを「source」として分離して開きます。報酬・締切・場所は投稿者入力です。

将来外部Providerから取得する場合も、provider名・取得時刻・原典URL・最終確認時刻を追加し、コミュニティ投稿と区別する必要があります。

## NFC / QR physical entry

タグはOS本体を保存しません。NFC / QRにはAvocadoの入口URLを保存します。

例:

```text
NFC: https://<avocado-host>/t/nyu-library-0001?source=nfc
QR : https://<avocado-host>/t/nyu-library-0001?source=qr
```

`/t/[tagId]` は次を行います。

1. tag IDを検証。
2. `sky_campus_tags` のactive tagを検索。
3. sourceを `nfc | qr | link` に正規化。
4. registered tagならeventを1件記録。
5. tagのCampus / modeへ302 redirect。

未登録でもprefixが既知Campusなら安全なfallback Campusへ移動できますが、owner不明なのでanalyticsは記録しません。不明prefixはCampusのunknown-tag入口へ戻します。

### Campus Mode

タグごとに次のmodeを持てます。

- `campus`
- `creative`
- `study`
- `social`
- `research`
- `career`
- `justice`
- `events`

NFC / QRから開いたmodeに応じて、最初の画面も変わります。

| mode | 初期画面 |
| --- | --- |
| social | People |
| career | Opportunities |
| events | Events |
| research / justice / study | Resources |
| creative | Projects |
| campus | Home |

したがって同じ大学でも、library tag、career-board tag、fashion studio tag、research tag等を別入口として使えます。

## Tag batch

`POST /api/campus` の `registerTags` でbatchを作ります。

制限:

- 1batch: 1〜200 tag
- 1 owner: 最大2,000 tag
- prefixはCampus IDから始める
- IDは連番4桁を付ける
- tag IDはownerをまたいで一意

例:

```text
campus: nyu
prefix: nyu-film
start: 1
count: 50

nyu-film-0001
...
nyu-film-0050
```

iPhoneのAvocado NFC Writerでは、このID列と同じURLを順番にNDEFへ書きます。書込後にread-back verifyしてから次のIDへ進めます。

## Analytics privacy

`sky_campus_tag_events` が保存するのは次だけです。

- event ID
- tag ID
- source = nfc / qr / link
- timestamp

Campus analytics用にIP address、認証email、precise location、raw User-Agent、端末fingerprintを保存しません。タグの `placement` はownerが自分で付ける説明文字列です。端末位置から自動取得しません。

ownerはtagごとに:

- active / inactive
- analytics全削除

を実行できます。

## Safety / moderation / user controls

Campusは人が作るコンテンツを含むので、最低限の制御をruntimeに置きます。

- profile public toggle
- block
- profile / item report
- owner post archive
- collaboration / closed-community request accept / decline
- tag deactivate
- tag analytics delete
- Campus単位の自分の全データ削除

`leaveCampus` はそのCampusについて、本人のprofile、owned item、edges、本人report、owned tag、tag analyticsを削除します。また本人profile / itemをtargetとするedge / reportも削除します。

reportの存在だけで自動処罰しません。operator moderation UI、appeal、retention SLAを本番一般公開へ進む前に独立受入する必要があります。

## API

`/api/campus`

GET:

- `?campus=<id>&view=bootstrap`
- `?campus=<id>&view=analytics` (auth required)

POST:

- `saveProfile`
- `createItem`
- `edge`
- `respondEdge`
- `registerTags`
- `report`

PATCH:

- `updateItem`
- `archiveItem`
- `removeEdge`
- `setTagActive`

DELETE:

- `leaveCampus`
- `clearTagAnalytics`

Mutationは既存 `requestUser` を通し、same-originでないrequestを拒否します。request bodyは32 KB上限です。

## D1 schema

migration: `drizzle/0017_campus_layer.sql`

tables:

- `sky_campus_profiles`
- `sky_campus_items`
- `sky_campus_edges`
- `sky_campus_tags`
- `sky_campus_tag_events`
- `sky_campus_reports`

canonical declarationは `db/schema.ts` です。

## 既存Avocadoとの接続

Campusは別OSではありません。

```text
RockstarOS Home
├─ Sky
├─ Zema / Work
├─ Campus
│  ├─ People
│  ├─ Projects
│  ├─ Opportunities
│  ├─ Events
│  ├─ Communities
│  ├─ Portfolio
│  ├─ Resources
│  └─ NFC / QR
├─ Wallet
└─ Market
```

Campusで人や案件を発見し、AI Toolが必要な作業はSky、依頼・作業管理はZema / Work、費用・収益はWalletへ移動できます。Campus自身がSky / Zema / Walletの既存台帳を複製しません。

## 受入

自動検証:

- `tests/campus.test.mjs`: Campus定義、domain verification、profile/item validation、route/tag validation、matching。
- `npm run schema:check`: canonical schema / migration / journalの一致。
- `npm run database:check`: generated database inventoryの一致。
- `npm run typecheck`
- `npm run lint:product`
- `npm test`
- `npm run build`

コードがmainへ入ったことと、本番D1 migration適用・公開Site配備・大学掲示許可は別です。大学構内へ物理poster/tagを設置する場合は、各大学・建物・掲示板のルールに従い、許可された掲示面を使用します。
