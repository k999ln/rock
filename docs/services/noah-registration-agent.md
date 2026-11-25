# Noah — 外部Agentの登録Agent

- 本人が言う一言: 「登録が必要なAgentの必要項目を入力してもらい、その情報をもとに登録Agentを回して」
- Goal: Noahの会員登録なしで、外部サービスの必要項目を入力し、承認した登録Agentへ実行を依頼できる。
- Noaがつなぐもの: サーバーで許可した外部Agent/登録Agent/必要項目/登録先/規約版。利用者がURLや権限を追加する機能は持たない。
- AMC工程: Agentを選択 → 必要項目のフォーム → 送信先・登録内容・規約の確認 → 登録Agentを一度起動 → 本人確認が要れば待機 → 結果を表示 → 元のAgentへ戻る。
- Jev合格条件: 未同意送信0、設定外の送信先0、重複実行0、他ブラウザからの仕事読取0、パスワード/メール等の原文のDB保存0、自己申告を接続成功へ昇格0。
- 出力先: Workの登録処理メタデータとゲスト本人のブラウザ。登録情報は明示された登録AgentのHTTPS入口だけへ渡す。
- Wallet: 課金や契約の自動実行はしない。初期設定は無料の登録アダプターだけ。外部の料金・条件は同意画面で別に確認する。
- hardware profile依存: フォーム・状態確認はブラウザのみ。既存Mac実行の認証・別端末共有は変更しない。
- 失敗時: 送信後の不明は自動再登録せず、同じ実行IDで状態を照会。本人確認・CAPTCHAは本人へ戻す。
- 記録: 仕事ID、ブラウザ用権限のhash、登録先ID/版、同意版、状態、期限。仕事の記録には登録情報の原文、password、OTP、外部token、応答本文を保存しない。本人が選んだ再利用情報だけを、後述の暗号化保管へ分離して保存できる。

## 登録不要の範囲

タイムライン・検索・登録Agentへの依頼/状態照会はNoahの会員登録なし。2026-11-22の会員制廃止後は、初回に発行するブラウザ専用の保存権限で、本人の登録情報・接続・サーバー保存の成果を扱う。既存アカウントや別ブラウザのデータは引き継がない。外部サービス固有の登録・同意は維持する。端末内ファイルの収集・暗号化出力は既存 `/noah/add/data` を使う。

登録処理にはランダムなブラウザ専用の権限（256 bit）を使う。ブラウザのsessionStorageに仕事IDと権限だけを保存し、URLへ含めない。紛失・期限切れは別accountへ移したり再発行したりしない。共有端末では終了時に明示的に画面の情報を消せる。

## 設定と実行契約

`NOAH_REGISTRATION_PROVIDERS` はJSON配列。各項目は `id,name,agentIds,revision,providerOrigin,verificationUrl,termsUrl,termsVersion,executorUrl,executorName,fields`。
必要項目は `key,label,type,required,maxLength`（type=text/email/password/file）。revisionは1以上の整数、NOAH_REGISTRATION_AGENT_TOKENは32文字以上。executorUrlはHTTPS。外部の提供者と登録Agentの送信先を両方表示する。
`NOAH_REGISTRATION_AGENT_TOKEN` は登録Agentのサーバー認証。公開APIへ返さない。
未設定・不正設定では受付を閉じ、個人情報のフォームを出さない。架空の登録成功や未接続Agentを実行可能とは表示しない。

- `GET /api/noah/registration`: 公開の必要項目と送信先情報。鍵/内部URL pathを除く。
- `POST`: action=start、UUID、providerId、固定revision、termsVersion、values、送信同意と規約同意。Origin/JSON/容量/項目の型を検査。`X-Noah-Registration-Key`でブラウザ専用権限を送る。
- `GET ?job=UUID`: 同じ権限で状態照会。元の入力内容は返さない。
- 登録AgentへはPOST `{action:'register',id,providerId,providerOrigin,termsVersion,values}`。状態照会はPOST `{action:'status',id,providerId}`。同じIDのregisterをNoahが再送しない。
- 応答は `{id,state}`（state=running/needs_user/completed/failed/unknown）。任意の自由文・URL・tokenは捨てる。本人確認リンクはサーバー設定済みの登録先URLだけを表示する。
- 20秒の上限、転送禁止、応答8KiB、受付8KiB。本人確認待ちで状態照会だけを継続する。completedは登録Agentからの完了報告で、Noahの接続許可ではない。
- Workへメタデータを保存してから一度だけ送る。同じID/入力の再送は現在の状態を返す。入力指紋はブラウザ権限を鍵にしたHMACで、原文やpasswordの裸hashを残さない。
- 有効期限24時間、同じブラウザ権限につき日10件、全体日200件を上限とする。権限を作り直せるため、本人単位の回数保証ではない。状態照会は5秒に1回。Noahの他APIへこの権限を流用しない。

実際の登録先アダプター・秘密設定は未接続。開発では注入した登録Agentで、必要項目が実行に渡り、本人確認待ちから状態照会へ進むことを検証する。本番の登録・契約・配備・設定は行わない。


2026-11-21 導線改善: 同じ登録の状態を表示中だけ5秒間隔で確認し、1回の表示では最大12回。外部の本人確認からタブへ戻ると状態を読み直す。背景では通信せず、完了/失敗で停止する。復元したブラウザの控えもGETの状態照会だけに使い、登録情報の自動再送はしない。未接続の登録先を使えると表示しない。


## 共通情報と委任（2026-11-22 本人承認の追加開発）

- 本人の認証で既存R2へ暗号化して保存する。AES-256-GCM、ランダムnonce、owner/用途をAADに固定。鍵はSites秘密設定 `NOAH_PROFILE_KEYS`（activeとkeys）、ブラウザ・Git・ログへ出さない。プロフィール/書類は公開データやWork本文に入れない。既存D1 schemaの変更は不要。
- 基本/活動/受取口座/本人確認のメタデータを一度保存し、必要な項目だけ接続先へ渡す。本人確認書類はPNG/JPEG/PDF、1件5MiBまで、2件まで。認証した本人だけにattachmentとして返す。保存・削除・委任変更はETag相当の版を照合し、他画面の変更を上書きしない。
- `GET/POST /api/noah/profile` は本人情報・接続先別の委任・一括停止を扱う。`/api/noah/profile/document` は書類の保存/本人ダウンロード。mutationはsame-origin、owner-scope、版、容量、型を検査。鍵未設定時は保存を閉じる。
- 登録先設定のprofileFieldだけを共通情報と対応付ける。パスワードは保存/再利用しない。利用者が今回の提出先/規約/項目を確認して送信する。保存版が変わったら再確認。背景の実行直前にも委任停止と版を読み直す。
- 任せる範囲は接続先・道具の定義hashごとに保存。任せない/一括停止は受付と送信直前に拒否、確認して実行は依頼ごとに確認、任せるも既存のBroker/Wallet/初回確認を省略しない。停止前に相手へ送った操作の取消を保証しない。
- 合格条件: 他owner読取/更新0、平文の永続保存0、未選択項目の送信0、未同意送信0、版競合による上書き0、停止後の新規配送0、登録情報の再入力を2つ目の設定済み接続先で省略できる。UIは390px/desktopで確認する。

### 送信アダプターへの保存情報の受け渡し

`fields[].profileField` に保存先キーを明記した項目だけ再利用可能。passwordには指定不可。fileは `profileField: identityDocument` に限定する。ブラウザは `profile: {revision, fields: [外部項目key], documentId?}` と `X-Rock-Owner-Scope` を送る。値と再利用指定の二重指定、保存版の変更、本人変更は拒否する。書類は公開URLにせず、送信時だけ `documents: {外部項目key: {name, type, base64}}` に展開する。adapterはこの追加契約を受け付ける場合だけfile項目を宣言する。Workに残すのは鍵付き入力指紋と状態のみ。

`NOAH_PROFILE_KEYS` は `{active:"v1",keys:{v1:"64桁のランダムhex"}}`。Sitesのsecretへ置く。最大3世代で旧keyを保持し、新規保存からactive keyに切り替える。旧keyを失うと復号できない。鍵や保管領域を利用できない場合、委任の検査は拒否し、停止や拒否設定を回避しない。`/api/noah/profile/documents` は認証・同一origin・本人scope・revisionを必須にする。取得は本人にattachmentとして返し、共有URLは発行しない。

### 2026-11-22 保存同意と段階的な案内

保存/登録ボタン直前に短い保存・再利用の文を表示し、説明版 `2026-11-22.1`、サーバー時刻、対象の項目名/書類IDを、情報本体と同一の暗号化R2オブジェクトへCAS保存する。古い説明版・保存競合・永続保存失敗では登録を送信しない。再利用停止はUIと登録resolverの双方で強制し、送信直前のrevision再確認で未送信分にも効く。パスワードは保存対象外。書類提出先の確認・規約同意は別に維持する。

「今使える」は実際の公開接続一覧、「追加で使える」は設定済み登録先のrequired/profileFieldと本人の保存情報との差分から表示する。調査チャットの303種類は候補台帳であり、実行可能数ではない。Browser Use Agent（AG0045）、Skyvern（AG0270）は調査台帳でruntime/integration未試験。Browser Use公式v4は運営APIキーとクラウドrunを必要とする（https://github.com/browser-use/browser-use/blob/main/skills/cloud/references/api-v4.md 、2026-11-22確認）。キー/登録対象の実行先/本人確認の引継ぎが未設定の間は登録処理を開始しない。


### 2026-11-22 公式APIの登録実行基盤

2026-11-22 100人試用の受付制限対策: Agentboardの429を受けた場合、`Retry-After`の秒数またはHTTP日時を再開目安にする（最大24時間、不明なら1時間）。本人別の暗号化保存と登録メタデータに`retryAt`だけを残し、相手の応答本文は保存しない。GET設定は`accountState: cooldown`と期限だけを返す。入力画面を開き直す・別IDを作る・状態照会する操作でも、期限前は外部の登録APIを呼ばない。期限後は本人が押して再入力するまで送信しない。所有者を越えた待機枠の予約や提供者の受付容量の保証はしない。合格条件は期限前の追加登録0、期限後の自動再登録0、別所有者への登録情報漏えい0。

本人指示により実行環境とキー設定を進める。最初の対応先はAgentboard（`mcp-registry:ai.agentboard/agentboard`）。公開名1項目を本人が確認してから `POST https://www.agentboard.ai/api/agents/register` を一度だけ呼び、発行されたキーを本人別の `noah-external/v1` R2領域へAES-GCMで保管する。暗号鍵は既存 `NOAH_PROFILE_KEYS` を用途分離のAADで使用。`GET /api/me` の本人IDとactive状態を確認してから登録完了とする。

Worker内の `NOAH_REGISTRATION_NATIVE=agentboard` と32文字以上の秘密設定 `NOAH_REGISTRATION_AGENT_TOKEN` を設定して有効化する。実行環境は既存Noah Worker、追加の有料基盤・DB移行は不要。通常の委任/所有者/送信前確認を維持。発行キーの保管には本人の保存権限が必要（会員制廃止後はブラウザごとに自動発行）で、閲覧と公開の道具は従来どおり。公開名の外部公開とキー保管を入力前に明示する。

登録開始前の暗号化CASで本人・接続先を確保し、重複操作/別ID/結果不明からの再登録を防ぐ。キー保管後の照会失敗はGETによる本人照会だけで復旧する。キーを失う応答切断は結果不明として止め、登録成功を捏造しない。本人以外の復号、キーのUI/Work/ログ保存、設定外URLへの送信、転送先への送信を拒否する。

AgentboardのMCPでは公開定義からcredential/agent入力を除き、登録済み本人の資格情報を呼出直前に注入する。register_agent/rotate_credential/delete_accountは通常の道具から除外し、資格情報の返却を防ぐ。未知の道具や手入力のcredentialは拒否、応答にキーが混入しても取り除く。公開投稿・返信は利用者が依頼した時だけ。最初の通し検証は本人情報を読むwhoamiを使う。

一次資料: [登録API](https://www.agentboard.ai/for-agents)、[OpenAPI](https://www.agentboard.ai/openapi.json)、[利用ルール](https://www.agentboard.ai/rules)（2026-11-22確認）。ブラウザ操作型は本人の後続指示によりNoah所有の実行基盤で実装する。Browser Use Cloudの運営アカウント・キーは使わない。


### 2026-11-22 自作ブラウザ実行基盤（本人の後続指示）

Browser Use Cloudのsignin/分離ブラウザ・本人への引継ぎを参考にし、Noah専用の `services/noah-registration-browser` を実装する。外部のBrowser Use契約・ログイン・キーを使わず、既存CloudflareのChromiumと独立Workerを利用。登録ごとに別ブラウザ、送信先は設定したhostnameだけ。ユーザーの端末画面・既存ブラウザ・OSを操作しない。

HMAC付きのサーバー間通信、登録前の本人別暗号化CAS、入力操作の通し番号、4分の期限/停止で再送を防ぐ。WorkerのDurable ObjectsにはID・状態・期限だけを保存し、入力情報/画面/外部キーは永続化しない。Noahの `/api/noah/registration/browser` が本人と登録IDを照合し、専用画面 `/noah/registration/browser` に画像と状態だけを返す。本人確認の完了後、設定した本人照会APIでキーを確認し、Noahの暗号化R2へ保存してブラウザを閉じる。接続先設定のhashをキーの保管記録と照合し、設定変更で既存キーの送信先がすり替わることを防ぐ。

設定は `NOAH_REGISTRATION_BROWSER_URL` と秘密の `NOAH_REGISTRATION_BROWSER_KEY`。既存profile暗号鍵は維持。browser実行の登録先は `execution: browser`、`requiresAccount: true`、同一提供者originの `mcpUrl` を持つ。対応は固定フォームとBearer認証のMCP、書類アップロード/OAuth更新は対象ごとの追加実装が必要。実在サービスの手順が未検証なら公開の登録先一覧へ出さない。初期のクラウド実測予算は合計10分/日（4分×2回＋2分×1回）で、100人向けの受付容量ではない。[実行環境の設定と制約](../../services/noah-registration-browser/README.md)。

## 2026-11-25 の会話（個人情報の登録）

- 意向: 「個人情報欲しい。けど、その個人情報はいかに、シームレスに登録してもらうか」「iPhone にすでに自分のコンタクトみたいに登録してあるやつ持ってこれたりしないかな」。
- できる事: iPhone の Safari は、フォームの項目に入力の種類（HTML の `autocomplete`。`name`・`email`・`tel`・`postal-code`・`address-level1` など）が付いていれば、本人の連絡先カードから一度に入れられる。Noah の個人情報の項目には、この種類を付ける。
- 採らない事: 銀行アプリを開いた時に口座を自動で集める規約の案（会話で「ちょっと怖い」）。iPhone では、他のアプリの中身を読めない。口座は本人が入れる。
- 会員制との関係: 上の「登録不要の範囲」のとおり、2026-11-22 に会員制を廃止した。全員に個人情報を登録してもらう形に戻すか、定期便を受ける人だけにするかは、本人の回答待ち（07 の未決「会員登録」）。

### 2026-11-24 Agentの利用中に進む情報登録

保存済み情報は折りたたまず確認・編集でき、必須の不足だけを先に入力する。任意項目は展開して追加する。登録シートで「保存する／今回だけ」を切り替え、対象項目、暗号化保存、送信先、提供元の料金条件を主操作の前に示す。「同意して登録・続ける」以外では登録を送信しない。保存済みの情報だけで足りる時はプロフィールを書き直さない。編集では元の値を引き継ぐ。登録Agentの完了報告と接続の成功を区別し、元のAgentへ戻る操作を主ボタンにする。

フォームからのAgent実行は、入力の一部と成果を仕事履歴へ保存すること、Noahの中継料0円と提供元の未確認料金を分けて事前に示す。料金の決定、決済、本人確認・送信の権限は変更しない。登録情報の画面では全部を先に埋める必要がないことを案内する。

合格条件: 保存しない選択でプロフィール書込0件、保存済み情報だけの登録で不要な書込0件、任意項目空欄で必須項目が揃えば送信可、編集値の保持、未同意の登録0件、保存失敗時の外部送信0件、390px/1280pxで横はみ出し0、送信前に保存・送信先・料金が読める。
