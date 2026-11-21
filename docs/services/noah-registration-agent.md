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

タイムライン・検索・登録Agentへの依頼/状態照会はNoahの会員登録なし。既存のMacとのペアリング、別端末共有、サーバーに保存した成果の閲覧/提供は既存認証を維持する。端末内ファイルの収集・暗号化出力は既存 `/noah/add/data` を使う。

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
