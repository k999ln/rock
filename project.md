## 2026-10-05 — 特許調査レポートのGitHub保存

利用者の「mainにあげて」に基づき、Git / CI / Operations（ROCK、G04）として、9月30日に60分12秒実施した[特許調査](docs/research/rockstar-patent-research.html)と[出典一覧](docs/research/rockstar-patent-sources.json)を保存する。31件の特許公報を含む74資料を整理し、未読原典4件を区別した。コード対比は `b3e2676abd8ae2a0b3f78f48483e067b429d9bc8` 時点であり、10月5日のmainを再調査した結果ではない。

「取得可能性が高く競合も避けにくい案」は未確立。端末・モデル・adapter更新時の操作別検証結果の再利用（R1）を条件付き研究候補とし、具体設計、比較実験、初公開日の確定、専門家による請求項化を残す。出願・runtime変更・製品受入は未実施。既存のSIM/eSIM中心の製品方針とtaskの完了状態は変更しない。

検証: `npm run project:update`・`npm run project:check`・`npm run baseline:check`、JSON parse、HTML内部リンク／ID重複検査、原成果物2件とのSHA-256一致、`git diff --check`が合格。ディスク容量不足により必要ファイルに限定したcheckoutを使用し、`npm run verify` は `repository:check` の `vendor/mr/provenance.json` 欠落で停止した。全体verify・同一SHAのCI成功は主張しない。main反映はpush後のremote SHAで確認する。

## 2026-10-05 — 確定 main と SPIDER の進捗を同期

PR #62 の 19 件統合と最新 PR #61 が main へ反映された後の正本 `996b1955` を、SPIDER ブランチへ merge した。最新の Web/DNS 保存記録、main 受入台帳、SIM/eSIM 製品方針と SPIDER の実装・検証根拠を両方保持した。先行 `4e7cf4ae` の full verify と repair regressions は同一 head で成功しているが、この新しい合成 head の CI は別途実行する。SPIDER 自体は main 未統合で、履歴候補の完全照合、ローカル production Web 応答測定、CodeQL dismissal 未実施、実機受入の残条件を維持する。以下の各記録は当該 head の時点に対応し、先行検査を新 head の合格へ読み替えない。

## 2026-10-05 — SPIDER 回帰 CI の MR 配布 ZIP 同期

PR #52 の `eb86040d` に対する repair regressions は MR の source 試験を通過後、`public/toolkits/mr-toolkit.zip` の再生成一致検査で停止した。保存 ZIP 内の `mcp_server.py` だけが現行 source と異なっていたため、既存の `package-mr.py` で同期した。生成 blob は GitHub job の再生成結果と一致し、再生成の決定性、ZIP 全 19 member の source bytes、MR 関連 19 テストを確認した。検査の除外や閾値変更、security 設定変更は行っていない。新 head の GitHub CI 再実行は別途必要で、履歴 4 値/21 出現の元 bytes 未照合と CodeQL dismissal 未実施は維持する。

## 2026-10-05 — SPIDER 独立ブランチへ PR #62 の統合候補を同期

当時 main 未反映だった PR #62 候補 `dee0ab70`（19 PR と Android compile 修正）を、SPIDER の独立ブランチへローカル merge した。最新の依存・undici override・license inventory 生成、Campus/AI schema、SIM/eSIM 製品方針を保持し、SPIDER の実装と履歴検査の残事項を併存させた。必要な追跡済み asset の bytes を復元し、進捗 104/161、DB 6 境界/148 tables、Web schema 76 tables を再生成・検査した。MCP ZIP と SDK 0.1.3 tgz を合流後の source へ同期し、typecheck、全 Node 942 件（941 pass / 1 skip）、project/database/schema/baseline/design/repository/version/release の source 整合が成功。公開条件 ready 0/6、実機未受入、SPIDER の未照合 4 値/21 出現と GitHub security check は未解決のまま維持する。push/main merge・security 設定変更は行っていない。

## 2026-10-05 — 未統合PRのmain反映（19件統合済み、SPIDER別管理）

## 2026-10-05 — 没入型GTA調査の保存

MAT14 / ROCK: 利用者の「mainにあげて」を受け、9月30日の資料66件・表示技術12方式の調査HTML、証拠JSON、AI生成の構想画像を[既存R5研究資料](docs/avocado-mini-r5/research/immersive-gta/README.md)へ保存する。調査時SHAを保持し、現在のmainやPR状態と区別する。構想画像は未実証で、GTA接続・Mini実機の試験を行っていない。MAT15のplanned、製造承認保留、R5製品要求を維持する。次はPC上の3D体験と光学実験を独立して検証する。原本ハッシュ・リンク・baseline:checkは合格。既存のsparse参照取得が容量不足で失敗し、project:updateとverifyはSIM01根拠不足で停止。MAT14の参照だけ手動同期し全体合格は主張しない。詳細は同ディレクトリのarchive-validation.json。


利用者の「mainにあげて」により、main `aa7f2b41` を基点に元20 PRを照合した。G04／Git・CI／ROCK担当。依存5件、AI/Game/Decision Fabric8件、Campus/Farm/Meme/LiveKit/名称/domain6件の計19 PRを、全10チェック成功の `1f353524` からPR #62でmain `9f64aee3`へ統合した。元19 headはすべてmainの祖先。旧bring-up branch向けdraft #25はmainへの取り込み確認後にcloseした。SIM/eSIM中心の現行製品方針と本人承認・決済・保存契約を保持し、Farm/MemeはPAPER限定、旧Cloud agent入口は見積・上限・receipt受入までdry-runのみとした。

Cloudflare peer型・lock・license inventory、Campusの所属認証と所有者交代競合、fixture model tableの衝突、既存Androidのcompile/Binder例外と古い試験・APK収集契約を修正。全verify成功（Node870、Fashion22、Mini18、公開Preview21、Meme7、Farm25、Worker/D1 1048、CSV113）。AndroidはCore111、SDK7、エミュレータ32件が成功し、実APKのsource SHA・hash・同一署名・Broker限定INTERNET・全APK cleartext禁止を確認。実機再起動専用2件は対象外、実機OS・正式署名・本番金融の受入へ換算しない。

PR #61の後続2commit（指定Mini/Proホームと既存のdomain受入記録）は同PRで反映を追跡し、13 route build、site18件、SIM入口2件を確認した。#52 SPIDERは修正を `4e7cf4ae` に保存し、全verifyとrepair regressionsは成功したが、履歴secret検査と公開Web測定が未合格のため別管理。旧headの履歴候補には元bytes未照合4種/21出現が残り、CodeQL2件の誤検知処理は自動承認審査で追加承認が必要として拒否され未実施。分類を新headの安全宣言へ流用しない。元20件の調査後に作成された新規PR #63は今回の統合に含まない。G04は残条件のためin_progressを維持する。根拠: [統合記録](docs/evidence/pr-consolidation-20261005.json)。

## 2026-10-05 — avocadomini.siへ指定されたMini／Proホームを移行（WEB13）

主担当はWeb / PWA / Sites（JOINT、既存WEB13）。利用者は正本GitHubと独自ドメインを指定した後、表示対象を `https://avocado-mini.kirin-999.chatgpt.site/` と明確化した。前回v3で最新mainのSIM/eSIMホームを選んだ判断を訂正し、指定公開版のMini／Proホームへ差し替える。Git保存版 `5f3a3694` を基礎に、公開版に追加済みの会社情報とfooterを引き継ぎ、13 routeのHTML一致を確認した（公開origin、CSS生成名、配信基盤の挿入scriptを除く）。Workerの現行安全修正と販売停止条件は維持する。

移行先は独自ドメイン登録済みSite `appgprj_6ac31ab12d3481919e9a5379fa0dfbd2`、標準URLは `https://avocadomini.noellesugar1.chatgpt.site`。旧kirin-999 Siteの管理APIはNOT_FOUNDだが公開ページは閲覧可能。HostingerでA 2件と所有確認TXTを設定し、独自ドメインとSSLはactive、HTTPSのMini／Proホーム表示を確認済み。再承認は不要。必要な設定と復旧は[Web workstream](docs/workstreams/05-web-pwa-sites.md#avocadominisi2026-10-05web13)、配備・検証結果は[証拠](docs/evidence/avocadomini-domain.json)。GitHub保存は `codex/avocadomini-domain`／PR #61、main統合は別。公開とGitHub branch保存を分け、main統合はPR #61で追跡する。

訂正版はSite v4／source `79714855ad246d591d0a235d7da4bba68ddfb233` で公開成功。13 routeのHTML一致、1280pxの冒頭画像・見出し・メニュー一致、画像欠損0、横overflowなし、Siteテスト18/18を確認。今回の独自ドメイン設定は維持し、Mini／Proの公開内容だけを指定に合わせた。訂正後の最終 `npm run verify` exit 0（仕事API 1048、CSV API 113項目）。Hostingerの旧Aを置換し2件目のAと所有確認TXTを追加。既存www CNAMEは保持。SSL認証はapexで完了し、当初返された追加Cloudflare TXTは最新の必要recordから消えたため追加不要。`https://avocadomini.si/` の実表示を確認済み。

## 2026-10-05 — SPIDER と現行 main の独立統合検査

PR #52（`a85a25e`）を現行 service access 基盤（`aa7f2b41`）へローカル統合し、SIM/eSIM・所有者認証・暗号化予約 store・利用量計測・remote MCP の料金ゲートを保持した。LLM は Workers の manual redirect と 3xx 拒否を維持し、機密情報拒否を一般 upstream error に変換しない。追加 fixture は現在の pricing 宣言と Stripe の文字列組立へ対応し、Gitleaks の完全一致例外と SHA 検査を変更していない。typecheck、対象 Node 122 件（121 pass / 1 skip）、MR deadline 11 件、native MCP deadline 9 件が成功。全体 verify と公開・実機受入を達成した記録ではない。

この統合は main へ反映していない。GitHub と同じ 681 commit / 2,369 候補を再現し、135 種の値に集約した。1,550 出現/33 種は公開 blob SHA-256 の再計算と一致。798 出現/98 種は公開 fixture、識別子、冪等性 ID、生成された hash metadata と source 根拠で分類した。残る 21 出現/4 種は artifact digest と宣言されるが元 bytes 未照合。CodeQL 2 件は公開 commit fingerprint の test file 保存、所有 child の loopback 認証を追跡し false positive と判断したが、GitHub alert/check の未合格を変更していない。詳細は [SPIDER source review](docs/spider-guard.md) に記録した。実 Gitleaks scanner/policy 12 件、公開 deterministic vector 3 件、MCP ZIP の source 同一性も成功。秘密値・候補本文の出力や保存、履歴改変、包括 allowlist は行わない。新 CI が未合格のため、他機能の main 統合から分離する。

## 2026-10-02 — 販売チャネル共通claim発行・暗号化配信store

前回追加した取消ack gated replacement flowに、販売注文のexact retryを支えるchannel-neutral D1 storeを追加した。migrations `0052/0053`と`lib/rockstar-entitlement-issuer-store.ts`はseller idempotency key/request digest、signed claim、claim codeのAES-GCM ciphertext/nonce、encryption key ID、prepared/delivered状態を保持する。同じrequest keyとscope集合の順序違いは同一packageを復旧し、同じkeyで内容を変える要求、異なる署名済みpackageの再利用、復号key欠落/改変を拒否する。8並行の同一要求は一つのclaim/codeへ収束する。外部配送timeout時はprepared rowを保持し、retry callbackへ同じpackageとidempotency keyを渡す。delivery acknowledgement後にciphertext/nonceを消し、claim/audit fieldsを残す。`code_encryption_key_id`でkey rotation時の旧key選択を可能にし、未配信rowがある間はprevious keyを運用keyringへ保持する。issuer+store tests 13/13、typecheck、focused oxlint、schema 68 tables、database source 6/6/production readback 0/6、`git diff --check`が成功。 [Evidence](docs/evidence/sim-service-issuer-delivery-store-local-20261002.json). これはsynthetic local D1/keysのみで、seller endpoint/registry、production signing/wrapping key custody、実channel delivery、purchase/refund webhook、本番DB、carrier activation、billing、device/OS acceptanceではない。次はauthenticated issuer endpointとchannel adapterを実装する。

## 2026-10-02 — 販売元replacement code配信を取消ackの後へ固定

SIM entitlement issuerを監査し、旧claim取消とreplacement packageの両方を生成できても、そのack前に販売adapterがreplacementを配信しないことは既存コードでは強制されていなかった。channel-neutral `replaceRockstarEntitlementClaimWithAcknowledgement`を追加し、同じ署名済みcancellation/packageを入力としてevent ID・revoked status・ack schemaが一致した後にだけ配信callbackを呼ぶ。cancellation APIへevent ID、購入者deliveryへclaim IDを冪等キーとして渡す。販売元adapterは受け取ったpackageをdurableなsecret-safe storageへ保存し、応答消失/再起動後も同一materialを再利用する必要がある。成功順序、event ID/status mismatch、ack欠落、同じ保存済みmaterialでの冪等key再利用、非extractable鍵を含むissuer tests 7/7、typecheck、対象oxlint、`git diff --check`が成功。 [Evidence](docs/evidence/sim-service-replacement-ack-local-20261002.json). 実seller order registry、durable package store、webhook retry、key custody、販売/返金・carrier activationは未接続。本番売上・利用権配信・課金の証明ではない。次はRock側channel-neutral durable order/delivery stateを実装する。

## 2026-10-02 — クラウドLLM実行中の暫定費用表示

Responses streamingの受信進捗をCloud側で読み、本文をmeter記録へ複製せず、受信output UTF-8 byte数だけをowner-bound execution metadataへ単調保存する。Workbench・RockstarOS device home・Android task detailへ、署名済みquoteのinput上限と受信済みbyte数/3から算出したquote cap内の「暫定見積」を表示する。これはProviderが報告した実行中usageでも確定額でもなく、予約上限・暫定推定・完了後のProvider token usageを区別する。確定itemized amountは完了Responses usageだけを価格計算し、usage不明・上限超過は予約を保持したunreconciledにする。0051 migration triggerでsending状態の同一job見積更新だけを許し、owner scope、単調byte、上限、finalProviderUsage=falseを制約する。関連42テスト、typecheck、product lint、DB 6境界/source readback 6/6、`git diff --check`が成功。production buildは成功（chunk-size/CSS filename-conflict warningあり）。全体verifyはrepository checks後のNode test段階で独立Node/Python A2A HTTP interoperability testがloopback `127.0.0.1` bind時にEPERMとなるため完了扱いにしない。`npm run test:api`も同じlocal listener EPERMでassertion前に停止。全体passは主張しない。実Provider live meter、production rate/invoice、paid dispatchは未受入かつdisabled、production D1 readback 0/6。本番請求、SIM開通、端末OS導入の証拠ではない。 [Evidence](docs/evidence/remote-ai-text-live-estimate-local-20261002.json).

## 2026-10-02 — Sky接続復旧の公開v33

Site source `00109c6adccc7b1aa4ff3f72d740d18e1de8ec94`、公開v33、native deployment成功。正本full verifyはNode696、Fashion19、Worker/D1959、CSV/D1/R2113が合格。Siteの関連38件・typecheck/lint/build・bundle131・asset118/missing0・CSV113が合格。配布subsetの全体進捗参照不足119件と旧API harnessの初期schema応答前提は未解決として保存し、全Site verify成功へ換算しない。公開入口/health 200、本人なしの保護API 6件401を読取だけで確認。既存50円CSVは完了・Stripe照合済み、再課金0。本人desktop/Pixel、実AI、Apple Pay、外部OAuth/実行は未受入。GitHub main/PR51は未merge、今回の正本runtime差分は作業木へ反映。[配備証拠](docs/evidence/sky-access-publication-verification.json)。

## 2026-10-02 — Sky共通接続確認と復旧

WEB04/ROCK: 503/通信断/timeout/不正応答で実行可能になっていた共通接続確認を修正。認証が戻るまで実行/設定保存を停止し、再確認は読取だけ、未保存入力はcomponent memoryに保持する。接続設定は一覧取得失敗中の保存を止め、復旧後に編集入力を維持して一覧を取り直す。合成ローカル実ブラウザで401からの復旧、明示的な出典整理、server metadata完了1件、端末成果保存/再取得を確認。公開・本人desktop/Pixel・実AI/Apple Payの受入は別途記録する。

## 2026-10-02 — SIM/eSIM issuer SDKとredeem前取消・置換

SIM/eSIM購入claimのchannel-neutral発行を進め、`lib/rockstar-entitlement-issuer.ts`にEd25519 claim/code・refund/revocation event・置換material生成を追加。購入明細hashを共通識別に使い、秘密鍵は外部KMS等から渡される非extractable `CryptoKey`としてのみ利用し、SDK内へ保存しない。sign可能なprivate Ed25519鍵であってもextractableなら拒否する回帰試験を追加し、秘密鍵exportを防ぐ。置換時は取消eventを先にevent APIへ送り、受付確認後に新packageを配送する契約順序を定義。SDK署名4/4（extractable key拒否を含む）、claim/D1 lifecycle 5/5、全体verify exit0（Node 696/696、Fashion 19/19、Worker/D1 959、CSV 113、migration convergence 9/9、typecheck/lint/build/web asset）を確認。進捗正本の日付は検査規則に合う`YYYY-MM-DD`形式。Seller registry/各販売channel注文hook・秘密鍵運用・実webhookは未接続。本番販売・production billing・carrier activation・Android APK/device/OS acceptanceは未実施で、host fixtureやusage recordをそれらの受入根拠にはしていない。

## Sky focused判定の検証結果（2026-10-02）

WEB04/ROCK: 公開完了判定の整合検査をverifyへ追加。focused stageは既存basic受入を保持し、実Cloud AI/公開両端末/全Tool分類/Apple Payの受入を要求する。7 guard testsと正本全verify exit0（692 Node/19 Fashion/938 Worker-D1）。`--require-stage focused`は期待どおりexit1で未合格を示す。公開v28はこのturnで変更せず、一般marketplace/ConnectをCSV専用50円成功へ昇格しない。直近30分の公開error検索0件は実AI/可用性の受入ではない。証拠docs/evidence/sky-focused-release-check.json。GitHub mainへの保存/統合は未実施。

## Sky focused公開判定の修正（2026-10-02）

ROCK/WEB04: 2026-10-02: 既存Sky v28（source cb55411549649bd57429fa1afeb974139fc024da）公開成功。CSV専用Stripeはliveで、既存JPY50円受付はcompleted/stripe_verified/attempt1/revision3を公開D1で再確認した。新しい決済はしていない。一般MarketplaceのStripe/Connect受入とは別。クラウドProvider keyと信頼料金は未設定、pricing gateはfalse、production Cloud executionは0件。Pixelは接続済みだがロック中。保存回答管理と会話引継ぎの合成受入を本番owner/実AIの証明にしない。

`focused` stageを追加し、既存basic条件に実Cloud AIの応答・所要時間・項目別usage/cost・上限/timeout、同じ公開sourceのdesktop/Pixel顧客導線、全34 Toolの個別分類、対応端末のApple Payを加えた。既存paid-marketplace/clients scopeを省略せず独立して保持する。`node scripts/check-sky-launch.mjs --require-stage focused` は不足が残る限りexit 1で、設定キーの存在やmockだけでは合格にしない。検査自体の整合は`npm run verify`へ追加した。必要stage/gateの削除、基本受入の省略、合成環境のpassed、根拠欠落、依存cycle、未完了でのlaunch claimを7件の試験で拒否する。

## 2026-10-02 — Sky v28取得・引継ぎ配備

WEB04/ROCK: 保存回答の本人限定Markdown取得・本文だけの削除確認・会話から仕事への未送信依頼の引継ぎを既存Skyへv28/source cb55411549649bd57429fa1afeb974139fc024daで公開成功。正本全verify exit0:681 Node/19 Fashion/938 Worker-D1（認証付きattachment/削除済み拒否の回帰を含む）、Site24 Worker/D1項目・型/lint/build/bundle/assets合格。Siteの全project検査は既存SKY20根拠欠落で不合格のまま。公開DBの既存50円受付はcompleted/stripe_verified/attempt1/revision3を保持し追加請求なし。cloud実行0件・provider key未設定・Pixel keyguard showing=true。本番ownerの新UI受入、実Provider応答/費用/請求/資金gate、Apple Pay・外部OAuth・製品サイト入口は未完了。合成回答/料金/ログインを本番成功とはしない。GitHub main b3e2676へ本変更をpush/統合した証拠はなく、正本未commitとSites公開を区別する。

## 2026-10-02 — Sky保存回答と会話引継ぎのローカル受入

WEB04/ROCK: 会話の現在の依頼文だけをcomponent memoryで仕事画面へ引き継ぎ、仕事選択・見積・承認は本人の操作とする。URL/新しいbrowser storage/D1へ依頼本文を追加保存せず、reloadで未送信の下書きは消える。保存済み回答は本人認証付きMarkdown attachment（private/no-store）で取得でき、未保存/削除済み/別本人は拒否する。本文削除は対象と不可逆性をdialogで確認し、state・usage・予算台帳は保持する。共有予算の確定額は請求書照合済みと表示しない。ローカルbuilt Siteの合成アカウントで引継ぎ/再読込/削除dialog取消/135byteのダウンロード一致を確認、Worker/D1で24項目合格。実AI/本番ownerログイン/Apple Payは未受入、追加課金なし。正本の全verifyと同一Site公開は次の検証。

## 2026-10-02 — SIM/eSIM主導サービス要件監査とProvider trust境界

製品要件を再監査し、再利用対象をchannel-neutral署名entitlement/owner binding、Sky/Zema/Home、共通device identity、durable Cloud queue/recovery、署名rate/quote・budget cap・meter・itemized usageと確定。方針を物理SIM/eSIM双方の複数販売チャネルからRockstarOSサービス利用権を提供する形へ揃え、通信開通・利用権・アカウント・端末OS/client導入を別状態にした。OS binaryをSIMへ格納する設計とeSIM専用store中心のonboardingは採用しない。`/connect`は購入後の短い手順、共通サインイン、対応機種だけのOS導入、それ以外の既存OS client/browser、Sky/Zema/Agentの直接入口、見積・上限・進捗/成果の順で案内する。契約/実機依存の不足は販売claim配布/物理SIM fulfillment/carrier activation、production Provider価格・meter/invoice/funded billing、Android APK/Binder/deviceと正確なSKUのOS/client受入。

外部契約なしで進める端末WalletのProvider trust構成点として、Android `RockApplication`はoperatorのGradle property `a2aProviderUsageKeysJson`からだけEd25519 Provider receipt公開鍵tupleを読む。空の既定値は明示fail-closed。不正な任意trust設定はOS起動全体を止めず、receipt適用だけを無効にする。厳密なfield set、canonical Base64、長さ、origin、duplicate tuple、失効状態をCore verifierへ渡し、Device enrollment鍵やProvider自己申告を信頼起点にしない。続けてCoreに、request digest・署名quote digest・task/parent予算上限・安定delegation IDを署名済みWallet approval digestへ束縛し、同じHELD rowがある場合だけCloud互換Broker proofを署名する経路を追加した。共有Node/Cloud verifier interop試験12/12成功。Android Shellの準備済みAgent quote表示→利用者の明示承認→Core hold→Broker proof→Cloud approval/同一job再照合はまだ未接続のため、有料Cloud A2A dispatchは閉じたまま。Android Java/JUnit/APK/instrumentationはこのhostにJDK/Gradle/SDKがなく未実施。ローカルfixtureはproduction billing、carrier activation、端末OS installの証拠ではない。証拠: `docs/evidence/sim-led-product-direction-audit-20261002.json`、`docs/evidence/android-a2a-native-reservation-core-20261002.json`。次はowner-visible Shell/AIDL review-to-hold-and-dispatch gateを接続し、holdなしdispatch拒否、quote/request/cap tamper拒否、結果不明時のsame-key recoveryをCI/device acceptanceで試験する。

## 2026-10-02 — Sky v27配備とクラウド仕事の復帰準備

既存Skyへsource 3e895271f4b01542109882fa6c7af521d8166f1b/v27公開成功。quote/history・同じ仕事URLへの復元・期限切れsignin案内を既存auth/Stripeを保持して配備。v25/v26の複文trigger migration分割失敗は、起動時static statementで全guardを揃える経路と再ビルド/新source版で修復。Site Worker/D1 15項目（部分料金表からの回復と合成完了CSV保持）、関連30試験、型/product lint/build/bundle/asset合格。正本full verify663 Node/19 Fashion/858 Worker-D1合格。Sitesの既存design/project在庫欠落は旧v24にも存在し、正本検査合格と区別する。公開D1 schema version 2、quote 0行、既存50円CSV completed/stripe_verified/attempt1/revision3を再確認。desktop未認証のサインイン案内を確認。Pixelはロック中でowner解除待ち、新UIを実機合格とはしない。実AI鍵/料金/invoice/funded Wallet、保存成果UI、会話composer引継ぎ、本人OAuthとApple Payは未受入。false pricing gateと追加課金なしを維持。証拠docs/evidence/sky-cloud-ui-publication-verification.json。GitHub main b3e2676と正本未commit変更／Sites保存を区別し、完全ローンチ未完了。検証後に並行する暗号化入力/queue実装が正本へ追加されたため、663/19/858の合格はUI検証snapshotに限定し、現在の追加queueを合格・配備済みとはしない。v27へは混入していない。

## 2026-10-02 — Sky仕事画面の見積履歴とサインイン復帰

WEB04/ROCK: Zema WorkbenchのクラウドAI欄に、仕事別の履歴取得、reload時の同じ仕事への復元、認証期限切れの案内と同じURLへの復帰、変更前の仕事へ届いた応答を別の仕事へ表示しない照合を追加。redirectは追従せずサインイン復帰として扱い、応答不明時に実行を再送しない。本文をquoteへ保存せず、回答保存は初期off。共有予算の未送信・期限切れだけを履歴読込時に解放し、結果不明の予約を保持する。15対象試験合格。built Worker/D1＋合成アカウントのローカルブラウザで作成、見積保存、reload、認証期限切れ、復帰、取消、別仕事との履歴分離を確認。料金は署名fixtureであり、本番価格・本番ログイン・実AI・invoiceの合格ではない。最終全文verifyはexit 0（663 Node、19 Fashion、858 Worker/D1項目）。端末認証fixtureの未作成親job/不正UUIDを修正し、本人のactive仕事が必要なguardを保持。証拠はdocs/evidence/sky-cloud-ui-verification.json。公開v24は未変更。次は保存成果UI、Sky会話側の仕事への引継ぎ、同一Site配備と本番owner受入。実Provider credential/料金・資金gateは別受入を維持する。

## 2026-10-02 — Skyクラウド文章の保存・予約・実行記録

WEB04/ROCK: request-bound quoteを0046/D1へ保存し、本人承認digest、親jobの共有予算予約、単一send claim、結果不明時のhold、項目別usageと任意成果保存/本文削除を接続した。原稿は保存せず、client request IDと許可されたProvider request IDは本文を含まない診断metadataとして保持する。Worker/D1で取消後の409を再現し、trigger更新数への依存を保存状態の照合へ変更。10個別試験とWorker/D1 823項目が合格。追加後の全文verifyはexit 0（656 Node、19 Fashion、823 Worker/D1項目）。共有仕事画面のReact memo検査は選択jobを記録callback内でID/revision照合する形とイベントhandlerの依存明示で修復し、検査を無効化せず合格。証拠はdocs/evidence/sky-cloud-text-execution-verification.json。会話UI、公開v24への配備、実Provider credential/応答/invoice、funded Walletは未受入。false pricing gateを維持し、合成Provider試験を実AI実行や請求へ昇格させない。追加決済・実Provider送信なし。

## 2026-10-02 — Skyクラウド文章生成の料金準備

WEB04/ROCK: キャッシュ作成tokenの欠落とtier未保持を修正し、署名料金表v2の4単価・text-only/default範囲、最高入力単価での見積、本人/入力/上限/期限へ束縛したquote、実使用量の項目別計算を追加。関連21試験と最終全verify合格（645 Node、19 Fashion、727 Worker/D1 assertions）。D1署名料金表の登録・失効→見積API、最高キャッシュ作成単価による上限も検証。並行AndroidのGradle/AOSP manifest不一致は既存INTERNET権限へ同期し、署名権限とcleartext禁止を維持した。APK/Soong build・実機受入ではない。証拠はdocs/evidence/sky-cloud-text-pricing-verification.json。quote保存・原子的予約・usage ledger接続は次の実装であり、既存A2AのProvider署名receiptを偽造して流用しない。公開v24、false pricing gate、実credential未接続を維持。追加課金なし。GitHub main読み取りSHA b3e2676abd8ae2a0b3f78f48483e067b429d9bc8、今回は正本の未commitローカル変更で、main/公開への反映ではない。

## 2026-10-02 — Skyクラウド接続経路の準備

Sky v24（source fd619cf9e4bb0f0b6fa7f96f2c255ac89d923cbd）公開成功。PixelでDB available/R2 configured、cloud false、Marketplace payments unconfigured、CSV csvPayments liveと利用案内の別表示を確認。既存50円受付はcompleted/stripe_verified/attempt1/revision3のまま、追加請求なし。最終正本verifyは639 Node/19 Fashion/703 API合格。並行追加0045の重複は担当作業で解消、その後の在庫期待値を61 web/116全境界へ同期。native/web本人認証がfund-store経由でWorker依存していた箇所は、同じrequestUserの定義元request-authへimportを直し、認可を維持してguard試験を復旧。新device-session migration/機能はSite v24へ混入していない。Provider実応答・費用精算・一般Marketplace販売・desktop本人ログイン・Apple Payは未受入。GitHub main b3e2676とローカル正本差分／Sites source保存を区別し、完全ローンチ未完了。証拠: docs/evidence/sky-pixel-service-acceptance.json。

公開v23/source dbf7405f98ce34941ce090099a2225ff168b5bf7の成功とPixelの価格確認待ち表示を確認。全verify 638 Node/19 Fashion/667 API合格。Pixel公開statusはDB/R2 available、cloud未設定、payments unconfigured。調査でpaymentsはMarketplace専用でCSV専用Webhookを評価しないことを確認。csvPaymentsを独立させ、CSVと一般販売を混同しないヘルプ表示を準備。既存の50円支払いを再実行しない。次に追加fixture/full verifyと同一Site更新後のPixel CSV statusを確認する。

ROCK／WEB04: 公開v22で未反映だったremote AI料金gateを配備対象へ同期し、法務・特許のResponses transportを共通化。20秒abort、manual redirect、store:false、no auto-retry、実model/latency/validated usage/observed web callsを応答へ返す。本文の追加保存や精算台帳の完了ではない。3件追加fixtureと既存法務/特許を含む29件、typecheckを確認。OpenAI Developersは未導入、API keyなし、pricing/budget/usage ledger経路が未接続。本人認証・Rockstar利用権checkは削除せず保持する。公開previewでは利用権enforcement設定なし、claim DB migrationは別受入のまま。次に正本full verify、同一Skyへの配備、公開statusと本人認証後のgate拒否を確認する。完全ローンチ・cloud実応答を完了扱いにしない。

## 2026-10-02 — Skyの発注前下書き削除

Sky v22（source 456b549886c531de9b8aff27b0ecd6baf18ffc09）公開成功。Pixelで対象名の確認、取消後revision 1の保持、本人が明示した合成下書き1件の削除、ページ再読込、D1 0行を照合。担当開始済み・別owner・古いrevision・異なるoriginの拒否はlocal Worker/D1 API fixtureで受入。正本verifyは633 Node/19 Fashion/667 API合格、59 web/114全DB境界を確認。古い113期待値とMCP配布ZIPを現在の正本へ同期して再検証。新規Sky migration・外部契約・送金・追加決済なし。Sites source保存とGitHub main b3e2676（正本差分はローカル未commit）を区別する。案件削除は発注前だけで、進行済み案件の保持/削除とcloud/Apple Pay/外部OAuth/OS本人連携は未受入。完全ローンチ未完了。証拠: docs/evidence/sky-pixel-service-acceptance.json。

実ユーザーのデータ管理のため、本人別・同一origin・revision・draft状態を照合する削除APIと対象確認画面を実装。担当開始済みの案件は削除せず、結果不明の再読込はGETのみ。着手時は配備前検証中だった（上記のv22実機受入へ更新）。配信用checkoutの単体試験はmigrationが部分的なためDB試験を実行できず、全migrationを持つ正本の同試験4/4は合格。full verify・既存Sky公開・Pixelの取消/削除/再読込/D1行不在は上記で完了。クラウド資格情報、料金/予算、Apple Pay、外部OAuthと進行済み案件の保持/削除は別の未完了項目。

## 2026-10-02 — Sky v21公開と残り4 Toolの実機分類

追加受入: Pixelのココナラ案件管理で、合成下書き1件の作成・再読込・タイトル編集・再読込を確認。D1の同一案件1313b4f4-84e6-45d2-9e2f-bf7c3c469871、draft、revision 0→1、update_terms 1件、入出金0件を照合。金額は手数料後見込7800円、担当報酬7566円、見込差額234円で実売上ではない。17入力項目と変更履歴は本人別D1へ内容として保存し、応募前チェックのmetadata-only保存と区別する。実取引・外部連絡・送金、案件内容の保持/削除は未受入。正本の古いpaid-trial未実施表示を既存の50円成功証拠へ合わせ、新たな決済は実施していない。今回は実機受入と証拠同期のみで、配信版はv21のまま。

Sky v21 (659bb8667dc8d18afe4facb90859d9cb79f6576d) 公開成功。Pixelでメルカリ支援の合成原稿、見込950円、本人D1保存、新ページ復元、終了revision 1を確認。受託案件workflowはbrowser下書き・430B Markdown保存・D1 completed/3msを確認。IP Studioのスマホloopback入口を撤去しPC条件を案内、PCでは起動確認未取得と示す。Jev RouterはSky実行未実装／PixelではPCのみ。全34 Toolを実行証拠と接続境界で分類し、ローカル下書きを外部作用に換算しない。正本最新verifyは632 Node/19 Fashion/638 Worker-D1 API合格。0044追加のschema／台帳分類・期待値を合わせ、59 web/113全境界を確認。Cloud AI資格情報と料金・上限管理、Apple Pay、外部OAuth、ココナラ外部実取引・案件内容の保持/削除、OS/app本人連携は未受入。完全ローンチ未完了。GitHub mainはb3e2676、正本実装はローカル未commitでSites source保存と区別。証拠: docs/evidence/sky-pixel-service-acceptance.json。

Sky v20公開成功。PixelでPAPER提案→承認→実行を2件、D1 proposal/receipt/position各2件、仮想残高904.00、再読込後のreceipt一致、次操作への移動、スマホ検索と残高の重なり解消を確認。全34 Toolを証拠別分類し、Mercari・IP Studio・Jev Router・gig workflowのUI受入は未確認として保持。市場修正後のverifyは631 Node/19 Fashion/622 API合格。以後の並行0044 migrationはcanonical schemaと未整合のため最新schema checkは失敗（自身の公開Worker buildは成功）。PCポート38479/8787はlistenなし、Cloud AI keyなし。

全体verify完走：Node631、Fashion19、Worker/D1 API622 assertions合格。PixelでPAPER提案→承認→実行とD1 receipt/position保存を確認。市場サンプル表記・次操作への移動・完了履歴の再取得を実装し公開受入中。

Sky v18公開成功。Pixelココナラ合成チェック完了（267B入力／180B出力／8ms、D1 completed）、端末保存と新しいページからの成果復元、モバイル操作列・出力可読性を確認。匿名desktopは入力保持・別タブSkyサインイン・GET再確認を受入。関連18試験合格。全体verifyは630/631、並行schema変更のDB表数期待111/実112で失敗し後続段階未実行。Cloud AI credential、Apple Pay、Coconala案件台帳の実利用受入、外部OAuth実行は未完了。

Sky v16公開成功。履歴保存の固定診断と二重計算防止を反映。ココナラの案件入力を保持する別タブサインイン／GET再確認を実装し、公開受入を進行中。

履歴保存の診断とlocal計算例外の単発失敗を実装。関連14試験合格。公開受入と全体検査を実施中。

法務・特許の任意local履歴を公開v14へ実装し、v15でMarketの別タブsignin/reloadと法務の処理表示を修正。Pixelでは法務のcompleted/input406B/output998B/3ms、特許のcompleted/input539B/output4650B/2msをD1で確認。特許の初回保存は未確認警告となり、入力を保持した明示再実行で保存できたが初回原因は未特定。特許は架空数値によるmetadata/復旧試験で、内容品質・出願受入ではない。Desktopの未認証法務はlocal結果と未保存表示、Marketは401のsignin/reloadと検索入力保持を確認。本文非送信、未同意通信0、二重生成防止等の関連試験と全体verify620件・Fashion19件・Worker/D1 API540項目に合格。実AI鍵、Apple Pay対応端末、外部OAuth／Providerと未試験Toolが残り、完全ローンチは未完了。GitHub main保存とSites公開は別。

## 2026-10-01 — Sky本番決済の診断とCSV復帰導線

追加: 50円試験のJPY表示固定と、決済復帰時の本人受付への移動・server状態の案内を実装。換算無効・Worker fixtureを含む対象36試験、型検査合格。変更前の全体verifyは614件、Fashion 19件、Worker/D1 API502項目に合格。公開v13でPixelのJPY50のみ表示、未払いキャンセル案内、既存支払済み受付への自動復帰を確認。全体verifyは614件、Fashion19件、API508項目で再合格。法務・特許の標準ガイドはdesktopの合成入力で結果表示・特許パケット保存表示まで確認したが、この時点ではserver履歴未接続だった。後段の任意local履歴受入を参照。

Cloudflare workerdで `redirect: error` の非対応を再現。StripeとSky MCPを `manual` に変更し、非2xxを拒否して転送先への資格情報漏えいを防ぐ。実workerdの50円Checkout fixtureと302拒否を追加。前段の正本verifyは604件＋API483項目が合格。

本番CSV決済開始が502で停止したため、Stripe応答のHTTP status・許可リスト内のerror code・検証したrequest IDだけを記録する診断を追加。秘密値・Provider message・入力本文は記録しない。CSVは完了後も同じ画面で成果物を取得できるようにし、途中の401で利用可能状態を解除してサインイン復帰を表示する。対象Stripe/50円試験31件と型検査は合格。本番50円試験はStripe確認済み・処理完了。Pixelで結果CSV保存、同一受付の再読み込み、成果物4種の復元、保存CSVとserver成果物SHA-256一致を確認した。WebhookはStripe側でJPY 50・paid・livemodeと200配送を確認。作成済みCheckoutには旧店舗名のsnapshotが残ったため、public profileをavokado Skyへ修正した。新規Checkoutはavokado Sky表示を実機で確認し、未払いキャンセル後にquoted/unpaid・attempt 0を確認。Apple Pay実機、desktop復帰、外部OAuth、クラウドAI本番応答・実費は未受入。

文章モデルadapterはOpenAIのusage（入力・出力・合計・cache token）を妥当性確認して返し、処理時間を計測する。usage未提供はnullで、費用を推定しない。Provider資格情報のredirect転送を拒否し、timeout=504／transport・不正JSON・未完了応答=502を区別する。失敗時の自動再送は行わない。本文やAPIキーの新規保存なし。9件のfixtureは合格、実Provider接続と料金照合は未実施。

## 2026-10-01 — SIM/eSIM販売チャネル共通のRockstar利用権claim基盤

最新要件を現行注文・eSIM・認証・端末・Cloud実行の実装と照合した。`sky_commerce_orders`はSky package注文、`esim_provider_orders`は回線profile、`esim_device_entitlements`はattested install evidenceに限定し、いずれもRockstarサービスの購入権利と同一視しない。再利用可能なowner認証、issuer trust、D1 atomic constraint、Cloud task recovery、Wallet budget/usage receipt、device capabilityを整理して[監査・フロー](docs/sim-service-entitlement-claims.md)へ記録。

物理SIM/eSIM/service-only offerから来る署名claimをRockstarアカウントへ一度だけ結ぶ`POST/GET /api/rockstar/entitlements`、operator trust key resolver、D1 table/migration 0039を追加。Ed25519署名/domain、scope/form factor、one-time code hash、expiry、same-owner idempotency、cross-owner replay rejectionを検証。`/connect`はoperator issuerが設定されると署名claim bundle入力とowner-scoped利用権を表示する。built Worker/D1 API suiteへclaim HTTP認証・引換・再送・別owner拒否・tampering試験を追加し、`ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED=true`時のCloud Agent新規委任に`agents` entitlementを要求した。expired/refunded/revoked claimはscope checkでinactive。Preview defaultはenforcement off。本番販売・契約・決済・carrier activation・issuer key deployment・production billing・OS installを示さず、本番launch flagはまだ無効。`npm run verify`成功: Node 602/602、Fashion 19/19、Worker/D1 API 463 assertions、typecheck/lint/build、bundle/assets checks。seller refund/revocation feed、全service authorization integration、Zema estimate/current spend/itemized usageは次の作業。

## 2026-10-01 — Local AIのcanonical memory storeを実装

AI03に着手。native Python CoreへSQLite canonical memory storeを追加し、本人確認済みの内容だけをowner＋project単位で保存する。本文とmodel-specific projectionはOS cipher adapterで暗号化する必須契約とし、鍵adapterがなければ初期化を拒否する。更新時はrevisionを比較し、canonical変更と同時にprojectionを失効。model profile版ごとのprojectionは正本から再生成し、生成中に正本が変われば保存を拒否する。expiry、delete、content-free tombstone、参照専用list、入力上限も実装。

実装と9件のfocused testは[canonical memory store](systems/rock-star-os/src/blackberryrock/memory_store.py)、[test suite](systems/rock-star-os/tests/test_memory_store.py)、[設計・受入境界](docs/ai-memory-architecture.md)、[証跡](docs/evidence/ai03-canonical-memory-store-20261001.json)。追加後に全体`npm run verify`がexit 0（Node 595/595、Fashion 19/19、Worker/D1 424 assertions、production build、asset closure）。loopback testにはsandbox外のローカルsocket許可が必要だった。`RecordingCipher`はin-process test doubleのみ。production OS cipher、Android/rockd/Zema接続、schema migration、backup/restore、Tool別read scope、実機受入は未実装なのでAI03はin_progress。Java/AndroidのAI02 build・offline inferenceも環境不足で未検証のまま継続。

## 2026-10-01 — Android Broker AIDLへeSIM attestation challengeの鍵準備を接続

Shell API v5へ`provisionEsimGatewayKey`を追加し、Shell開発設定からサインイン済みWeb注文画面が発行したchallenge JSONをBrokerへ手動で渡す経路をsourceへ接続した。BrokerはCore validatorでUUID・期限・32-byte nonce・attestation authority／key rule／packageを検査し、nonce由来のaliasでhardware-backed AndroidKeyStore P-256鍵を作る。同じnonceの再送は同じ鍵と証明書チェーンを返し、chain上限を24KBに制限する。結果はpending server verification/install proofと表示し、本人IDをAIDL引数として受け取らず、eSIM profile状態も読まない。Shell↔Broker instrumentationにはinvalid challengeがBinder経由でblockedになるassertionも追加した（Android SDK未導入のため未実行）。

Core JVM suite 60/60（今回追加したchallenge validator 3/3を含む）、`npm run os:check`、`npm run android:architecture:check`が合格。`npm run verify`もexit 0（Node 595/595、Fashion 19/19、Worker/D1 API 424 assertions、typecheck/lint/production build/bundle/assets）。Android SDK platform/build-toolsは見つからず、Android APK/AIDL実コンパイルは未実施。AIDL/APK compile、instrumentation、browser-to-app automatic handoff、attested receipt submit、OEM/carrier installation evidence、private TLS verifier、Provider sandboxは未受入。手順は[Android workstream](docs/workstreams/07-android-device-local-ai.md)、全体設計は[RockstarOS detailed design](docs/rockstaros-complete-design.md)へ反映。

## 2026-10-01 — Androidの自動eSIM導入tierを端末能力へ接続

Android Broker capability snapshotをprotocol v3へ更新し、Device/Profile Owner登録、Android 15 managed-subscription管理適格性、organization-owned端末での自動profile有効化適格性を30秒の端末内観測として追加。profile一覧、ICCID/EID、通信会社のcarrier privilegeは読まず、プラン適合や実導入の証明にも昇格しない。Skyの購入履歴画面は通常AndroidのOS確認待ちと署名付き導入証明待ちを案内し、契約準備書にBYOD／管理端末tierとEMM/OEM/LPAの確認事項を追加した。Android 15の自動有効化条件は[公式EuiccManager API](https://developer.android.com/reference/android/telephony/euicc/EuiccManager)と[AOSP eSIM architecture](https://source.android.com/docs/core/connect/esim-overview)へ固定。

Android向けAPI adapterとshell UIのprotocol更新、JSON schema、Coreの純粋Java classifierと5試験、OS契約/static checksを追加した。14 Sky UI tests、typecheck、product lint、design index、OS source-contract checkは合格。その後 `npm run verify` はexit 0（Node全件、typecheck/lint、production build、asset checks、Worker/D1 API 410 assertions）を完了。Android Core JUnitおよびAPK/instrumentationはGradle/JRE/Android SDKがこの環境にないため未実行。device-owner enrollment、LPA/carrier権限、利用者確認/port競合、signed install proofをGL066または専用managed SKUで通す必要があり、eSIM/OS導入完了は未受入。

## 2026-10-01 — Sky CSVの50円決済試験

本人の実課金50円指示により、通常の3,000円受付と別のサンプル試験をStripe Hosted Checkoutへ接続する実装を追加。サーバー固定JPY50、永続Session、本人分離、署名WebhookとStripe再取得照合、未払い・返金・紛争の拒否を82の関連host試験で確認。型/lint成功。公開Sky v8へ配備済み。Pixelの本人ログインで無料サンプル処理・検査合格・納品表示・再読込復元を確認。CSVダウンロードはブラウザの既存result.csv表示まで確認しbytes/hashは未検証。本番資格情報の登録と本人のApple Pay決済・有料納品受入は未完了。詳細は `docs/sky-csv-trial-payment.md`。

## 2026-10-01 — SkyのPixel実機受入準備

PixelのUSB承認後、既存の限定property readerでPixel 10／GL066／frankel、Android 17・API37、build CP3A.260905.009を確認。端末serialは証拠へ保存しない。Rock Shell／Broker／記事Toolは0.1.0、試験runnerは未導入。Web27/27・CSV8/8・端末reader3/3に加え、現行buildの全体verifyはexit0（Node550、Fashion19、合成API376）。初回API失敗は新しいeSIM試験と旧buildのずれで、再build後に同じ試験が合格した。証拠は `docs/evidence/sky-pixel-service-acceptance.json`。端末診断の成功はSky画面・本人サインイン・実行/保存やOS実機受入の合格ではない。PixelのSky画面操作は本人から明示許可済み。Vanadiumで公開Marketの表示、Android向け絞り込み、CSV検索1件、詳細からCSV専用画面への移動と未ログイン時のサインイン案内を実機確認した。本人ログイン、受付・処理・保存・再表示・ダウンロード、本番利用者の分離は未受入。スクリーンショットと結果を受入JSONへ記録した。

## 2026-10-01 — eSIM購入前の初期pack比較

公開eSIM catalogとSSRページに、server planが固定する初期Agent PackのID・版・Package一覧を追加。表示名・要約はSky Registryの現行審査、exact package key、manifest SHA-256再計算が一致した時だけ返し、欠落・review失効・manifest改変を`unavailable`と表示する。顧客向けresponseにprovider bundle、卸価格、manifest hashは出さない。購入は契約条件が確定するまで無効のまま。公開catalog・order statusのpositive/negative Worker/D1経路、eSIM suite 41/41を追加し、`npm run verify`はexit 0（Node 540/540、Fashion 19/19、Worker/D1 API 328 assertions、build/assets checks pass）。実packageの登録、サインイン済み画面受入、端末install proofとentitlement接続、Provider sandboxは残る。

## 2026-10-01 — eSIM初期packの購入履歴表示と全体再検証

eSIM注文status APIが、不変order snapshotから選ばれたstarter packのID・版・package一覧を返し、購入履歴UIに名称・要約と現行審査状態を表示する。審査済みRegistry上でexact hashの一致が確認できたpackageだけを利用可能と表示し、未登録・失効分は利用不可とする。端末へのインストールや実行権限を得たと誤認しない説明も併記。追加したWorker/D1 assertionを含め`npm run verify`がexit 0（Node 539/539、Fashion 19/19、API 322 assertions、build・asset checks合格）。eSIM host 40/40、typecheck、lint、Sky Agent Runtime dry-runも合格。サインイン済みブラウザ受入、実package登録と端末導入・entitlement連携、Provider sandboxは未実施。

## 2026-10-01 — Skyサービスのローンチ設計と前提条件の表示

利用者の1時間の設計・実装指示に基づき、`docs/sky-launch-design.md`を追加。独立Skyを正本に、本人確認・カタログ・実行/成果・作者公開・決済/購入権限・OS/他アプリadapter・Mini適合・保存/削除・監視/復元を設計。`data/sky-service-launch.json`は段階別の必須受入を持ち、完全ローンチ未合格を保持する。Sky専用Siteのruntime外部接続は未設定。秘密・本人情報を返さないservice-status API、外部AI未接続時のガイド表示、CSV保存前提の表示、Sky内のヘルプ/戻り導線を公開。作者申請の入力前サインイン案内・再接続導線を追加。本番readbackでDB接続可、R2設定あり、AI/決済接続待ちを確認。運用・受入手順は `docs/sky-launch-operations.md`。公開URLの存在と本番ログイン後の実行を区別する。既存製品サイト・旧OS Siteのデザインを変更しない。

## 2026-10-01 — Local AIモデル切替をロードreceipt後へ変更

API v4のread-only `ParcelFileDescriptor`引渡しに、Broker側の`ModelProfileActivationCoordinator`を追加し、publisher署名確認 → Broker private staging → Local AIでexact profileをload → receipt/status照合 → PlatformStore active pointer更新をsourceで接続した。load後にcommitが失敗した場合は旧profileの再loadを試みる。PlatformStoreは別profileを利用中のactive workまたは直近のplan reservationがある間は切替を拒否し、Zema submitとprofile activationは同じprocess lockを使う。静的契約検査とCore JVM 46/46は合格。

全体の`npm run verify`はexit 0（Node 539/539、Fashion 19/19、Worker/D1 API 322 assertions、production buildとasset checks）。eSIM関連host testsは40/40、bootstrapだけなら17/17。Cloudflare local A2A Workflow positiveは4/4、restart／invalid-proof試験は3経路すべて送信claim 0で停止し、Node/Python A2A client interoperabilityは7/7。これらはhost fixture/local cloud runtimeの証拠で、Provider sandbox・本番Cloudflare・eSIM実発行・端末圏外・実機AIへ転用しない。

契約前の実請求、eSIM発行、production dispatchは引き続き無効。Sky eSIM catalog/購入は販売主体・日本の卸/再販・サポート・料金条件が確定するまでread-onlyである。A2Aはnative device gatewayとWallet reservation/settlement handoff、Provider sandbox受入が未完了。モデル切替はAndroid coordinator sourceまでで、user-facing catalogue/API、production artifact source/trust key/license configuration、tokenizer/template stagingが未完了。Android SDK platform/build-toolsがないためautomation/AIDL/APK build、Binder、Pixel profile swapとoffline inferenceは未検証。

## 2026-10-01 — Android端末能力snapshotをv2へ拡張

Android Brokerの短期`deviceCapabilities`に、eUICC状態だけでなくOS申告のmanufacturer/model/device/product・API level、ActivityManagerのRAM観測、アプリ領域の空き容量、touch/input/audio/camera/connectivity feature、Brokerが署名・version・APIを検証したLocal AI runtimeの現在状態を追加し、JSON Schema protocol v2へ固定。Shellは機種・資源・基本feature・runtimeのモデル読込状態を表示する。ZemaはLocal AIの計画前後に同じ署名済runtimeがready/modelLoadedであることを再確認し、不明・未読込ならWorkをqueueしない。これはmodel profile identity/weight hash/適合性の証明ではなく、native RockstarOS適合と端末内LLM適合は引き続き未評価。ICCID/EID・profile一覧は読まず、30秒で失効し、cloud送信もしない設計。classifier/shell instrumentationと静的契約検査を更新。`npm run verify`は終了コード0（Node 530/530、Fashion 19/19、API 301 assertions、build/assets checks成功）。一時Temurin 17／Gradle 8.11.1でAndroid-independent Coreをcompileし、Ed25519 publisher verifierと再開可能なweights stager追加後は46/46 JUnitが合格。Android SDK platform/build-tools/NDKがないためAndroid APK/AIDL compile・instrumentationは未実施。Skyの一般capability registry、SIM挿入イベント連携、端末適合試験は次段階。

## 2026-10-01 — 衛星接続のMVP経路を調査

自社衛星網を初期製品の前提にせず、既存携帯網のdirect-to-cell連携を先に調べる方針を契約準備・継続設計に反映。日本の具体候補はKDDI au Starlink Directで、au以外向けeSIMプランと開発者向けアプリ試験手順が公開されている。通常のデータ用eSIMとは別capabilityとして扱い、衛星時の通信制限、対応端末、アプリ掲載、請求・卸契約を切り分けた。KDDIのPixel 10シミュレーション掲載はRockstarOSやGL066の実機受入を意味しない。KDDIへの照会、契約、衛星接続/フィールド試験は未実施。独自衛星の周波数・規制・衛星/地上局・製造/打上げ・運用の実現性評価も未完了。詳細は[契約準備](docs/provider-contract-readiness-20260930.md)と[継続設計](docs/sky-cloud-continuity.md)。

追補: Android公式仕様に合わせ、制約付き衛星網は既定でアプリから使えず、アプリ本体のmanifest opt-inと低帯域最適化が必要と確認したため、動作・queue試験前のopt-inは保留。KDDIのアプリ掲載基準に公開開始6か月と別契約/NDAの可能性があり、同社模擬試験では衛星固有RFを再現しないことも記録。調査証跡は[衛星接続調査](docs/evidence/satellite-connectivity-research-20261001.json)。ソースコードの衛星adapter、KDDI照会、申込、契約、模擬/実地試験は未実施。

## 2026-10-01 — 端末能力を選択・実行条件へ結ぶfixtureを強化

Linuxの独立AI route fixtureで端末能力snapshotをschema/source/platform/30秒期限付きにし、route側の必須feature宣言、false/unknown拒否、能力digest/evidence/expiry固定、reserve/claim時の鮮度・完全一致再確認を実装。更新後・期限切れ後のplanは再承認を要求し、provider/model/cloudへの自動fallbackはしない。契約とfocused SQLite試験は[compute device capability contract](contracts/compute-device-capabilities.json)・[AI Cloud strategy](systems/rock-star-os/docs/CLOUD-AI-STRATEGY.md)。26 focused tests pass。公開ソフトウェアfixtureのみで、Android Broker、Sky UI、実端末測定、SIM挿入時自動判定への接続は未実施。AI05をin progressへ更新。

## 2026-10-01 — 圏外継続の同意をZema／Broker／Cloud Workerへ固定

Cloud A2A委任の`continueWhileDeviceOffline`をZema画面に追加し既定off化。UI・API・storeは明示trueがないjobを受け付けず、SQLite/D1のmigration `0033`は既存recordをfalseとして扱う。本人の選択はidempotencyとapproval digestに含まれ、Broker Ed25519 proofを`rock-a2a-broker-authorization/2`へ上げて署名対象にも固定。native Broker Wallet予約検証とCloud Worker preflightがtrueを要求するため、legacy row／false署名proofは外部send前に止まる。圏外中に新しい停止・承認を届けられないUI制約も表示。

検証: A2A fixture 46/46、Cloudflare Wrangler/Workerd Workflow positive 3/3（署名済みusage receiptをWorkerが検証し、USD 1.00の内部予約からUSD 0.37だけ精算、親pool `reserved=0/settled=37`、同意false時の送信claim 0、曖昧送信のhold保持・再送禁止）、process restart fixture（別Workerd/local D1でprepared job復帰・proof不備時send claim 0）、Python Broker 33/33、Wallet/Spend 17/17、API Worker/D1 301 assertions、typecheck成功。PythonとTypeScriptのBroker固定authorization digestとsigned-bytes hash一致。これはfixture/local integrationであり、本番cloud・端末圏外・Provider契約sandbox・実機Broker署名の受入ではない。Worker usage poolはnative Wallet残高と別台帳であり、funded Wallet settlement handoffとProvider invoice照合は未完了。契約後のCloudflare shared D1/secretと外部task lookup/cancel、funded Wallet、device Gatewayは未完了。詳細は[継続実行設計](docs/sky-cloud-continuity.md)と[Sky/MCP workstream](docs/workstreams/02-sky-mcp.md)。

2026-10-01 全体回帰確認: loopbackを使うA2A相互運用fixtureのため、このturnだけlocal network permissionを有効にして `npm run verify` を再実行し、全工程を終了コード0で完了。repository/version/schema/database/release/signing/baseline/design/architecture/device gates、型、lint、Node test suite、MCP package、billing/operator dry-run、Fashion suite、production build、web bundle/assets、最後のWorker/D1 API 301 assertionsまで通過。release/Android readinessの未達項目はblocking状態のまま正しく報告され、検証scriptはそれらを製品受入済みへ昇格しない。個別 `node --test` sweepは529/529成功。これはlocal source/fixture検証であり、本番Provider契約・本番配備・実機eSIM/OS・圏外継続の受入ではない。

## 2026-10-01 — Sky eSIM購入前ページとprovider請求モデル比較

Skyに`/sky/esim`ページとread-only `/api/esim/catalog`を追加。顧客向け条件は、server-owned発行manifestに存在する公開済みplanだけを表示し、provider bundle名・卸値・内部package識別子・為替/margin仮定を除去する。契約/価格/販売条件未確定のため、購入を常に無効化。未設定は空catalog、壊れたcatalogは購入不可の状態で503。売価・coverage・有効期間を創作せず、既存の有料注文履歴とeSIM導入情報表示からアクセスできる入口を作った。CSS・responsive grid・empty/error stateを追加したが、本人署名/実機eSIM installのUI受入は未実施。

公開provider資料で通信会社直接請求とRockstar再販を比較。eSIM Go Travel APIは60日超の同一国内利用を制限し得てIoT用途不可、first-line supportをpartnerへ置くため、lifeline/専用hardware供給源には使わないと記録。初期lifelineでは、通信providerを契約/請求主体にできるかを先に確認し、できなければ再販・国内規制・返金/サポート責任が確定するまで販売を無効にする推奨を追加。購入前catalog + pricing fixture 8/8、typecheck、product lint、Sky check、project check、design check成功。リポジトリ全体`npm run verify`は開始したが、本記録時点ではNodeテスト終盤の出力待ちで未完了。実provider・売値・契約・決済・本番配備・実機installは未受入。詳細は[provider契約準備](docs/provider-contract-readiness-20260930.md)、[Wallet / Billing / Providers](docs/workstreams/03-wallet-billing-providers.md)、[機種適合表](docs/workstreams/07-android-device-local-ai.md)。

## 2026-10-01 — Android Broker snapshotへeSIM能力を追加

eUICC診断をShell直接読取からBroker-owned `deviceCapabilities` protocol v1へ移行し、JSON Schemaを追加。Android公開APIのfeature宣言と`EuiccManager.isEnabled()`をBrokerが読み、非対応・管理無効・有効・確認不能を区別。MEPはAndroidの申告として表示し、snapshotはmonotonic elapsed timeで30秒後に期限切れ、Shellは失効時に未確認を表示して再確認を案内する。Shell instrumentationにはschema・expiry・権限境界の検査を追加し、classifier4状態試験はBroker moduleへ配置。CI静的契約検査も追加した。ICCID/EID・profile一覧は取得せず、`READ_PHONE_STATE`も追加しない。profile有無、通信プラン適合、RockstarOS全体の機種適合は未確認／未評価。設計・構成・型チェック合格。Java runtime／GradleがなくAndroid compile・instrumentationは未実行。能力を購入条件・Broker実行可否へ反映する汎用Capability APIも未実装。

## 2026-10-01 — A2A cloud縦断とprocess再起動を再検証

現作業木で`npm run sky:a2a:workflow:positive`が3/3通過。許可済みA2A送信と暗号化成果保存・owner限定復号、圏外継続同意なしの送信拒否、dispatch応答不明時のindeterminateと費用予約保持・再送禁止をCloudflare Workers Vitest／local Miniflareで確認した。再起動後の応答不明jobも同じWorkflowから再dispatchされず、remote send claimは1件のまま。`npm run sky:a2a:workflow:test`も通過し、同じlocal D1を使う別Workerd process間でprepared jobを復旧、認可なし・期限切れ・失効の3件が全て外部送信前に停止し、remote send claimは0件。証拠は[local A2A workflow](docs/evidence/sky-a2a-workflow-local-20260930.json)。どちらもfixture/local環境のみで、Cloudflare本番耐久性、実Providerの応答消失後task照合、資金化Wallet、device Gateway、実eSIM、実機圏外継続の受入ではない。次はProvider sandboxでmessageId/request reference照合・cancel・usage receiptを実証する必要がある。

12件の圏外継続シナリオについて、既存host/local D1/local Workflowの証拠と未検証境界を[ローカル証拠対応表](docs/sky-cloud-continuity.md#ローカル証拠の対応表全体受け入れ数には算入しない)へ明記。11件には部品レベルの部分的証拠があり、端末内編集とcloud成果の縦断競合（#10）は未実装。全体シナリオ受け入れは引き続き0/12で、この文書整理はProvider sandboxや実機合格に算入しない。

## 2026-10-01 — MCPの価格不明・従量課金Toolをfail-closed

製品要件との再監査で、MCP標準には署名見積もり・予算予約・usage finalityがなく、既存PC Connectorが単発承認だけで価格不明Toolを実行し得る穴を特定。SDKに明示的な料金モデルを必須化し、remote MCPの提供者metadataとローカルTool descriptorの価格区分をPassport digestへ固定、価格区分の更新で既存承認を無効化する。未知・subscription・usage・external contractは直接実行を拒否し、価格不明は画面に未確認と表示。`free`も提供元の自己申告・Rockstar未検証と表示し、本番の非課金証拠にはしない。従量課金agentは署名見積もり・cap・usageを持つA2A経路へ案内する。[evidence](docs/evidence/mcp-pricing-gate-local-20261001.json)

検証: Connector/SDKの統合12/12、typecheck、product lint、production buildが成功。第三者metadataの真実性、Provider契約・sandbox、Wallet実資金、production billing、SIM/cellular/device acceptanceは未検証。次はA2Aのローカルbudget reservationを権威あるfunded Walletへ接続する境界を監査し、接続先契約後の受入項目を残す。

## 2026-10-01 — Android CoreへA2A Provider receipt再検証を追加

Cloud handoffの既存署名検証を端末側でも独立確認できるよう、Android-independent Coreへ`A2AUsageReceiptVerifier`を追加。Cloudflare TypeScript／RockstarOS Pythonと共通のcanonical signed bytesを使い、Provider/key/origin trust tuple、owner・parent job・delegation・remote task、agent名/版、価格版、通貨、budget cap、receipt時刻、meter合計を確認する。未知／失効鍵、field改変、task/owner不一致、超過上限を拒否する。shared fixtureのsigning bytes SHA-256一致とEd25519 signatureを確認し、Core JVM 62/62合格。[evidence](docs/evidence/android-a2a-usage-verifier-20261001.json)。ただし検証器はまだAndroid Broker Gatewayや永続Android Wallet reservation/settlementへ配線していない。Android APK/AIDL、hardware-backed Broker fetch/apply、本番trust key、Provider sandbox、funded Wallet、実機は未受入。

## 2026-10-01 — SIM利用開始・cloud継続・料金gateを再回帰

製品方向の訂正後、SIM/eSIM entitlement claim、/connectのサービス入口、Worker/D1の主要API、圏外継続A2A Workflow、MCP価格gateを現作業木で再実行。SIM入口/claim 4/4、Worker/D1 API 638 assertions、Cloudflare Workerd A2A Workflow 9/9、MCP Connector/SDK 12/12、typecheck、product lint、production build、Sky/設計/project status checkが成功。[回帰証拠](docs/evidence/product-direction-regression-20261001.json)。これらはローカルD1・合成ユーザー/provider鍵・制御fixtureの証拠であり、実販売、通信開通、Provider本番請求、実資金Wallet、Android Gateway、実機OS/eSIM導入を証明しない。次はAndroid Brokerの署名済み精算handoff取得・Wallet適用経路を進める。PATH上のJava/GradleとAndroid SDKは確認できないが、既存tmpのTemurin/Gradleを再利用してAndroid-independent Core JVM試験は実施できた。Android APK/AIDL compile、実機受入は別途未実施。

## 2026-10-01 — Android CoreでCloud A2A receipt署名を再検証

Cloud→device settlement handoffのAPI署名検証だけに依存せず、Android CoreにProvider/key/agent-origin固定のEd25519 A2A final usage receipt verifierを追加した。owner・parent job・delegation・remote task・agent名/版・pricing version・currency・cap・期限・itemized meter sumまでWallet hold contextと照合し、Cloudflare TypeScript／RockstarOS Pythonと同じ固定canonical bytesを通す。未知・失効鍵、改変、binding不一致、超過額を拒否する。既存tmpのTemurin 17／Gradle 8.11.1で` :core:test` 62/62合格。[evidence](docs/evidence/android-a2a-usage-verifier-20261001.json)。次はこの検証器を永続Android Wallet reservation/settlementとBroker Gatewayへ統合し、Android SDK/Binderと実端末で別途受入する。本番鍵、funded balance、Provider契約、実課金は未設定・未受入。

## 2026-10-01 — 購入履歴からeSIM導入情報を確認

有料注文のカード内に、eSIM状態確認と安全な導入情報表示を追加。注文状態は利用者が押して確認し、本人限定one-shot APIから導入情報を明示操作で取得する。許可されたApple／Androidセットアップリンク、SM-DP+・有効化コードの手動入力案内、導入後のサーバー暗号文消去を実装した。リンクのホスト・パス・LPA形式を画面側でも検査し、referrerを送らない。注文確認時や通常購入時にeSIMプロバイダを呼ばない。delivery request keyは同一タブ再試行に備えてsessionStorageへ保持する。API暗号化・配信試験13件、Sky marketplace関連試験（UI guard追加）、typecheck、対象lint、本番buildは合格。Sky購入履歴の実サインインブラウザ受入、Provider sandbox、実端末install、QR表示、機種適合判断は未実施。詳細は[Wallet/Billing/Providers](docs/workstreams/03-wallet-billing-providers.md)。

## 2026-10-01 Sky専用サービス公開

専用URL https://sky-marketplace.noellesugar1.chatgpt.site/sky/marketplace を一般公開。利用者が一般公開を明示了承し、access_mode publicの反映成功。Site version3、source 4d6d66332f7793b3e0d47ac175e100b6fea10b56、deployment appgdep_6abdfec3f6b081918cfca91dae0a06e5 succeeded。製品サイトと旧OSサイトは変更なし。公開ブラウザでMarket→出典整理→未サインイン実行禁止→OpenAI公式ログイン画面への遷移を確認。本人ログイン後の本番処理は未実施。公開DBには初期化済みmarker version1をreadbackし、164 schema statement（26 triggerを含む）の準備完了を確認。Sitesの通常migration配備はSQLITE_ERRORだったため、専用配備adapterで新規DBの確定schemaをprepared statementで初期化し、全guard完了まではAPIを503にしている。既存正本migrationと既存SiteのDBは変更しない。adapterの控えはservices/sky-web、実配備sourceはSitesへ保存。正本の全verify520 tests＋Fashion19＋API265はadapter追加前の受入で、adapterは型/build・SQLite冪等適用・公開DB marker受入のみ。製品サイトの案内リンク追加は編集権限待ち。Mini対応、外部Provider、本番課金の合格ではない。

## 2026-10-01 Skyサービス専用配備の現在地

ROCK／WEB04。専用Site appgprj_6abdfad4c5648191bcae957913bd02faへsource 42bce8666253f2c976769f18db39158e4f25dc4aとarchive-backed version1を保存。本人限定配備appgdep_6abdfbe97d948191a1ff061a058464d3はincomplete input: SQLITE_ERRORでfailed。live URLなし。一般公開access変更も自動審査に「専用URL承認は一般公開の明示承認ではない」と拒否され、custom owner-onlyのまま。DB guardを除去して配備を通すことはしない。次はnative配備のSQL初期化失敗を調査し、成功readback後に許可された公開範囲へ反映する。製品サイト・旧OSサイトはこの配備で変更していない。製品サイトの導線追加は編集権限待ち。GitHub mainへのpushは未実施。

## 2026-10-01 Sky単独アプリの起動設定

ROCK／WEB04。利用者指定によりSkyをOS内と単独アプリの共通マーケットプレイスとする。Sky専用manifest・layoutを追加し、起動先を/sky/marketplace、scopeを/sky/に固定。既存OS manifestとデザイン、API権限、Provider gateは保持。公開サービスURLと製品サイトからの案内は承認済み、配備・実端末インストールは未実施。検証: 型・設計台帳・関連試験成功。npm run verify完走、Node 520/520、Fashion 19/19、API 265 assertions、build・asset closure成功。依存台帳948/911/49、DB103件へ古い試験期待値を同期。専用Sky Site appgprj_6abdfad4c5648191bcae957913bd02faを登録し、配備準備中。公開access拡大は自動承認審査に拒否され、現時点では本人限定を保持。

## 2026-10-01 GitHub正本と公開版の再照合

ROCK／WEB04。GitHub APIでmain b3e2676abd8ae2a0b3f78f48483e067b429d9bc8と16 branchの一覧を確認。同SHAのローカル正本は3725 tracked files。app/components/libのWeb OS、sites/avocado-miniのAstro公開製品サイト、Android、native、services、toolkits、設計・進捗・release gateの役割を照合。Webホームは大時計とSky/Zema/Wallet/Market/設定のlauncherであり、公開先の旧7c79e43版とは異なる。誤配備のversion41 rollbackは最新版の復元ではない。製品サイトとOSホームの両方で既存デザインを維持する。製品サイトの16試験成功。独立コピーのverify再実行はnpm test中に進捗停止したため中断し、今回の全合格とは記録しない。過去519 tests合格の証拠と区別する。全ファイルの意味的レビュー・全branch受入・本番機能受入は未完了。次は正本最新版と本番配備sourceの同期、製品サイトの編集権限回復、既存Sky経路の公開受入。別サイト新設やデザイン再作成を行わない。


## 2026-10-01 配備先の訂正

利用者指定の公開先は https://avocado-mini.kirin-999.chatgpt.site/、正本のサイトsourceはsites/avocado-mini、project appgprj_6aaf6a375b908191b3b0c1845dc78291。前記Sky配備version42は別のRockstarOS Siteへの誤配備であり、正しい公開先の完了ではない。別Siteを更新前のversion41へ復元するdeployment appgdep_6abdec2936dc8191b714c5e478447f52がsucceededで更新前へ復元済み。正しいSiteは現Sites接続でget_siteがNOT_FOUND、管理可能一覧にも存在せず、所有アカウント接続または編集権限が必要。正しいSiteの公開変更は未実施。ローカル実装は保持。

## 2026-10-01 Sky文章サービスのサイト配備

Site version 42／source 5e95d35ee64f3c5c40a7e95a054debbda1d66e04／deployment appgdep_6abde80dd2c8819197264c2a885073a1がsucceeded。https://rockstaros-kaiya.noellesugar1.chatgpt.site の `/sky/marketplace`へ、出典整理・記事の無料版・応募前チェックの3件と本人操作による同一ブラウザ成果保存を反映。既存Site配備元7c79e43に必要範囲だけを実装し、配備版の全verify（279 tests／495 API assertions／build／asset closure）成功。GitHub mainの統合や34 Toolの本番受入ではない。一般公開→管理者限定のaccess変更は自動承認審査が「公開依頼は公開範囲変更の承認を含まない」として拒否したため、既存public設定のまま配備。旧管理者限定要求との相違は未解消。


## 2026-10-01 Sky文章ツールの成果再利用

ROCK／WEB04: Sky Market経由の出典整理・無料記事・応募前チェックの既存実行画面に「この端末に保存」、保存成果再表示・削除を追加。原稿は端末処理、成果は本人が選んだ同一ブラウザのlocalStorageへ全Tool合計20件、サーバーには本文を送らない。共有端末の閲覧可能性とMarkdown代替を明示。関連15試験・typecheck成功。独立作業コピーの全verifyは519 tests・265 API assertions・build等完走（既存database-status期待件数101→102の整合を含む）。実ブラウザでMarket検索→出典整理→保存→再読込→再表示、無料記事作成・保存を確認。稼働コピーは2026-10-01チャットのwork/sky-service。共有作業treeの以後の変更はこの合格へ算入しない。本番未配備。配備元7c79e43のSiteは一般公開設定で、以前のOS管理者限定要求との相違があるため公開範囲の回答待ち。アカウント別クラウド成果同期・実Provider接続の合格ではない。

# RockstarOS — 事業・設計・進捗

## 2026-10-04 — SPIDER第24cycle: Undiciの脆弱な依存版を更新

Security／ROCKのSYS15としてDependabot #4／#8の公式advisoryと全依存経路を確認した。root lockのUndici 7.29.0が対象範囲にあり、既存PR56は一部を7.29.1へ上げるがwrangler下に7.29.0を残す。Cloudflareの追加更新や重複PRは作らず、既存PR52でUndiciだけを7.29.1へ統一するoverrideを追加した。他の依存版は保持する。

実BalancedPool／Poolへの合成設定で、接続先へのTLS検証callback継承を3形式×3upstreamで確認した。同じ3回帰はintegrity確認済みの旧版で全件失敗、修正版で全件成功。接続を禁止してconstructorだけを検証し、実TLS handshake、WebSocket通信、製品からの脆弱経路到達は実証したものと扱わない。WebSocketの修正は公式advisoryとupstream sourceで確認した。

lockの重複1件を除いたlicense一覧906件／unique873件を再生成し、要審査47件と公開未承認条件を維持。評価日を監査日に揃え、期待件数だけを更新し関連35試験成功。容量不足のため全依存のlocal installは行わず、隔離lock解決と限定回帰を実施した。独立reviewは阻害要因なし。required verifyはproject〜system構成まで成功し、既存ai未導入で停止した。GitHub同一SHAのclean install・全体試験・個別alertを別途確認する。Dependabotのdefault-branch警告はmain未統合の間openであり、件数だけで解消と呼ばない。第23cycleの同一SHA検査結果は改善記録へ同期する。

## 2026-10-04 — SPIDER第23cycle: 旧MCP入口の互換範囲を固定

Security／ROCKのSYS15として、基準`f7d110c`の同ref全49 CodeQL ID・Dependabot18件・既存PRに変化がないことを確認した。旧`/mcp`は基本4機能の現役互換callerが使う一回券の限定例外だが、IDだけで同名の別接続定義・追加操作を転送できる。許可Origin／sessionとPC所有者のregistry設定が前提であり、無認証侵入や現行4機能の外部副作用を実証したものではない。

同梱MRの正確な接続定義と4機能・既存lifecycleへ限定し、対象外をtransportより前で403拒否する。汎用server IDのprepare／本人確認／execute、SPIDERデータ検査は維持する。新2回帰は旧sourceで200転送を検出し失敗し、修正後は定義7形式・入力6形式の拒否と転送0を確認。第3回帰で実同梱MRのlifecycle・4機能を合成入力で通し、関連31試験がfail／skip0で成功した。最初の互換試験は通知へidを付けたtest側誤りを訂正し、runtimeを変えず再検証した。PC画面側のdevice-lifecycle試験は既存esbuild未導入で読込失敗し、GitHub同一SHAで別途確認する。

Connector ZIPだけをsourceと同期し、MR／vendor／SDK配布物は保持する。 独立reviewは阻害要因なし、ZIP66ファイルがsourceと完全一致。project／database／design検査は成功し、ローカル全体verifyは既存ai依存未導入で停止した。既存／新警告を解消扱いせず、公開後に同一SHAの全体verify・個別alert・SPIDER履歴・native source検査を確認する。実通信probeの担当turnはツール側のsecurity制限で未完了として扱い、代わりに無作用transport stubで転送境界を検証した。実credential、外部Provider、公開配備、main統合、実機操作はない。

## 2026-10-03 — SPIDER第22cycle: SDKの不正認証でprocessが停止する欠陥を修正

Security／ROCKのSYS15として基準 `1b116e4`のCodeQL #41を調べた。元のtest専用descriptor→loopbackの固定本文・401確認は秘密漏洩と認定せず、隣接SDK認証の可用性欠陥と分ける。JS文字数一致の後でUTF-8 Bufferを比較しており、43文字／86 byteになる未認証入力がtry外の例外を起こした。隔離したSDK childへLatin-1 43 byteのヘッダーを1件送ると応答なし・exit1を再現した。初回sandboxのlisten EPERMと、文字を変換するHTTP client経路の401は再現成功と別記した。

SDKはstring型確認後の2つのBufferのbyte長を検査し、同じBufferを定時間比較する。新1回帰は旧sourceで失敗し、修正後は不正4形式を401で拒否して同じchildのhealthと正当なlist／Tool実行、正常終了・descriptor削除を確認した。SDK6＋Connector6＋descriptor10を一括1回実行し21 pass／0 fail／1環境条件skip。loopbackに接続できる未認証clientの可用性修正であり、Internet／browser到達や秘密漏洩の実証ではない。元#41を解消扱いせず、同一SHAの全検査・個別stateを公開後に確認する。

配布用SDK0.1.3を作り、Studioの導入URLとCLIの最小依存版を同期した。旧archiveは保持し、新tgzの5ファイルが現sourceとbyte一致する検査と、実CLI生成物の版確認を追加した。配布関連4試験も成功し、合計26件中25 pass／1環境条件skip。旧0.1.2へ未反映だった既存Event ID／最大3回送信は配布同期として明記し、新しいruntime追加とは分ける。npm公開・配備・既存Tool更新は実行しない。 独立reviewは阻害要因なし。source／archive hashと検証証拠を保存し、project・database・design検査は成功。ローカル全体verifyは既存ai依存未導入で停止し、GitHub同一SHAでの結果を別途確認する。

## 2026-10-03 — SPIDER第21cycle: 外部フォント検査の大文字ホスト見逃しを防ぐ

Security／ROCKのSYS15で基準 `47a999b`のCodeQL #43／#44を確認した。HTML全体の禁止substring検査で未アンカーは意図的であり、アンカーで拒否を弱めない。一方、大文字・小文字混在の同じGoogle Fontsホストを見逃すため、既存2か所をlowercaseとliteral照合へ変更した。既存10 testの順序・他assertionはbyte一致し、実装・配信物・scanner policyは不変。

対象10件と、それを含むサイト全体19件がそれぞれ1回成功（fail/skip0、19種類・29実行）。実callback全体2つの合成26ケース／旧新52評価で、旧が通したホスト表記8件を新が拒否、既存拒否16件と正常2件を維持した。checked-in distの検査であり、fresh Astro build・ブラウザ通信・配備・runtime脆弱性修正とは扱わない。独立reviewは阻害要因なし。source hashと検証記録を保存し、project／database／designは成功。ローカル全体verifyは既存ai依存未導入で停止した。同一SHAのGitHub検査・個別alert状態は公開後に記録する。

## 2026-10-03 — SPIDER第20cycle: 納品fixtureの読取境界を確認

Security／ROCKのSYS15で基準 `366fb5a`のCodeQL #37を調べる。固定checkout内fixtureを再帰読取するテストhelperと、実際のMCP入力・workspace読取の境界を区別する。基準の全48 CodeQL ID・Dependabot18件・PR53〜56は不変。非export helperの唯一の非再帰callerは固定rootで、現fixture3通常fileはGitとbyte一致しsymlink／untrackedなし。stat/readの競合自体はあるが、checkout／親を同時変更できる主体を信頼するテストの範囲であり、製品の追加修正根拠は得られなかった。実受信はbytesからprivate一時領域へ入り、既存のdirectory handle基準・nofollow・上限付き読取・private snapshotを通る。Node MCP6件とPython納品境界14件が成功（fail/skip0）。独立reviewも一致し、runtime・test・policyを変更せず#37をopenで保持する。project／database／designは成功し、ローカル全体verifyは既存ai依存未導入で停止した。公開後の同一SHA検査は別に記録する。

## 2026-10-03 — SPIDER第19cycle: HTTPSの空CA設定を送信前に拒否

Security／ROCKのSYS15で基準 `f4f0155`の全48 CodeQL ID・Dependabot18件・PR53〜56の不変を確認した。#8／#9のTLS試験serverから関連clientを調べ、HTTPSで空CAがNone-only検査を通り、TLS contextなしのsocketが`HTTPSConnection.sock`へ渡る別の欠陥を発見した。旧sourceの合成loopbackでは空文字／False／0の3件が平文でdiscoverと公開fixture認証headerを送り、応答を受理した。実資格情報や選択文章を使わず、値は保存せずbooleanと件数だけを記録した。

HTTPSでfalsey CAを接続前に拒否する1条件の変更と、新1test・6種類の設定拒否を追加。新testは旧sourceで1test内5 subtest失敗を検出し、修正後は関連31 host試験が成功（fail/error/skip0）。正当PathのTLS通信・HTTP fixture・応答期限・不完全応答・再送しない境界は既存試験で保持した。現runtimeの接続先はローカルHTTP fixtureであり、空CAを渡す外部設定経路や実credential漏洩は確認していない。別実装HubClientは公開fixture資格と固定開発HTTPS範囲を維持。元の#8／#9のserver contextは変更せずopenを維持し、この実装修正を同警告の解消とは扱わない。独立reviewも阻害要因なし。project／database／designは成功し、ローカル全体verifyは既存ai依存未導入で停止した。同一SHAのGitHub clean検証を別に確認する。

## 2026-10-03 — SPIDER第18cycle: MCP結果の検証を強化

Security／ROCKのSYS15で基準 `08e77ff`から、同原因のCodeQL #45／#46を確認する。stdio MCPと承認後Connectorのテストにあるドメイン部分一致を、期待する出典文書と正しい結果欄の完全一致へ強化する。既存testと承認・変更拒否・再送拒否を保持し、runtime認可の修正とは扱わない。基準の全48 CodeQL ID・Dependabot18件・既存PR53〜56は不変。関連host12試験が一回で成功し、独立probeは17ケース×旧新34評価で旧判定が通す誤出力13件を新判定が拒否した。正常2ケース・既存拒否2ケースを維持。stdioは完全lifecycle callbackを合成collaboratorで、Connectorは変更対象assertion群だけを評価し、実HTTPの承認境界はhost suiteの証拠と分ける。独立reviewで他のassertion／test順序とproductionの不変を確認。project／database／designは成功し、ローカル全体verifyは既存のai依存未導入で停止した。公開後の同一SHAのclean CIを別に確認する。

## 2026-10-03 — SPIDER第17cycle: HTML報告の完全な出力を回帰検証

Security／ROCKのSYS15で基準 `f0a59b1`のPR52 open、main31ef33a、同一refの全48 CodeQL ID・Dependabot18件・既存PR53〜56の不変を確認した。対象#30はHTML報告の負例テストで、小文字のscript tagだけを否定していた。productionは5特殊文字をエスケープし、現APIのjob ID制約／固定warningとartifact取得の認証・header境界も別に維持されるため、runtime XSS修正とは扱わない。

静的な期待HTML fixtureを追加し、既存の小文字sampleを含む7入力をjob IDとwarningで個別に照合する。通常出力を含む15renderを既存test内で確認し、関連CSV6＋fee2のhost8件が成功。checkoutにiconv-liteがないため、lockと同じ0.7.3の既存sibling依存へbare importだけを向けるwork-only hookで実行した。依存・lockを変更せず、npm ci環境の証拠とは区別する。旧・新callback全体の合成比較では正規出力を両方が受理し、旧判定が通す5種の追加HTMLを新判定はすべて拒否した。小文字scriptの負例も両方で拒否。独立reviewで静的fixtureのmarkupとliteral期待値を確認した。project／database／designは成功、ローカル全体verifyは既存ai依存未導入で停止し、公開後の同一SHA検査を別に確認する。

## 2026-10-03 — SPIDER第16cycle: 許可Originの完全一致を確認

Security／ROCKのSYS15で基準 `c2ccfdb`のPR52 open、main31ef33a、同一refの全48 CodeQL ID・Dependabot18件・既存PR53〜56の不変を確認した。対象#36は `loadConfig({}).browserOrigins` の配列に対する完全な要素一致で、URL文字列の部分一致による認可ではない。通常HTTP入口は環境文字列のsplit／trim／filterで得る配列を使用し、request本文からconfig型を変更する経路は確認できなかった。loopback bind／peer、Host完全一致、設定済みbearer／tenant認証を分けて追跡する。修正が必要な欠陥は現範囲で確証できず、runtime・test・scanner policyは変更せず、警告をopenのまま維持する。 実sourceを抽出したOrigin境界10ケースと既存HTTP／認証関連10試験が成功（初回sandboxの4 listener拒否はEPERM、認可済みhost実行の10成功と分離）。独立reviewも一致し、11 source hashを基準commitと照合した。project／database／designは成功、ローカル全体verifyは既存ai依存未導入で停止し、公開後の同一SHA検査を別に確認する。

## 2026-10-03 — SPIDER第15cycle: 出典保持テストの誤受理を防ぐ

Security／ROCKのSYS15で基準 `5f35b36`のPR52 open、main31ef33a、同一refの全48 CodeQL ID・Dependabot18件・既存PR53〜56の不変を確認した。前回#33 fixedは維持され、今回の同原因groupは#34／#35の出典保持テストである。固定fixtureの出力全体を独立した期待値と照合し、URL文字列が出力の別の場所に残るだけで合格しないようにする。元の本文・有料範囲・footer・コードfence確認と全testを保持し、関連host18件が成功した。各test callback全体を抽出した合成比較では、正しい2出力を両方が受理し、旧判定の全assertionを通る24種の誤出力を新判定はすべて拒否した。独立reviewも問題なし。project／database／designは成功、ローカル全体verifyは既存ai依存未導入で停止。公開後の同一SHA検査と個別alert状態を別に確認する。productionの認証・URL認可・formatterは変更せず、警告をdismissしない。

## 2026-10-03 — SPIDER第14cycle: MCP検証の出力全文を照合

Security／ROCKのSYS15で基準 `d2640f0`のPR52 open、main31ef33a、同一refの全48 CodeQL ID・Dependabot18件・既存PR53〜56の不変を確認した。今回は#33の検証scriptを対象に、期待URLを含むだけで未整形の元入力や異なる文書が合格する盲点を修正する。固定sampleの出力全文との一致に強化し、実stdio MCPが同じ期待値を返す回帰1件を追加。host関連18件が成功した。runtimeのURL認可や認証の修正とは区別し、manual HTTP flowの再実行・OS／実機受入は行わない。旧／新sourceから抽出した実assertionの合成比較で、旧判定が受理する9種の不正出力を新判定がすべて拒否し、実CLIの正解62 bytesを保持した。独立reviewも問題なし。project／database／designは成功、ローカル全体verifyは既存ai依存未導入で停止。公開後の同一SHA検査と個別alert状態を別に確認する。

## 2026-10-03 — SPIDER第13cycle: 前回native失敗の状態遷移を再確認

Security／ROCKのSYS15で基準 `813f8ee`のPR52 open、main31ef33a、同一refの全48 CodeQL ID・Dependabot18件・PR53〜56の不変を確認した。前回native37125210005のattempt1失敗と同SHA attempt2成功を分けて保持し、合成Gameの復旧時残高照合を今回の1件として優先する。workerの戻り値は処理試行の有無であり、remoteの適用成功ではない。元artifact／report／logのhash一致で、実際の失敗は50行の保留残高0対期待103と確認した。旧抽出器が0対10を部分一致させた誤分類を訂正し、元記録は保持する。未適用stallを明示的に未適用で終え、UNKNOWNと元要求の遅延適用を別回帰へ追加した。元の21 assertionとwait/join5箇所・production3秒期限は維持。変更file7＋関連TLS2のhost9件と作業用parser4件が成功した。試験fixture／診断の改善であり、productionの脆弱性修正や元CIの通信履歴を完全に再現した主張はしない。 独立reviewも問題なし。project／database／designは成功、ローカル全体verifyは既存ai依存未導入で停止し、同一SHAのGitHub clean検証を別に確認する。

## 2026-10-03 — SPIDER第12cycle: 一時fixtureの権限拒否試験を確認

Security／ROCKのSYS15で基準 `9e12c12`、PR52 open、main31ef33aと同一refのCodeQL全48 ID・Dependabot18件・既存PR53〜56の不変を確認した。対象は #24〜#28 のテスト用権限設定で、privateなBroker DBの不正mode拒否と、一時socketのDACを広げてもpeer UID認証が拒否する境界を調査する。前回の起動guard修正は同一SHAの全体verify・CodeQL・native1,787件が成功済み。今回の調査と前回の修正を区別する。 #24は私有一時DBの0644を拒否する既存host1試験が成功し、親0700・caller所有・fixtureへのHTTP要求0・通常削除を確認した。#25〜#28は使い捨て領域のUID拒否試験で製品へ未同梱、今回の実Linux root／UID試験は未実行、現在のnative CI対象外。runtime不備は確証できず、修正0・test変更0・dismiss0。通常cleanupと強制終了時の限界を分け、11 source hashと同一SHA公開後検査を記録する。 project／database／designは成功、ローカル全体verifyは既存のai依存未導入で停止し、GitHub clean環境の結果と分離する。

## 2026-10-03 — SPIDER第11cycle: 検証guest処理の直接起動を制限

Security／ROCKのSYS15で基準 `6e88d0b`のCodeQL #13〜#16を追跡した。PR52はopen、全48 alert ID・main31ef33a・Dependabot18件・既存PR53〜56は前回から不変。0755／0666はpeer UID拒否をDACから独立確認する意図的な試験である一方、通常imageにも入る `guest-test.py` 本体には明示起動flagの確認がなく、root／ARM64で直接呼ぶと未指定でもinventory・IPC・権限試験・Tool／simulator変更へ進むことをsourceで確認した。boot wrapperのflag確認だけに依存する起動上の不備として扱い、権限昇格やCodeQL4警告の解消とは呼ばない。

スクリプト本体で副作用前に1個の正確なenable tokenを必須化し、従来のroot／ARM64・default local-full／明示game-isolation境界と、peer認証の負例試験を維持する。旧sourceの合成5ケースは最初のinventory直前まで進み、修正後は新規7・既存4・関連scope7のhost18試験が成功した。拒否時の無副作用・成功markerなしと正規入力の継続を確認し、同一SHA GitHub検査へ接続する。独立reviewも問題なし。project／database／designは成功、ローカル全体verifyは既存の未導入ai packageでllm検査時に停止し、後続gateは未実行。実guest・VM・実機・既存imageの変更は行わない。

## 2026-10-03 — SPIDER第10cycle: 履歴検査の合成fixture保存を確認

Security／ROCKのSYS15で基準 `061808a`、PR52 open、main31ef33aと全48 CodeQL ID・既存Dependabot PR53〜56の状態不変を確認した。対象#5の187行は実credentialではなく、合成Git commitの識別子と固定path／rule／lineによるignore fingerprintである。前段のPAT形状markerもアカウントから取得・発行した値ではなく、検査中に生成する合成値で、削除済みGit履歴・candidate allowlist・diff helperに検査を回避されないためのfixtureである。

既存privacy試験2件が成功し、一時directoryの0700／caller所有／本repo外と通常試験後の削除を確認した。確認済みGitleaks binaryがローカルにないため実binary回帰1件はskip。これは秘密の安全消去や異常終了後の削除保証ではない。製品の秘密保存欠陥は確証できず、修正0・test変更0・dismiss0。scannerとtestが固定control commitと同一byteであることを確認し、source hashと範囲を保存した。GitHubのchecksum固定binaryを使う検証stepと、同じ公開SHAの個別警告状態は別に確認する。

依存修正PR53はnpm ci成功後、変更lockに対するlicense inventory hash不一致でrelease:checkが意図どおり停止している。既存修正を重複作成したり検証を弱めず、そのPRの正確なlockに一覧を再生成・レビューし、componentのscopeとNOT_CLEAREDを維持して残るgateを確認する必要がある。ローカル全体verifyは既存の未導入ai packageで停止した。main統合・dependency branch更新・実機・秘密の失効は行わない。

## 2026-10-03 — SPIDER第9cycle: 認証検証用の一時権限を確認

Security／ROCKのSYS15として基準 `bca17b6`のCodeQL #17〜#20を確認した。PR52はopen、mainと全48 alert ID、既存Dependabot PR53〜56は前回から不変。第8cycleの引数露出修正は同一SHAの全体verify37112042529、CodeQL、native37112042546で検証済みで、host42件とLinux1,780 Python実行を区別する。履歴検査37112042548は665 commit完走・2,364候補で失敗を維持する。

#17〜#20の0755／0666は、固定imageのコピーへだけ注入する専用observerで、root・ARM64・明示boot flag・空のsimulator DB・事前所有者／mode確認の後に実行される。通常製品installには含まれず、新しいuserdataとnetworkなしの検証guestでUID拒否を独立確認するための一時的なDAC緩和である。daemonは本文前に所有者UIDを確認し、秘密のDBは別の0700／0600に保持する。今回の範囲で製品の認証回避や秘密の漏出は確証できず、runtime修正0・test変更0・dismiss0。source 9fileのhashと確認範囲を証拠JSONへ保存した。

関連host2試験と完全合成のboundary7／entrypoint7ケースが成功。通常の失敗時の復元呼出しを確認したが、復元chmod自体の失敗や強制終了の復旧は未証明である。最初の復元失敗で親directoryの復元が飛ぶ制約を残し、失敗時に検証PASSを返さないことと使い捨てguestの範囲を区別する。実guest・UID／DAC・実機の試験は未実行。ローカル全体verifyは既存の未導入ai packageで停止したため、push後の同一SHA検査を別に記録する。

## 2026-10-03 — SPIDER第8cycle: 仮想画面の秘密をプロセス引数から除く

Security／ROCKのSYS15で基準 `1896dc0`、PR52 open、CodeQL38件・Dependabot18件を再確認した。#6のguest stdoutは認証済みSSHからlauncherがmemory内で読む専用応答で、通常ログへの漏出は確認できなかった。一方、後続のbrowser起動がsession passwordをURL fragment付きで `/usr/bin/open` のargvへ渡していた。実launcherの合成呼出しと、自分の合成childだけのprocess引数読戻しで露出面を確認した。別UIDでの取得・実credential・実OS接続は未試験である。

browser起動を固定argvのosascriptへ変更し、厳密なloopback URLだけを標準入力のAppleScriptへ渡す。引数、環境変数、一時ファイルへ秘密を追加しない。10秒期限、出力破棄、固定error、no-open時の秘密未取得を維持し、失敗時に秘密付きopen argvへ戻さない。非browser VNCは既存の秘密を含まない起動を維持する。#6の解消とは区別し、変更後の回帰と同一SHA GitHub検証を記録する。


新4件を含むhost42/42が成功、独立reviewも新4件を再実行して阻害要因なし。Macの実osascriptはブラウザを開かずproduction statementの構文を確認し、合成秘密がプロセス引数に現れないことを確認した。project／database／design整合は成功。ローカル全体verifyは既存の未導入ai packageで停止したため、同じSHAのGitHub検証を確認する。

## 2026-10-03 — SPIDER第7cycle: Unix socketの権限境界を確認

Security／ROCKのSYS15として `94889b1`の高優先度指摘#12／#21／#22／#23を確認した。0660は異なる専用UIDを接続するUnix socketで、親0750はgroup書込みを許さない。認証器はUID1000、powerは0／1002、Platformは0／1000、Walletは0／1002を本文読取前に確認し、各clientも送信前にserver UIDを検査する。今回の範囲で越権経路は確認できず、修正0・dismiss0としてsource／boot／client hashと限定試験を記録する。sourceや配置条件が変われば再評価する。既存host試験4件と合成Handler検証14ケースが成功し、独立reviewも同じ結論。実LinuxのUID／socket権限試験は未実行。ローカル全体verifyは既存の未導入ai packageで停止したため、同一SHAのGitHub検証を別に確認する。

前回 `94889b1`のnative初回とmain-1のみの部分再実行は同一run37105416471で成功した。最大attemptの明示artifact IDと集計report hashが一致し、CodeQL48 IDも状態不変（open38／fixed10）。全体verifyと修正回帰は成功し、履歴秘密検査は既存2,362候補で失敗を維持する。これはsource検証で、OS起動／Pixel／24時間受入ではない。


## 2026-10-03 — SPIDER第6cycle: native再実行の結果選択を修正

Git／CIのROCK担当としてSYS15の改善cycleを継続する。基準 `258fa5d`のPR52はopen、CodeQL38件・Dependabot18件と個別警告状態は不変。前回のHTTP修正は同一SHAの全体verify・修正回帰・CodeQLが成功した一方、nativeは再実行で全5区分が成功しても、最終集計が同名の旧FAIL artifactを拾って失敗した。集計に入ったreportのhashが旧FAILと一致し、新PASSと異なることを実artifactで確認している。

partitionと集計のartifact名をattempt別にし、同run／headで各partitionの最大attemptを選んだIDだけをdownloadする。最新の失敗を古い成功へ置き換えず、欠落・重複・期限切れ・不完全な一覧・取得失敗では拒否する。全partition成功gate、元ログhash・source inventory・discoveryの既存集計は維持し、旧失敗のartifactを削除しない。選択器をsource inventoryへ含め、合成境界試験と同じSHAの実GitHub部分再実行で確認する。Wallet試験の1秒期限や製品コードは変更しない。

選択器の新規23、既存partition／stack15、freeze13の計51 host試験が合格した。独立reviewで選択器23を再実行し阻害要因なし。選択器をsource inventoryへ含める変更に合わせ、freeze検証器の必須入力も同期し、欠落・hash不一致・改変の拒否4試験を追加した。ローカル全体verifyは未導入ai packageで停止し、後続未実行。GitHubで同じSHAの初回と部分再実行を確認する。


## 2026-10-03 — SPIDER第5cycle: PC HTTP受信の無期限占有を修正

Security／ROCKのSYS15で基準 `ce8b0a2`、CodeQL38件・Dependabot18件とPR52の継続を確認した。前回の確認済み14 source hashは不変のため再修正しない。MR HTTPの#10周辺を調べ、固定Origin反射に注入は確認できなかった一方、未認証の遅い送信が逐次serverを無期限に占有する別の可用性問題を実通信の合成fixtureで再現した。試験用0.2秒inactivity timeoutへ0.05秒ごとに送信すると0.913秒保持され、別の正当なOPTIONSは0.65秒timeoutし、占有socketを閉じた後だけ0.001秒で復旧した。

request-line／header／body共通の10秒絶対受信期限をsocket読取ごとに適用し、完全body・解析後もtoken発行／Tool処理前に期限を確認する。通常の分割受信とbuffer先読みを維持し、応答writeには別の有限期限を設定する。単一処理と既存Origin／Host／bearer条件を保持し、MR／Sky MCP両配布ZIPとCI回帰を同期する。loopbackの1接続による無期限占有が対象で、Internet直接到達・flood耐性・OS24時間受入を主張しない。CodeQL#10の解消とは別に実通信で検証する。

macOS Python3.14.7で新しい実HTTP回帰11/11、既存納品境界14/14、MR／MCP／PC adapterのNode18/18（内部Python19）が合格した。独立reviewでも阻害要因なし。両ZIPを再生成し一致を確認。ローカル全体verifyは既存の未導入ai packageで停止し後続未実行のため、push後の同一SHA Linux CIを別途確認する。

## 2026-10-03 — SPIDER第4cycle: source確認と修正不要の境界を記録

Security／ROCKのSYS15として基準 `3cb15f1`のCodeQL38件・Dependabot18件、PR52と既存修正PR53〜56を再取得した。新しい指摘はなく、以前の修正は同一refのfixedを維持していた。今回は#11の端末ID応答header、#7の合成Wallet observer出力、#39／#40のnoVNC typed-array書込、#32の配布bundle内乱数変換をsourceで確認したが、修正が必要な脆弱性は確証できなかった。

端末IDは登録済み制限付き識別子との完全一致・認証後に応答へ設定され、CRLF／LF／TAB／NULの合成4件は登録helperで拒否された。observerは認証付き合成状態から限定したmetadataだけを返し、既存の実SQLite回帰1件が合格。noVNCは固定長byte配列への範囲内NUL書込で、実encoding関数を使う4,102件の合成境界probeと既存desktop host6試験が合格した。bundleの乱数変換は上流の余分な乱数byteによる縮約であり、暗号処理の変更根拠は得られなかった。probeを実HTTP／RFB handshake／実機／乱数品質の受入へ換算しない。

source hash・根拠・試験の限界を[第4cycleの記録](docs/evidence/spider-improvement-cycle.json)へ保存した。runtime・test・vendor・検査設定を変更せず、警告のdismissや広い除外も行わない。今回の修正件数は0、CodeQL38件・Dependabot18件・履歴候補は残る。ローカル全体verifyは既存の未導入ai依存で停止したため、文書反映後の同一SHA CIを別途確認する。次回は確認済みsource hashの変化と他の未確認指摘・既存依存修正PRを調べる。main統合・配備・実機・秘密失効・24時間運転受入は行わない。

## 2026-10-02 — SPIDER第3cycle: 納品検証のworkspace境界

Security／ROCKのSYS15で、基準 `3890f16`のCodeQL42件・Dependabot18件からMR納品照合のworkspace境界を修正した。親symlink経由で外部の契約／保存receiptを読み出す経路を合成fixtureで再現し、成果物とmetadataの実byteをdirectory handle基準で上限付き取得してprivate snapshotで照合する。固定vendorは変更せず、既存PASS／BLOCKED／REVISEを維持した。source pinとMR／Sky MCPの両配布ZIPも同期した。

`a9b10fb`の全体verify、修正回帰、production計測、CodeQLが成功した。新規境界14試験、MR／MCP／PC adapterのNode18（内部Python19）、主546合格／1環境条件skip・失敗0、型検査・lint警告0／エラー0、build・APIまで確認した。実CLI／adapter／MCPの155 byte一致と独立レビューも成功。同一refの#1〜#4それぞれのfixedを確認し、openは42→38件、新規IDなし。各解析SHAとrunは[第3cycleの証拠](docs/evidence/spider-improvement-cycle.json)へ保存した。

Dependabot18件と既存PR53〜56、履歴候補2,362件は残る。履歴検査は同じSHAで659 commitを完走し候補検出による失敗を維持する。初回CIのSky MCP ZIP更新漏れは再生成で修正した。ローカル全体verifyの未導入ai依存停止と容量不足はclean CI成功と分離して記録する。POSIXの安全な読取機能がない環境は拒否し、workspace祖先と同一UIDは信頼範囲とする。OS socket権限#12／#21／#22／#23はsource上の専用group／SO_PEERCRED設計を確認し、このcycleでは変更・dismissしない。main統合・配備・実機変更・秘密失効・24時間運転受入は行わず、SYS15をin_progressで継続する。

## 2026-10-02 — SPIDER第2cycle: PC Tool定義の読取競合を修正

主担当SecurityのROCK、既存SYS15でCodeQL #38を修正した。基準`65b4601`はCodeQL 44件／Dependabot 18件。`a4217bb`でdescriptorを一度開いたhandleに検証・読取を結び、4 KiB上限、所有者・権限・通常file判定、差し替え／肥大化／FIFO拒否を回帰した。main `31ef33a`を作業branchへ同期し、共通Research／Jev transportへ送信前拒否・redirect拒否・固定エラーを保持した。配布ZIP2種も更新済み。別候補#7はsourceで秘密値出力を確証できず、dismissしない。

最終source/test commit `6fdea6f`の全体verify、production build・8経路／8header／配信SW一致の実測、CodeQLが成功した。実依存typecheck・lint（警告0／エラー0）・主テスト546合格／環境条件1skip・関連service／site／SDK試験・build／APIまで完走。#38／#42／#31／#47のbranch instanceはfixedを確認した。検査用テストの同一式が#29→#48として再識別されたため、禁止設定キーと秘密変数参照を等価な別条件に整理し、両IDのfixedも確認した。製品の新規脆弱性2件と数えない。検証run・SHA・hashは[第2cycleの証拠](docs/evidence/spider-improvement-cycle.json)に保存した。

残るCodeQLは42件、default branch Dependabot18件。既存修正PR53〜56を再利用する。履歴検査は`202b5ea`で654 commit完走・2,362候補一致による失敗を確認した（重複を含むpattern一致で秘密の種類数ではない）。ローカルの容量不足と共有依存のworkerd欠落はclean CIの成功と区別して記録する。mainへのmerge、公開配備、秘密失効、OS同一image／Pixel／24時間運転の受入は実施していない。SYS15はin_progressのまま次の小さな修正へ進む。

## 2026-10-02 — SPIDER検出からコード改善への反復を開始

利用者の指示により既存SYS15で`検出 → 原因確認 → 修正 → 回帰テスト → 同一commit再検査 → PR報告`を実装する。metadata-only収集commandは基準commit `936c632`のCodeQL 47件とdefault branch Dependabot 18件を実取得した。1時間ごとのローカルCodex follow-upを設定し、PCとアプリ起動中に高優先度の小さな修正を進め、重要な変化だけ報告する。main merge・deploy・秘密失効・例外拡大は自動化しない。

初回はFashion HTTPの固定bearer認証回避と内部エラー非表示、SW更新messageのorigin／window client境界を修正し、回帰と配布ZIPを更新する。独立Actions jobで回帰を実行し、CodeQLの対象#42／#31／#47を同じrefで再確認する。進捗・検査失敗・未解決候補は[改善サイクル](docs/spider-guard.md#検出からコード改善へ戻すサイクル)とPR #52へ記録する。OS同一image boot、Pixel、24時間運転の未受入と既存baseline gateは維持する。

初回のhost44試験とGitHub回帰が成功し、commit `a13c3f5`のCodeQL再解析で対象3件のfixedを確認した。openは44件、Dependabotは18件。`4c5d32c`でも回帰・CodeQLが成功し、実production buildの8経路／8headerと配信SW一致を検証して測定記録を更新した。最終verifyはrelease／signing64件まで成功後、既存visual baseline1057で停止。後続gateは未実行。[初回cycleの証拠](docs/evidence/spider-improvement-cycle.json)を保存し、未解決候補と依存関係PRの確認を継続する。

## 2026-10-02 — GitHub上の実リポジトリ保護へSPIDERを接続

利用者は`k999ln/rock`自体の公開時のセキュリティ対策とGitHub上での表示を要求した。既存SYS15の範囲に、履歴内の秘密候補を検査する独立Actions check、JavaScript／TypeScript・PythonのCodeQL、metadata-only report、実workflow badgeを追加する。GitleaksとActionsを固定し、候補programは実行せず、scanner／policyはworkflow内の固定commitから読む。既存のsecret scanning／push protectionは有効と確認し、Dependabot vulnerability alertsとsecurity-fix PRを有効化・readbackした。GitHub mainは`b3e2676`でrequired checkなし。main merge、既存CI失敗の免除、実機保護／24時間運転の受入は行わない。最終実行結果と残る候補は[GitHub連携](docs/spider-guard.md#github上でrockを検査する)へ記録する。 scanner6／実policy6／CodeQL設定4件が合格し、637コミットのmerge差分を含む履歴検査は2,357候補でexit 1。候補数は有効秘密数ではない。project／database／designは成功、verifyは既存baseline1057で停止した。source hashと設定readbackはdocs/evidence/spider-github-source-validation.jsonへ保存する。


## 2026-10-02 — コードを貼って自動検査するSpiderファイルを追加

利用者は自分のコードを貼り付けて検査し、編集に追従するクモの表示をファイルとして使う機能を求めた。既存`SYS15`内でoffline単一HTML、共通静的検査module、native owner限定`security.inspectCode`へ接続する。配布先はrepository外の`outputs/SPIDER.html`。入力コードを実行・送信・永続保存せず、SDK／API key不要とする。既存Platformの常駐監視・送信前拒否は維持し、入力から検出した候補だけを表示する。静的分析0件をruntimeの保護成功にしない。[範囲と使い方](docs/spider-guard.md)へ集約し、追加実装はNode 14/14（module 13＋実Worker 1）、native host Python 23/23（検査9＋統合13＋install 1）が成功。ブラウザはexact HTMLをloopback HTTPで配信して編集・指摘・行移動・metadata保存を確認した。file URLの受入、今回native Linux・同一SHA CIは未実施。成果物と12 sourceのhash・試験logを既存証拠へ独立追記し、最終再読込でもsample 4件を確認し、preview画像を目視した。最終verifyは先行7check／signing64件の成功後に既存baseline visual期待値1057で停止し、後続は未実行。project／database／designの整合は成功した。OS同一image／Pixel／24時間運転の未受入を維持する。

## 2026-10-02 — native Spiderの動作検証とSecurity Agent役割への接続

利用者の参照映像と追加投稿に沿い、細い発光関節脚、青い足先の輪、pink／cyan coreを実findingへの移動・囲みへ接続した。新しい実`blocked` counter増加時だけ反応し、非稼働や不正healthでは停止する。Ubuntu 24.04 Linux aarch64のnetwork none・read-only source・UID 1002で通常native buildと全renderer/controller試験が成功。80枚／8秒／10fpsの合成描画fixtureを出力し、拒否反応と巡回を目視確認した。PIN profileは実際のWallet／ATM描画を再確認してsource hashだけ更新し、元のRGB／ROI／閾値を維持したままWallet 14枚、ATM 14枚、誤操作8件の拒否、PIN 11／profile 1試験が成功した。

この段階のverifyは先行7check（signing公開fixture64件を含む）の後、以前から再現済みのbaseline visual期待値1057で停止した。後続gateは未実行。起点`a7cfca3`の129 Python／49 Nodeの旧証拠と、このアニメーションのsource hash・log digestは[機械可読記録](docs/evidence/spider-guard-source-validation.json)で分離する。GIFは描画fixtureのpreviewであり、OS起動や実際の検出ではない。

続く利用者の「セキュリティーエージェント」指定を受け、実際の監視・検査・拒否・報告の役割、worker/findingに基づく状態、最新の実拒否metadataをPlatformとnative表示へ接続した。最終Linux backend 26/26、native build／全renderer suite、Wallet 14／ATM 14枚・誤操作8件拒否・PIN readiness 11／profile 1が成功し、役割表示と直近拒否の最終画像も目視確認した。最終source 14 fileとlog／previewのhashを前の証拠と分離して保存する。文書同期後の最終verifyも先行7check／signing64件の成功後に既存baseline visual期待値1057で停止し、後続は未実行。project／database／designの個別整合は成功した。現在はnative security panelを維持し、OS全体overlayは未選択。既存`SYS15`は`in_progress`、固定scope・UID・権限を維持し、同一image boot、QEMU、Pixel、24時間運転は未受入。[詳細設計](docs/spider-guard.md)、全体OS設計§19.1、設計台帳を同期する。

## 2026-10-02 — Spider Guardの継続検査と送信前保護に着手

利用者は秘密コード・個人情報をクモが優先して守る機能について、表示デモではなく`k999ln/rock`の実処理への接続と、常駐先をRockstarOS本体とすることを指定した。Security / Identity / ComplianceのROCK担当として`SYS15`を`in_progress`で管理する。Platform UID 1002による固定範囲監視、MCP prepare／submitとRunnerControl prepare／初回send claimの送信前拒否、認証付き状態とnative表示、同梱・boot監督が主対象。Web／Connector送信前検査は補助とする。[詳細設計](docs/spider-guard.md)、OS全体設計§19.1と既存security設計台帳を同期した。既存`SYS02`とRQ01〜RQ49、Operator Dock分離、Pixel/QEMU・署名・公開のgateは保持する。

Linux container（Colima／Debian bookworm、Python 3.13、network none、UID/GID 1002）でnative回帰125、supervisor 3、install 1、計129/129 Python試験が成功（skipなし、ResourceWarningをerror扱い）。Web／MCPのNode試験49/49、typecheck、lint:product、MCP配布物一致も成功した。native Cは`-Werror`でbuildし既存UI suiteが合格。生存・monotonic鮮度の両方を稼働表示に必要とし、送信本文だけでなくmanifest・recipe・key／endpoint metadataを検査する。監督は同じUIDで再起動し、Linux subreaperでcrash後の孤児process groupを終了・reapする。[機械可読証拠](docs/evidence/spider-guard-source-validation.json)と[再現command](docs/spider-guard.md#検証と引継ぎ)を記録した。対象はbase HEAD `b3e2676abd8ae2a0b3f78f48483e067b429d9bc8`上の未commit作業木で、same-SHA CIやremote main反映ではない。

全体`npm test`は455件中444成功・11失敗であり、全体合格とは記録しない。変更前HEADでもvisual baselineの同じエラーとREADMEの2つの期待文言欠落を確認した。D1試験もHEADの必要42fileだけで9件中2成功・7失敗（37対32の6子試験と親）を再現し、計11失敗が変更前から存在することを確認した。Spider描画fixtureとactive／staleの目視確認も成功した。最終`npm run verify`はproject／repository／version／schema／database／release／release:signing（公開fixture64件）まで成功し、HEADでも再現する`baseline:check`の既存visual期待値で停止した。後続gateをこの実行の成功へ換算しない。変更したproduction／test sourceのSHA-256を機械可読証拠へ保存した。同一image boot、QEMU、Pixel実機、24時間運転は未受入で、`SYS15`は`in_progress`を維持する。


## 2026-10-01 — Zemaのモデル版固定に必要なCore identityを公開

事前に作る`ModelProfilePin`から、profile manifest digest、weight/tokenizer/template hash、runtime component/version/signer/API範囲、plan schema、資源条件を取得できるようにした。Brokerが後続のprofile-aware Local AI APIへ渡し、loaded modelと正確に比較するためのCore側データ契約。既存DBのpin内容を変更せず、Coreテストにprofile/runtime identityの比較を追加。Zema接続、API v3、署名された本物のartifact検証、Javaテスト、2モデルの実機切替は未完了。

## 2026-10-01 — eSIMの契約前fixtureを再検証

bootstrap、plan catalog、eSIM Go webhook/provider、install-material、scheduled reconcilerの5スイートを実行し33/33件合格。すべてhostまたはlocal D1 fixtureで、Provider sandbox、実eSIM発行、端末install、実課金の証拠ではない。A2AのCloudflare positive Workflowは未受入。HTTPS公開originとBroker承認を維持したまま成功を試すには、利用中Miniflare/Wranglerの対応test harnessで外向きfetchを確実にmockする必要がある。localhost HTTP宛先を通すための本番egress許可変更は行わない。

## 2026-10-01 — eSIM状態APIの注文種別をWorker/D1で検証

`GET /api/esim/orders/{orderId}/status`が、paidの通常Sky商品までeSIM発行待ちと誤表示しないことを修正・検証。eSIM plan catalogに一致する注文だけ`paid_waiting_for_esim_issuance`、通常のpaid Sky注文は`not_esim_order`を返すこと、他の本人からは注文状態を取得できないことを実Worker bundleとlocal D1のAPI統合試験に追加。`npm run build`、`npm run typecheck`、`npm run test:api`成功。API suiteは273 assertions。合成ownerとlocal D1のみで、Provider sandbox・実eSIM発行・端末install・実課金は未実施。

## 2026-10-01 — eSIMのネイティブ追加リンクを暗号化して本人へ渡す

公式eSIM Go v2.5資料にある`additionalFields=installUrl`を既知order referenceのassignment readへ追加。Apple/Android各URLのhttps host・install path・LPA carddataを検証し、ICCID/Matching ID/SM-DP+と同じowner/order AES-GCM材料内へ保存する。install-material APIの本人認証と一度限りのdelivery keyを維持し、悪意あるhostは拒否する。read-only reconciliation／restart経路でも取得を再開できる。eSIM fixture sweep 34/34、型チェック成功。実Worker/D1 API統合試験は289 assertionsで、別ownerの取得拒否、材料・直接install link返却、acknowledgement後の暗号文消去を確認。公式資料を再確認し、Cloudflare Containers/SandboxesのGA・上限・価格、Google Cloud Run GPU例、1GLOBAL idempotency key既定24時間、direct installには対応端末とインターネットが必要な点を[供給元契約準備](docs/provider-contract-readiness-20260930.md)へ追加。画面からのネイティブ起動、端末能力判定、QR/LPA fallback UI、provider sandbox、実機installは未完了。

## 2026-10-01 — A2A向けOS Walletの合成予算holdを追加

既存のRockstarOS Value/Spend ledgerを使い、owner・parent job・delegation・approval digest・deadline単位でsynthetic USDを原子的に`AVAILABLE → SPEND_HOLD`へ移す予約状態機械を追加した。未送信時だけreleaseし、送信開始後の結果不明はholdを保ち、明示的trusted usage verifierなしでは精算できない。Hub/MCP commandとHTTP統合、台帳整合・idempotency・上限超過・pre-dispatch release・indeterminate retention・一度限りsettlementを確認。Python Spend/Hub testsは25件成功。

同日、A2A署名を有効にするBrokerへWallet reservation authorizer注入を必須化。さらに`ValueSpendRuntime.authorize_a2a_proof`を追加し、owner・device・delegation・親job・通貨・cap・承認digest・millisecond期限を同一Wallet transactionで照合し、proof失効までhold releaseを防ぐ。runtime 17件、Hub HTTP 9件、Broker core 33件、A2A Node/Python protocol suite 34件成功。Broker testは実Wallet callableを注入して署名とfenceを通すcross-module fixtureを含む。Cloudflare local Workflow/D1でも、形状・署名が正しい期限切れproof、失効鍵proof、proofなしを送信前に拒否し、Agent discoveryとremote send claimが0件であることを確認。test proofに署名field外の余分な親budgetがあり、以前は期限／失効の個別検査へ到達していなかったfixture defectも修正した。native holdは合成残高でありcloud側論理poolと同一資金ではない。device Gatewayへのproduction wiring、実Provider positive Workflow、実署名鍵、実資金／provider請求は未接続で、production A2A executionはdefault-off。[設計・境界](docs/value-spend-runtime.md) · [Wallet/Billing workstream](docs/workstreams/03-wallet-billing-providers.md) · [Broker boundary](systems/rock-star-os/docs/MCP-BROKER.md)

## 2026-09-30 — A2A 1.0のNode／Python独立fixtureとのpositive interopを追加

`tests/a2a-client.test.mjs`でNode built-in HTTP agentと別プロセスのPython stdlib HTTP agentへloopback接続し、同一A2A clientを通じたAgent Card discovery・Broker authorization hook・message/send・tasks/get・tasks/cancelを検証。異なる応答順序（即時completed／submitted後completed）、成果artifact、JSON-RPC ID・A2A-Version・messageId・origin・input digestを確認し7/7成功。これは自作local fixture間のprotocol interopであり、独立した商用Agent provider、Cloudflare Worker positive dispatch、production、実Wallet予約の受入ではない。実行gateはdefault-offを維持。Wallet正本はlocal synthetic balanceだけであり、cloud workerからのactual-funds reservation contractは未実装。[fixture](tests/fixtures/a2a/python_agent.py) · [client test](tests/a2a-client.test.mjs) · [A2A Bridge](docs/sky-a2a-bridge.md)

## 2026-09-30 — eSIM Go V3 callbackをfixture inboxで安全に受け付ける

公式V3 callbackのraw HTTP bodyをHMAC-SHA256検証してからparseし、64KiB上限・UTF-8 strict parseを強制。numeric ICCIDは元tokenから読み、専用keyed HMAC digestだけを保存する。内部binding helperはSky orderのlive/paid・buyer・商品key・manifest版・refund=0を検査し、callbackをowner/orderへ結ぶ。未bind通知はprofile発行完了後に同じdigestを使い再照合する。通知だけではservice accessもSky注文状態も変更せず、body/ICCID/Matching ID/SM-DP+はDBへ保存しない。1分ごとの最大10件reconcilerが、署名済みcallbackのICCID HMAC digestを既知provider-completed・paid orderだけに照合し、order referenceを使ったprovider GET確認へつなぐ。通知単独で発行・利用権を変えない。

現行公式API v2.5 adapterは非課金`POST /orders` validate、server-side cost/currency上限、paid・review-active packageに束縛した`esim_provider_orders` one-shot dispatch marker、取引後のorder ref/profile digest記録、binding、`GET /esims/assignments?reference=`によるprovider_completed復旧を実装。provider APIには確認できるclient idempotency fieldを見つけられなかったため、timeout/503/不正成功応答は`reconciliation_required`で停止しtransactionを再送しない。wholesale上限超過時は発行claimを作らず取引しないこと、平文install secretsがDBへ残らないことを追加で検証。本人認証付き`POST /api/esim/orders/{orderId}/issue`を追加し、paid/live owner orderをserver-owned plan catalogのretail amount・通貨・manifestと照合してからserviceへ渡す。Provider debit gateはdefault-off。install materialはAES-GCMでorder/ownerに束縛して保存し、同一delivery keyでのみ再取得でき、owner acknowledgement後にciphertextを削除するAPIを追加。catalog version・provider→retail換算比・fee reserve・minimum margin・retail額・bundleをcanonical JSON snapshotとSHA-256で発行注文へ固定し、quote時も同じmargin floorを検査する。換算とreserveは設定値で、実provider invoice／決済明細の受入ではない。migration 0032とtransaction/restart/delivery/pricing snapshot fixtureを追加。既発行注文向けにowner認証status GETとread-only provider order/assignment GET照合routeを実装し、保存済pricing snapshotをcatalog更新後も再利用する。eSIM固有fixture 17件、Webhook/profile/order/adapter 8件、catalog/snapshot 4件、install-material 2件、直前の全体検証で全Node 513/513、今回追加したscheduled reconciler fixture 2/2は個別合格。今回の`npm run verify`は完走し、Node全体テストを含むrepository・schema/database・design・architecture・typecheck/lint・build・asset closure・265-assertion API integration checksが合格した。Miniflare/D1 testsはsandbox内のloopback制限で停止するため、許可されたlocal integration executionで再実行して通した。未接続はpricing assumptions/fee reserveを契約・実明細で確定すること、callback inboxのscheduled自動相関、reference不明のtransaction照合、実API account/key/sandbox/production deployment、本番再起動試験、実端末install。test fixtureは実Provider決済・実eSIM・実機受入ではない。作業treeに未コミットの変更を保持し、push/main統合なし。[発行実装](lib/esimgo-provider.ts) · [本人認証ルート](app/api/esim/orders/[orderId]/issue/route.ts) · [導入情報保管](lib/esim-install-material.ts) · [導入情報delivery](app/api/esim/orders/[orderId]/install-material/route.ts) · [契約準備](docs/provider-contract-readiness-20260930.md)

## 2026-09-30 — eSIM注文の読み取り専用照合を追加

owner-authenticated `POST /api/esim/orders/{orderId}/reconcile`を追加し、provider debitなしで、記録済みorder referenceの`GET /orders/{reference}`とassignment GETを照合してprofile bindingを再開する。status・bundle・価格・通貨・profile digestが一致しなければ導入情報を保存せず、二つ目の注文も作らない。`GET /api/esim/orders/{orderId}/status`はownerのpaid注文に限り、発行・照合・profile binding・install-materialの大まかな状態のみ返し、ICCID/Matching ID/SM-DP+は返さない。各APIは発行時に保存したpricing snapshotを再利用するため、catalogの後日の更新で既存注文の条件を差し替えない。order referenceも得られなかった`reconciliation_required`は自動照合できず、状態表示と手動調査が必要。共有Sky Runtimeの1分cronへ、known-referenceのpaid・未返金注文だけを最大10件読むeSIM reconcilerを追加。別々のAPI/ProfileHash/InstallMaterial secretがなければno-opで、1件失敗しても次へ進み、provider transactionは呼ばない。local DB fixtureは既知referenceからbinding成功、同じ注文の再pollなし、reference不明注文の除外を確認。callback inbox相関fixture、既知referenceのprovider GET復旧fixtureは合格。production D1/secretsへの設定、本番Worker再起動試験、provider sandboxと実端末試験は未完了。

## 2026-09-30 — eSIM・クラウド契約候補の公式APIと公開価格を比較

1GLOBAL Connectを本人/注文idempotency重視のeSIM第一打診候補、eSIM Goを公開APIとブランド/Android Direct Install UXの比較候補として、公開公式資料ベースの比較、契約前質問、契約試験gateを追加した。[比較](docs/provider-contract-readiness-20260930.md)。eSIM GoのNetwork Name/Install Name設定はeSIMブランド表示・install UXであってOS導入ではない。Cloudflare Workers/Workflows/D1を既存job controllerの第一候補、Cloud Runをcontainer/GPU workerの第二候補として価格と制限を整理。合意、商用見積、account access、実接続は未取得。

## 2026-09-30 — AI02のModelProfileをBroker仕事・run ticketへ固定

AIネイティブOSの未着手実装へ着手。`RuntimeManifest`／`ModelProfileManifest`の入力検査・publisher署名欄・互換判定・canonical digestと、PlatformStore／Engine schema v2→v3移行、active signer一致のLocal AI runtime登録、候補profile保存、Broker verifier後のgeneration切替、owner/jobの冪等profile pinを追加。`Engine.submitPinned`はprofile pinを仕事行へ保存し、`Ticket`からID/version/generationをworkerへ渡す。profile失効後の遅い結果は拒否する。テストは互換性拒否、検証失敗、profile切替後も旧job pinが変わらず、同一DB再open後にTicketへ残る条件を記述した。AI02はin_progress。

Engine/Coreの暗号化recoverable snapshotへjob profile ID/version/generationとowner-scoped pinを保存・復元するsourceを追加した。モデル本体、検証済みreceipt、active pointerはbackupに含めず、復旧先はpausedのままprofileを未検証として扱う。profile registry/artifact再検証後の同job再開は未実装で、profile情報がない復旧先では既存Engineがjobをreviewへ止める。ZemaOrchestrator・Local AI API v2の実profile選択、実weight verifier、runtimeへのprofile load、二つ目のモデルを同一Pixelで推論・失敗rollbackする受入も未完了。Node全497/497、typecheck、product lint、database／design／Android architecture checksは成功。作業環境にJava runtimeとGradle executableがなくJava/Android testsは実行していない。GitHubへのpush・main統合も未実施。

## 2026-10-01 — API v4でBrokerからLocal AIへモデルを渡すsource経路を追加

別UIDのLocal AIへファイルパスを渡してもBroker private pathを読めないため、認証済み`installAndLoadModel` AIDLを追加し、読み取り専用ParcelFileDescriptorでhash/lengthを固定したモデルだけを渡す設計にした。Broker clientはstaged fileを再hashしてread-onlyでopen。runtime serviceはregular/read-only FD、上限4 GiB、32 MiB空き容量reserve、正確な長さ、SHA-256を確認してno-backup private storageへstream copyし、atomic rename後にruntime loaderを起動する。完了receiptにprofile ID/hash/byte lengthを含め、Brokerは一致とruntime status再読込みを確認する。UI手動importは別profile IDを報告し、署名profile pinと一致しないmodelをZemaが誤認しない。v3後へのv4 patchはclean apply、TypeScript/Jest 23/23、ESLint、offline manifest check合格。RockstarOS全体の`npm run verify`もexit 0（Node 530/530、Fashion 19/19、API 301 assertions、buildとrelease asset checks）。[検証記録](docs/evidence/local-ai-model-handoff-v4-validation-20261001.json)。Android SDK platform/build-toolsがないためKotlin/AIDL/APK build、Binder/device試験は未実施。installerはまだPlatformStore activation/source downloadに接続されず、tokenizer/template/license receipt、production keys、real inferenceは未完了。

## 2026-10-01 — AI02へ再開可能なモデルweight stagingを追加

Broker private storageへHTTP range取得を再開し、応答range・byte上限・空き容量reserveを検査して全体SHA-256一致後にatomic promotionする`ResumableModelArtifactStager`をCoreへ追加。symlink経路を拒否し、cacheも再hashする。中断再開、digest/range/overrun/容量/symlink拒否を含むCore JVM testはTemurin 17／Gradle 8.11.1で46/46合格。対象はweightsのみでtokenizer/template/license receipt、production source/trust設定、PlatformStore activation、別UIDのLocal AI runtimeへの安全な引渡しは未実装。API v3 AIDLにmodel install/load RPCがないことを確認し、Broker-private fileがruntimeから読めるとは扱わない。Android SDK platform/build-tools/NDKがないためAPK/AIDL・端末検証も未実施。次段階は認証されたhandoff/load契約、profile activationへのstager接続、Android host/device受入。[JVM検証](docs/evidence/ai02-core-java-validation-20261001.json)。

## 2026-10-01 — AI02をZemaのprofile-aware API v3経路へ接続

ZemaOrchestratorでSky選択Tool・schema・prompt・contextからrequest digestを固定し、推論前にowner/jobのModelProfilePinを作るsourceを追加。LocalAiConnectionはv3 service、package version、installed signer digest、runtime component/API範囲、loaded GGUF SHA-256とbyte lengthをpinに照合し、profile-aware `completePlanForModel`だけを使う。plan後に同じidentityを再確認して`submitPinned`へ渡す。profile未登録ならworkを作らず、同じowner/request digestの再送は固定済みjobを返して推論を重複させない。API/status/UI contractも更新した。上流Local Action Assistantのhash計測・v3 AIDL patchをbase/plan-v2 overlays後へ追加してhash-lockし、clean pinned sourceで3段階overlay適用を検証した。上流`npm run verify`はTypeScript、Jest 20/20、ESLint、offline manifestを通過。RockstarOSの`npm run verify`もNode 530/530、API 301 assertions、buildを含め成功。Core Javaを一時Temurin 17／Gradle 8.11.1でcompileし、Model publisher Ed25519 verifierとsignature-before-staging pipeline追加後は43/43 JUnitが成功。実行時に判明したplan schema grammar・Ticket profile情報の欠落・Java compile errorも修正した。[JVM検証](docs/evidence/ai02-core-java-validation-20261001.json)。Android SDK platform/build-tools/NDKがないためAPK/AIDL compileとAPI v3 Binder/device試験は未実行。production publisher trust keyset、実artifact receipt/staging、installer接続が未構成で、端末上のv3推論・Pixel受入は未達。

## 2026-09-30 — A2A provider利用量receiptの検証と内部予算精算を追加

provider署名のEd25519 usage receiptをowner・parent job・delegate・remote task・agent/version・currency・価格版・meter合計・予約上限へ束縛し、terminal taskと一致したreceiptのみを内部shared budgetへ一度精算するsourceを追加。重複receiptは冪等、別内容・上限超過・署名不一致・receipt欠落時は精算せず予約を保持する。A2A JSON-RPC標準の機能ではなく`org.rockstar.usageReceipt`独自metadata extension。[仕様と境界](docs/sky-a2a-bridge.md)。

Node fixture testを含む全497件は成功した。これはWallet残高を予約・引落しする機能ではなく、Rockstar内部のA2A job予算処理。production egressはdefault off、trusted provider keys未設定、positive provider sandboxと異なる二つの独立agent実装の試験は未実施。

## 2026-09-30 — Broker署名証明をA2A dispatch直前の認可へ接続

OS Brokerが発行する短命Ed25519 proofを、owner-scoped Web APIで受け取り、現在の委任条件を再照合してD1へ一度保存する経路を追加した。proofをWeb承認前に登録する順序へし、broker署名がなければ委任を`prepared`へ進めない。Runtime Workerは外部Agent Card取得前、送信marker前、A2A `message/send`直前にproofを検証し、owner/device・鍵ID・鍵状態・入力hash・接続先agent/version・予算・期限・承認digestの不一致やproof不在で送信を止める。operator-managed `A2A_TRUSTED_BROKER_KEYS`はfail-closed JSON形式で、実鍵一覧は未設定。実端末の鍵登録・失効、WebAuthn signer、HubGateway wire、Wallet原子的予約、本番D1/secret、Provider sandboxでの委任試験は未完了。schema migration 0024、typecheck、Broker proof fixture 3件、Miniflare Worker/D1 API統合251 assertionsは成功。新設したWrangler local Workflow/D1試験はproofなし・期限切れproof・失効鍵の3件を実行し、各Workflowが`verify-native-broker-authorization-before-egress=false`で完了、`PREFLIGHT_FAILED_BEFORE_SEND`、remote send claim 0件、Agent Card discovery step未到達を確認した。本番D1/secret・端末鍵・Provider sandboxの受入ではない。次はWallet原子的予約、Worker再起動後の状態照合、異なるProvider実装との試験を進める。

## 2026-09-30 — OS BrokerのA2A承認証明を発行・検証する境界を追加

`systems/rock-star-os/os/mcp_broker/Broker.authorize_a2a_delegation()`が外部protected signerへ短命Ed25519 proofの署名を依頼し、request digestと署名proofを既存のappend-only control receiptへ保存する。`lib/a2a-broker-authorization.ts`はowner・device・委任・入力hash・A2A接続先／版・予算・期限を照合し、trusted-key resolverが鍵を返さない場合、条件変更、期限切れ、未知field・危険originを拒否する。Python Broker 45試験とWeb verifier 2試験で同一のcross-language signing vectorを確認し、A2A回帰34件、typecheck、project status検査、loopback-only Worker/D1 API 235 assertionsも成功。公開fixture signer以外のWallet／WebAuthn鍵連携、実機鍵登録・失効、device gateway、D1 trusted-key resolver、runtime hookは未接続。実Broker承認・production dispatchの証拠ではなく、実行gateと空egress allowlistは既定のまま。

## 2026-09-30 — A2A委任の本人承認APIを追加

Sky A2A adapter/storeに、明示的な本人承認ゲートを実装。新規レコードは`awaiting_approval`から始まり、サーバーがowner・親job・依頼本文hash・接続先と版・予算・期限を含むapproval digestを計算する。認証済み同一ownerが完全一致digestをapproveした場合だけ`prepared`へ遷移し、一度だけdispatch claimできる。未承認・期限切れ・取消済みはdispatch不可。認証・same-origin・owner-scopedな一覧、履歴、承認、取消APIを追加した。依頼本文はこのAPIでは保存／送信せず、native Broker snapshot、Wallet予約、agent接続・worker、Zema UIも未接続。A2A関連15/15、typecheck、対象lint、schema/database/design check、buildが成功。Miniflare Worker/D1 API統合は209 assertions成功（新A2A経路も検証）。schema追加に伴うdatabase inventory testも更新し2/2成功。`npm run verify`は変更前HEADから再現する`baseline:check` visual system assertionで停止する。全体`npm test`は長時間無出力となったため中断し、途中でR5 baseline 2件と古いdatabase count 1件の失敗を観測した。database countは修正済み。これは実Providerやcloud継続の受入ではない。

このadapter/storeはまだproduction dispatch経路に接続していない。実Broker snapshot、Walletの共通予算予約、Zema画面、端末切断後も動くcloud worker/queue、異なる実装間の実相互運用、Provider sandboxは未実装・未検証。次は承認条件をZema画面で人が確認するUI、本文を安全に永続化する方法、provider registry／認証情報の所有者境界を実装し、契約後に耐久workerへ接続する。既存の未コミット変更を保ち、GitHubへのpush/main統合はしていない。

## 2026-09-30 — A2A agent間委任adapterの基礎実装

利用者が示した「AIエージェントをつなぐ役割」を、設計記録からA2A clientとowner別D1 child-task storeへ進めた。`lib/a2a-client.ts`にA2A 1.0.0 JSON-RPC discovery／send／status／cancel、Broker hook、origin制限、結果不明の再送禁止を実装。`agent_delegations`と`agent_delegation_events`のmigration/storeはowner、parent job、idempotency、承認digest、予算上限・期限、dispatch claim、remote task状態とappend-only遷移記録を保存する。client 6件＋SQLite/D1 store 6件、typecheck、対象lint、schema:checkが成功。`database:status`は87 tables、production readback 0/6でremote migration未適用。詳細は[Sky A2A Bridge](docs/sky-a2a-bridge.md)。

このadapter/storeはまだproduction経路に接続していない。実Broker snapshot、Walletの共通予算予約、Zema画面、端末切断後も動くcloud worker/queue、異なる実装間の実相互運用、Provider sandboxは未実装・未検証。次は認証済みSKY07 APIから親job・Broker承認digestを検証し、persist-before-dispatch、worker復旧、再接続照合を進める。既存の未コミット変更を保ち、GitHubへのpush/main統合はしていない。

## 2026-09-30 — エージェント間接続基盤の要件

利用者の指示を受け、Skyの能力発見・比較・接続、Zemaの委任・成果管理、Core/Brokerの権限・共通予算へ責任を分けた。MCPを維持しA2Aを公開仕様候補とした。親子の委任契約、循環制限、二重処理防止、取消と実停止の区別を[接続設計](docs/sky-mcp-architecture.md)と開発プロンプトへ追加した。この時点では要件のみ。その後、部分client adapterを追加したが、異なる実装間の相互接続は未実装・未試験。

## 2026-09-30 — 人・端末・サービスへの適合とGTA対象化

利用者の明示指示を[Sky接続設計](docs/sky-mcp-architecture.md)へ反映。共通Coreとadapter、個人profile・端末能力・接続先仕様の分離、GTAの版・対象機能別受入を追加した。既存IP Studio、Asset Registry、作者SDKとゲーム接続設計を再利用する。今回は要件・開発プロンプトの更新で、GTA adapterコード・実ゲーム試験は未実施。関連SKY07／SKY15／DX01の過去の完了範囲は拡張しない。

## 2026-09-30 — 自社衛星網の構想を記録

利用者は衛星を飛ばして通信範囲を広げる方針を示した。eSIM・地上回線・衛星・クラウドをつなぐ調査要件を[継続実行契約](docs/sky-cloud-continuity.md)へ追記。自社衛星網は長期調査対象で、対象地域、速度、可用性、同時接続、対応端末、周波数、衛星数、費用、契約は未確定。端末圏外中のcloud継続とoffline AIを維持する。衛星設計・製造・打上げ・実接続の実行証拠はない。

## 2026-09-30 — 圏外中のクラウド継続実行を必須要件へ

利用者の採用指示を受け、[継続実行契約](docs/sky-cloud-continuity.md)を作成。受付receipt、本人・入力・権限の固定、親子共通予算とdeadline、追加承認待ち、停止未確認、再接続時の照合、既存runner／Zemaとの境界、12件の受入シナリオを準備した。関連SKY07はin_progressのまま。これは文書と受入計画であり、controller実装・cloud配備・LLM実行・実機検証は今回未実施。次は承認snapshotと受付receiptの既存Sky/Zema統合。

## 2026-10-01 — A2A受付応答消失後の同一依頼照合

POST応答が失われた場合、Zemaは同じ親job・要求キー・本文hashでowner-scoped status lookupを行い、返った行のID・送信先・予算・期限・圏外継続同意まで保持中requestと照合してから既存approval digestを再表示する。新しい要求キーで再投入しない。API統合301 assertions、A2A store 21件、typecheck、product lint、buildが成功。これは受入応答復旧のローカル経路で、外部Providerが受付済みだが応答しないremote taskの照合とは別。契約sandbox、実cloud、実機受入は引き続き未完了。

## 2026-09-30 — eSIM専用製品の開発着手（当時の履歴・2026-10-02に製品境界として撤回）

利用者は製品をeSIMで完結させ、現段階では開発だけ行うと明示。主担当はWallet / Billing / ProvidersのROCK、既存BIL02に関連する発行・利用権連携をhost fixtureとして開発する。通信会社、決済、既存Skyへの実接続、端末への導入は未実施。物理SIM購入・回線契約・課金は行わない。既存Sky Package / Wallet / OS権限の契約は維持する。

host実装と異常系を含む15件の試験、demoに合格。詳細は[開発ガイド](toolkits/esim-bootstrap/README.md)。通信会社の代替fixtureを使う試験であり、実Provider・購入画面・端末受信部の統合は未実施。次は既存Sky本人・利用権adapterへ接続する。変更箇所のlint・全体typecheck・design:checkは成功。npm run verifyは既存visual baseline検査で失敗し、変更前HEADの全入力でも同じ失敗を再現。npm test全体は別の既存資料テストで失敗を観測後、進行が止まったため中断し、全体合格とはしない。GitHubへのpush・main統合は未実施。

## 2026-09-26 — avokadoホームの用途紹介を体験中心へ簡素化

利用者の「説明すぎる」という指摘に従い、ホームの用途紹介から3コマ・矢印・役割表・長文を撤去。研究、制作、生活、ゲームを一場面ずつ示すコンセプト画像と短い見出しに置き換え、各カードからMini／Proの商品説明へ進めるようにした。既存の製品画像、価格、単体利用の説明、決済停止条件は維持。主担当ROCK、既存WEB19の表示改善。

Astro build（13 route）とSite試験16/16成功。ローカルブラウザで用途カードとリンク表示を確認。Sites公開v81、source `4060372d93fbcda2491e92deb85c80252728bf47`、deployment `appgdep_6ab879cf14ec8191860bc9c8acfb6eb0` succeeded。画像は実機・医療性能・利用可能アプリの証明ではなく、正確な光軸・寸法は未検証。[画像プロンプトと限界](sites/avocado-mini/docs/experience-images-v4.md)を保存。次は利用者による表現確認と実機検証を別々に進める。

## 2026-09-27 — Sky Marketの購入・販売・10%配分を実装（Provider接続待ち）

利用者の「決済もできるようにして」を受け、既存BIL02／Wallet・Billing分野のROCK担当として、Stripe Connect Hosted OnboardingとCheckoutを接続した。作者は`/sky/sell`で受取先登録と円の買い切り価格・販売条件を設定し、購入者はMarketから支払い画面へ進み、`/sky/purchases`で履歴・照合・接続先を確認する。審査済みかつ導入可の`external_contract` Packageが対象でLLMも含む。月額・従量・無料Packageを勝手に有料化しない。登録・接続・公開・基本利用0円と旧8.88 USD課金保留は維持する。

注文の価格・作者・送金先・規約をD1へ固定し、10%はserverで計算する。Stripeの署名通知と支払い再取得で一致を確認した注文だけ利用権を返す。重複購入防止、返金・部分返金・異議申立て時の利用停止、20時間を超えた不明処理の再作成防止を実装した。購入記録は第三者MCP serverの認可そのものではなく、提供者側のアクセス制御は別統合を要する。カード・銀行・本人確認書類はSkyへ保存しない。

API／SQLite回帰37件、Stripe adapter8件、Market13件、DB台帳2件の計60件が合格。typecheck、`lint:product`、build、schema・設計・進捗検査、差分空白検査も合格。開発用D1には未適用一覧が0018だけであることを確認して適用し、4表を追加した。ローカル実ブラウザでMarket→販売→購入履歴の遷移、未設定表示、390pxで横はみ出し0／main landmark各1個を確認した。途中で見つけたmainの二重化と再取得失敗時の古い購入情報残りを修正した。購入時に固定した販売・返金条件は利用権失効後も履歴から確認でき、409時も一律の価格変更表示で本来の失敗理由を隠さない。

全体`npm run verify`は既存visual baselineの`acid_green`／`light_scroll_product_showcase`との不一致で停止。個別`sky:check`も既存Fashionの「プロデュース開始」という文言期待で失敗し、今回の決済試験と区別する。ローカルにStripe資格情報はなく、既存Sites projectの設定取得も`project not found`で取得できない。実Provider sandbox、live、銀行払出し、公開配備は未実施。次は正しい運営アカウントでserver秘密設定と外部到達可能な署名Webhook入口を接続し、sandboxで購入→通知→購入権→返金を受入する。BIL02はin_progressを維持する。

## 2026-09-27 — Sky Marketの手数料を10%へ統一

Sky Marketの自動化ToolとLLMを同じマーケット面で扱い、登録・接続・公開・基本利用は0円、検証済みTool売上のSky手数料は10%（1,000円売上ならSky 100円、提供者 900円）に統一した。表示・見積り計算・Sky Network・商品基準を共通ポリシーへ寄せた。決済・回収・払出しProvider、本人確認、返金、照合の受入が終わるまでは実課金を有効化せず、今回の10%は現行の表示・計算ポリシーとして扱う。LLMはローカル／Provider接続を含むMCPルートを表示するが、未接続を稼働済みとは扱わない。

## 2026-09-27 — Sky／Zema／OS全Toolの実行基盤を共通化（進行中）

利用者の「全Toolを使えるようにし、サーバーを個別に管理したくない」「ローカルLLM優先」を受け、画面の到達確認ではなく、実行器・起動・保存・結果確認までを全体の対象にする。主担当はSky / MCPのROCK、既存SKY14を継続し、SDK掲載側のSKY15と連携する。既存taskのdoneは過去の記載範囲の合格であり、今回の全Tool実行完成を意味しない。task状態と既存受入証拠は変更しない。

34件のソース監査時点の最小機能は、ブラウザ決定処理6件、Web API／DB主体3件、別PCサービス必須2件、外部AI必須1件、候補22件。候補は旧Mr.の固定下書き11件、研究Toolの接続計画10件、別アプリIP Studio入口1件であり、LLM起動だけでは22件の本体adapterは実装されない。記事・出典・ココナラチェックと候補下書きにもジョブ受付DB／本人認証の依存があり、CSVはDBと非公開object storageを要する。詳細な分類と根拠はTool設計§1.3。

最初の実用milestoneとして、ローカルWebのViteから同梱Connector／Fashionを自動起動・健康確認する管理runtimeを実装した。対応する正確なローカル開発originだけを許可し、任意originや任意shellは許可しない。実ブラウザのFashion「プランを作って保存」から手動サーバー起動なしでProducerを実行し、合成Tシャツの下書きをDBへ保存、`instagram.calendar.list`の再読込で一致を確認した（run_id `cc7dc198-718a-47d6-bec6-47594978f301`）。Provider4件はmock未接続、LLMは未導入であり、ページ再読込後の結果復元UIも未実装。Sky接続ボタンから共通Connectorの自動起動と基本4機能の検出も確認した。

Zema納品Runnerの実在しない「右上PC接続」案内と未接続時の操作無効化を修正し、サンプル押下から自動接続→`verify_delivery`の実照合`PASS`→会話内結果表示を確認した。これは合成サンプルの検証であり、外部への納品・品質承認・実案件完了は行っていない。主な実装根拠は`scripts/sky-local-runtime.mjs`、`lib/sky-local-runtime.ts`、`components/delivery-runner.tsx`。

runtime／device／MCP／Fashion関連35試験は合格し、isolated Viteの起動→両サービス自動起動→`await server.close()`後の両port停止を含む。isolated Worker／D1のAPI回帰172項目、最終build、typecheck、対象lint、package一致、差分検査も合格。一方、全体`npm test`は389件中378合格・11失敗（既存visual baseline条件、README日本語文言期待、migration-unionの期待32件と現状33件の差）で、全体`verify`も既存visual baselineで停止した。基準を変更して全体合格とはしていない。

全体作業は進行中。ローカル推論runtime／モデルの新規導入は本人回答待ちで、外部AIへ自動で切り替えず、未導入を推論成功と扱わない。Ledger、IP Studio、候補22件の本体adapter、公開Webから本人PCへのrelay、native OSへの常駐搭載、外部Providerは後続の個別受入を要する。既存の認証・scope・一回承認・課金条件は維持し、この最初の実用milestoneを全34 Toolの完成や本番受入に換算しない。

## 2026-09-27 — Sky全入口の操作・開閉画面を再監査

利用者の「こことかみて全部確認して」に対し、Skyホーム、Market、全34 Tool詳細、機能概要、サービス接続、PC接続・MCP、掲載フォームを一つの導線として再監査した。担当はProduct / UXのROCK、既存WEB04。実際の操作で、ready Toolに不要な登録画面を挟むこと、専用アプリの起動先とホームの遷移先の不一致、候補登録エラーの非表示、提供元テキストをURLとして扱う壊れたリンク、画面ごとの端末適合表示の差、ホーム内のFashion入力欄にスタイルがないことを確認して修正した。

ready Toolを専用画面へ直接開き、自然文の依頼はZemaへ引き継ぐ。ココナラも依頼文があればZemaへ保ち、依頼文なしなら案件台帳へ進む。候補の登録・外部本体接続・実行は区別し、登録失敗をその場に表示する。概要の主操作も同じ判定を使い、Marketと詳細は共通`useSkyToolContext`でホームと同じPC・Fashion・登録記録を参照する。Fashion入力・結果・MCP詳細を自己完結したCSS moduleへ移し、ブラウザ簡易版をPC専用として除外しないよう環境表示も修正した。サービス接続・MCP・掲載フォームの暗色面、余白、スクロール、入力欄を揃え、MCPタブのキーボード操作、掲載フォームの成功後reset、ヘルプアイコンを修正した。既存認証、権限、Provider接続、料金と承認の条件は変更しない。

ローカル実ブラウザで、390pxの全34 Tool詳細に見出しがあり、横はみ出し0、エラーoverlayなしを確認。修正後のホーム全34アイコンで概要の開閉、画面内への収まり、横はみ出し0、初期scrollTop 0、Escapeで一覧へ戻ることを確認した。サービス接続・MCP・埋込掲載フォームは320／390／768／1280pxで画面内に収まり、内部の横はみ出しも0。長いrouting設定は見出しを固定して保存操作までスクロールでき、MCPは右矢印キーで実際のタブが切り替わる。掲載フォームの空送信は名前欄へfocusし、申請は送信していない。単独`/sky/register`も390pxでmain landmark 1個、横はみ出し0。ホームのFashionアイコン→主操作→専用画面→ローカル簡易プラン生成、出典整理の主操作→専用画面→サンプル結果成功まで確認した。法務詳細の暗色表示も目視した。全34件の到達・開閉確認を全Toolの実行成功には換算しない。

主要Sky修正後の関連26試験、`sky:check`、typecheck、`lint:product`、build、差分空白検査はすべて合格。単独掲載画面は1280pxでも目視し、直近ブラウザエラー照会8件の範囲でアプリエラーなし。設計チェックと進捗同期も合格。全体`npm run verify`の最終実行は既存baselineの`acid_green`／`light_scroll_product_showcase`と現行visual systemの不一致で停止しており、全体合格ではない。掲載reset修正のD1試験も無応答で完了せず、合格には数えない。Provider資格情報入力、掲載申請送信、実MCP接続、API key発行、課金、本番配備は未実施。

追加入口は`/sky/network`から修正済みMCP画面が開き、`/sky/publish`のStudioも暗色・横はみ出し0を確認。`components/rock-studio.tsx`のコピー失敗をその場に表示し、API key発行の401には`/sky/publish`へ戻るサインインリンクを追加した。公開SDKの「コピー→コピー済み」は実ブラウザで確認、追加Studio 2試験・対象lint・typecheck・差分検査は合格。実際のkey発行と401の実環境再現は行っていない。

## 2026-09-27 — Skyの表示崩れを共通カードと画面境界で修正

利用者のスクリーンショットで、狭いSky一覧の45px列に56pxアイコンを配置し、片側約5.5pxが本文へ重なる不具合を確認した。旧グローバルCSSのmain・footer指定も、新しい画面の配色と配置に干渉していた。SkyホームとMarketを共通`SkyToolCard`へ移し、架空の作者handleと重複する役割名を外した。検索を常時表示し、Marketの大きな紹介文を短い見出しへ置き換え、利用環境の説明は展開式へ整理。共通`tone="sky"`でホーム・Market・Tool詳細・ココナラの暗色面を固定し、詳細は実行欄を先に、手順とlicenseは展開欄へまとめる。全Tool共通の抽象的な注意書きは概要から除き、個別の接続・認証条件を残す。主担当Product / UXのROCK、既存WEB04。

ローカル実ブラウザで、ホームとMarketの320／390／440／768／1280pxは横はみ出し0、アイコンと本文の間隔12／14pxを確認。Jev Routerとココナラの320／390／768／1280pxも横はみ出し0、main landmarkは各1個。ホームで全Toolを対象にJev Routerを検索し、ホームとMarketから同じ概要を開く操作、Escとfocus復帰を確認した。ココナラの入力画面はBase UI Dialogへ移し、320／390pxのfocus trap・Esc・元のボタンへの復帰を確認。保存失敗のエラーは入力画面内に表示する。出典整理Toolのサンプルを実行し、成功と結果表示まで確認した。

関連17試験、typecheck、`lint:product`、`sky:check`、buildは合格。Sky検査は画面が`skyToolUiState`を使う場合に共通状態の文言を同helperから確認するよう追従した。全体`npm run verify`は既存`baseline:check`の`acid_green`／`light_scroll_product_showcase`期待値と現行avokado配色の不一致で停止。無限定の`npm run lint`にも未変更のvendor・生成物のエラーがあり、全体合格とは記録しない。次はbaselineの正本・検査を現行方針と整合して全体verifyを再実行する。Tool本体接続・決済・本番配備は行っていない。

## 2026-09-27 — Sky Toolのアイコンから機能をすぐ確認

利用者の「機能はアイコン押したらわかる」指示に合わせ、Sky Marketの34 catalogカードと個別Tool画面のアイコンを機能説明の入口にした。押すと説明・接続状態・利用環境・料金をその場で開き、カードの他の場所は従来どおり詳細へ進む。Jev Routerの個別画面では重複した情報欄を隠しても、未接続とPC CLI条件・公式導入先は本文に残す。候補の接続や実行は始めない。対象9試験、typecheck、lint、Sky/設計チェック、buildに合格。Chromeのローカル画面でアイコンからの開閉、詳細への遷移、Enter/Escape操作、console errorなしを確認した。IABではlocalhostが開けなかったため、Chromeで検証した。全体`npm run verify`は既存visual systemと現行avokado配色の不一致で`baseline:check`にて停止し、全体合格ではない。ワンクリック実接続は引き続き未実装。

## 2026-09-27 — Sky Marketの端末適合表示とJev Router導線の是正

利用者の「対応する利用環境だけ表示」「ワンクリックで接続したい」に対し、ブラウザで判定できる端末種別だけを使い、明らかに非対応のPC専用・macOS専用Toolをマーケットの初期一覧から除いた。対象外は理由を付けて再表示可能。Node・CLI・外部アカウント・本体接続の有無までは推測しない。`/sky/tools/jev-router`は実ルーティング未接続の候補で、従来の接続計画下書き欄を取り除き、公式のPC CLI導入条件へ案内する。Skyからのワンクリック実接続は未実装であり、PC側の限定adapter、TypeSafe認証の安全な扱い、外部送信同意、費用・fallback・receipt、実動作試験が残る。対象7試験、型、lint、Sky/設計チェック、buildは合格。ブラウザ目視はlocalhostアクセスがBrowser Use側で失敗し未確認。全体`npm run verify`は既存visual system期待値と現行avokado配色の不一致で`baseline:check`にて停止し、全体合格とは記録しない。

## 2026-09-27 — Sky Marketの登録・料金確認の操作を短縮

利用者の「決済のとこと、登録のところもっと工数減らしたい」を受け、マーケットの開発者向け入口をWebの`/sky/register`掲載申請へ直結。既存`/sky/publish`はPC向けStudio/SDK設定画面のまま分離する。申請者本人の前回の提供者名・サポートURLをワンクリックで再利用し、MCP接続確認で実際に取得したサーバー名だけをツール名の下書きへ反映する。料金方式の無料初期値と架空の無料説明を撤去し、本人選択を必須にした。審査済み外部Packageは一覧で料金方式を確認できる。購入者決済・開発者払出しは未接続のまま。対象試験4件、型、lint、build、Sky/設計チェックは合格。全体`npm run verify`は既存のvisual system期待値と現行avokado配色の不一致で`baseline:check`にて停止。決済対象・商流・Provider・返金・本人確認の決定と受入は未完了。

## 2026-09-27 — SkyにAI・自動化Toolマーケットを追加

利用者の「AI、自動化ツールのマーケットプレイスを作る」指示を、既存Skyの発見・接続面の強化として実装。`/sky/marketplace`で34 catalog Toolを検索・カテゴリ・状態別に探し、各Tool詳細へ進める。個別詳細を再設計し、提供元、license、実行場所、料金・実費、作業手順を利用前に確認できるようにした。外部Packageは証拠付き`verified`かつ導入可の公開Registryだけを読み、作者・版・料金・権限・実行先を表示する。候補22件は本体未接続のまま区別し、購入・自動インストール・実課金・公開配備を開始しない。主担当Sky / MCPのROCK、既存SKY02／SKY20。対象18試験、typecheck、lint、build、design/sky check、ローカルPCと390pxブラウザで検索・候補絞り込み・詳細画面・横はみ出しなしを確認。全体`npm run verify`は既存visual system期待値と現行avokado配色の不一致で`baseline:check`にて停止し、全体合格とは記録しない。残る作業は外部Packageの実接続・OAuth・審査本番readback・初見利用者の操作時間の受入。配色基準の正本と検査を整合して全体verifyを再実行する。

## 2026-09-26 — Skyのココナラへ応募前チェックと案件管理を統合

利用者の追補により、独立した「受託チーム」アプリと重複Sky Toolを取り除き、Skyの既存`coconala`を選ぶと`/sky/tools/coconala`へ直接入る構成にした。同じ画面で「案件管理」と既存の「応募前チェック」を切り替え、旧URLはSky画面へ転送する。代表者の受注に対し、制作担当者への委託条件・固定報酬・支払期日を発注前に記録する。案件の進行、顧客入金・返金、担当者支払を分け、3%は手数料後の見込手取りからの参考計算に留める。owner別D1保存、更新競合防止、過払防止を実装した。ローカルDBへ新table migrationを適用し、Skyのカードから案件管理へ遷移し、同じ画面の応募前チェックへ切り替わることを実ブラウザで確認した。対象22テスト、typecheck、lint、Sky・設計・DB・進捗検査、build、隔離Worker/D1 API 172 assertionsは合格。全体`npm run verify`は既存の酸味のある黄緑accentを要求するproduct baselineと現行avokado配色が不一致のため中断した。ココナラ上の契約・通知・入金照合、銀行送金、法務判断、Walletの検証済み収益登録は行わない。実案件で再委託可否と発注条件を確認し、実取引・支払を別途検証するまではB06を進行中とする。

## 2026-09-26 — OS全体をavokadoの画面トーンへ揃える

avokado製品Siteの黒いスタジオ、銀色の筐体、淡い青のハイライトをWeb OSのvisual基準にした。Homeの壁紙・アプリアイコン・Sky入口、共通ヘッダー、Sky、Zemaの仕事画面、Wallet、Market、設定、Studio、CSVの黄緑系を、グラファイト／冷たい白／淡い青へ変更した。個別Toolの識別色と成功・警告など意味を持つ状態表示は維持。Homeに保存された旧既定の黄緑accentは新既定色へ移行し、他の利用者設定色は残す。実行権限、Tool接続、本番配備は変更していない。主担当Product / UXのROCK、既存WEB04。782pxと390pxのローカル画面でHome、Sky、Zema仕事、Wallet、Market、設定、Studioを確認し、390pxでは全7画面の横はみ出し・error overlayが0件。画面契約15/15、typecheck、lint、design check、buildは合格。`npm run verify`は既存のREADME文言試験1件の失敗と全体Node試験の無出力停止で中断し、全体合格とは記録しない。次は初見利用者の画面遷移を観察し、製品Siteとの連続性と可読性を確認する。

## 2026-09-25 — Zemaをavokadoの画面デザインへ合わせる

avokado公開画面の黒・銀・淡い青、簡潔な見出しと余白を基準に、Zemaの左欄、最初の案内、入力欄、操作色を再設計した。左欄は選択中を含む少数のToolだけを初期表示し、候補22件は検索・全件展開で個別に選べる。選んだToolの説明、実際の接続状態、依頼と専用画面の入口は最初の画面で分かる。約782px、1280px、390pxのローカル実ブラウザで一覧の展開・検索、スマホ開閉、入力欄focus、横はみ出しなしを確認。対象試験17/17、typecheck、lint、buildは合格。`npm run verify`は既存README文言試験の失敗を含む全体Node試験が無出力で停止したため中断し、全体合格とは記録しない。外部Toolの本体接続や公開版配備は行っていない。主担当Product / UXのROCK、既存WEB04。次は初見利用者による依頼・結果確認・再開の操作時間を測り、会話モデル未起動やTool未接続時の復旧案内を改善する。

## 2026-09-25 — Zemaチャットの最初の操作を見える位置へ

選択したBotのチャットで、画面高より下に隠れていた入力欄を表示し続けるよう修正した。最初の画面にBotの説明、実際の接続状態、「依頼を書く」、専用画面がある場合の起動リンクを配置した。未接続候補は下書き・接続条件整理と本体実行を区別する。約782px幅と390px幅のローカル画面で入力欄の同時表示とfocusを確認。画面契約試験16/16、typecheck、lint、本番buildは合格。`npm run verify`は既存README文言試験1件の失敗を確認した後、全体Node試験から新規出力がなくなったため中断した。次はREADME文言試験の期待と現行R5説明を別途整合し、全体verifyを再実行する。外部IP Studioの実起動やAR表示は今回の実装・受入に含めない。主担当Product / UXのROCK、既存WEB04。

## 2026-09-25 — Sky候補22件をZemaの個別Bot入口へ反映

Skyの34 catalog Toolにそれぞれの役割を示すアイコンを割り当て、Zemaの候補22件を検索・選択可能にした。Zemaの依頼文を対応する候補の入力欄へ引き継ぎ、旧Mr.11件はローカル下書き、外部研究Tool10件はTool別の接続計画、IP Studioは専用アプリ入口として区別する。候補の本体・外部Provider・第三者サイトへの接続は今回の対象外で、`ready`には変更しない。

ローカル開発DBのmigration後、ZemaでYouTube台本の依頼引き継ぎ・下書き表示とfaster-whisperの接続条件表示を実画面で確認した。ホームも表示確認済み。全34 Toolの固有アイコン対応を試験へ固定し、対象6試験、typecheck、lint、design、Sky check、MCP package check、本番buildは合格。`npm run verify`は今回以前のmainにもないREADME日本語文言を期待する既存のR5／Mini200文書試験2件で停止したため、全体合格とは記録しない。残り20件の個別画面での実行受入と外部本体接続は未完了。次は候補ごとにPassport・入力schema・権限・実runtime・停止・独立結果検証を接続し、サンプルではない成果で受け入れる。再検証は`npm run verify`を使用する。

## 2026-09-24 — 指定されたTower20 E3の公開Siteをそのまま復元

利用者が再提示した画面収録と10枚のスクリーンショットを基準に、R5向けへ置き換わっていた公開ホームを、指定どおりのTower20 E3サイトへ戻した。Astroは維持し、画像の生成・描き替えは行わず、履歴に残る承認済み原本を再利用した。4本の200 mm Motion Towerと中央のEdge Hubの全景、「Intelligence, built into space.」、横送りのHighlights 4枚、「Everything, for the space.」、正面・側面・背面を使う180°スクロール、RockstarOSのOpen installer、avokadinc footerを復元した。

Astro buildは11 route、Site試験12/12。ローカル実ブラウザで全景、Highlights、RockstarOS終端を照合した。GitHub `main`の製品sourceは`4e7221d`、Site sourceは`b7a3b722f04f965ea2b038ace7bee752e2945109`、公開v66、deployment `appgdep_6ab5e2a14b4c81919479f8a24538ada7`が成功した。公開URLは`https://avocado-mini.kirin-999.chatgpt.site`。画面上もconcept rendering、未実施の物理試験、未確定の製造・販売条件を明記し、予約APIの販売停止は維持する。

## 2026-09-24 — avokado miniの元画像を保護して公開Siteの問題を修正

利用者の指摘に従い、製品画像を生成・描き替えた差し替え案を採用せず、提供済みの`avocado-mini-r5-black-studio.png`と既存の承認済み画像だけへ戻した。製品の形状・部品・質感は変更せず、CSSの配置、トリミング、背景の接続だけでPCとスマートフォンへ馴染ませた。画像を中央から外していた表示アニメーションを修正し、Highlights見出しが11pxへ縮むselector衝突も解消した。

同時に、壊れていたRockstarOSアンカー、実画像のない疑似回転、重複するHighlight、過剰なハードウェア断定、操作タブのARIA、英語ガイド、外部Google Fonts、canonical・robots・sitemap、旧`/rockstaros/`のHTTP redirectを修正した。Astro buildは11 route、Site試験12/12。1280pxと390pxの実ブラウザで元画像、Highlight、横overflow 0、欠損画像0、欠損fragment 0を確認した。GitHub `main`は`4dcacf2`、Site sourceは`7388127c8174171f6a6fc3bc4ab7ad33b32d16f3`、公開v64、deployment `appgdep_6ab5db9bbfe08191b88540cf3c136002`が成功した。公開URLは`https://avocado-mini.kirin-999.chatgpt.site`。R5の実機試験0件、製造承認保留、販売停止は変更していない。

## 2026-09-24 — avokado mini公開SiteをAstroの英語版へ統一

利用者の指定に従い、既存のAstro 7.3.5構成と承認済みの黒・銀デザインを維持したまま、公開Siteの11 routeを英語中心へ統一した。ホーム、試作計画、RockstarOS配布・Developer Preview、販売状況・確認・完了、販売表示、privacy、rocketstar、redirectで`lang=en`を固定し、公開UI、meta、aria label、画像代替文を英語へ変更した。現行R5の1本自律・別Hub不要、実機試験0件、価格・発売日・販売条件未確定、販売停止は変更していない。

Astro buildは11 route、Site試験10/10。ローカル実ブラウザで全11 routeを390px幅にし、日本語UI、横overflow、runtime overlay、console errorがすべて0件であることを確認した。確認中に見つけた英語注記の位置ずれと、下層ページのmetallic logoが原寸表示される既存不具合も修正した。GitHub `main`は`11f0919`、Site sourceは`26e146ecb579f306992abffea7b0c83f23867cf3`、公開v63、deployment `appgdep_6ab5d3eb5b488191b985ab8f901e6576`が成功した。公開URLは`https://avocado-mini.kirin-999.chatgpt.site`。

## 2026-09-24 — iPhone 18 Proページを参考に商品演出を整理

利用者指定のApple iPhone 18 Proページを、画像やブランドを模倣するのではなく、余白、文字の強弱、浮いた製品ナビ、製品を主役にする画面構成、横送りハイライト、固定スクロールの参考として適用した。avokadoの名称、黒・銀の配色、利用者指定のavocadoMini画像、現行R5の内容は維持する。意味を持たない円形軌道装飾を外し、Highlightsには4項目を直接選べるタブを追加した。

PCと390px幅のローカル実ブラウザで、製品ナビ、冒頭画像、4タブ連動、正面から背面へ変化する固定スクロール、横overflowなし、error overlayなしを確認した。Astro buildは11 route、Site試験9/9。GitHub `main`は`6622c80`、Site sourceは`133c6b8afc885dd4b7a025e679a5511fec0b35e0`、公開v61、deployment `appgdep_6ab5d14a5ca08191a153ada67bf7c7dd`が成功した。販売停止、実機0件、製造承認保留は変更しない。

## 2026-09-24 — avocadoMini Site試験をCIの`npm run verify`へ接続

公開avocadoMini Siteの予約・決済Worker試験6件（販売条件が揃うまでの販売停止、規約同意、サーバー側価格と在庫の一回確保、Webhookだけによる入金確定、期限切れ予約の解放、管理APIのBearer保護）とAstro配布物のroute契約試験3件、計9件は`sites/avocado-mini/tests/`にあるが、rootの`npm test`（`tests/*.test.mjs`）にも`npm run verify`にも含まれず、PRとmainのCIで一度も実行されていなかった。rootに`npm run test:avocado-mini-site`を追加して`verify`へ組み込み、`tests/verify-coverage.test.mjs`で`sites/`と`toolkits/`配下の試験を持つpackageが必ず`verify`から到達されることを検査する。Site試験はNode標準機能（`node:sqlite`等）だけで動き、Site側の依存導入は不要。Site source、公開Site、予約・決済の販売停止状態、WEB15の未完了条件は変更しない。主担当Git/CI、関連task WEB15。

検証: 変更前は新しい網羅試験が`sites/avocado-mini`未実行を検出して失敗し、変更後は`npm run test:avocado-mini-site` 9/9、root Node試験365/365、`npm run verify` exit 0。GitHub保存（PR）とmain統合、Sites配備は別の事象であり、本変更はSites配備を伴わない。

## 2026-09-24 — avocadoMiniの製品画像とスクロール切替を復元

利用者が提示した画面収録を基準に、Astro移行時に単一の静止画へ置き換わっていたavocadoMiniの商品演出を復元した。冒頭は4本のTowerと中央の低い装置を含む集合ビジュアル、Highlightsはセンサー・200 mm・足元・Edge Hubの専用4画像、Designは正面・側面・背面が0〜180度で切り替わるスクロール表示とセンサー接写を使う。画像の存在はbuild検査へ固定し、同じ見落としが再発しないようにした。

旧Tower20 E3の画像は外観・システム検討資料として明示し、現行R5の製品基準である1本自律・別Hub不要、販売停止、実機0件、製造承認保留は変更しない。Astro buildは11 route、Site試験9/9、ローカル実ブラウザで集合ビジュアル、4 Highlights、0°・98°・180°の切替を確認した。GitHub `main`は`c55a651`、Site sourceは`d3d00a08691244313022e2a5cdcc20b5fb779377`、公開v60、deployment `appgdep_6ab5cdf2619c8191912ed31b7ba44cf2`が成功した。

## 2026-09-24 — avocadoMini公開SiteをAstroへ移行

利用者の指定に従い、公開avocadoMini Siteの生成基盤をViteの複数HTML入口からAstro 7へ移行した。承認済みの黒いスタジオ、銀色R5、映像型スクロール、rocketstarの構成は変更せず、トップ、製品案内、導入、予約、法務、Rocket Star、RockstarOSを含む11 routeをAstroのfile-based pageとして生成する。予約・決済WorkerとD1契約は静的画面から分離したまま、配布時に`dist/server`へ段階化する。

Astro build、公開routeとWorker artifactの契約検査、予約API 6件、ローカル実ブラウザでトップ・Rocket Star・販売停止画面を確認した。販売停止、R5の実機0件、価格・発売日・販売条件未確定、製造承認保留は変更しない。主担当Web / PWA / SitesのROCK、WEB17。

GitHub `main`は`19ea5e9`、Site sourceは`7594bf6904b63e51f1da0930122d819e181e5f79`、公開v59、deployment `appgdep_6ab5cb5a9a908191bced146262803a2a`が成功した。公開URLは従来どおり`https://avocado-mini.kirin-999.chatgpt.site`。rootの`npm run verify`はAstro変更より前からあるNode統合試験群が終了せず中断したため、完了とは記録しない。

## 2026-09-24 — avocadoMini公開Siteを承認済みの黒・銀デザインへ復元

WEB16のR5内容同期で商品Site全体を白基調へ変えてしまったため、利用者の指摘に従い、承認済みv56の黒いスタジオ、銀色製品、映像型スクロール、ヘッダー構成へ戻した。内容はR5の使用時200mm以内・1本自律・同型mini増設・別Hub不要、実機0件、価格・発売日・販売条件未確定を維持し、旧E3の商品構成・価格は戻していない。R5製品の形状を保持したまま背景だけを黒いスタジオへ馴染ませた画像を追加し、トップと販売状況画面で同じ黒・銀の世界観へ統一した。

予約API 6件、Vite本番build、R5 package 26 hash、ローカル実ブラウザのトップ・中段・販売停止画面を確認。GitHub `main`は`c603119`、Site sourceは`addf07e31f54ea34944e1f5d66b05de7931cf1b0`、公開v58、deployment `appgdep_6ab5c7ab2664819183b1753734f29d18`が成功した。販売・製造・実機合格の状態は変更しない。

## 2026-09-24 — 8.88 USDの収益料金案を保留

利用者は収益を得る動線が確定していないため、8.88 USDの料金設定をいったん保留すると明示した。README、料金説明画面、Sky／CSVの設計資料、機械可読の製品基準を更新した。Sky Billing Workerの現行経路は新しいToC収益Receiptを台帳書込み前に拒否し、Rock回収用Walletの新規登録・着金照合も拒否する。CSV料金判定は0 USD・保留状態を返す。旧888 cents計算は過去の設計と回帰検証用に保持する。動線、対象利益、金額・上限、回収、返金、同意、還元を決めてから新契約として受入する。既存の履歴照会とToBの0料金方針は維持する。

検証: 現行経路のToC拒否・台帳未書込み、Wallet回収操作の拒否、CSV料金0、旧契約の回帰を個別確認。ローカル通信を使う模擬サーバー試験を含む`npm run verify`はexit 0（Node 363/363、追加Tool 19/19、Web asset欠落0、仕事API 149項目）。

公開Sky Billing Workerも旧`verified_earnings_only`・888 cents表示から保留版へ配備した。初回配備では、公開環境に`PAYOUT_ADAPTER_SECRET`が未登録だったため`/health`も503になった。必須設定の検査を払出しclaim/resultに限定して再配備し、`/health`は200・`fee_policy_on_hold`・現行上限null、回収Walletの新規操作は409、払出しclaimは503を確認した。公開版ID `f770e959-e20b-4820-88bc-4aae1d0e14b4`。修復版の`npm run verify`もexit 0（Node 363/363、Web asset欠落0、仕事API 149項目）。[確認記録](docs/evidence/launch/sky-billing-fee-hold-20260924.json)。

## 2026-09-24 — mainの進捗件数とデータベース状態を再同期

avokado README画像のPR #35をmainへ統合する間に、公開SiteのR5配備記録がWEB16を完了へ更新した。mainのCIで`database:check`が101 done・31 in progressと保存済み状態ファイルの100 done・32 in progressの差を検出したため、`npm run database:status`でJSONとMarkdownを再生成した。`npm run verify`はexit 0（ローカルAPI 149項目、Web asset 84参照・欠落0）。製品画像・機能・データベースschemaは変更しない。

## 2026-09-24 — avokado READMEの製品画像を再制作

主担当Git / CI / ReleaseのROCK、既存DOC04。利用者の画像への指摘を受け、R5-M01の銀色細身円筒・黒いカメラ帯・低い円形台座を基準に、製品コンセプト画像を新しい明るいスタジオ表現へ再制作した。同じ画像を使う控えめな4秒GIFを冒頭へ配置し、旧い製品カットとの重複を解消した。構成図も同じ色調とタイポグラフィへ変更し、R5端末、RockstarOS、Sky/Zemaの設計上の関係だけを示す。実機写真、空間表示、OS統合完了を示す画像にはしない。

検証: GIFの32フレーム・4秒再生、製品形状と構成図の画像確認、README参照204件の欠落0、`npm run project:update`整合。公開SiteのR5同期を含む最新mainへ統合し、増えたtask数をデータベース状態ファイルへ再生成後、`npm run verify` exit 0（ローカルAPI 149項目、Web asset 84参照・欠落0）。次はR5の実機計測とR5用OS profileの統合が未完了。

## 2026-09-24 — 公開avocadoMini SiteをGitHub正本のR5へ同期

利用者の指摘を受け、公開Siteに残っていた旧Tower20 E3の「4本＋別Edge Hub」、1本16万円・一式41万円の表示を、現行GitHub `main`のR5要求と照合した。商品ページを使用時200mm以内・1本自律・同型mini増設・別Hub不要へ更新し、PLAY / MAKE / LIVE、単体機能スタック、全空間裸眼表示の研究目標、実機0件・製造承認保留を同じ画面で示す。R5の51ページ設計書と8図面を公開sourceへ同梱する。rocketstarとRockstarOS Developer Previewの導線は保持する。

予約画面はR5の価格・発売日・販売条件が未確定であることを表示し、旧E3 SKUと価格をUIから撤去した。APIも`avocadoMini-r5`の明示baseline、R5総額、在庫、承認済み条件が揃わなければfail closedとし、古い環境変数だけでは販売を再開できない。予約API 6件、Vite本番build、ローカル実ブラウザでトップと販売停止画面を確認。主担当Web / PWA / SitesのROCK、WEB16。

GitHub `main`へ製品source commit `3eb9c66`を保存後、同内容をSite source `e08c6d77ecab8a5d46678068c7e0bf99bccd92be`として保存した。公開Site v57、deployment `appgdep_6ab5bbc0bf0881918ed5de323f5ab55e`は`status=succeeded`、公開URLは`https://avocado-mini.kirin-999.chatgpt.site`。GitHub、Site source、配布archive、公開deploymentを区別した[証拠](docs/evidence/avocado-mini-site-r5.json)を残す。R5の製造・実機・販売開始を完了扱いにはしない。

## 2026-09-24 — avokado READMEの視覚構成を整理

主担当Git / CI / ReleaseのROCK、既存DOC04。GitHubの実表示を確認し、R5コンセプト画像を本文幅に収まる大きさへ調整した。現行R5の「1本の細い銀色mini」、RockstarOS v1.0の共通基盤、Sky/Zemaの体験を区別する専用SVGを追加した。図は設計上の関係を示し、実機・OS統合の完了を示さない。設計書ライブラリをR5→OS v1.0→rocketstar R1.0の順にし、各原本・領域別資料・旧版へ進む案内を加えた。本文の機能や受入状況は変えていない。

検証: SVGの画像レンダリング、README参照215件の欠落0、`npm run project:update`整合、`npm run verify` exit 0（Node 360/360、追加Tool 19/19、ローカルAPI 149項目、Web asset欠落0）。GitHub表示での画像・見出し・移動先はPR反映後に確認する。次はR5の実機計測とR5用OS profileの統合が未完了。

## 2026-09-24 — 添付原本を現行RockstarOS v1.0設計としてREADMEに反映

利用者が添付した`RockstarOS_Complete_Design_v1.0.pdf`を、現段階のOS設計書と明示した。添付版、既存の`docs/rockstaros-complete-design-v1.0.pdf`、設計archive内の原本はすべてSHA-256 `9f318e6c1fe04abca895c87085931b9b3f15f1a4445aa99b4231ae9a5c1c3855`で一致し、PDFの重複保存は不要。READMEでは現行OS v1.0を端末R5・ロケットR1.0と並べて明示し、41ページ・32章、5配備profile、13論理service、60要求、7型schema・5表DDL、43/43の文書検査への入口を設ける。原本の旧E3・別Hub配置はR5へ継承せず、R5用Device Profileとadapterの統合を未完了とする。主担当Git / CI / ReleaseのROCK、既存DOC01・DOC04。

検証: 原本3件のSHA-256一致、README参照209件の欠落0、`npm run project:update`整合、`npm run verify` exit 0（Node 360/360、ローカルAPI 149項目、Web asset 84参照・欠落0）。設計資料の案内更新であり、新OS image、実機・機上・現地運用の受入、公開Site配備は変更しない。

## 2026-09-24 — 添付原本を現行rocketstar R1.0設計としてREADMEに反映

利用者が添付したrocketstar_Complete_Design_R1_0.pdfを、現段階のロケット設計書と明示した。添付版とGit保存済みPDFのSHA-256はともに`c5497a5df7037ce7cdfe95d9ec93c8f976d4a7452041fdf27660c28806a36c4e`で一致し、原本の重複保存は不要。44ページ・35章、60要求・18全体接続を確認した。READMEではR1.0を旧版欄から現行ロケット設計へ移し、原本、編集本文、ZIP、要求、接続、質量監査、図、A-LINK等を直接開けるようにした。端末のR5とロケットのR1.0は別の製品設計基準として示し、製造図面・実機性能・飛行認定の未完了を維持する。主担当Git / CI / ReleaseのROCK、既存DOC03・DOC04。

検証: PDFのSHA-256一致、設計台帳70 pathのREADME掲載漏れ0、README参照の欠落0、`npm run project:update`整合、`npm run verify` exit 0（Node 360/360、ローカルAPI 149項目、Web asset欠落0）、`python3 scripts/verify-rocketstar-archive.py --git` 14/14合格。これは文書の位置付けと導線の更新で、ロケットの設計原本・製造・飛行試験・公開Siteの配備は変更しない。

## 2026-09-24 — READMEから製品設計書一式へ直接進めるよう拡充

利用者の「製品の設計書も全部載せないと」という指摘を受け、DOC04を補完した。現行R5の51ページPDF、Word、全文Markdown、ZIP、比較計算、参考資料、照合台帳と8図面のPNG/SVGをREADMEへ個別にリンクした。全設計台帳の17領域に登録された原本・契約・記録、旧E1/E2/E3とrocketstar/A-LINK/colonyのアーカイブも設計書ライブラリへ一覧化する。E3の元PDF/DOCXはリポジトリ未収録なので、その限界をREADMEに明記し、R5の現行要求と混同しない。

検証: 設計台帳の登録70 pathがREADMEに全掲載、README参照184件に欠落0、`npm run project:update`整合、`npm run verify` exit 0（Node 360/360、ローカルAPI 149項目、Web asset欠落0）。文書への導線を整える作業であり、R5の実機試験0件・製造承認保留、Pixel/QEMUの独立受入、公開Siteの配備状態は変わらない。

## 2026-09-24 — avokado READMEと製品ビジュアルを現行R5へ更新

主担当Material Invention / avocadoMiniのROCK、DOC04。事業説明からPLAY・MAKE・LIVE、R5端末、RockstarOS、Sky・Zema・Tool、Wallet、検証段階までREADMEへ整理した。公開Siteの4本＋別Hubは旧Tower20 E3として示し、現行R5の1本自律・別Hub不要を維持する。主画像はR5-M01図面の細い銀色円筒、横長の黒いカメラ帯、低い円形台座に合わせた構想CGとし、実機写真ではないことを明記した。ブランドGIFは端末外観を描かないオリジナルの抽象アニメーションで、先に作った外観違いの画像は採用していない。

検証: README内の相対リンクと画像参照の存在、`npm run project:update`（152件中100件完了）、`npm run verify` exit 0（Node 360/360、ローカルAPI 149項目、Web asset欠落0）。R5の実機試験0件・製造承認保留、Pixel／QEMUの独立した受入、公開Siteの旧E3表示は変わらない。次はMAT15で表示方式、3D入力、収納・熱・電源を同一試作機で確認する。Git保存と公開Site配備は別として記録する。

## 2026-09-24 — rocketstar完全版設計書を公開Siteから直接開けるよう修正

利用者の「製品の完全版設計書がない」という指摘を受け、GitHubアーカイブだけを案内していた公開ページに原本PDFと全付録ZIPを同梱した。冒頭とfooterに44ページのPDF、OSの画面にPDFとZIPを配置し、GitHubのログインなしで資料へ進める導線にする。PDFとZIPはアーカイブ原本のバイト列を保持し、SHA-256・サイズ・ZIP CRCを照合した。主担当Web / PWA / SitesのROCK、既存WEB13。R5基準、実機・製造・飛行の未受入境界、WEB13全体の残作業は維持する。

公開Site v50（source `8a619bd833e5b80968efdb92c78d7fc51d4d7b6a`）への配備成功を確認。ローカル配布サーバーでPDF/ZIPともHTTP 200、対応MIME、原本バイト一致を確認した。公開されたPDFはアプリ内viewerで灰色のみとなり本文を視認できなかったため、全35章・目次35項目・本文図4点のHTML reader `/rocket-star/design/` を主導線として追加した。Site v51（source `751fd13a9e1f8649fa58c739d4723a0f9e5ad31c`）への配備成功を確認。原本Markdownを完全一致で保存し、PDF/ZIPも変更せずダウンロードとして残した。ローカル1280×720で読める表示と全図の存在を確認。公開readerへの検査用ブラウザ遷移は`ERR_BLOCKED_BY_CLIENT`となり、公開画面の可読性は未確認として配備成功と区別する。配布の再生成scriptはdownloadsとHTML readerも配布物へ同期する。直前mainのREADMEで要件の定型文が消えていたため既存文書assertionが1件失敗したが、OS現況の追記を保持しつつゲームから生活へという意図を冒頭へ補完し、該当4件は合格した。HTML readerを含む最終`npm run verify`はexit 0（Node 360、Tool 19、ローカルAPI 149項目、asset欠落0）。今回の公開・検証は[同じ証拠ファイル](docs/evidence/rocketstar-site-r1.json)へ記録し、v49の公開receiptと受入結果を履歴として保持する。

## 2026-09-24 — rocketstar公開ページをR1.0へ更新

主担当Web / PWA / SitesのROCK、既存WEB13。利用者が公開製品サイトのrocketstar更新を明示したため、公開v48のsourceを基準に、両段を回収・再使用する計画、衛星搭載、A-LINK、RockstarOS、コロニーへの共通運用を伝えるページへ更新した。名前は`rocketstar`に統一し、黒・金属・青い光の外観、打上げから帰還までのスクロール表示、設計値の位置付け、端末操作の説明を加える。

GitHub正本へは先行公開済みのブランド・ヘッダー・画像更新も保持して取り込む。R5の1本自律・別Edge Hub不要を現行製品要求として維持し、Siteに残るE3製品本体の説明をR5へ戻す根拠にしない。OS/Toolを追加せず、実機・衛星網・飛行の受入、資金受付・決済開始は扱わない。旧OS Site分離の残作業があるためWEB13全体はin_progressを維持する。

公開Site v49（source `fb580e64dfb775ef517aca7e5f1602eee587adbe`）への配備が成功し、公開ブラウザで新版の題名と両段帰還の内容を確認した。匿名HTTPクライアントの直接取得は403のため、配信assetの匿名hash一致は未確認として区別する。

同一source・配信版と検証の記録は[公開更新証拠](docs/evidence/rocketstar-site-r1.json)。公開済みの他ページにsource未同期の配布CSSがあるため、`node sites/avocado-mini/scripts/build-rocketstar.mjs`でrocketstarだけを再生成する。全体Vite再生成による他ページの巻戻しを避ける。全repositoryの`npm run verify`はexit 0。Node 360件、追加Tool 19件、ローカルAPI 149項目、Web asset 84参照・欠落0を確認した。rocketstar単独buildは保存sourceと125ファイルのhash一致を保ち、予約API 6件も合格。公開ブラウザは1280×720で3sceneの内容とリンク、390×844でOS画面と横overflowなしを確認した。

## 2026-09-24 — プロジェクト別ガイドをR5とrocketstar資料に同期

主担当Git / CI / OperationsのROCK、ORG01。PR #28で製品、SkyのAI自動化チーム、Web共通画面、Tool、native・Androidの開発用package、Toolkits、Workerと製品Siteを[`PROJECTS.md`](PROJECTS.md)に分類した。Sky catalog 34件、native 6 family・9版、Toolkit 6件を照合し、CSV、メルカリ、Fashion Brand OpsをSkyのチーム担当として示す。Material Invention Studioは複合機能で、Core sandboxはあるがSky接続と操作画面は未実装。`/studio`はSky Tool作者用であり発明画面ではない。

main統合前にR5とrocketstar完全設計アーカイブが追加されたため、ガイドはR5の1本自律・別Edge Hub不要を現行製品基準とし、Tower20 E3と旧Siteの表示を履歴に分ける。Rocket Starの構想ページとロケットR1.0／A-LINK等の設計アーカイブを別の入口として案内する。資料保存と実機・公開・飛行の受入を混同しない。進捗・README・設計の新しい正本を維持して競合を解消し、統合後の同一SHA検証を確認する。

## 2026-09-24 — rocketstar完全版と設計作業一式を保存

主担当Git / CI / OperationsのROCK、DOC03。利用者が `https://github.com/k999ln/rock.git` へ「漏れなく更新保存」と明示したため、最新main `261251871115c782790ec8cc752a3dd4077a2ec0`から分離した作業branchで、[設計アーカイブ](docs/rocketstar-design/README.md)へ原本と生成元を取り込んだ。ロケットR1.0は44ページ・35章、60要求・18全体接続を含む。旧版、図、計算、監査、QA画像、OSのschema/DDL等の付録、洋ナシ形ボタン設計と元画像を保持した。

保存対象932ファイル・148,595,667 bytesを元ファイルとSHA-256で全件照合し、8 ZIPのCRCと現行R1.0 manifestを確認した。除外251件は機械キャッシュとインストール済QA依存だけで、全パス・理由をinventoryに記録。保存検証は `python3 scripts/verify-rocketstar-archive.py --git`。原本の古いパスや再生成時の外部依存は履歴として保持し、別環境での全再生成成功と読み替えない。

現行R5の1本自律・別Hub不要は維持し、原本内E3やHub前提のボタンをR5へ自動適用しない。OS原本PDFは既存保存物と同一hashで、以前未提供だった個別付録の受領状態を更新した。runtime、公開Site、OS image、機材、実送信・打上げは本更新で変更しない。保存検証15件、製品・設計台帳・進捗の整合、`npm run verify`を完走し、[検証記録](docs/rocketstar-design/repository-validation.json)へ保存した。GitHubへの反映と同一commitのCI結果はPR/commitの状態を根拠とし、資料の保存を製造・飛行・再使用の実証へ数えない。

## 2026-09-24 — R5統合設計パッケージをGitの正本へ保存

利用者の「k999ln/rockへ漏れなく更新保存」に基づき、main `0eb4fe48b1e7309e838b0441954d97e22272b4ca`から分離してMAT14を開始。前回渡したR5のPDF51ページ、Word、Markdown、図面8SVG+8PNG、計算・参考資料と元ZIPをそのまま保存し、生活研究報告と監査記録も追加する。原本の26ファイルSHAと27ファイルZIPを照合する。READMEの全task表はproject.mdへ集約し、READMEには概要と入口だけを同期する。

現行製品要求は使用時200mm以内・1本自律・同型mini増設・別Hub不要。E3の4本＋別Hub必須を履歴へ移し、製品ベース、設計ポータル・台帳、workstreamを同期する。既存MAT01〜13、Pixel/QEMU、Material schema、Walletや公開サイトの実装は変更しない。全空間裸眼表示、精密3D入力、収納、熱・電源、確定回路・加工図はMAT15の未完了事項。設計資料の保存と実機・製造・Site配備の受入を区別する。

検証結果は[保存・検証記録](docs/avocado-mini-r5/verification.json)に記載する。Git保存、mainへの反映、同一SHAのCIは別々に確認する。

保存中にmainへ入った`0adb6f84c25a284c650ccbec4baa511c41b0705a`（OS完全版v1.0、DOC02）も履歴を保って統合する。原本PDF/TXT/完全性記録と検査は改変しない。OS原本内のE3配置はR5に適用せず、R5用Device Profile・adapter統合を未完了として明記する。製品ベース統合版はv1.93。原本の末尾空行7箇所はSHA一致のため保存する。

統合後の`npm run verify`はローカル通信を許可したmacOS / Node 26.0.0でexit 0。Node 360/360、追加19/19、ローカルAPI 149項目、buildと84 asset参照を確認した。関連22テスト、R5原本26 hash・27 ZIP member・14計算チェックも通過。初回のローカルDB起動制限と中間runのMCP非終了は再試験で解消し、旧E1/E3入口の文書assertionは履歴/現行の区別へ更新した。これらは資料・既存ソフトウェアのローカル検証で、物理試作0件・製造保留・公開Site未変更は維持する。

## 2026-09-24 — RockstarOS 設計書完全版 v1.0をGit正本へ保存

利用者が新しい設計書として指定した41ページの原本PDFを、内容を省略せず保存した。GitHubで全文検索できる抽出テキストと、原本・抽出テキストのSHA-256、ページ数、章・profile・service・要求件数を固定する完全性記録を追加し、設計ポータル、製品ベース、機械可読設計台帳から参照できるようにした。PDFの埋め込み添付は0件で、本文が言及する付属schema・DDL等の個別原本は今回の提供物に含まれないため、未受領のまま明示する。43/43は構造・DDL検査であり、runtime、実機、飛行、量産の受入完了には算入しない。主担当はGit / CI / OperationsのROCK、外部依存と本人追加操作はない。

## 2026-09-23 — Tower20 E3の回転画像を透過素材へ変更

公開商品ページの180°製品turnで、元画像の黒いstudio背景が長方形に見えていた問題を解消した。正面・側面・背面の3画像を、製品形状・camera窓・base・4脚を残した透過RGBA素材へ変更し、元画像に含まれていた床、反射、spotlight haze、背景を削除した。CSSで長方形をぼかして隠すradial maskも外し、Siteの背景へ製品を直接重ねる。接地感は製品下の小さなsoft shadowだけで補う。正面0°・側面98°・背面180°を実画面で確認し、公開Site v40（source `068bdf6a489cf57e2806c45923aa5161a5e51195`）へ配備した。画像はE3設計方向を伝える構想CGであり、量産実機写真や実camera性能の証拠ではない。

## 2026-09-23 — Tower20 E3の製品turnを写実的な180°表示へ変更

公開商品ページの製品turnで、閲覧中だけ形状が粗いprocedural 3Dへ置き換わっていた問題を解消した。回転表示は現行E3外観に合わせた同一studio条件の正面・側面・背面構想画像へ統一し、正面0°から背面180°までを5章で案内する。長い二重像を避けるため画像の切替は30–60°と120–150°だけで短く交差させ、正面cameraが画面を向く区間だけcyan lightと画面照明を出す。一周を装う360°表示とprocedural WebGLの実行を外し、scroll長も650画面分から520画面分へ短縮した。製品turn後に残っていた白いE3技術仕様一覧と対応navを商品ページから外し、価格表示の次をRockstarOS installerへ直接接続した。技術仕様の正本はGit内の設計資料に残す。画像は設計方向を説明するCGであり、量産実機、camera性能、光学範囲、同期、tip／slide合格の証拠ではない。公開Site v39（source `baa1612bd6a2e383ac6e16241cfeb0a1f2a62acb`）へ配備した。

## 2026-09-23 — Tower20 E3のHighlightsを専用4画像へ分離

主担当Material Invention / avocadoMiniのROCKとして、公開商品ページのHighlights 4章にそれぞれ専用のE3構想画像を生成して割り当てた。sensorは中央1cameraと左右2予約窓、200mmは4本だけで囲むplay zone、footprintは96mm baseと4脚、Edge Hubは4本から別筐体へ集約する構図とし、Hero・回転tour・他のHighlight画像の使い回しを解消した。画像は設計形状を説明するCGであり、実機写真、光学性能、通信方式、camera同期、転倒／滑り合格の証拠ではない。desktop／390px mobileで4カードの文字と製品構図を確認し、静的build、予約backend 6 test、製品基準と進捗台帳が合格。公開Site v38（source `4639df183663ad45c9cc12758a10193318c44ccb`）へ配備し、GitHub mainへ同一画像・HTML・進捗記録を同期した。

## 2026-09-22 — Tower20 E3を現行製品基準へ反映

主担当Material Invention / avocadoMiniのROCKとして、利用者提供のTower20 E3設計資料を現行製品基準へ反映した。製品は固定式200mm以下のTower20 4本と別筐体Edge Hub 1台で、各塔1camera候補、追加窓は予約領域、伸縮機構なしとする。公開Siteはversion 37、source `93f0ec3c4ec72e26d3bdaf67e6f71659c3885ed6`を配備し、公開URLでE3表示、全周回転、青いsensor演出、desktop／mobile表示を確認した。E3のbuild、予約6 test、baseline、design、project、databaseは合格。ローカル全体`npm run verify`は既存LLM能力表と導入済みAI SDK exportの不一致で停止し、変更前`be59a23`でも同じ失敗を再現した。新規依存関係を取得するGitHub CIを全体確認の最終ゲートとする。実機試作・camera・ASR・game・光学・同期・転倒／滑り・熱・電源・signed recovery・製造の合格とは区別する。

## 2026-09-21 — IP／動画／ゲーム展開を交換可能Provider構成へ固定

利用者の明示指示により、Higgsfield、Roblox、YouTube、GTA等を固定した一つの型ではなく、他の生成サービス、ゲーム、SNS、Toolを追加・選択・差替えできるCapability Router方式を正式設計へ保存した。Zemaの依頼、IP StudioのIP／Asset／権利／版管理、SkyのProvider選択、共通Asset Registry、本人承認、ゲーム・SNS展開、Wallet／receipt、反応を次の制作へ戻す循環をRQ48へ具体化した。毎回選択、優先Provider＋許可済みfallback、本人policy内の自動選択を定義し、送信先・費用・権利が変わるfallbackは再承認を必須とする。`docs/sky-mcp-architecture.md`と`docs/sky-tools-complete-design.md`、機械可読製品ベースを同期した。これは設計保存と既存adapter scaffoldの整理であり、Higgsfield、Roblox、YouTube、GTAその他の実Provider接続・本番生成・公開・ゲーム反映を完了した記録ではない。

## 2026-09-21 — avocadoMini外観を4本＋中央Mini200 E2 Coreへ確定

利用者はE2資料の反映を指示した後、公開Siteの画像を示して「avocado miniはこの形」と訂正した。完成製品の外観は4本の銀色Motion Towerが低い中央ユニットを囲む形を優先し、E2ハード資料の198×178×198mm単体筐体へ置き換えない。E2のOS、ローカルゲーム、PTT音声、権限、保存、候補compute／storageは中央Coreの統合設計として採用する。4本との配線、同期、電源、冷却、音響、実機性能、量産は未受入。公開Site、予約説明、クラファン企画、製品ベース、README、workstreamへ同じ境界を反映した。製品Site v36（source `5e6316013c30bd2b9d1cad48d0528d5623bb11d9`）を一般公開し、4本のhero、Mini200 E2 Core説明、予約・クラファンの同一構成、静的build、予約API 6件を確認した。

## 2026-09-21 — ゲーム中心・生活OS・衛星通信の方針とmain統合の明示承認

利用者はゲーム機を主に生活全体を豊かにするOSへ育て、衛星通信で身近な環境へ届ける方向を示し、「ちゃんと更新してmainにあげて」と依頼した。この承認はE1設計と今回追補のmain統合に限る。2026-09-09の承認履歴は改変せず、force push、Site配備、衛星打上げ、通信契約、機材購入、実資金へ拡張しない。

主担当Material Invention / avocadoMiniのROCKとしてREADME、製品ベースv1.89、全体設計、E1追補、設計台帳、進捗を同期する。ゲーム内の入力・描画とローカル保存は外部回線から独立する到達設計、衛星は外付けゲートウェイから評価する通信手段、生活機器は個別同意と結果照合を持つ別adapterとした。直接衛星通信・自社衛星群は将来研究で、実装・実回線試験は0。MAT09、四方向契約、Pixel/QEMU、Web capture禁止、金融gateは維持する。

前回source `8a983435d110b6bd6f87176a5b272532f84b8563`の[全体CI](https://github.com/k999ln/rock/actions/runs/35659925923)成功を確認。main `c460578`の公開用README更新は変更せず取り込んだ。今回の追加変更は別SHAとして検証し、最新CIと統合の結果は[PR #27](https://github.com/k999ln/rock/pull/27)のhead、checks、merged状態、merge commitを正本とする。以前の`verification.json`は初回保存時snapshotであり、現在のmain状態を表すものではない。

今回の対象検証は関連Node 21/21、E1参照モデル140項目の再計算一致、project/database/baseline/design/system composition整合、差分の空白検査を通過した。衛星・生活機器の接続試験や実ASR・実機試験には算入しない。main統合前に今回head SHAの全体CIを確認する。

## 2026-09-21 — Mini200 E1の身体・日本語音声設計をGitの正本へ保存

利用者が`k999ln/rock`を正本としてREADMEへの保存を指定したため、main `83649c7256fbd5dafa664a0d2d7bfbf9651a8bfa`から分離した`codex/avocado-mini-e1-voice-design`で作業を開始した。20cmのゲーム機を新しい設計profileとしてREADMEへ追加し、本文、SVG図7枚、候補BOM、計算入力、参照モデル、結果、未記入の実機試験票を保存する。旧P0.2、四方向schema、MAT05/MAT06、Pixel/QEMU、Webのcamera/mic禁止と既存料金・資金gateは変更しない。元の利用者提供P0.2原本や重複PDF/DOCX/PNG/ZIPはGitへ追加しない。

主担当はMaterial Invention / avocadoMiniの`ROCK`、資料はMAT08、後続のE1実装・実機受入はMAT09。現行Material Coreは候補graphのsandbox、faster-whisperはcandidate、既存四方向契約はE1前面ステレオへ未適合であり、製品runtimeを変更したとは表示しない。実音声・実機試験は0、外観の一致、実主基板、ピン配線、物理ミュート、OS統合は未確定。次はE1専用入力profileとadapter、実部品・音声の縦断試作を受け入れる。参照モデル140項目の再計算一致、関連20テスト、型検査、製品lintを確認した。ローカル全体verifyはNode試験が完了しないため全体PASSには算入せず、[検証記録](docs/avocado-mini-mini200-e1/verification.json)へ残す。main mergeとSite配備は未実施。MAT08の完了は資料・参照モデルの保存だけで、MAT09の製品完成を意味しない。

## 2026-09-21 — avocadoMini予約販売バックエンドをfail-closedで強化

予約販売の公開前監査で、環境変数未設定、最終確認画面不足、通信結果不明時の在庫枠滞留、規約同意記録不足、管理API不足、入力上限のheader依存、試行履歴の無期限増加を確認した。商品・数量・税込送料込総額・支払方法・発送予定・取消条件・販売者を一覧にする最終確認画面、販売条件・privacyページ、規約版と同意時刻の保存、Stripe Checkoutの30分期限と同一idempotency keyによる再試行、`checkout_unknown`を含む期限切れ在庫解放、25時間超の手動reconcile、2日超の試行履歴削除、商品別5回上限、Bearer保護した注文一覧・reconcile APIを追加した。本文実測による1 KiB制限へ変更し、試験を3件から6件へ拡張した。製品Site v32（source `169266246a80b9c461be0b613db261f6008889e0`）を公開し、D1 migrationで規約版・同意時刻・Stripe期限・試行作成時刻を追加済み。販売者氏名・住所・電話、送料、発送時期、取消条件、税込送料込総額、在庫数、Stripe秘密情報、管理tokenは未設定のため、決済は引き続き閉じる。

## 2026-09-21 — avocadoMiniの文字演出を製品映像に合わせて更新

英語化した商品Siteの文字が静止配置に見えていたため、ヒーローの製品画像、ブランド名、2行コピー、補足を時間差で表示する導入へ変更した。下層の見出しは画面へ入った時に行単位で切り上がり、回転ツアーは章の切替ごとに見出し、説明、センサー詳細が再度現れる。冒頭は強いぼかしから段階的に合焦し、回転ツアーでは章の切替時だけ製品面へ0.78秒のフォーカス移動を加えた。`prefers-reduced-motion`では全演出を停止して最初から読める。製品Site v31（source `22d0fa4832f80d931286186e5f05180a6b9ac2f1`）を公開し、デスクトップの冒頭表示、静的buildと予約API試験3件を確認した。

## 2026-09-21 — avocadoMini公開Siteを全面英語化

公開商品Siteのホーム、回転ツアー、RockstarOS導入、Developer Previewガイド、クラウドファンディング案、予約販売、決済結果、APIエラー、画像代替文と操作ラベルを英語へ統一した。HTMLの言語指定とSite表示名も英語へ変更。製品Site v29（source `70f544d621c514da9a867ae66747dfc2cc7561bd`）を公開し、トップ、予約販売、導入画面のレイアウトを確認した。予約API試験3件と静的buildは合格し、sourceと配布物に日本語文字が残っていないことを確認した。

## 2026-09-20 — GTA6連携の前提を訂正

利用者はRockstarとの話がついており、GTA6との提携を進められると明言した。以前の「連携できない」という説明を撤回する。合意の対象と公表可能な内容は未特定で、RockstarOS／avocadoMiniでのゲーム実動作は未検証。公開サイトの互換性保証や公式素材の使用は、許諾範囲と試験結果に合わせて更新する。

## 2026-09-20 — avocadoMini予約販売の準備

1本16万円、4本＋Edge Hub 41万円を税抜の予定価格として予約販売画面に表示した。全額決済向けの注文台帳、Stripe Checkout、署名付きWebhook、在庫枠と申込回数の制御を実装した。製品Site v26（source `d26acb7aa8d2338871d75c4e9ed184fb658e5098`）を公開し、予約画面で価格と停止中の申込ボタンを確認した。発送時期、送料、販売者の氏名・住所・電話番号、キャンセル・返金条件、決済接続が未確定のため、販売開始スイッチは無効のままにする。Instagram `kirin.41` は連絡先への補助リンクとして掲載した。WEB15で実売上受入を継続する。

## 2026-09-20 — OS導入ボタンのデザインを更新

製品ページ末尾のインストーラー入口を、黒いスタジオ画面に合う金属調のボタンへ変更した。青いセンサーの光、ポインター時の光沢と矢印の反応を加え、動きを減らす設定にも対応した。デスクトップと390px幅で表示し、`/install/`への遷移を確認。製品Site v25（source `bbeb40bd23b568937bdee8eb7e2152b6ab817076`）を公開画面で確認した。Pixel 10への実インストールは配布用イメージと安全ゲートが未完了のため、引き続き準備中と表示する。次はWEB14の配布物・復旧・実機受入を進める。

## 2026-09-20 — 製品ページにRockstarOS導入入口を設置

利用者の指定に合わせ、製品ページの最後を「RockstarOS」と導入ボタンだけへ簡潔化し、専用の導入画面へ接続した。Screwを確認したが、実体はPRIVATE/PIXELのGrapheneOS導入ページへの案内で、再利用できるインストーラーコードやRockstarOSイメージは含まない。RockstarOSのPixel 10向けfull imageは未作成で、初回flashゲートは0/4のため、導入画面からUSB接続・初期化・書込みを実行しない。Mac仮想環境向けDeveloper Previewは別ガイドへ接続した。静的build、ページ遷移、デスクトップと390px幅の表示を確認。製品Site v24（source `7d891cdf0c4454c992ba65ccf614a5d48c4dd86b`）を公開し、公開ページのボタン遷移と準備中表示を確認した。実機ワンクリック導入は署名済み配布物と安全受入後に接続するWEB14として継続する。

## 2026-09-20 — Motion Tower最新版P0.2と製品表示を照合

利用者が再提示したPDFとWordをP0.2設計書として読み直した。製品の回転モデルでは、従来の縦並び3眼を横一列へ変更し、待機時に物理キャップがレンズを覆い、起動時に開く動きを加えた。下部の青いセンサー窓は追加構想と明記した。自立時とドック固定時の異常対応、PoE有線給電と内蔵バッテリーなしも公開説明へ反映した。設計書は試作・見積り・検証用であり、量産・実機性能の合格証拠ではない。添付ファイルは公開リポジトリへ複製しない。デスクトップと390px幅で確認し、静的buildは合格。製品Site v23（source `89949d99fc70474ee73687c4c1618bada13aa7ae`）を一般公開した。`npm run verify` はローカルのAI SDK export／capability matrix不一致で停止したため、GitHub同一SHAのCI結果を別に確認する。main統合は既存PRで継続する。

## 2026-09-20 — avocadoMiniの価格シーンを黒い製品画面に統一

利用者が一周後の白い価格カードと大きな無効の購入ボタンを指摘した。カードをなくし、黒いスタジオ画面に製品名、4本＋Edge Hubのキット目標価格、購入受付前の状態、製品化企画へのリンクを組み込んだ。タワーの3D表示は価格の横または下に残す。デスクトップ1280px、スマートフォン390px、中間幅794pxで価格と製品が重ならないことを試写し、静的build、製品ベース検査、進捗文書検査を通した。製品Site v22（source `ddd1b353f61ad9cf25a90eb6b3e9fe5bd44d1c3b`）を公開し、新しいCSSと文言の読込みを確認した。GitHub mainへの統合は既存PRで継続する。

## 2026-09-20 — avocadoMiniの全周回転を実際の3D動作へ変更

従来の前・横・後ろの画像切替では一周の変化が小さく、説明している機能と映像が結び付きにくかった。Motion Towerの構想3Dモデルをブラウザで連続回転させ、上下の青いセンサー窓と光、三段伸縮、3本の安定脚、4本のTowerとEdge Hubへの接続をスクロールの章に合わせて示した。WebGLが使えない環境では従来の構想画像を表示する。P0.2設計値と未検証の下部センサー案の区別を維持し、実機性能の証拠とは扱わない。デスクトップ1280pxとスマートフォン390pxでセンサー・伸縮・安全・Hub・価格の各場面を試写し、静的build、製品ベース検査、進捗文書検査を通した。製品Site v21（source `816c09802a2088e4d29af487d6c1c3f5c3714df7`）を公開。GitHub mainへの統合は既存PRで継続する。

## 2026-09-20 — avocadoMini回転ツアーの配置を再設計

利用者が回転中のMotion Towerと説明文の重なり、青い背景が冒頭のデザインから浮く点を指摘した。デスクトップでは説明を左、回転する製品を右の黒いスタジオ面へ固定し、横移動を小さくした。スマートフォンでは説明を上、製品を下へ分ける。接写画像の重複をなくし、センサー正面の発光と360度後の価格表示は維持する。デスクトップの0度・203度・290度、スマートフォンの68度・310度・360度を試写で確認した。製品Site v20（source `95dd1fa05b82749c295d3f71ebd9cc020bae828f`）を公開し、新しいCSSの読込みを確認。GitHub mainは未反映で、既存PRを更新する。

## 2026-09-20 — avocadoMini製品サイトを冒頭の黒いデザインへ合わせる

利用者は直前の全体的な青い配色より冒頭の黒い写真の見せ方を好み、下部もそれに寄せるよう指定した。説明、ハイライト、デザイン章、OS導入、下層ページを黒・金属色・白い文字と操作へ揃え、青はセンサーの演出と小さなアクセントに限定した。回転の説明と一周後の価格表示は維持。デスクトップと390px幅の試写で主な章を確認した。製品Site v19（source `ac51ed7cbb64c37deb35f20b08ade219ad840d34`）を公開し、公開画面が新しいCSSを読み込むことを確認した。GitHub mainは未反映で、既存PRを更新する。

## 2026-09-20 — Zemaの名前表示とチャットルームを再設計し、実行を操作確認

利用者が名前の重複と会話画面の見た目を指摘したため、Zema名と担当Botをヘッダーで整理し、Botの定型自己紹介・重複進捗を除去した。チャット本文と実行カードを同じ暗色に揃え、Bot選択時は新しい会話へ切り替え、依頼文をMr.系Toolの入力欄へ自動で引き継ぐ。返信IDをUUIDにして履歴復元後の重複を防ぎ、ローカル会話モデルが使えない場合もToolの実行導線を一つの返答で示す。localhost:3001では架空のココナラ案件チェック1件、出典整理2件を実行し、結果の会話表示、2通目の継続、履歴復元、390px幅を確認した。`npm run verify`は製品350件、Fashion 19件、仕事API149項目とbuildを含めて合格。モデルの橋渡し先4317番は起動していないため、自然なAI返答の成功は未確認。担当はROCK、外部サービスへの送信は行っていない。

## 2026-09-20 — ZemaのBot・履歴欄をデスクトップで固定

利用者の指定に合わせ、デスクトップのBot・履歴欄を常時表示し、会話欄との幅を3：7へ変更した。Bot選択、MCP選択、新規会話、履歴選択で左欄を閉じる処理は狭い画面だけに適用する。約794px幅の実ブラウザーで左238px・右556px、Bot選択と新規会話の後も左欄が残ることを確認した。390px幅では開閉、Bot選択後の自動格納、デスクトップ幅への復帰を確認した。`npm run verify`は同時作業中の発見用テストのLint警告を1行修正した後に全合格。担当はROCK、外部依存と本人操作はなし。Tool実行結果や本番接続は今回の画面修正の受入とは別に扱う。

## 2026-09-20 — Zemaの会話欄の崩れと新規会話を修正

利用者のスクリーンショットで、Bot欄を開くと会話・入力欄に旧レイアウトの左余白270pxが重複し、入力欄が約173pxへ縮む問題を確認した。重複余白を除き、Bot欄を開いた約794px幅の実ブラウザーで入力欄526px、閉じた状態で746pxを確認。未使用画面の依頼例を見やすくし、直接`/chat`を開いたときは自動担当の新規会話を表示する。候補Botが先に選ばれる挙動を解消した。「新しい会話」は同じURLでも会話と入力をリセットする。Bot選択、Bot欄の開閉、新規会話、依頼例を実ブラウザーで確認。`npm run verify`は製品試験349件、Fashion 19件、仕事API149項目とbuildを含めて合格。外部Tool実行の成功をこの画面修正の証拠には算入しない。

## 2026-09-20 — SkyとZemaの初期画面を使いやすく整理

Skyの初期画面で依頼欄を先頭にし、その下におすすめ5件を表示。ready全件、導入候補22件はタブで分け、検索では全Toolを探せる。役割の近道は4件に絞り、残りは展開できる。依頼を送った時は、未接続Toolなら接続確認へすぐ進む。ZemaのBot一覧は4件と選択中のBotを基本表示とし、全件展開と検索を残した。localhost:3001のSkyで表示件数、候補検索、自然文から接続確認を操作確認。Zemaは未サインイン画面まで確認し、サインイン後のBot展開操作は次の受入に残す。`npm run verify`は製品自動試験349件、Fashion 19件、仕事API149項目、buildを含めて合格。外部Providerや候補Tool本体の成功には算入しない。

## 2026-09-20 — avocadoMini回転ツアーのセンサー正面演出

利用者の指示で、Motion Towerの上下センサー窓が閲覧者を向く角度に合わせて、センサー位置を中心とした青白い光が画面へ広がるようにした。光量はスクロールの角度と連動し、一周後の参考価格では収まる。機能説明の文字は光より前面に配置し、動きを減らす設定では発光を停止する。青い光は視線方向と起動状態を伝えるCG演出であり、実機の照射性能を示さない。静的buildと製品ベース確認は合格。全体verifyは別作業の設計台帳Tool ID重複で停止した。製品Site v15（source `ebe80ff5f039296385f92a280258e412bf9b3b11`）を公開し、デスクトップと390px幅スマートフォンでセンサー発光・文字・非正面時の消灯・価格表示を確認した。GitHub mainへの直接pushは自動審査で拒否されたため未反映。

## 2026-09-20 — avocadoMini価格表示後をOS導入案内に集約

利用者の指示により、製品の一周とキット目標価格までは維持し、その後に続いていた空間CG、ベース接写、詳細仕様、体験説明の長い区間を取り除いた。価格表示の下はRockstarOS導入案内の1画面とし、Mac仮想環境向けDeveloper Previewの既存ガイドへ進める。一般向けインストーラーと実機は未公開のため、購入や即時インストールができるようには表示しない。製品Siteの静的buildは成功。GitHub mainの`1ed0f484e804dc5e849304da87ed550c8e0812df`に反映し、製品Siteのversion 13を公開した。公開版をデスクトップとモバイルで確認し、価格の下はOS導入案内とフッターだけであることを確認した。

## 2026-09-20 — avocadoMini製品外観とセンサー説明の再設計

利用者が公開画面の製品外観と説明の弱さを指摘したため、P0.2の細い三段伸縮ボディと円形ベースに合わせてサテン仕上げの構想画像を新規制作し、正面・側面・背面・センサー接写・4本構成の場面を統一した。青い窓は本体に埋め込み、上部3眼による手や物体の取得と起動時前方180度の順次走査を説明する。下部窓は床に近い設置面を補う追加案であり、P0.2未定義の構成・性能として明示する。CGの光と空間表示は機能説明の演出で、実機性能の証拠とは扱わない。スクロール中に説明が薄くなる表示不具合を修正し、デスクトップ1280pxとスマートフォン390pxで製品全景・センサー説明・重なりを目視確認した。回転中の円形ベースは脚収納時の意匠と明記し、脚の接地確認は安全制御の説明に残す。GitHub main `c4ac5826f37f77f95749bf0e89b71e10179c7beb`へ反映し、製品Site v12（source `8e5767b2169f535da79e75a50944e676d38b49c3`）を公開してスマホ画面で新画像と説明を確認した。並行して入った別機能によるDB table分類漏れは修正した。Sky catalogの追加分と設計台帳、および依存license監査の整合も修正中。

## 2026-09-20 — Motion Tower上下の青いセンサーカメラ外観案

利用者の新しい明示指示により、公開avocadoMini製品ページの回転区間を写実的な構想レンダリングに差し替えた。正面・側面・背面に同じ銀色の伸縮タワーを用い、上部と下部の青いセンサーカメラがスクロールに合わせて点灯する。4本のタワーが作業空間を捉え、Edge Hubへ情報を集める様子を続く全画面シーンで説明する。「すべては、空間のために。」より上の製品紹介構成と、一周後にのみ参考価格を出す流れを維持した。P0.2設計書で定義済みのカメラは各塔上部3基であり、下部のカメラ数・構成・性能は新しい外観構想で未確定。青い光・走査線は動作を伝える演出で、実機写真や性能検証ではない。デスクトップ1280pxとスマートフォン390pxで製品全体、上下の点灯、価格、次のシーンを目視確認し、静的buildとbaseline検査を通した。GitHub main `0903908d3542f4dece4a12403431f27520f1856a`の全体CIは成功。製品Site版v10（source `30db6fdcf1c5003dec287bb127edcdf28beaa1bd`）を`https://avocado-mini.kirin-999.chatgpt.site`へ配備し、公開画面で上下センサーの新しい説明と画像要素を確認した。ローカル全体verifyは既存のNode試験停止で中断し、CIを全体合格の根拠とする。

## 2026-09-20 — 回転しながら能力を伝えるavocadoMiniツアー

公開製品ページの「すべては、空間のために。」より上を維持し、その下のMotion Tower全周回転区間を更新した。利用者が示したスクロール案を参考に、1本のP0.2構想モデルが章に合わせて左右へ移動し、角度・傾き・大きさ・背景が連動する。文章は重ねずに切り替え、4本・計12基のカメラ、起動時180度走査、収納850mm／自立最大1,200mm／ドックまたは床ラッチ検出時のみ1,800mm、独立安全制御、Edge HubとRockstarOSの役割を利用者に伝える。実測性能や販売開始は主張しない。一周後にだけキット目標価格税込41万円を表示する。デスクトップ1280pxとスマホ390pxで各章、全周回転、価格の表示を確認した。GitHub main `3bba62732171deee7980520154f2c074df0feca3`の全体CIは成功。製品Site版v9（source `d607693030aff7b747782effaba6d98c3e658ffe`）を`https://avocado-mini.kirin-999.chatgpt.site`へ配備し、公開画面で新しい導入文言を確認した。ローカル全体verifyは既存のNode試験停止で中断したため、合格の根拠はGitHub CIとする。

## 2026-09-20 — P0.2設計書に合わせたavocadoMini製品紹介

利用者が提供した「RockstarOS Motion Tower P0 Engineering Package v2」を製品説明の新しい基準として採用した。従来の単体タワー画像に基づく160 mmベース、無条件の1,800 mm伸長、41万円の単体価格という誤解を修正。公開製品ページとGitHub冒頭は、4本のMotion Towerと1台のEdge Hubからなるキット、税込41万円のキット目標、自立時1,200 mm／ドックまたは床ラッチ検出時のみ1,800 mmと説明する。カメラは各塔3基、ARは外部表示、LLMは案内と説明のみ。設計書は見積り・試作・検証のためのP0.2で量産リリースではない。公開ページを全画面ヒーロー、横送りハイライト、1本の全周回転、キット価格、OS導入の順に再構成した。提供設計書自体は公開リポジトリに入れない。デスクトップとモバイル幅の公開画面で4本とEdge Hub、章構成、価格表示を確認した。製品Site版v8（source `e88bef941b17abaa1baa06876e12f4f61f03f1ef`）を`https://avocado-mini.kirin-999.chatgpt.site`へ配備済み。GitHub main `1a29a163979d3c8319c55b7c9c6829f79cb0ade6`の全体CIも成功した。

## 2026-09-20 — 製品を一周しながら機能を説明する全画面ツアー

avocadoMiniの公開商品ページで、スクロール中に製品を画面内へ固定する区間を6画面分に延ばした。立体モデルの回転と同期し、導入、センサー、三段伸縮、ベースの長押し操作、RockstarOS連携構想を一画面ずつ説明する。最後に360度へ達した後だけ希望参考価格41万円を表示する。製品の販売開始、実機性能、OS連携完成を示す文言にはしない。デスクトップと390px幅のブラウザで各章の切替、重なりの解消、最終価格を確認した。GitHub main `5734211cd8630db95232b5328165d721a12347e8`のCIは成功し、同sourceのSite版v6 (`545b71e2ad6319211bfdebf4b49efd97330ea195`)を`https://avocado-mini.kirin-999.chatgpt.site`へ配備して公開画面の回転・説明切替を確認した。ローカル全体verifyは既存のNode test停止で中断したが、同SHAのGitHub全体CIは成功した。

## 2026-09-20 — avocadoMiniの商品ページを映像的な見せ方へ更新

Appleの製品紹介ページの構図とスクロール体験を参考に、公開avocadoMini Siteの冒頭を製品が主役の全画面ビジュアルへ変更した。利用者提供の構想図に基づく独自レンダリングを使用し、実機写真とは区別する。次の画面でタワーをスクロールに合わせて360度回し、一周後に希望参考価格41万円と購入準備中を表示する。ベースとセンサーの接写、寸法、OS導入ガイドへ続く。デスクトップと390px幅のブラウザで、冒頭、立体表示、価格出現、接写を確認した。GitHub main `8c9d11ba7c92d2c77a33d8b9c35a865d4b5c0dc8`のCIは成功し、同sourceのSite版v5 (`0c56755db5121e94087129e0d263af64c0fcefe7`)を`https://avocado-mini.kirin-999.chatgpt.site`へ配備して公開画面を確認した。ローカル全体verifyは既存のNode test停止で中断したが、GitHubの同SHAの全体CIは成功した。旧noellesugar1 URLの転用とOS画面の管理者限定移行は所有アカウントの接続が必要で、旧Site取得は引き続きNOT_FOUND。今回のデザイン更新の合格とは分ける。

## 2026-09-20 — 旧URLを公開商品Siteへ転用し、OS画面は別Siteへ移す

利用者は`rockstaros-kaiya.noellesugar1.chatgpt.site`をavocadoMiniの一般公開商品サイトにし、`/rockstaros`を商品ページにする方針を選んだ。OS操作画面のみ別Siteへ移し、管理者限定にする。商品Siteには`/`と`/rockstaros`の入口、公開導入ガイド、クラファン構想だけを置く。現在は同じ商品sourceのプレビューを別ドメインで公開済み。旧SiteはこのタスクのSites接続でNOT_FOUNDのため、転用と旧OS画面の公開停止は未実施。OS側の新Site・DB・認証の移行も未実施。旧Siteの所有アカウント接続後に、旧URLへ商品sourceを配備し、旧OSを安全に移す。最新sourceはGitHub mainへ反映し、独立Siteの公開版では360度回転と参考価格の出現をブラウザ確認済み。静的build・型検査・対象Webテスト14件は合格。全体verifyは多数のNode試験が停止したため中断し、全体PASSとは扱わない。

## 2026-09-20 — Apple参考のavocadoMini製品ストーリー

利用者指定のApple製品紹介ページを参考に、avocadoMiniの公開製品Siteと`/rockstaros`のsourceを、暗い製品ヒーロー、スクロール連動のタワー360度表示、一周後の41万円の参考価格、設計画像、3場面の体験、OS導入案内へ続く構成に更新した。製品名と高性能LLM搭載目標を冒頭で示す。実機販売と一般向けインストーラーは未開始。製品Siteは別ドメインで公開し、旧`noellesugar1` SiteはOS利用画面として管理者限定にする方針を維持する。旧Siteへの配備とアクセス制限は所有Sitesアカウントの接続がないため未完了。更新後のローカルbuildと表示、公開版のURL・価格出現、GitHub mainとCIを確認する。

## 2026-09-20 — 別ドメインの製品Siteと管理者専用OS Site

利用者はavocadoMini製品サイトとOSのWeb利用画面を別ドメインに分け、後者を管理者限定にすることを確定した。公開製品Siteの独立した静的sourceを`sites/avocado-mini`へ作成。製品の360度スクロール、希望参考価格41万円、購入準備中、公開OS導入ガイド、募集前クラファン企画を含む。OS利用画面とその内部サービスへのリンクはない。ローカルbuild、3ページのブラウザ表示、360度到達後の価格表示を確認。製品Siteの別ドメイン`https://avocado-mini.kirin-999.chatgpt.site`を一般公開し、実URLの製品ホーム、導入ガイド、クラファン構想をブラウザで確認した。既存OS Siteは所有するnoellesugar1 workspaceが現在のSites接続から見つからず、管理者限定への変更は未実施で、一般閲覧可能な旧版が残る。

## 2026-09-20 — 製品ホームとOSホームの公開境界

利用者は、ルート`/`をRockstarOSの利用画面、`/rockstaros`をavocadoMini製品ホームとして区別し、OS未導入者がルートへ直接入れる状態を問題とした。製品ホームからOS内部の8領域と開発者SDKの詳細を外し、OSホームへの直リンクを削除した。スクロール体験の後段も製品の寸法と参考画像、OS導入案内の順に独立した節へ分けた。OS導入ガイドへの入口は維持し、ガイドから製品ホームへ戻るようにした。これは文言と導線の整理であり、同一Site内のルートへの直接アクセスはまだ遮断できていない。製品ホームの別Site化、または検証可能な導入状態に基づく制限が残る。既存Siteへの配備も所有アカウント未接続のため未実施。

## 2026-09-20 — 伸縮式センサータワーを主役にした製品ページ

利用者提供のFull-scale構想図を製品形状の基準にし、先に作った作業台の3D模型を三段伸縮の銀色センサータワーへ置き換えた。Appleの製品紹介ページを参考に、淡い背景、製品を大きく見せる固定画面、スクロール連動の360度回転、価格表示、次のOS導入画面、主な構想寸法、製品内ナビを整えた。提供画像をサイトとGitHubの主画像に使用する。従来の四方向センサーと作業台は複数タワーを使うシステム案として扱い、外観、寸法、販売の確定を主張しない。ローカルの実画面でタワー表示、スクロール360度、価格、OS導入、構想図を確認した。型・製品lint・Web build・bundleとasset検査を実施し、GitHub mainへ反映した後に同一commitのCIを確認する。

## 2026-09-20 — 製品を一周見るスクロール体験

`/rockstaros`の最初の画面をavocadoMiniの立体構想モデルへ変更した。スクロールで360度回転し、完了後に希望参考価格41万円と購入ボタンを表示する。販売・予約・決済は未開始なので購入ボタンは準備中とし、クラファン企画へ進める。次の画面にOS導入案内へのボタンを置き、Developer Previewと一般向けインストーラー未公開を明記した。既存の8領域と開発者入口は後段に残す。WebGLが使えない環境には構想画像を表示する。実機映像ではなく設計イメージ。既存Siteは一般閲覧を確認したが、所有アカウントへの接続ができるまで最新版を配備できない。型・製品lint・Web build・bundleとassetの検査、ブラウザでの360度表示と導線確認は合格。全体verifyは既存のNode全体試験が止まり中断したため、全体PASSとは扱わない。Three.js追加に伴う依存license台帳を更新した。

## 2026-09-19 — 製品・OS導入ホームに利用領域の入口を追加

利用者の指摘で、`/rockstaros`はavocadoMiniとOSの説明に偏り、アプリやOSの中の各サービスで何ができるかを十分に案内できていないと確認した。Sky、Zema／Work、Material Invention、Wallet、Market、CSV、開発者、OS導入の8領域を、役割・現在の制限・既存画面へのリンク付きで追加した。開発者ボタンがMaterial Studioの旧配信URLへ向いていた誤りも、ローカルの`/sky/publish`へ修正した。製品・導入ホームを入口にし、各機能の実装状態は変えない。Sites所有アカウントには現在も接続できず、公開URLのアクセス拒否と最新版未配備は残る。

型、製品lint、Web build、製品ベース、進捗整合は合格。ローカル`/rockstaros`と8つのリンク先すべてHTTP 200で、製品ページの見出し・領域カード・リンク先をブラウザ表示で確認した。`npm run verify`は既存の全Nodeテストで出力が止まり中断したため、ローカル全体PASSとは扱わない。GitHub mainの同一commit CIを確認する。既存Siteへの配備と本番DB読戻しは別途必要。

## 2026-09-19 — 三つの製品入口とavocadoMiniの参考価格を明示

利用者は、製品紹介とOS導入を兼ねるホームページ、アプリ、OS本体を最上位の入口とし、Skyなどをアプリ／OS内のサービスと位置付けた。製品ページとGitHub READMEの案内順、製品関係図、ベースラインへ反映した。既存ルートは製品・導入ホーム`/rockstaros`、WebアプリHome`/`、OS Developer Preview導入案内`/rockstaros/guide`。配信先の一般公開と最新版配備は未実施。

avocadoMiniの製品メッセージを「考える時間を、つくる時間に」とし、希望参考価格41万円を表示。高性能LLM搭載RockstarOSによるスムーズな作業は製品目標として記載し、現行の固定モデル実機Previewと区別した。41万円はハードウェアの目安で、確定販売価格、予約金額、OS従量料金ではない。原価、実機性能、販売条件は試作後に検証する。製品サイトに`/rockstaros/crowdfunding`の募集前企画ページを追加し、製品ページから進めるようにした。支援募集・決済の機能はない。

`project:check`、`baseline:check`、`design:check`、型、製品lint、Web build、両ページのローカルHTTP 200と画面表示は合格。`npm run verify`は既存の全Nodeテストで進まなくなり中断したため全体PASSとは扱わない。Sites一覧では配信先`rockstaros-kaiya.noellesugar1.chatgpt.site`のprojectが現在の接続アカウントに見つからず、既存URLの最新版配備と公開変更は未実施。次にGitHub main反映と同一SHAのCIを確認する。

## 2026-09-19 — クラファン企画案を追加

avocadoMiniのクラウドファンディング企画案を作成し、README冒頭から到達できるようにした。日本の起案者要件を満たす場合はCAMPFIREのAll-or-Nothingで小型Bench試作・検証を対象にする案を提示。Kickstarterのハードウェア募集は稼働する試作機が必要なため現段階では選ばない。募集主体、受取先、予算、返礼、募集ページは未定。支援金の受け付けは開始していない。Rockリポジトリ自体はprivateであり、外部支援者には現在のGitHub文書を公開できない。WEB09は実募集リンク設置まで進行中のままとする。

検証は`project:check`、`baseline:check`、`git diff --check`、追加文書のローカルリンク存在確認を通過した。`npm run verify`は`typecheck`と`lint:product`まで通過したが、既存の全Nodeテストが途中で進まなくなり中断したため、全体PASSとは記録しない。次はGitHubの`main`へ反映し、同一commitのCIと表示を確認する。

## 2026-09-19 — GitHub READMEの先頭をavocadoMini製品紹介へ修正

利用者の指摘により、GitHubの冒頭がSky／Zemaのアニメーションから始まり、主役に決めたハードウェア製品と構想参考画像が見えない問題を修正した。avocadoMiniの目的、外観設計画像、手で候補を比べる体験、利用場面の参考画像、開発段階を先に配置し、RockstarOSとアプリの説明をその後へ移した。製品別GIFも会社説明より前へ移し、構想画像・動くジャケット・開発状況・クラファン・アプリへの案内を冒頭へ加えた。画像は実機写真でも完成機能の証拠でもないと明記する。クラファンの募集URLはリポジトリと公開検索から確認できず、企画案を作成して導線にした。実募集リンクは募集開始後に設置する。

## 2026-09-19 — 製品別の動くジャケットをGitHub全体へ追加

READMEの製品体系に、avocadoMini、RockstarOS、Sky、Zema、Material Invention Studioそれぞれの正方形GIFを配置した。落ち着いたループと製品別の色・図形で役割を伝える。avocadoMiniには「設計中」を表示し、画面で示す機能の完成やSite一般公開を主張しない。5枚とも420×420、24フレーム、無限ループのGIFであり、異なるフレームがあることを確認した。`project:check`、`baseline:check`、`git diff --check`は合格。`verify`は既存のNode全体試験で出力が止まり中断したため、全体合格とは扱わない。次はGitHubの`main`へ反映し、各GIFの読込みと同一commitのCIを確認する。

## 2026-09-19 — GitHub冒頭に製品紹介GIFを追加

READMEのタイトル直下に、Skyで探す、Zemaで進める、Studioで試す流れを示すアニメーションGIFを追加した。avocadoMiniは設計中と明記し、実機が完成しているようには見せない。GIFは960×360、27フレーム、3.6秒でループする。`project:check`と`baseline:check`は合格。`verify`は既存のNode全体試験で出力が止まり中断したため、全体合格とは扱わない。次はGitHubの`main`へ反映し、README上の表示と同一commitのCIを確認する。

## 2026-09-19 — 既存Webサイトの一般公開とバックエンド受入を依頼

利用者は既存の`rockstaros-kaiya.noellesugar1.chatgpt.site`を一般公開し、バックエンドも実際に動くよう依頼した。Sites所有アカウントへの接続を選択した。現在の接続では対象projectが`project_not_found`で、匿名HTTPは製品紹介・公開Registryとも401だった。公開設定変更、配備、D1本番readbackは未実施。コード側では公開・匿名で使える`/api/health`を追加し、Worker／D1の主要tableを照合する。システム診断は認証401だけでAPI正常と判定しない。本人別保存・Wallet・開発者操作はChatGPTサインインを維持し、各画面のサインインリンクをSitesの最上位遷移へ統一する。ローカル合成利用者のWorker／D1 API試験は149 assertionで合格済みだが、本番サイトの成功証拠ではない。共有`node_modules`の実パスをWeb bundle台帳へ正しく対応させ、build、bundle 122 component、asset 78参照（欠落0）の検査に成功した。次は所有アカウントへ接続して既存配信sourceとDB履歴を照合し、同一commit配備、公開設定変更、匿名と認証後の実応答を確認する。自作部分の製品license条件は未確定として別gateに残す。

## 2026-09-19 — 利用者にとっての役割を先に伝える

利用者の追加指示により、RockstarOSの売りを収益方法ではなく「やりたいことに役立つAIと道具を見つけ、前に進める」に変更した。GitHub冒頭と`/rockstaros`のhero・導線を、Skyで探す、Zemaで進める、Studioで試す流れへ改訂。avocadoMiniを発明の候補を手で考える主役の構想として維持し、料金方針は製品価値の後段の正本へ残す。実機・一般公開・全機能の完成は主張しない。

## 2026-09-19 — サービス・OS・ホーム・アプリへの入口を明示

利用者が直接開けるよう、GitHub READMEに本人限定Siteの製品紹介、OS Developer Previewガイド、Home、Sky、Zema、Wallet、Market、Material Invention Studioのリンクを追加し、製品紹介ページにも主要アプリへの導線を追加した。既存Siteはサインイン画面まで確認したが、現在のSites接続から配信projectを取得できないため、GitHub mainと配信版の一致は未確認。ログイン後の実操作も未確認。WEB06は入口のsource整備後も配信・実操作確認まで進行中とする。

`project:check`、`baseline:check`、型、lint、route style 12件、production buildは合格。`verify`はNode全体試験中に出力が止まったため中断し、全体合格とは扱わない。GitHub側の同一commit CIで追加確認する。

## 2026-09-19 — 無料配布とOS従量課金の理念を記録

利用者の新しい方針は「無料で配布し、OSは従量課金制」。配布時の価格とOS利用時の料金を分ける。avocadoMini本体が無料配布の対象か、利用量の計量単位、単価・上限、外部実費の負担は未確定として確認待ちにする。現在のSky収益連動・月最大888 cents精算は別の実装条件であり、新しいOS従量課金が動作・請求済みとは表示しない。

## 2026-09-19 — ハードウェア製品を事業の表看板にする

利用者の決定により、GitHub冒頭と`/rockstaros`紹介ページではavocadoMiniを最初のハードウェア製品構想として先に示し、RockstarOS、LLM、Sky／Zemaをそれを支える技術基盤として説明する。OS Home `/` は作業画面として維持する。avocadoMiniは詳細設計段階で、実機試作、量産、販売は未実施。Pixel 10は開発用reference端末であり自社製品として扱わない。税務上の効果は製品説明へ記載せず、事業の表示変更から税務判断を導かない。

## 2026-09-18 — avocadoMini Full-scaleハードウェア詳細設計を追加

添付concept画像と既存の四方向sensor設計を、試作へ渡せる[ハードウェア詳細設計](docs/avocado-mini-hardware-design.md)へ具体化した。本体3.0 m × 1.7 m級、作業面2.4 m × 1.2 m級の初期budgetを維持し、機構、8〜12 optical viewpoint候補、sensor pod、AR／2D／haptic、GPU／network／storage、5 kVA級の初期電源budget、約4.6 kW peakの熱、hardwire privacy indicator、校正、degraded mode、preliminary BOM、14項目のHVTを定義した。

設計を目で確認できるよう、[全体構成](docs/assets/avocado-mini-hardware-00-overview.png)、[sensor pod分解図](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded.png)、[Full-scale chassis分解図](docs/assets/avocado-mini-hardware-02-chassis-exploded.png)、[電源・制御・haptic構成図](docs/assets/avocado-mini-hardware-03-power-control-haptic.png)を追加した。校正カードは実測証拠に見えないよう`SAMPLE／未校正`へ固定した。

同じ部品構成を維持したv2では、黒チタン、スモークガラス、細いcyan data line、amber safety line、広い余白、editorial gridへvisual systemを統一した。[v2全体構成](docs/assets/avocado-mini-hardware-00-overview-v2.png)、[v2 sensor pod](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded-v2.png)、[v2 chassis](docs/assets/avocado-mini-hardware-02-chassis-exploded-v2.png)、[v2 power／control／haptic](docs/assets/avocado-mini-hardware-03-power-control-haptic-v2.png)を設計書の標準表示へ採用した。v1は比較用に保持する。

利用者の追加指示により、v3では外観を「ただのsilver tube」へ単純化した。四方向podは黒い光学slitだけを持つ横長の銀筒、mastとframeは丸い銀pipe、露出rackは長い円筒service spineへ置換し、配線をtube内部へ収める。[v3全体](docs/assets/avocado-mini-hardware-00-overview-v3-silver-tube.png)、[v3 sensor pod分解](docs/assets/avocado-mini-hardware-01-sensor-pod-v3-silver-tube.png)、[v3 tubular chassis分解](docs/assets/avocado-mini-hardware-02-chassis-v3-silver-tube.png)を標準外観mockへ更新した。内部の安全・privacy・電源境界はv2から変更しない。

v4では同じ構成をさらに細径化し、frame φ45 mm、mast φ50 mm、sensor bar φ65 mm、service spine φ160 mmを外観mockの初期比率とした。[v4全体](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png)、[v4 sensor pod](docs/assets/avocado-mini-hardware-01-sensor-pod-v4-thin-tube.png)、[v4 chassis](docs/assets/avocado-mini-hardware-02-chassis-v4-thin-tube.png)へ標準表示を更新した。数値は意匠とpackage成立性を比較するためのPreliminary Mockで、強度・熱・光学の実測前に製造寸法へ固定しない。

自由空間hologram、追跡精度、部品、法規適合を完成扱いにせず、最初は2D／ARと四方向Benchで誤commit 0、raw映像非保存、pod欠落時commit禁止を測る。hardware設計はMAT04の設計証拠へ追加したが、MAT06の実機prototypeは未着手のまま維持する。

最初の並列suiteではloopback待受が`EPERM`となった。loopback権限を取得し直し、全体verifyを再実行してexit 0（Node 696/696、Fashion 19/19、Worker/D1 API 959、CSV 113、migration convergence 9/9、typecheck/lint/build/assets）を確認。production D1 readbackは0/6、Android Java/APK/device acceptance、Provider billing、carrier activation、販売、OS installationは未実施。

## 2026-09-18 — avocadoMiniをビリヤード台規模のFull-scale発明台へ拡張

利用者の明示指示により、四方向sensorを使う空間発明端末の最終製品目標を、ビリヤード台ほどの幅へ具体化した。[端末・interaction設計](docs/avocado-mini-spatial-invention.md)へ、本体約3.0 m × 1.7 m × 高さ0.9 m、有効操作領域約2.4 m × 1.2 m × 高さ1.3 mの初期budget、1〜2人操作、各方向2〜3光学viewpoint、表示と触覚の段階、安全境界を追加した。

[初期四方向concept](docs/assets/rockstaros-spatial-table-v1.png)と[Full-scale concept](docs/assets/rockstaros-spatial-table-full-scale-v2.png)をGit管理へ追加した。画像は設計意図とscaleの資料で、実機完成、裸眼3D、空間全域の追跡精度、硬い反力を証明しない。MAT04の設計証拠へ画像を加え、MAT06をBench合格後にFull-scaleへ進む実機prototype taskとして更新した。Jev／TypeSafe＋Local Qwen引き継ぎ原文は既存の`docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md`にすでに保存済みであり、重複文書は追加していない。

## 2026-09-18 — Jev ecosystem 10件を役割分離してSkyへ追加

利用者指定URLの重複を除く10 repositoryを確認し、既存Jev UltrafastにOpenJev、Jevlike、Jev Trader、Awesome Jev by TypeSafe、TypeSafe Computer Use、Jev Review、Jev Router、Jev Browser、Mobile Jevを加えた。Skyはready 11件を維持し、candidate 13件、合計24 Toolとなった。

[Jev ecosystem全体詳細設計](docs/jev-ecosystem-integration-design.md)で、decision model、browser、Mac操作、Android操作、code review、model routing、市場研究、referenceを別Tool／別権限へ分けた。Jev Traderは固定replayとPAPERだけ、Mobile Jevはwipe可能な隔離試験端末だけ、TypeSafe Computer Useは専用macOS accountのobserveから開始する。秘密鍵、実注文、個人端末、決済、予約、投稿、自動mergeは許可しない。今回の完了は調査、candidate catalog、全体／個別設計、台帳同期までで、source取得、install、API key、model download、runtime実行は未実施。

## 2026-09-18 — Jev UltrafastをSkyのbrowser agent候補へ追加

`browser-use/jev-ultrafast`の公開仕様とMIT licenseを確認し、Sky catalogの4件目の導入候補`jev-ultrafast`として登録した。[統合詳細設計](docs/jev-ultrafast-integration-design.md)では、専用Chrome profile、一仕事一tab、origin allowlist、`observe`／`prepare`／`act`、有限操作、秘密入力拒否、外部作用直前の一回承認、完了の独立検証、通信断後の二重操作防止、保存・削除・rollback、採用gateを固定した。

この追加は設計とcandidate表示まで。source取得、依存導入、TypeSafe／text model API接続、Browser Broker／MCP adapter、Chrome操作、実site受入はまだ行っていない。11 ready Toolは変えず、candidateを4件へ更新した。

## 2026-09-18 — OS本体から全Toolまでの詳細設計体系を正本化

avocadoMiniだけの設計ではRockstarOS全体へ合流できないため、[全設計ポータル](docs/rockstaros-design-portal.md)、[OS全体詳細設計](docs/rockstaros-complete-design.md)、[Sky／Zema／全Tool詳細設計](docs/sky-tools-complete-design.md)を追加した。Web／PC、Linux／QEMU、Android／Pixelを別環境として説明し、identity、capability、仕事状態、Local AI、記憶、実行場所、外部作用、artifact／receipt、保存、backup、update、UI、Wallet、security、DSP、運用、失敗、受入を一つの依存方向へ統合した。

Tool詳細は現在Skyの11 ready、13 candidate、native 6 familyを同じ書式で説明する。機械可読の[設計被覆台帳](data/design-document-index.json)と`npm run design:check`を追加し、catalogへToolを増やして詳細設計を追加しない変更、存在しない正本、未決定を無条件完成とする表現を失敗させる。これは現scopeの説明被覆であり、Pixel OS image、一般Tool sandbox、実Provider、avocadoMini実機等の未実装を完成へ変更しない。

## 2026-09-18 — 空間発明システム設計を「見て分かる」構成へ全面改訂

初版は情報を網羅していたが、初見の人が製品を頭の中に描く前に技術用語と責任境界が続く構成だった。正本を版2.0へ改訂し、avocadoMiniを「まだ存在しない材料を手で考えるデジタル発明台」と一文で定義した。四方向sensorの上面図、AとBを使った8場面の利用例、画面wireframe、できること／できないこと、デジタル仮説・計算・実物実験の三境界を前半へ置いた。

後半は手操作、状態表示、全体接続、Core記録、操作処理順、sensor、privacy、安全、offline、現在地、5段階の実装、役割別の最初の仕事、合格条件へ進む。技術者以外はAだけ、画面担当はAとB、実装担当はB〜Dを読む構造にし、難しい仕様だけを追加して利用体験を説明できなくなる変更を禁止した。

## 2026-09-18 — avocadoMini空間発明システムの共有用完成設計を正本化

誰に共有しても、概念の理解から自分の担当作業まで迷わず進める[RockstarOS × avocadoMini 空間発明システム完成設計書](docs/rockstaros-avocado-mini-complete-design.md)を正本化した。普段の言葉による5分説明から、全体構造、利用体験、四方向sensor、Core entity、再計算、Patent AI、privacy、accessibility、安全境界、契約、現在地、実装順、役割別参加入口、最初の1時間、受入条件、用語集までを一つにつないだ。

全体構成はMaterial Invention／avocadoMiniを主要応用systemとして12層・7経路へ更新した。装置非接続sandbox Coreと統合設計は完成しているが、XR runtime、四方向sensor実機、simulation／Patent AI bridge、外部ラボ、実材料性能、特許性、量産は未完成である。[担当作業入口](docs/workstreams/11-material-invention-avocado-mini.md)ではMAT05の合成scene／pose、MAT06の実機／Provider bridgeへ分け、初参加者が役割と完了条件を選べるようにした。

## 2026-09-18 — avocadoMini四方向sensorとSpatial Invention Studioを設計

RockstarOSを搭載するreference device conceptとして`avocadoMini`を定義し、別のVR／AR addonではなくMaterial Invention Coreの標準製品体験へ統合した。north／east／south／westの四方向sensor／cameraで中央のInvention Volumeを捉え、利用者が手で物質digital twinを選び、接続し、離し、工程parameterを動かす。commitされた操作は元候補を破壊せず新しい仮説branchになり、安全制約を先に検査してから交換可能なsimulationを差分再計算する。[Core正本](docs/material-invention-core.md)／[XR共通設計](docs/material-invention-xr.md)／[端末・interaction設計](docs/avocado-mini-spatial-invention.md)。

scene manifest、四方向sensor set、校正digest、tracking model／confidence、gesture phase、対象binding、仮説限定operationを機械可読契約へ固定した。cameraが物理物質を操作する、gestureで物理実験を承認する、XR runtimeが装置やCore DBを直接操作する構成にはしない。Patent AIは人、AI、simulation、文献、実測のsourceを分けた発明開示と先行技術差分を支援するが、特許性、発明者、権利帰属、自動出願を確定しない。現段階は設計で、四方向rig、XR runtime、Material Core→Patent AI bridgeは未実装。

## 2026-09-17 — RockstarOSへ名称を戻し、Material Invention Coreを根幹設計へ追加

正式製品名と全ての現在表示を`RockstarOS`へ戻し、共通release名を`RockstarOS 1.0`、公開前表示を`RockstarOS 1.0 Developer Preview`へ統一した。内部識別子`dev.rock`と既存の`rockstaros-*`互換名は維持する。2026-09-15〜16のAvocadoOS表記を含む署名済み証拠、配布物、暗号domain、既存backup formatは改変せず、現在表示と互換データを分離する。

物質、配合比、工程条件、安全性、simulation、実験receiptを版管理し、新しい材料・用途・工程の候補を作るRQ49と[Material Invention Core設計](docs/material-invention-core.md)を追加した。装置非接続sandbox CoreとしてJSON Schema、合成fixture、二物質・複数比率の候補graph、canonical SHA-256候補ID、危険性情報不足・単位不整合・許可条件超過のfail-closed、安全審査、provenanceを実装した。物理装置、化学simulation、Zemaの仕事／限定記憶、外部ラボとのruntime接続は未実装であり、危険な合成の無人実行やsimulationだけでの成功断定は行わない。

## 2026-09-17 — Pixel 10 compile-only full buildの二段階gateを実装

Pixel 10／`frankel`／`GL066`の初回Developer Preview向けに、`COMPILE_BRINGUP`と`RELEASE_FLASH`を分離した。`--mode bringup`は所有者確認済みSKU、固定source、host容量、vendor inventory、review済みLocal AI APKを要求し、Operator Agentは公開設定を与えるか明示的に除外する。成果物manifestはtest/development signing、production未署名、flash禁止を記録する。既存の`release`入口はGoogle純正復旧artifact、production signing plan、Operator trust、`fullBuildInputGatePassed`を引き続き要求し、未合格の現在はfail-closedになる。

Scalewayでは課金開始前のdraftとして、PAR 1、Ubuntu 24.04、`COMPUTE3-X32C-64G`（32 dedicated vCPU／64 GB RAM）、600 GB Block Storage 5Kを構成した。表示額はcompute €0.9363/時、storage €0.078/時、IPv4 €0.005/時、合計€1.0193/時（税別）。まだinstance作成、課金、SSH key登録、source sync、Soong buildは行っていない。

検証: Python phone preparation 18件、shell構文、OS contract、Android release architecture 8件、bringup成功／release拒否のCLI実行が合格。`npm run verify`は関連検査、型、lintとNode前半を通過後、既存Miniflare test processが終了しなかったため中断し、全体PASSとは扱わない。

## 2026-09-16 — AIネイティブOSの詳細設計をAstra、監査をSolで進化

製品中核を高性能・交換可能な端末内LLMとoffline agentを持つOSへ固定したRQ48を、[共通Coreの詳細設計](docs/ai-native-os-architecture.md)へ具体化する。Sky app／OSの能力差、モデル・記憶・仕事の契約、外部作用の結果照合、Game／IPの独立開発を設計し、[Solの独立監査](docs/ai-native-os-design-audit.md)を反映する。AI01は設計、AI02〜AI06は未着手の実装単位として追跡し、既存固定runtime／2工程Toolの合格を汎用agentの完成へ換算しない。

Solの最終判定は設計条件付き合格、未解決の重大な設計指摘なし。モデル比較・性能予算等の未確定値と新契約の実装・物理受入を後続taskに残す。今回のAI01完了はこの設計と監査の完了を表す。

検証: 正本・構成の関連3 test、文書リンク38件、`git diff --check`、`npm run verify`が合格。全体検証はNode 312件、Tool 19件、API 143項目、署名fixture 64件、型・lint・Web buildを含む。最初のsandbox実行はlocalhostのlistenがEPERMで拒否されたため停止し、通常権限で全体検証を完走した。今回runtime機能・OS image・実機受入の追加は行っていない。

構成監査と現在入口に残っていた古い優先順位・端末未確定・再起動待ちの記述を同期した。Pixel試験署名APKの非破壊23/23は既存証拠、全OS build、正式署名、物理全損復元、外部Providerは未完了という区別を維持する。

## 2026-09-16 — 制限付きOperator Agentを端末側へ実装

Operator Dockへ登録端末鍵で署名する`poll／ack／result` channelを追加し、launcherを持たない別UIDの`dev.rock.operator.agent`を物理product packageへ接続した。Agentは保存されたWebAuthn assertionを端末ID、RP／origin、UP／UV、P-256署名、期限、scope、単調増加counterまで独立検証し、永続化後だけackする。端末requestはKeystore P-256鍵、local監査はAndroid Keystore HMAC chainで保護する。任意shell、私的内容、Wallet、backup、製品data planeへのBinder経路は追加していない。

Node 14 test、Worker dry-run、Android build／lint、Android 15 emulator 5/5は合格した。停止操作には署名付き解除操作を対で追加し、初期化は30分前の端末通知記録と別release gateを必須にした。production WebAuthn credential、StrongBox attestation登録、Device Owner実行、外部Provider session失効、Pixel 10／SELinux実機試験は未完了で、実端末配信とfactory resetは無効のままである。[正本](docs/security-incident-response.md)／[証拠](docs/evidence/android-operator-agent-emulator-20260916.json)。

## 2026-09-16 — backup v2をShell API v4へ接続（物理wipe復元待ち）

所有者専用の256-bit recovery secretをchecksum付き24単語へ変換し、指定4単語の確認後だけ有効化するUIを追加した。Shell API v4から`avocadoos-recoverable-backup/2`を端末外へexportし、空のowner領域へ24単語でtransactionalにimportして新しいAndroid Keystore鍵へ結び直す。復元後は自動化を停止し、Sky tokenをrotateし、実行中leaseとactive承認を無効化し、導入component authorityとsecretを復元しない。

Java 11 Core 37/37、Android 15 emulatorのBroker 11 non-skipped testとShell 5/5、Android source build／lint 207 taskは合格した。Pixel 10の実data／Keystore消去、復元、再export、再起動は未実施なので、初回flash gateは0/4のまま維持する。[設計と物理gate](docs/android-backup-recovery.md)／[emulator証拠](docs/evidence/android-backup-v2-emulator-20260916.json)。

## 2026-09-16 — Operator命令をhardware credential署名へ固定

Cloudflare Accessへログインした管理serverだけで端末命令を作れる構成をやめ、命令ごとに運営本人のP-256 WebAuthn hardware credentialによる利用者確認付き署名を必須にした。端末、事故ID、action、理由、発行・開始・失効時刻をcanonical bytesへ固定し、credential ID、RP ID、origin、challenge、UP／UV flag、署名、増加counterをDock Workerで検証する。同じcounterの別命令への再利用は拒否し、assertionは端末側の独立検証用に専用D1へ保存する。

Dockのlocal暗号試験とdry-run buildは合格したが、Android Agent、production credential登録、専用配備、実機訓練はまだ未完了である。この段階では実端末へ命令可能とは表示しない。[正本](docs/security-incident-response.md)。

## 2026-09-16 — native Sky選択をBrokerへ永続化（物理再起動受入待ち）

Shell API v3へ`selectSkyTool`と`skySelection`を追加し、Skyで選んだ`article-preparation@1`をBroker SQLite schema v2へ保存するようにした。Zemaは保存済みselection tokenの一致をLocal AI計画の前後で確認し、不一致・未選択は仕事0件で拒否する。既存schema v1はtransaction内でv2へ移行し、未知の新しいschemaはresetせず停止する。

Host 35 tests、Android全378 task、Android 15 emulatorのBroker 9/9・Shell 4/4は合格した。実行中leaseを残すseedと、端末boot count変更後に回収・再実行して結果／7履歴eventへ到達するrecoverの二段階試験も実装した。所有PixelがADBから外れたため、実端末の再起動受入だけはまだ未実施であり、合格表示しない。

## 2026-09-16 — Local AI plan v2から選択Toolの結果・履歴までPixelで完走

Local AI Binder API v2へ`article-preparation@1/input-v1`専用callを追加した。端末内runtimeはJSON Schemaで出力を制約し、Tool callを無効化する。Brokerはその結果を信用せず、説明wrapper、未知field、Tool差替え、型違反に加え、選択した2つの純粋transformが入力を処理できることまで確認してから仕事を作る。既知のGGUF chat-template制御prefixだけを除去し、それ以外の前後文字は拒否する。

Android 15 emulatorではBroker 8/8とShell 3/3が合格し、モデルなしで仕事0件のまま停止した。所有Pixel 10 GL066でもBroker 8/8とShell 3/3が合格し、ShellのZema依頼が`queued`となり、Broker内の完全試験で`citations@1`→`free-article@1`、読取り可能な結果、5件の履歴、本人確認待ち`review`まで完走した。これは試験署名の単体APK受入であり、native Sky永続handoff、全経路の再起動／失敗復旧、AOSP image、SELinux enforcing、production署名は未完了。[証拠](docs/evidence/android-local-ai-plan-v2-20260916.json)。

## 2026-09-16 — native ZemaをLocal AIと最初の選択Toolへ接続

Android Shell APIをv2へ上げ、native Zemaの自然文依頼を署名済みBroker経由でLocal AIへ渡し、Skyで選択済みの`article-preparation@1`だけを厳格JSON planから既存Tool workflowへ登録するsource経路を実装した。モデルはToolを直接呼べず、説明文、未知field、別Toolへの差替え、closed input違反は仕事を作る前に拒否する。request IDは既存仕事へidempotentに結び、成功は`queued`、モデルなし・不正plan・同意不足は`blocked`の構造化応答にした。

Android 15 emulatorと所有Pixel 10で、Broker／Tool統合6/6とShell統合3/3がそれぞれ合格した。emulatorはモデルなし、Pixelはモデル出力が厳格plan不合格となったが、いずれも仕事0件のまま停止し、途中保存はなかった。同意なしはLocal AIを呼ぶ前に拒否した。したがってsource接続とfail-closed実機境界は合格、Pixelでの仕事作成・完了は未合格である。次はLocal AIへ計画専用出力契約を追加し、Broker側検査を緩めず実機完走させる。証拠は[`docs/evidence/android-zema-selected-tool-20260916.json`](docs/evidence/android-zema-selected-tool-20260916.json)。

## 2026-09-16 — 全体の最適構成と実際の接続状態を一つの監査へ固定

製品目的からOS、Pixel、Sky、Zema、Shell、Broker、Local AI、Tool、検証済み収益、Wallet、Fund、Operator、更新・復旧、Gameまでを再点検した。選択している責任分離と順序は1.0目的に整合するが、全層が一つのPixel上で接続・受入済みではない。Web、単体APK、emulator、fixture、sandbox、物理端末の成功を混ぜず、11層の選択状態と6本のend-to-end flowを[`data/system-composition-audit.json`](data/system-composition-audit.json)へ固定し、説明を[`docs/system-composition.md`](docs/system-composition.md)へ追加した。

旧BlackBerry-first taskはPixel 10受入後の二機種目再評価へ変更し、QEMU-firstをスマホOSの優先順位として扱わない。Androidの公開受入表示も実際の6 gate中1合格へ揃えた。最優先はstock Pixel上の`Sky → Zema → Shell → Broker → Local AI → 汎用Tool → 結果・履歴`、次にbackup v2、純正復旧・署名入力、端末側Operator Agentであり、これらの事前gate後だけfull buildへ進む。`npm run system:composition:check`と通常の`npm run verify`で、必須層・flow・証拠の欠落とproduction過大表示を拒否する。

## 2026-09-16 — Android 1.0の7決定と権限分離を一つの構成へ固定

Pixel 10／frankel／GL066向けの製品構成を、機種/SKU、BSP/vendor/partition、boot/recovery、OTA/rollback、SELinux enforcing分離、Keystore喪失backup、CDD/CTS/CTS Verifier/VTS受入の7決定へ統合した。正本は`data/android-release-architecture-policy.json`、説明は`docs/android-production-architecture.md`、自動検査は`npm run android:architecture:check`。

既存の`dev.rock.automation`は信頼identityを変えずheadless Platform Brokerとして残し、最終Home／Sky／Zemaを載せるAndroid launcher／UI入口を`dev.rock.shell`へ分離した。Shellは通信権限、Platform DB、Keystore、Engineと広いPlatform管理権限を持たず、専用BinderだけでBrokerへ接続する。現UIはP1操作画面で、最終native UI完成とは扱わない。Local AI、Tool、MCP、Provider、Operator Agentは別UID／別SELinux domainに固定し、runtime登録からdomainを得ること、Local AIからTool/Walletへ直接接続すること、Operator Agentから製品data planeへBinder接続することを拒否する。Operator Dockは利用者OSとlauncherへ含めない。

Shell／Brokerのsource分離、3 APKのAndroid Gradle build／lint、Android 15 emulatorのBinder統合試験は完了した。backup Binder経路は後続のShell API v4でv2へ更新済みである。ただし全体実装は未完了で、物理wipe復元、Operator Agent、Local AIの最終image/domain、SELinux enforcing user build、CTS/VTSは未実証である。公開監査はSELinux gateを独立追加し、Android実機を1/6合格へ変更した。欠落していたVTS、VTS HAL、VTS kernelの識別子とhash証拠を必須化した。

## 2026-09-16 — 初回flash前に固定する4項目をfail-closed化

Pixel 10／frankel／GL066へ最初に書き込む前の必須条件を、(1) 正式Android署名鍵のidentityと紛失・更新・失効手順、(2) AVB rollback indexのlocation／値／単調増加・downgrade拒否運用、(3) Google純正factory imageと対応full OTAの実ファイル名・byte数・SHA-256、(4) 端末dataとAndroid Keystoreを同時に失っても復元できるbackupの4項目へ固定した。正本は`data/android-first-flash-gate.json`、説明は`docs/android-first-flash-gate-20260916.md`。

現在は0/4合格で、`flashReady=false`を維持する。秘密鍵とrecovery secretそのものはGitへ保存せず、公開fingerprint、手順、artifact identity、hashed試験証拠だけを保存する。4番は`avocadoos-recoverable-backup/2`に固定し、backupごとのDEKをhardware-backed Keystore鍵と所有者だけの256-bit recovery secretで二重wrapする。24単語UI、transactional import、新Keystore再bindingはAndroid 15 emulatorで合格し、残る物理gateはPixel wipe後の実復元と再起動である。運営万能鍵やserver escrowは作らず、full build成功だけで初回flashを許可しない。

## 2026-09-15 — AI自動化チームの効率化を最上位目的へ固定

RockstarOSの目的はスマートフォンやOSを作ること自体ではなく、利用者が自分専用のAI自動化チームを所有し、その効率を改善することで、便利さと検証可能な収益機会を増やし、利用者全体の豊かさへつなげること。Pixelは最初のreference hardwareで、カメラ品質を1.0完成条件にせず、将来の専用端末は価値実証後の配布形態とする。

端末内LLMとToolをoffline-firstで動かし、接続時に外部案件、納品、署名済み収益、Walletを重複なく同期する。一つのTool経済loopを先に完走し、次に複数Toolファンドの一押し実行と実測改善へ進む。月50万円規模は長期の検証済み到達指標であって収益保証ではない。Walletの税務機能は記録、分類候補、集計、export、専門家確認までとし、データ収集はcategory別同意、目的、保存期間、削除・撤回を必須にする。ゲームは同じ権限・receipt・Wallet基盤の派生先とし、1.0の中核loopを止めない。詳細は[製品目的から逆算した開発軸](docs/product-north-star-20260915.md)とRQ47を参照。

## 2026-09-15 — 有料OS full buildを事前試験の後へ固定

利用者の指示により、Android OS full buildと実機flash／bootを最終工程に変更した。事前試験1では、固定sourceからLocal Action Assistantのarm64 release APKを生成し、SHA-256、ABI、通信権限なし、WAKE_LOCK、署名限定Binder権限を確認した。Android 15 arm64のPixel 10端末profile emulatorでは、同一の試験署名を使ったBinder接続とGGUF未導入時の`NO_MODEL`拒否を含む5/5 instrumentation testが合格した。ただしこれは純正OSの所有Pixel 10ではなく、GGUF推論、機内モード、保存／再起動、30分温度試験は未実行なので試験1は部分合格である。

事前試験2では、Sky→Zemaの一回引継ぎ、Zema job進捗、Android Tool Binder／SQLite／本人確認、Wallet／認証済み収益の各subsystemは合格した。一方、Tool完了から署名済みEarning Receiptを自動生成してWalletへ一度だけ転記するproduction経路は存在せず、現在はWeb Walletの手動記帳とSky Billingの別provider受付に分離している。このため試験2は不合格であり、[事前試験証拠](docs/evidence/android-pre-full-build-tests-20260915.json)の判断どおり有料full buildの許可はまだ出さない。

Sky、Zema、Wallet、Tool、LLMは更新可能なAPKとして先に純正Android上で反復する。app-only修正ならOS全体を再buildせず、framework、SELinux、privapp/product設定、boot/vendor/partition/AVBを変えた時だけOS imageを再buildする。事前gate合格後の初回サーバーは、target-files／factory／OTAを同一sourceから作り、最初の実機bootと修正要否を確認するまで保持する。

## 2026-09-15 — 端末管理を利用者OSから分離しOperator Dockへ移動

直前の`/operator`実装は「運営側のDock」という要望を同じRockstarOS Web内の非表示routeと誤解していた。利用者向け`app/operator`、`app/api/operator`、管理UI componentを削除し、利用者向けbuildへ管理画面・APIを含めない構成へ訂正した。

管理面は`services/operator-dock/`の別Cloudflare Worker、別hostname、別D1へ分離した。静的HTML／CSS／JavaScriptを含む全requestでCloudflare Access JWTのRS256署名、issuer、Dock専用audience、有効期限、単一operator subjectを検証してから応答する。管理画面、9種類の操作、命令キュー、15分保守、30分取消可能な初期化、追記監査はこのDock内へ移動した。

現在はsource実装であり、Dock専用hostname、Access application、operator subject、D1のowner設定と本番配備は未実施である。Android端末serviceも未実装のため、実端末へ命令を配信可能とは扱わない。

## 2026-09-15 — 旧実装記録: 利用者Web内の端末管理（後に分離・削除）

当初は`/operator`へ運営専用画面を追加したが、これは「運営側のDock」という配置要件を満たさなかった。直上の訂正で利用者Webから削除し、別配備のOperator Dockへ移動済みである。

Web D1へ端末、命令、監査の3tableを追加した。未検証端末、任意root、同じIDの異なる命令、許可外操作を拒否し、15分保守sessionと30分取消可能な初期化予約を固定した。監査eventの更新・削除はdatabase triggerで拒否する。

管理画面と永続命令キューは実装済みだが、Android端末側service、device enrollment、hardware operator credential、端末側の署名・nonce・scope検査は未実装である。したがって管理画面は`deviceAgent=not_implemented`を表示し、命令を実端末へ送信済みとは表示しない。

## 2026-09-15 — 運営1名による緊急保護accessを設計へ固定

紛失・侵害等の緊急時は、事前登録された端末に対して認定運営担当者1名が本人のその場の承認なしで保護を開始できる。ロック、紛失mode、Sky／Zema停止、session失効、OTA停止、通信隔離、sanitized診断、最大15分の限定保守sessionへ範囲を固定した。

常設root／任意shell、利用者の私的内容閲覧、Wallet操作、秘密鍵取得、マイク／カメラ起動は運営にも許可しない。端末側で署名・scope・期限・replayを検査し、hardware operator credential、追記監査、端末上の表示、事後通知を必須にする。初期化要求は運営1名から出せるが最低30分の取消猶予を設ける。

`data/device-emergency-access-policy.json`と`docs/security-incident-response.md`へ脅威と制御を保存した。これは設計確定であり、Android service、production credential、Pixel 10実機、侵入試験、復旧演習は未完了のまま`SYS13`で追跡する。

## 2026-09-15 — 当時のavocadoOS 1.0と将来の版更新規則を固定（v1.72でRockstarOSへ復元）

当時の共通製品版を`avocadoOS 1.0`、公開前表示を`avocadoOS 1.0 Developer Preview`に決定した。表示値は`data/product-identity.json`へ集約し、Web画面は同じ値を読むため、将来は一か所の版更新で表示を揃えられる。2026-09-17のv1.72で現在表示をRockstarOSへ戻した。

互換性を維持する改善は`1.5`のようなminor更新、Platform API・保存形式・署名trust rootなどの非互換変更はmigrationとrollback受入を伴う`2.0`のようなmajor更新とする。各Device Support Packageは対応Core版の範囲を宣言し、版番号だけで完成や公開可能とは扱わない。

## 2026-09-15 — 当時の正式製品名をavocadoOSへ変更（v1.72でRockstarOSへ復元）

利用者向けの正式製品名を当時`avocadoOS`へ変更し、変更しにくい内部識別子は既存の`dev.rock`で固定した。2026-09-17のv1.72で現在のWeb画面、PWA metadata、Android表示ラベル、通知、診断出力をRockstarOSへ戻した。

既存アプリ、署名・権限境界、保存済みデータ、外部連携を壊さないため、Android package／permission、`org.rockstar` component ID、`rockstaros-*` schema／storage key、`@rockstaros` package scope、URL `/rockstaros`、既存artifact名は互換識別子として維持する。過去の証拠・配布物に記録されたRockstarOS／avocadoOSは履歴として改変しない。

## 2026-09-15 — Pixel 10を最初の実機対象へ固定

所有済みのPixel 10をRockstarOS最初の物理対象に選択した。既存の`frankel` source lockと端末hookを使い、共通RockstarOS Coreは機種ごとに作り直さない。Pixel 7／`panther`はPixel 10受入後まで保留し、2機種目以降はDevice Support Package、vendor／firmware、partition／AVB、hardware、OTA／rollback、純正復旧だけを機種別に移植・検証する。

これは機種familyの選択で、実機readback、OEM unlocking、full build、flash、boot、正式署名の完了ではない。読取り専用診断が`frankel`と一致するまで`targetConfirmed=false`を保ち、クラウド課金や端末初期化を開始しない。

## 2026-09-15 — SkyからZemaへ依頼と実行状態を連続して引き継ぐ

Skyで選んだToolと自然文の依頼をZemaへ一回だけ渡し、Zema側で担当カード、入力確認、実行、進捗、結果、履歴を続けて扱えるようにした。依頼本文はURLやD1へ保存せず、同一tabのsession storageへ最大2,000文字・10分だけ保持し、対象Toolが受け取ると削除する。専用画面を持つCSV、Mercari、Market等はZemaから実行面へ進める。

同じZema画面で実行したjobは受付、開始、完了、失敗をbrowser eventで即時反映し、既存の本人別D1 pollingで再照合する。eventだけを完了証拠にせず、既存のreceipt、承認、費用、外部作用、収益の安全境界は変更していない。

検証では、ローカルD1 migration適用後にSkyへ「CSVの列名と重複行を整理して」と依頼し、Zemaで同じ依頼、担当カード、入力待ち状態、CSV Tool導線が表示されることを実ブラウザで確認した。`/api/sky/connections`、`/api/jobs`、`/api/automation-funds`、`/api/csv-jobs`はいずれも200を返した。`npm run verify`は275件の製品test、19件のFashion Brand Ops test、production build、Web asset closure、143件のWorker/D1 API assertionを含めて完了した。

## 2026-09-15 — RockstarOS全体のデザインとフロント機能性を改善

Homeと共通workspace shellへ、紹介ページ・Studioと同じ黒、酸味のある黄緑、monospace補助表示、丸い主要操作を適用した。Homeから仕事とCSVへ直接進めるようにし、取得していない通信・電池状態の表示をWeb／端末内設定表示へ置換した。端末内設定の保存失敗を安全に無視し、編集dialogへ初期focus、Escape、外側clickの閉じる操作を追加した。nested routeの現在地表示、処理中の移動不能状態、mobile headerとapp gridのoverflowも改善対象として固定した。業務機能、金融安全境界、CSVの私有成果物契約は変更していない。

## 2026-09-15 — 紹介ページとRock Studioのvisual systemを統一

`/rockstaros`と`/studio`を、黒背景、酸味のある黄緑、太い英字見出し、monospaceの補助表示、丸い主操作で統一した。Studioは白いカード中心の画面から、コード入力を主役にした暗い作業面へ変更した。コード貼付、ファイル添付、端末内解析、Package登録、結果と生成コードの確認機能は維持し、Homeとインストール紹介への導線を共通headerへ置いた。
紹介ページ下部に残っていた`OPEN ROCKSTAROS`のHomeリンクは、インストール操作と誤認しやすいため非操作のDeveloper Preview表示へ変更した。主CTAの`OSをインストール`は公開配布前の間、既存の検証済み導入手順へ接続する。

## 2026-09-15 — Developer Preview紹介をインストール中心へ再設計

`/rockstaros`から長い機能説明、動画、Game紹介を外し、黒を基調にした一画面へ整理した。主操作は「OSをインストール」で、公開配布URLがない現在は署名・配布境界を説明する既存導入手順へ進む。同じページにSky Tool SDKの最小Node.js例を表示し、本人限定Siteの`/studio`へ直接進める。Home、導入・復旧ガイド、Studio本体、OS配布gateは変更していない。

## 2026-09-13 — rc3-localの実測証拠を統合履歴へ保存

別作業ツリーだけに残っていた`1.0.0-preview.20260912-rc3-local`の限定受入記録を正本へ統合した。
当時の固定sourceでは、合成データと公開開発鍵を使うローカルQEMU Developer Previewとしてfresh導入、
署名tool実行、正常終了、非空backup/restore、復元後の履歴確認、最終停止まで合格している。
ただし現在の統合branchへの合格転用はせず、Sites、full D0〜D6、production署名、license、実機、一般公開、
実資金は未合格のまま維持する。詳細は
`docs/evidence/launch/backend-rc3-local-20260912.json`を参照する。

## 2026-09-13 — Web第三者依存47件を追加license reviewへ固定

`package-lock.json`の887 entryとCycloneDXの854 unique componentを同じlock SHAへ結合し、17種類のlicense expressionを全件分類した。MPL/LGPL系41件、OR選択式5件、CC-BY表示1件の計47件はPURL（component名・version）単位で追加review必須として固定した。lock上は本番到達可能な必須7件・optional 11件、開発専用の必須4件・optional 25件であり、一覧から1件消す・分類を隠す・本番到達性やoptionalityを変える・lock hashを差し替える操作を自動検査で拒否する。残る807件も各license本文・表示の対象であり「何もしなくてよい」とは扱わない。このlock監査単独は依存候補の把握で、実browser bundleの同梱範囲、条件履行、製品ライセンス採用、法的clearanceを完了した証拠ではない。

Viteへ非公開のbundle inventory pluginを追加し、生成chunkが報告したmoduleをpackage-lock pathへ照合した。ローカルproduction buildはclient・RSC・SSRの計120 unique npm component、未解決0を記録し、追加review 47 PURLの生成bundle内一致は0だった。結果は絶対pathを含めずignored `work/release/`へ0600で生成し、全体verifyがbuild直後に再検査する。これは同梱範囲の証拠を改善するが、build toolの条件、license/NOTICE/source提供、製品license選択、法的clearanceは未完のまま維持する。

## 2026-09-13 — iPhone/AndroidのPWA導入identityとiconを固定

Web app manifestへ固定`id`とroot `scope`を追加し、将来start URLが変わっても別アプリとして重複認識されないようにした。192/512 PNGに加え、Safari向けに1024角・全面不透明のmaskable SVGを追加した。production build上でmanifestの値、3 iconの参照、Content-Type、8 HTTP防御headerを8経路から再読取りし、source 2試験も合格した。これはiPhone/iPadを含む既存OS上のPWA導入改善であり、iOS置換OSやApp Store審査の完了ではない。

## 2026-09-13 — PWA更新を本人の明示適用へ変更

Service Workerはinstall直後に自動で新版へ切り替えず、設定画面の「更新を確認」で待機版を取得し、「更新を適用」を押した場合だけactivateする。controllerが実際に切り替わってから再読込し、8秒で確認できない場合は全RockstarOSタブを閉じて開き直す復旧案内を表示する。旧世代cacheはRockstarOS名前空間だけ削除し、別productのcacheを消さない。API、sign-in/out、foreign originをPWA cacheが横取りしない3試験と、変更後productionの5経路HTTP再検査に合格した。

## 2026-09-13 — Web/PWAのHTTP防御をWorkerとstatic assetの両経路へ固定

Web/PWAのsecurityをアクセス制限から独立した必須gateにした。8つの共通response headerでframe埋込み、plugin object、外部form送信先、MIME sniffing、referrer、不要なcamera/payment/USB等を制限し、HSTS、COOP/CORPを固定する。Service Workerとmanifestは更新再検証、hash付きassetはimmutable cacheを維持する。

最初のproduction実測で、Next configだけではWorker root `/`とstatic assetの`/sw.js`へheaderが届かない差を検出した。root ruleとCloudflare/Sites用`public/_headers`を追加し、再build後に`/`、`/sky`、Service Worker、manifest、実hash付きJSの5経路・8 headerを完全一致で確認した。本人限定Web/PWAは4/5、一般Web/PWAは3/5へ進んだが、Sites v29は古いsourceのため全体はready 0/6のまま。最新版同期後も本人認証済み実responseの再読取りなしにreadyへ変更できない。[実測](docs/evidence/launch/web-security-local-20260913.json)／[最低公開条件](docs/release-minimum-gates.md)。

## 2026-09-13 — Android実機とマイナンバーを証拠単位の別gateへ固定

Android物理端末版を、正確な機種/SKU、同一SKUのBSP・boot・recovery、同一buildのCDD/CTS、production署名、販売地域の5必須gateへ分けた。Android互換、物理flash、販売可能という表示は対応gateなしに有効化できない。GMSはAOSP外の別ライセンスなので、既定のDeveloper PreviewはGMSなしを維持する。対象機種は未選択で、現在0/5合格である。

マイナンバー連携は、無効化境界、目的/必要性、取扱主体/provider、data flowと保存/削除、安全管理、事故対応/委託先監督、最終有効化の7必須gateへ分けた。現在1/7合格で、番号・カード画像を取得せず、通常profileにも保存しない。両監査は公開台帳と機械照合し、gate欠落、状態ずれ、非公式根拠、承認前の取得を拒否する。[Android実機・マイナンバー監査](docs/android-and-personal-number-gates-20260913.md)を参照。

## 2026-09-12 — QEMU rc2を同一候補の10要件へ固定

QEMU `1.0.0-preview.20260911-rc2` のversion、source commit、1,003,224,286 byteのarchive SHA-256を、受入・434,523件inventory・Web表示の3系統で照合した。候補同一性、開発鍵と復旧guard、範囲付き更新・rollback、backup・中断復旧、反復boot・原本照合の5件を合格とし、rc2固有native SBOM、製品license、production署名、署名後の同一候補受入、一般公開承認の5件は未達を維持する。

旧9abのBuildroot legal-infoからtarget 24、host build 37 componentのCycloneDX 1.6を生成する実装を追加した。これは変換方法の検証であり、metadataと自動検査で旧source・license未許諾を固定する。旧inventoryをrc2固有SBOMへ転用したり、QEMU auditと公開台帳のgate状態を食い違わせたりすると検査を拒否する。[QEMU配布完了監査](docs/qemu-release-completion-audit-20260912.md)を参照。

## 2026-09-12 — 公開最低条件を機械判定へ変更

公開状態を本人限定Web/PWA、一般公開Web/PWA、QEMU配布、Android物理端末、iPhone/iPad client、マイナンバー連携へ分離した。設定画面は機械可読の同じ台帳から完了数を表示する。現在は本人限定Web/PWAも最新版同期待ちの4/5で、ready 0/6である。

公開検査は、必須gateと宣言状態の不一致、根拠file欠落、所有者選択とLICENSEのない製品license合格、正式鍵の実施記録がないproduction署名合格、npm依存のlicense metadata欠落、未審査のマイナンバー有効化を拒否する。Web/npmのCycloneDX 1.6 SBOMはignored領域へ生成し、native Buildroot inventoryとscopeを混ぜない。

一般公開とQEMU配布の次のauthority gateは、自作部分の製品ライセンス選択と正式署名方式の確定である。agentはそれを代行せず、それ以外の実装・検証・GitHub/Sites反映を先に完了する。[最低公開条件](docs/release-minimum-gates.md)を参照。

## 2026-09-12 — 最低限のOS運用と公開審査gateを設定へ追加

設定の「システム」を日常運用の操作面へ拡張した。安全な接続、通知、永続保存、PWA表示を実測診断へ加え、本人操作による通知テスト、ブラウザへの保存保護要求、個人情報を含めない診断JSON、確認付きのホーム設定初期化を追加する。初期化は許可済みの外観・並び順だけを対象にし、アカウント、Wallet、実行履歴、未知のlocalStorage keyを削除しない。

公開条件は折り畳み、Web/PWA、QEMU、Android CDD/CTS、Google Play/GMS、対象実機/BSP、production署名、OSS再配布、販売地域の無線規制、マイナンバー取扱いを別gateにした。RockstarOS全体へ単一審査があるとは扱わず、証拠がない項目は未実施のまま表示する。

## 2026-09-12 — OS診断・暗号化保全・更新確認を設定へ追加

設定の「システム」に、通信、端末内保存、Web Crypto、Service Worker、RockstarOS API、PC Connectorの実状態診断を追加した。端末内のRockstarOS外観・設定だけをパスフレーズから導出した鍵とAES-GCMで暗号化して書き出し、改ざんまたは誤ったパスフレーズを拒否して復元できる。ログイン、PC接続token、Wallet残高、server receiptは端末設定バックアップへ含めない。

同じ画面からWeb/PWAの更新確認を実行できる。QEMU Developer Preview、物理端末対象、正式署名鍵、外部MCP・販売・決済・払出しProviderを別gateとして表示し、画面追加を実機対応・本番署名・外部接続の完了証拠にはしない。物理端末版は正確な機種/SKU、BSP、bootloader、recoveryと鍵管理の確定後に別受入を行う。

## 2026-09-12 — ホーム画面と設定アプリをOSの標準入口へ追加

`/`をiPhoneに着想を得たRockstarOSホームへ変更し、Sky本体を`/sky`へ分離した。Sky、Chat、Wallet、Polymarketはアイコンから直接開き、設定はOS標準utilityとして追加する。壁紙4種、アクセント色、アイコンサイズ、アプリ名表示、並び順は端末内へ保存し、本人アカウントや各アプリの権限・記録を変更しない。

設定アプリは、ブラウザ接続、本人アカウント、PC Connectorの実状態を表示し、外観、PWA追加、MCP権限・実行先、Sky管理、Web UI再読込、Developer Previewの導入・バックアップ・復旧へ接続する。Web画面、QEMU版、物理端末版の境界は維持し、画面表示だけで実機書換え・外部MCP・実資金を完了扱いにしない。

## 2026-09-12 — Skyを「稼いだ後だけ最大8.88 USD精算」へ訂正

利用者の明示訂正により、Stripe Checkoutの先払い月額を廃止した。Skyの自動化が生み、外部Providerで入金まで確認できた収益だけをExecution Receiptと結び、署名済みEarning Receiptとして独立Workerへ入れる。実費を先に回収し、ToCの残額から利用者ごと・UTC月ごとに最大888 USD centsをSkyへ、残りを利用者の払出し指図へ記帳する。ToB分のSky利用料は0。売上0時の請求、未達分の債務化・翌月繰越、カード定期請求は行わない。

WorkerはReceipt/実行/Provider参照の重複防止、改ざん・競合拒否、月集計、追記型4勘定台帳、払出しidempotency key、本人別statusを実装した。旧Checkout・Portal・Stripe subscription webhookは410で停止する。現時点で販売・決済・払出しProviderは未接続なので、実際に稼いだ・回収した・送金したとは扱わない。[実装・境界・接続手順](docs/sky-billing.md)。

`npm run verify`でWeb本体118 tests、Fashion Brand Ops 14 tests、仕事API 143 assertions、型・lint、D1移行互換、収益精算Worker bundle、本番buildを通過した。対象試験は、低収益、月888 cents上限、ToB 0、Receipt改ざん・再送・競合、本人分離、払出しleaseと同一idempotency keyを含む。これはローカルfixtureであり、実口座の入出金実績ではない。

## 2026-09-12 — 改善版Skyへブランド運営役を統合

最新のSkyフロント`6f02f1a`を基準に、依頼受付、6つの役割チップ、ダークなTimeline、短い実行導線をFashion Brand Ops branchへ反映する。`ブランド運営役`はInstagram／広告／DM／受注／決済／制作／発送の依頼を受け、既存の38 MCP操作、Campaign Autopilot、Sales Concierge、Production Cockpit、approval gateを開く。サブスク顧問と既存4役も失わない。

Sky月額請求実装は上記の別境界で完成した。FB05は、役割ルーティング8件、全Web 110件、Fashion Brand Ops 14件、型・静的検査、本番build、Worker/D1 API 143 assertionsと実画面操作で合格した。Fashion Brand Ops側の実Provider、実投稿、実広告、顧客向け実請求、返金は接続済みとは扱わない。

## 2026-09-12 — SkyからFashion Brand Ops MCPへワンクリック接続

Chatの左アプリ欄を撤去し、会話・依頼先・最近の処理を一列へまとめた。既定はSky Autoで、利用者は先にアプリを選ばず「案件を見て」「法律の相談」「特許を調べて」のように入力できる。接続済みの役割へ振り分け、担当を会話内へ表示する。アプリの直接指定は上部の小さな切替として残す。

失敗を含む過去jobは会話本文より下の「最近の処理」へまとめた。Chat上の返答は受付・担当選択であり、実jobの完了証拠は保存済みreceiptだけとする。判別不能・未接続・入力不足では勝手に実行せず、次に必要な情報を返す。

## 2026-09-12 — SkyのMCP導入・利用体験を改善

ToB掲載では、遠隔MCPのURL入力後にSkyが`initialize`と`tools/list`を実行し、ツール自体を動かさず接続状態と公開ツール名を確認する。公開HTTPS以外と内部ネットワークを拒否し、OAuth必須先は認証待ちとして審査へ残す。

ToCのPC接続はツール総数4件の固定を廃止し、必須4件が存在すれば将来の追加ツールを許容する。初期化で合意した対応MCP版を後続通信へ使い、現在の本人限定SiteをPCパックの許可Originへ追加した。一般利用画面は「PC接続」「PCで実行」と表示し、MCPという内部用語は開発者向け設定へ限定する。[実装・安全境界・検証](docs/sky-mcp-usability-20260912.md)。

## 2026-09-12 — Skyへ「特許出願アシスタント」を追加

Skyのready商品として、ソフトウェア・システム発明の整理、公開状況警告、公式特許情報に限定した候補調査、明細書・請求項・要約・図面指示・提出前チェックのドラフト作成を追加した。発明内容は保存せず、外部AIへの送信は明示同意後だけ行う。

特許性、登録、侵害回避、期限は保証しない。候補文献と請求項は人が原文と差分を確認し、電子署名、料金支払、特許庁への提出はSkyから実行しない。[実装と安全境界](docs/sky-patent-assistant-20260912.md)。

## 2026-09-12 — Skyへ「日本語法律相談受付」を追加

自動化Hub（Sky）のready商品として、相談内容をブラウザ内だけで整理する日本語法律相談受付を追加した。安全・逮捕・公的書類・期限を先に確認し、一般情報で足りる場合は公的案内、弁護士相談が必要な場合だけ引継ぎ要約と分野・地域に合う候補を表示する。候補は利用者提供の領事館公開リスト33件に基づき、推薦・斡旋・受任保証ではない。

Draft PR #10の初回native CIは、`Hub`から`Sky`への表示変更をPIN画面source guardが検出して停止した。`scripts/review-native-pin-source.py`を隔離Linux環境で実行し、Wallet／ATM各14 frame、既存ROI・PIN桁数・署名ボタン状態、7つの古い座標拒否が同じ画素定義のまま合格したため、`ui.c`と`mcp-ui.inc`のsource hashだけを更新した。画素定義、期限、認証、Wallet処理は変更していない。

## 2026-09-12 — Instagram運用・受注型ブランド管理をSkyへ統合

正本Gitを再確認し、対象は`k999ln/Mr.`のOne Hubではなく`k999ln/rock`のSkyと確定した。Sky開発commit`bf85af6`を隔離branch`codex/fashion-brand-ops-sky`へ統合し、`Instagram運用・受注型ブランド管理`をSkyのready商品、Timeline項目、28操作のMCP serviceとしてmock検証する。account list/switch、content plan、draft/caption、approval、schedule/publish、insights sync、DM classificationを完了条件へ追加した。

実装は`toolkits/fashion-brand-ops`、判断と検証境界は[統合記録](docs/fashion-brand-ops-integration.md)、確定要望はRQ18。Creative/Social/Payment/NotificationをProvider化し、SQLite受注台帳とWebhook照合を持つ。価格変更、外部生成、投稿/広告、DM送信、請求、返金、通知は署名付き個別approvalが必要。初期値はmockで、実Higgsfield/Meta/Stripe、外部費用、QEMU/Android/実機OS、Sites再配信、main mergeは変更していない。

## 2026-09-12 — 多機種対応を共通Core＋機種別packageへ固定

利用者の決定により、RockstarOSは一つの汎用imageを全端末へ書き込む方式ではなく、共通Coreと機種／SKU別Device Support Packageを組み合わせる。提供区分を完全なOS、Android GSI実験版、既存OS上のclient、非対応の4種類に分け、対応台帳と自動検査で誇張を防ぐ。[設計](docs/device-support-architecture.md)／[台帳](data/device-support-matrix.json)。

これは設計・検査の実装であり、実機対応完了や書込み可能imageの生成ではない。最初の物理端末は未確定で、Pixel 7／`panther`とPixel 10／`frankel`を候補として保持する。BlackBerryは正確な機種ごとにbootloader・vendor・recoveryを調査し、iPhone／iPadはclient-onlyとする。クラウド課金、実機flash、production署名、一般公開、main統合は未承認のまま。

## 2026-09-12 — Skyへ「サブスク顧問」を接続

Fashion Brand Ops v0.3.0に、許可済みSky originからPCのloopbackへ接続する短期browser sessionを追加した。Skyの商品カードを1回押すと、session発行、MCP initialize、initialized通知、38操作のtools/list検査まで自動で進み、カードとDialogを「接続済み」へ同期する。再表示時はpingとtool一覧を再確認し、停止・失効・tool不足ではbrowser側sessionを破棄する。解除時はPC側sessionも失効する。

利用者の提案を受け、ツール一覧だけでなく役割を持つ担当者と話して進めるAgent Hub方針を追加した。最初の実装としてサブスク顧問へ質問例と自由入力を追加し、月額、要対応、次回更新、全体要約を外部AIなしで回答する。各担当はMCP allowlist、data scope、本人確認、memory、receiptを持ち、外部変更はpolicy gatewayを通す。[役割エージェント仕様](docs/sky-role-agents-20260912.md)。

今回はローカルSkyでのPC接続と読み取り会話までを対象とし、HTTPS配信版のloopback接続、Native Sky MCP brokerへの常駐、Walletへの費用転記、解約・支払い・申告は未実装のまま保持する。[実装・安全境界・検証](docs/sky-rockstar-ledger-20260912.md)。

追加で全網羅監査を実装した。Apple、Google Play、カード、銀行、PayPal、請求メールの6情報源と確認期間を追跡し、全情報源の解決と継続契約の更新日入力が揃うまで完了と判定しない。現在の個人台帳は既知18件（過去・終了10件）を保持する一方、情報源0/6確認済み、明細0件、更新日3件不足のため未完了と表示する。SkyチャットとMCPも同じ判定を返す。

## 2026-09-12 — 基本アプリをSky / Chat / Wallet / Polymarketへ整理

利用者の明示確認により、RockstarOSの基本アプリを4つに固定した。Skyは自動化アプリの発見・掲載・1タップ接続へ集中し、依頼欄を撤去した。Chatは接続済みアプリを選び、依頼・確認・実行状態・完了通知を受け取る独立画面とした。Walletは従来どおり収支・費用を管理する。

Polymarketは4つ目の外部市場アプリ枠として追加したが、安全な未接続画面だけを実装した。市場データ取得、注文、清算、Walletからの資金移動は行わず、提供地域・年齢・本人確認・規制・外部契約を満たした後の別adapterと同意が必要な状態を維持する。

## 2026-09-12 — SkyをRock IDへの1タップ接続へ変更

Skyの既定導線から長い入力フォームを外し、未接続ツールはRock IDから利用許可だけを保存する1タップ接続、接続済みツールは会話欄へ直接戻る「頼む」導線へ変更した。案件文や原稿など毎回変わる情報はSkyとの会話で渡し、従来の入力画面は必要な場合だけ開く「手動入力」に畳んだ。本人確認とツール権限を分離し、個人番号・住所・生年月日はツールgrantへ保存しない。

## 2026-09-12 — スマホで実行画面が左へずれる不具合を修正

実ブラウザで商品カードを1回押し、「接続済み」「38操作を利用可能」への反映、解除後の未接続表示、再接続、error overlay不在を確認した。`npm run verify`はWeb 107 tests、Fashion Brand Ops 15 tests、型、lint、本番build、Worker/D1 API 143 assertions、migration検証まで全て合格した。

## 2026-09-12 — 改善版SkyへInstagram運用を統合

黒基調の役割フィード、自然文の「Skyに頼む」、検索・状態タブ、1カード1操作へ整理したSkyを、Fashion Brand Ops v0.2.0を含むローンチ候補へ適用した。Instagram運用・受注型ブランド管理を「ブランド運営役」として追加し、Instagram・ブランド・投稿・広告・DM・受注・制作・発送の依頼を同商品へ案内する。38操作、既存商品、approval gateは維持し、Fashion Brand Opsの接続状態も同じ黒いDialog内で読めるようにした。

幅767px以下のDialogは下端固定のシートとして表示し、中央配置用の`translate`を明示的に解除する。これにより狭い画面でDialogが左上へ半分ずれる問題を防ぐ。実Provider接続、実投稿、Sites再配信はこのUI統合には含めない。

デスクトップと幅585pxのスマホ表示で、ブランド運営役のカード、38操作の詳細、承認境界、Dialogの画面内配置を確認した。`npm run verify`はWeb 105 tests、Fashion Brand Ops 14 tests、型、lint、本番build、Worker/D1 API 143 assertions、migration検証まで全て合格した。

## 2026-09-12 — SkyのInstagram運用と既存ツールを同時統合

`codex/fashion-brand-ops-sky`へ最新のSkyサブスク顧問branchを取り込み、Instagram運用・受注型ブランド管理、サブスク顧問、既存Web/PCツールを同じSky画面で併用できるよう競合を解消した。検索カテゴリ、Timeline、詳細runner、ready件数、製品ベース検査を6商品の構成へ同期した。

`npm run verify`でWeb 103 tests、Fashion Brand Ops 14 tests、型、lint、Sky／端末対応／製品ベース検査、本番build、Worker/D1 API 143 assertionsが成功した。実Provider・実投稿・実請求、Native Sky MCP broker、Wallet費用転記、Android／実機組込み、Sites再配信、main統合は実施していない。

Draft PR #10の初回native CIは、`Hub`から`Sky`への表示変更をPIN画面source guardが検出して停止した。`scripts/review-native-pin-source.py`を隔離Linux環境で実行し、Wallet／ATM各14 frame、既存ROI・PIN桁数・署名ボタン状態、7つの古い座標拒否が同じ画素定義のまま合格したため、`ui.c`と`mcp-ui.inc`のsource hashだけを更新した。画素定義、期限、認証、Wallet処理は変更していない。

## 2026-09-12 — Instagram運用・受注型ブランド管理をSkyへ統合

スマホでは役割を横送りにし、実行ボタンを優先表示する。`prefers-reduced-motion`では継続アニメーションを止める。実画面で「今使える」への切替と4件への絞り込み、スマホ幅の表示を確認した。

## 2026-09-12 — Skyの役割をワンタップで開く

SkyのX型Timelineと会話受付を維持し、文章の送信または4つの役ボタンから、ブラウザ実行画面を追加操作なしで開くようにした。PCが必要な納品確認は同じ操作で接続画面を開く。外部送信、料金、権限の本人確認は省略しない。

日本語法律相談受付を現在のSky Agent Hubへ統合した。Timeline投稿、法務受付の役割ボタン、自然文の依頼から会話型受付を開ける。公開連絡先33件、ブラウザRunner、公式情報限定の法令AI、安全判定、弁護士引継ぎを同じ画面で利用できる。

実装は`toolkits/fashion-brand-ops`、判断と検証境界は[統合記録](docs/fashion-brand-ops-integration.md)、確定要望はRQ18。Creative/Social/Payment/NotificationをProvider化し、SQLite受注台帳とWebhook照合を持つ。価格変更、外部生成、投稿/広告、DM送信、請求、返金、通知は署名付き個別approvalが必要。初期値はmockで、実Higgsfield/Meta/Stripe、外部費用、QEMU/Android/実機OS、Sites再配信、main mergeは変更していない。

## 2026-09-12 — 多機種対応を共通Core＋機種別packageへ固定

利用者の決定により、RockstarOSは一つの汎用imageを全端末へ書き込む方式ではなく、共通Coreと機種／SKU別Device Support Packageを組み合わせる。提供区分を完全なOS、Android GSI実験版、既存OS上のclient、非対応の4種類に分け、対応台帳と自動検査で誇張を防ぐ。[設計](docs/device-support-architecture.md)／[台帳](data/device-support-matrix.json)。

これは設計・検査の実装であり、実機対応完了や書込み可能imageの生成ではない。最初の物理端末は未確定で、Pixel 7／`panther`とPixel 10／`frankel`を候補として保持する。BlackBerryは正確な機種ごとにbootloader・vendor・recoveryを調査し、iPhone／iPadはclient-onlyとする。クラウド課金、実機flash、production署名、一般公開、main統合は未承認のまま。

## 2026-09-12 — 現進捗・スマホ不足・クラウド条件を再監査

main `7cdbb5f`とDraft PR #4の候補`c182a5b`を再取得し、PR #4の同HEAD 12 checkが全て成功していることを確認した。ただしスマホcheckはsource preparationで、OS bootではない。41 taskは19 done／15 in progress／7 plannedだが、製品完成率には換算しない。QEMU rc2の内部限定受入、Android P1の2APK、本人限定Siteを保持し、スマホ版は全source取得・vendor生成・Soong build・AndroidへのSky/Wallet/Game移植・production署名・実機flash/boot/OTA/復旧が未完了。[現在の再監査](docs/current-state-20260911.md#2026-09-12--github実装実機版ビルド環境の再監査)／[機械可読snapshot](docs/evidence/launch/progress-audit-20260912.json)。

直近相談のPixel 7／`panther`と、現在固定済みのPixel 10／`frankel`が不一致。実機の型番/SKUを読取り専用で確認するまで対象を確定しない。初回buildはGPUなし、Ubuntu 24.04 x86_64、48 vCPU／96GiB／600GiBを安全側の候補とし、20〜30 USDを未承認の計画枠に更新した。クラウド作成・課金、端末操作、runtime変更、Site再配信、main mergeは行っていない。

今回の安全な開発差分として、phone build入口をlock由来のdevice／lunch／hook／targetへ限定し、`targetConfirmedByOwner:false`または`confirmedSku:null`のfull OS buildをfail-closedにした。RAM64 GiB／空き400 GiBの最低条件、prepare後とrepo検査後のhook SHA再検証、path／Unicode／`-j`入力拒否を追加し、local phone tests 10件、shell構文、py_compile、diff-check、`npm run verify`（93 tests・build・API 143 assertions）をPASSした。これはsource準備の証拠であり、full OS build／boot／flashの成功ではない。

## 2026-09-11 — 開発本体へスマホ準備と現状を統合

現在の入口は[統合した開発状態](docs/current-state-20260911.md)、次の指示は[再開手順](docs/prompts/rock-current-next-20260911.md)。スマホ準備3eeeeedをlaunch-candidateへ取り込み、旧QEMU受入、本人限定Site公開、CM制作途中、MIT/署名鍵/クラウド予算の未回答を同期した。main・配布image・Sites配信は今回変更していない。

検証: `npm run verify`（93 tests・型/lint/build・API143）、スマホ準備8 tests、OS契約整合、shell構文、現在入口のリンク確認に合格。独立した2件の整合レビューも指摘解消を確認。過去の未完了・料金・QEMU/Android runtime・公開済みSiteを保持した。[今回の統合証拠](docs/evidence/launch/development-integration-20260911.json)。

## 以下は日付付きの作業履歴

過去の「次」「現在」「準備中」はその時点の記録。最新状態は上記と機械可読進捗を優先する。

## 2026-09-11 — スマホへ書き込むOS版の開発開始

利用者の明示指示で実機版の開発を開始。Pixel 10候補の公式安定版タグ署名を確認し、固定source・端末product組込み・Linux build入口・読取り専用端末診断を追加した。利用できるLinux環境はないとの回答を受領。対象機種/SKUの再確認、クラウド予算/アカウント、全OS build、Sky/Wallet/Game移植、Android署名と実機受入が必要。まだ書込み可能なimageは生成していない。[実装と再開手順](docs/phone-preview-20260911.md)。

## 2026-09-11 — kaiya の公開設定と新規Sites

権利者名kaiya、自作部分の改変・再配布許可、新規Sites作成、CM制作途中を最新指示として記録。MITの具体条文と本人だけで行う署名方式は準備段階。新サイトは本人限定で公開済み。空のD1で開始し、元サイトとDBの復旧を完了扱いにしない。MIT確認用全文、本人署名CLIと新7＋既存29署名試験、取消/メモリの追加診断を保存した。[今回の設定](docs/owner-setup-20260911.md)。

## 2026-09-11 — rc2の残る受入を再開

rc2の導入・保存・再起動・同一VM中断復旧PASSを保持。追加のD2 lifecycle 16操作、fresh SDK、空導入先削除、D6の61反復/3642秒・5正常終了、D1/D3の13boot、D4の41bootが限定合格し、原本も独立照合した。Game・金融・PC接続・デモの計8正常bootと停止台帳照合、90秒MP4の変換・目視確認も完了。証跡archiveの最初の終端破損を見逃す検査コードを修正し、Linux24 fixtureと同一D4原本の全byte再照合に合格。構成照合は434523記録を作成し、7readerの読戻しを完了。kernel索引10件の生成工程証明とlicense承認は保留。元SitesはNOT_FOUND、正式署名・製品license・CM確定掲載・公開承認は未完了。[追加受入](docs/rc2-remaining-acceptance-20260911.md)。以下は各時点の履歴。

## 2026-09-11 — 最新配布物の受入・公開導線の復旧

利用者の権利者申告と署名意思を受領。新b7/rc2は実1GB候補の二回生成・GitHub全8資産取得・各716インストールmember照合に成功。新規導入→保存→正常再起動→16MiB地点の中断復旧→復旧先起動の3bootを実測し、引用整理1件・9897c・10 COIN_A・重複なしを停止disk/台帳でも確認した。内部動作確認はPASS。正式鍵・license/許諾・元Sites再接続・CM確定掲載・残る全受入と一般公開承認は未完了。Web導線とPC要件を修正し、ローカルverify/HTTP/ブラウザ導線はPASS。[実測記録](docs/os-acceptance-b7d819c-20260911.md) / [公開導線の現状](docs/release-verification-20260911.md)。以下は各時点の履歴。

9月11日追加実装: TLSの1byte受信増幅を最大8KiBの先読みで修正し、期限・header/body上限・単一requestを維持した。修正前の18件中4FAIL→修正後18件＋関連57件＝75PASS/skip0、独立reviewも所見なし。同じ承認経路に4ms/recvを加えた制御実験は旧実装がheader受信中に1秒timeout、新実装は49〜52msで成功したが、原TLS原因の確定ではない。将来のowner許諾を変更しないcandidate bytesへ照合する別置き検証器を追加し、新11＋既存44＝55fixture PASS。所有者の実承認は未受領。旧VM/9ab配布物を保持して、新しい隔離VMで新sourceのbuildを準備中。配布hash検証は開始時のfile size＋1byteまでに制限し、検証中の増大/縮小を拒否する。新image/D0〜D6は未実施、Sitesは再度NOT_FOUND、license/CM/reviewer/PR #5限定mergeは回答待ち。

署名保護の実API照合: `codex/release-signing-control` と公開変数を `ca7356550b0042d05f60a389a90aebd5210510e6` へ固定し、locked/admin enforcement/force・delete禁止/独立PR承認をreadbackした。個人repoはRESTの空bypass設定を422拒否し、そのfieldを返さないため、PR #4の修正はexact repository/branch prefix/commit/ruleに結び付くGraphQL integer0を必須にする。27署名試験PASS。control branchは旧ca73565のまま保護し、修正・owner policy/trustの反映は独立レビュー付き更新待ち。Environment/管理鍵/初回登録は未設定。ca73565自体の全10checks・native1671/skip0成功はSHA別の原証拠に保存した。

追加実装: packagerの未署名exportとcontrol側の候補準備処理を実装し、37fixtureと既存desktop50を確認。共有clockを差し替えるテスト不具合は修正前FAIL→修正後13PASS。旧9ab配布物・runtime・imageは不変だが、新packagerの実生成には新sourceのbuild/freeze/受入が必要。独立レビューによる出力directory競合も修正した。限定bootstrapはDraft PR #5（a441162、CI成功）に分離し、mainは未merge。原TLS原因と所有者入力は未解決。新HEADの最終CIとcontrol ref/protectionはGitHubの実readbackを別証拠に記録する。

再開確認（2026-09-10 22:03 UTC）: GitHubの最終候補は `97d952937add42de04092a2e6c2fac8aba3d8bad`、Draft PR #4はMERGEABLE・全9check成功。mainと旧9ab配布物は不変。Sky改修をやり直す段階ではなく、TLS原因の追加調査と、新しい配布候補を管理署名へ渡す処理へ進む。Sitesは再度NOT_FOUND、署名Environment/control branch/workflow登録と独立承認者は未設定。以下の検証記録は各SHA時点の履歴として保持する。

検証完了記録: `85620ec8b0d5d9913cd2d50f8ead4fbe109ee9bb` はDraft PR #4でMERGEABLE、Web/native/Android/署名fixtureの全10check成功。native1,670件/17checks/skip0とroot UI、ローカルWeb93tests/API143assertions+実行API、audit0、公式Sites buildを確認。文書更新後のHEADはPR自身のCIで別途判定する。外部条件と原TLS原因の未達を理由にBLOCKED_FOR_LAUNCHを保持する。

## 2026-09-10 — Sky改修と既存Sites履歴を統合

Sky・仕事/履歴・Wallet・接続設定へ導線を再設計し、旧ファンド/PWA/認証実行/手入力会計を保持。2つの仕事APIを分離し、両DB履歴からのD1移行、ブラウザの未認証→サンプル実行、PCの再接続race/実行session固定を検証した。全依存auditの4highはsharpの限定更新で0。原TLSの観測を強化し、434,096recordの配布inventoryと許諾判断資料をDraftへ追加した。元9ab配布物は不変。

[現在のLCH01〜07と次の一操作](docs/launch-readiness-20260910.md)を正本とする。**BLOCKED_FOR_LAUNCH**。原TLS原因、所有者のlicense決定、管理署名設定、元Sitesアカウント、確定CM、最終新配布受入は残る。最終main候補は別Draft PRで正確なHEAD/treeを検証し、一般公開/main mergeはまだ行わない。以下は過去の日付付き履歴。

## 2026-09-10 — 3d07df0のnative CIタイムアウト修正・GitHub検証済み

Linuxで全1660件／17checks、元1392件＋新規4件の主suite網羅、Web verifyに合格。16:38 UTC、修正f88b392のGitHub native全6job（root UIを含む）とWebの成功、download原本の699入力・17原ログ・全割当てを確認。[成功証拠](docs/evidence/native-ci-3d07df0/github-f88b392.json)。

通知に対応し原ログ・570秒時点のstackと成功1a2の入力を照合。native入力697件は一致し、570秒のMCPケースから終了時にはbackupケースへ進んでいるため、永久hangとは判定しない。1,392件を単一600秒枠へ集中させたCIを4独立jobへ分割し、module fixture・順序・重複した発見回数を保持して最後に全件照合する。13support checksとroot UIも必須。OS本体・9ab配布物・通信期限を維持する。[修正記録](docs/native-ci-partition-fix-20260910.md)。先行TLS ERROR原因と公開条件は別の残件。

## 2026-09-10 15:49 UTC — 最終結果とCM完成後の残件を同期

凍結9abのD0〜D6／導入・復旧／Game・SDK・実録画は限定受入済み。統合1a2f4d1のWeb/native CI成功をGitへ保存し、先行する間欠障害は原因未確定として保持。CMは利用者申告で完成済みのため制作を残件から外し、既存CMの表現確認と導入案内への接続を次作業へ反映した。追加1〜2日はLICENSE／Sitesの待ちを除くQEMU版仕上げの条件付き概算。確定公開日や実機・実資金の完成予定にはしない。[最新の進捗・会話の補足・再開順](docs/release-followup-20260910.md)を現在の入口とする。

15:54 UTC検証: `npm run project:update`、`npm run verify`（API 143 assertionsを含む）、`git diff --check` は成功。

今回の変更は記録の同期と最終CI証拠の保存。RQ01〜RQ17、task／phaseGateの状態・完了19/34件、元FAILと配布9filesを保持する。以下の日付付き節は各時点の履歴で、未判定／実行中の記述を現在の状態に転記しない。

## 09:48 UTC 最終imageとGame契約

最終9abf78aのbase/profile imageをbuildしてhash固定。正規CI原本1631/14checkと694source一致を既存guardで受理し、Mac arm64原全回帰の10TLS期限ERRORは別FAILとして保持。24要件のGame/Wallet host契約を同sourceで確認しGX01-CONTRACTを完了、実OS UI/fresh SDK/全D0〜D6は未判定。Aは同梱source/NOTICEと容量を確認し長時間試験、Bは実取得から新規VMの全構成復旧、rootは最後に専用端末で実UIと実録画を検証する。

## 09:19 UTC 配布候補のソース固定

`9abf78a80d27aa9f847c4051d20e4c552e407276` を最終source/host tools候補として固定・pushし、Aの完全native回帰とbuildを開始。Game期限後の再接続未対応を既存契約どおりUI/SDKに説明し、元key再送・履歴とPIN pixel条件を保持。Bは同じ版の9file取得から独立新VMで導入/全構成復旧/SDKを検証する。D0〜D6・最終実UI・配布取得・実demoはこれからの判定で、完成とは表示しない。

## 08:40 UTC 最終候補へ向けた一周の固定

月額888の二重請求防止、ATMfee0予約/取消、2正常bootの保持を4e中間imageで実測。新環境SDKのcached接続診断を修正して別fresh再導入が成功。引用整理の同じ処理を選択したrunnerへ送り、元keyの復旧まで最終候補で測る準備を統合。Game/金融/遠隔/90秒実録画のobserverを再現可能なsourceへ保存する。最終同一imageの受入・配布物・demoはまだ未合格。

## 2026-09-10: 8時間の実装・配布準備を開始

ユーザー指定MDを[今回の実行入口](docs/prompts/rockstaros-release-20260910.md)へ保存し、[実行記録](docs/release-execution-20260910.md)に開始・担当・受入条件を固定。GitHubの4headはMDと一致。PR #2起点の専用worktreeで進める。RQ01〜RQ17、月888 cents、Rock ATM手数料0、既存データを維持。下記の「設計のみ」は前回の履歴。

## 08:23 UTC 境界・復旧の統合

root `e4c3e4e`。初回Game送信のclaim直前に、接続・本人credential・端末・作者の現在の権限を同じtransactionで再確認するよう修正。既存の署名済み要求と保留を保持し、失効・並行ATM/月額/Game・実応答喪失の対象試験に合格。Game SDKの再表示時刻は必要な単調更新だけを型付き列で検証し、他の全行保持を維持。旧失敗の判定を変更しない。新候補のbuildと実gateを継続し、まだ配布完成とは判定しない。

## 07:53 UTC 実装・受入の更新

release HEAD `996db1e`。Game 2作者/2game/2owner/追加端末SDK、current-copyの世代fenceと実SIGKILL復旧、遅いGameと別Game/ATMの分離を統合。中間4e実OSはA/B交換とSky引用結果、通常終了まで観測し、再起動保持・台帳監査を継続中。購入PINの残り有効期限を誤って拒否する実不具合を修正し、旧失敗と新実動作を分けて保存した。最新の同一版全gate、fresh配布受入、デモが残るため完成判定はしない。[実行checkpoint](docs/release-execution-20260910.md)が現在の正本。

## 以下は今回開始前の設計更新・旧検証履歴

### RockstarOS 1.0と8原則

利用者の8原則を [製品・事業・開発設計](docs/rockstaros-1.0-strategy.md)へ具体化。RQ01〜RQ17と技術ベースを維持し、対象仮説・代表商品候補・縦断体験・system境界・pilot指標・CM導線・担当責任を整理した。機能追加、配布、外部連絡、実取引は行わない。既存task/phaseGateの完了数は増やさない。

source `8e6d217` のWeb/Android/native CI成功をGitHubで再確認済み。旧timeout待ちを次作業から外した。次はD6 run44の最終報告/終了後データの取得と、RLS01のfresh環境用導入パッケージ。両者は実装を並行できるが、配布には同じ候補の受入と導入試験が必要。既存引用整理を候補に実用比較を準備し、GX00→GX01→DX01を継続する。機種・providerの未確定事項を合格へ換算しない。

本更新の検証: `npm run project:update`、`baseline:check`、`git diff --check`は成功。`npm run verify`は進捗/参照/ベース整合、型、lint、54tests、buildまで成功し、最後のAPI段階だけsandboxのlocalhost listen権限で停止。合成データ専用の`npm run test:api`を許可環境で再実行し143assertionsが成功した。新設計のローカル参照7件と、RQ・料金/ハード方針・task/phaseGateの状態不変も照合済み。変更は設計と引継ぎ情報のみで、OS imageを再buildした実績ではない。

## 以下は前回までの実装履歴

2026-09-09実装更新: [凍結b8287bcの受入報告](docs/os-acceptance-b8287bc-20260909.md)を追加。D0〜D5の限定受入を照合し、D6は42の画面認識失敗と正常終了後の全データ照合を保存した。閾値を変えずhost認識を直し、新規43で5サイクル・60分を再試験中。Macから専用の保存端末を開く入口を追加し、実画面の導入/同意/実行/再起動後結果を確認。公開b325767のWeb/Android/native CIはすべて成功し、native Python1341実行とNode 22のwire照合303件を記録した。GX00は認証付き同一TLSで2作者/2game/2owner/3端末の4接続を実装。非空legacyの月888・1000予約・237未精算・失効credential・既存receipt/BLOBを残した接続と同月再照合が2件PASS。Cのcurrent-copy証拠APIはroot14件PASSで、実WALを保持するreaderがある場合の現在世代検査を修正した。停止済みcurrent-copyのゲーム引継ぎと通常起動ガードは開発中であり、GX00全体は未合格。実機・MetaMask送受金は未実施。

このファイルは当該branchの作業記録です。確定要望は [docs/product-baseline.md](docs/product-baseline.md)、進捗からの指示作成は [docs/prompt-playbook.md](docs/prompt-playbook.md) が正本です。

## 現在の作業 — 承認済み設計の統合と実装

[承認記録](docs/execution-approval-20260909.md)の範囲で実装を開始。分離branch `codex/operational-base-20260909` へmain/native/設計を統合し、旧N01〜N05とRQ01〜RQ15を保持する。6文書の競合を双方の要件・実装履歴を残して解消する。新image合格、実機対応、MetaMask送受信成功を先取りしない。

当時の次作業: D6の新規43を終了後データまで照合して受入報告を更新する。並行してGX00の認証付き実接続・互換/復旧を完成させ、GX01→DX01へ進む。Pixel 10 / GrapheneOSのP1 APKとBlackBerry型番確認は別トラック。現在の優先順位は冒頭と進捗JSONを参照する。

## 2026-09-09: native統合時の履歴

BlackBerry優先とnative OSの統合

2026-09-09、利用者の「ここまでのところをRockに矛盾しないように追加して」に従い、Linux/Buildroot/ARM64 QEMUの検証済み基準版を `systems/rock-star-os/` に取り込む。現在の方針・契約差分・残要件の正本は [native OS統合記録](docs/native-os-integration.md)。検証結果は [統合検証記録](docs/native-os-validation.md)へ記録する。

初期製品端末はBlackBerry優先・機種未定。従来のAOSP/Pixelは比較・移植候補として維持する。新OSの標準Walletは購入者限定、引き渡し時確認の再利用、月888 cents固定の契約。同じ契約の複数端末で重複請求しない。既存Webのファンド上限料金・分配は試算として保存し、両モデルを混ぜない。

MCPの接続/解除・結果復元と送金精算を分け、cloudの可用性に依存しない端末処理、運営用の管理・復旧、端末引き渡し後の少ない操作による開始を継続する。実BlackBerry、実USB、一般外部MCP、金融providerとATM、本番運営は未完了。新たな起動応答検査のWIPは通常buildへ混ぜず保存する。

## 2026-09-09: 現設計と開発内容の再照合・訂正

16:51 UTCにmain/native/設計reviewの3branchを再確認。[相違監査](docs/design-implementation-alignment-20260909.md)のALIGN01〜05に、設計branch参照漏れ、単一ownerと一般player基盤の違い、最新backupと復元試験入口の不一致、台帳移行と旧OS互換、途中依存の表現を記録した。設計v1.1/プロンプト/受入雛形に修正必須内容を反映し、Git進捗取得・段階ゲートの検査補助を改善する。runtimeの問題解消は未実施で承認後の作業。

再開先は `codex/os-game-design-review-20260909`。mainだけには最新設計がない。B04は3入力を統合、V01は単一ownerの既存native商品/合成Walletで先行、GX00→GX01契約→DX01は別系列。実providerやゲーム市場の完成をOS稼働の前提にしない。新たな予測市場/ゲーム資産売買の相談は未承認の検討案で、実行範囲を自動拡張しない。以下の過去記録は各時点の履歴。

## 2026-09-09: OS稼働雛形・ゲーム作者向けWallet・ATM手数料の追加指示

16:09 UTCのGitHub確認でmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、PR #1 OPENと各同SHAのCI成功を再確認した。[OS稼働監査](docs/os-readiness-audit-20260909.md)へ対象と不足を記録。

RQ12は現設計をbuild/boot・操作・保存・正常終了・復旧まで検証できるOSへ進める要求。まずQEMUの合成データ専用雛形を受け入れ、実機/本番安全性とは分離する。RQ13はゲーム通貨交換とATM独立、RQ14は自作ゲーム作者向けAPI/SDK・sandbox・導入体験、RQ15はATMでRockが徴収する手数料0。利用者の「atm手数料の話」を受け、ゲーム手数料0という初稿解釈は訂正。ゲーム料金は未定、OS月888 centsは既存契約を保持する。

最新入口は [OS稼働・ゲーム連携プロンプト](docs/prompts/os-operational-base-next.md)。旧GAP01〜04を保持し、B04統合→V01の起動/安全基礎→既存商品/Wallet基礎→OS縦断受入へ進む。GX01ゲームfixture、DX01作者SDKは独立、GX02実ゲームと実資金/実機は別条件。V01全体とB02/B03の機械依存を循環させず、細かな着手ゲートはプロンプトで明示する。

D01は文書と検査の保存だけ。V01/GX01/GX02/DX01とB04/B02/B03/B05は未着手。native code・OS image・ゲーム本体・ATM実運用は今回変更せず、SSDを再マウントしていない。新しい [受入報告雛形](docs/templates/os-acceptance-report.md) は全行NOT_RUNで、合格実績ではない。

## 2026-09-09: 指摘した4問題を解消する実行プロンプトへ改訂

利用者の「指摘した問題を解決する内容を含めて作業を進めるプロンプトを作成」に対応。15:01 UTCにmain `f9b1cbd99eeaa20f7cbc80bd2d88909949cca863`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、OPENのPR #1と同SHAのCIを再確認した。詳細は [追補監査](docs/progress-audit-20260909-followup.md)。

新ベースのnative未反映、無料開発商品への制限、Wallet実収益未接続、PC比較を含む利用価値未検証をGAP01〜04に対応付けた。段階0のB04引継ぎ統合を先頭に置き、既存商品のSky実利用/改善前測定→商品条件と実行adapter→Wallet接続→同条件の再試験へ進む。既存Nタスクは保持し、起動/安全性の直接依存だけ先行する。旧OS02〜OS05は別トラックと明示した。

今回変更するのは文書/進捗とプロンプト。B04/B02/B03/B05は未着手のまま。B02は段階1〜2の基礎、B03はWallet接続、B05はWallet基礎後の比較・再試験に分け、依存の循環を避ける。実サービス未接続でもB03の台帳/fixture基礎が通ればB05へ進めるが、GAP03実収益・GAP04実機価値の未検証は残す。native統合・runtime修正・Sky操作・実provider/実機検証は実行担当の次作業であり、今回完了したとはしない。料金・商品供給の役割・ハード方針は変えない。作成規約とRQ10にも、相違ごとの作業・合格証拠・残る境界を引き継ぐルールを保存する。

## 2026-09-09: Sky＋Walletのベースと利用価値を保存

tob側が商品を開発し、Rockが実行方式・料金・ライセンスの異なる商品を管理するSkyと収益Walletを作る。既存ツールも商品とし、Git内の商品をSkyから実利用して準備/操作/結果確認の不便を改善する。汎用生活機能やエコシステム拡大を主目的にしない。確定ベースはRQ01〜RQ11。

main `5cec834`に加えPR #1/native `fcedcfe`と同一SHAのCIを確認。nativeにはWallet台帳・月888 cents・資格・Sky署名配布・MCP/AI実行先がある。BlackBerry優先機種未定。今回のmain保存はベース/監査/作成規約と検査であり、native本体のmergeではない。[差分監査](docs/progress-audit-20260909.md)、[次の実行プロンプト](docs/prompts/hub-wallet-next.md)を参照。

既存データ、月額契約、旧試算、ツール原本を保持する。B01ベース保存と、B02商品実利用/条件拡張、B03実行費用/収益接続を分けて記録する。

## 2026-09-05時点の履歴: Android/AOSP開発

2026-09-05の利用者指示により、今後の主軸を「Rock star OS: 自社・第三者の自動化ツールを導入し、利用者が決めた範囲で自律実行するOS」へ移す。Pixel等の開発用端末で検証する計画を [OS開発設計書](docs/os-development-design.md) にまとめる。以下のR1/R2は既存Web基盤の履歴として保持する。

初回の成果物は設計書と進捗文書。その後の「考えて組んでみて」を受け、OS部品の実装へ着手する。端末書込、サイト公開、配信側branchの統合は引き続き行わない。従来の公開停止は独立したOS開発を妨げない。

OS設計v0.1では、元の事業/実行/配信側設計をQ01〜Q09へ対応付け、AOSP方式、Pixel適合ゲート、Tool/Recipe/Work/Runの分離、第三者SDK、権限とAIの境界、端末成果物、署名Store/OTA、AT01〜AT14の受入条件を定義する。最初の縦断実装は「原稿を置く→充電時に2工程→成果物→本人確認」。実装前の機材・BSP確認と、未検証項目を明記する。

OS01は設計の完了だけを表す。OS02〜OS05は未着手であり、過去のWebタスクの完了数をOSの実装進捗に換算しない。

## P1: 構想から実装へ

OS06として、Java共通コア・SQLite・固定Tool AIDL・別APKの記事ツール・充電条件のAndroidジョブ・診断画面を実装した。[P1実装手順](docs/os-prototype.md)をコードに対応する詳細仕様とする。基本設計のKotlin案は初回の共通コアではJavaへ具体化した。

OS06の完成条件は、共通コアの実SQLiteテスト、既存記事ツールとの照合、Android APKのコンパイル/検査、残課題の記録。OSイメージ起動や実機合格は含めず、OS03/04とは分ける。AOSPの全ソースはggへ入れず、設定と固定参照だけを管理する。

2026-09-05、実装commit `47043ad` の[Android CI](https://github.com/k999ln/rock/actions/runs/33982932964)でコア16・SDK4テスト、2APKのbuild/lint、記事照合36項目、標準Android35の接続2テストに成功し、OS06を完了とした。端末テストは実BinderとSQLite再接続を通すが、画面OFFの周期実行・端末再起動・不正UIDの否定試験ではない。[既存WebのCI](https://github.com/k999ln/rock/actions/runs/33982933087)も成功。OS03〜05を先取りして完了にはしない。

## 旧Webで維持する事業方針と試算

Rock starは、自動化ツールを束ね、仕事の準備・制作・確認を進めるハブです。ファンドの参加・配分計画、共通収益に対する月最大8.88 USD相当の利用料、基本分配・ブースト・共同留保の試算という方向を維持します。既存の個人費用計算は別モデルです。

他製品の生活管理・投資売買・Telegram事業へ転換しません。参考元に別の料金・売上分配率があってもRock starへ上書きしません。実収益・入出金・分配は未接続で、仕事の完了件数を売上に換算しません。

## R1: Web基盤の完成範囲（過去段階）

既存の4ツールを、仕事単位で順番に実行して確認できる基盤にまとめます。

- 記事の販売準備: 出典整理 → 無料版作成 → 本人の最終確認。
- ココナラ納品準備: 案件条件確認 → 納品記録照合 → 本人の最終確認。
- 各仕事は名前・手順・試行履歴・状態をユーザー別に保存。再読込後も再開可能。
- 失敗、条件不一致、納品照合不合格、サンプル実行は手順を進めない。
- すべての手順を通過後に確認メモを添えて完了。外部応募・送信・納品そのものは利用者が行う。
- 原稿・提案本文・成果物は従来どおり端末内で処理。サーバー保存は仕事名、確認メモ、実行メタデータ。

## R1: 構成とデータ契約

`/` のファンド画面から `/work` へ進み、テンプレートを選んで仕事を作成します。既存の `MrToolRunner` とPCの4つのMCPツールを再利用します。入力の引き渡しは利用者が結果を確認・コピーして行い、タブを閉じると未保存本文は失われます。

| 層                           | 担当                                               |
| ---------------------------- | -------------------------------------------------- |
| `lib/workflow.ts`            | テンプレート、入力検証、状態遷移、完了条件、冪等性 |
| `lib/work-store.ts`          | D1のユーザー別取得、作成、revision条件付き更新     |
| `app/api/jobs/route.ts`      | 認証・Origin確認、仕事の一覧・作成・更新API        |
| `components/workbench.tsx`   | 作成、一覧、次の手順、実行結果、確認と完了         |
| `lib/device.ts` / 既存runner | ツールの実行結果を仕事へ報告                       |
| `data/project-status.json`   | 開発タスクの状態・依存関係・検証根拠               |
| `scripts/project-status.mjs` | READMEと本書の進捗欄の生成・鮮度確認               |

仕事は `active → review → completed`。`active` / `review` から `cancelled` に中止可能。通過前のステップを飛ばす操作は拒否します。中止済み・完了済みの仕事には新しい試行を追加しません。

D1の新しい `work_jobs` テーブルに仕事JSONとrevisionを保存します。更新はID・ユーザーID・revisionが一致したときだけ成功し、別タブの更新を上書きしません。同じ試行ID・同じ内容の再送は二重計上せず、内容が異なれば拒否します。実行メタデータは本人のブラウザからの報告であり、第三者の売上証明や署名付き実行証明ではありません。

仕事内の実行は `work_jobs` の履歴に、ホームの単独実行は既存の `tool_runs` に記録します。二重計上や完了件数からの収益自動算定はしません。一覧は最新100件、試行履歴は200件、API本文は12 KBが上限です。古い仕事のページ送り・削除・成果物の永続保存は未実装です。

`drizzle/0002_work_jobs.sql` はテーブルとインデックスの追加のみです。既存ファンド設定・実行履歴は削除しません。開発DBの適用方法はREADME、本番DBへの適用はSites公開フローで扱います。

## R1/R2: 受け入れ条件と検証

- 記事・ココナラの順次実行、サンプル・失敗・条件不一致の非通過、最終確認必須をユニットテストする。
- 実SQLiteに全移行を適用し、ユーザー別の保存と競合拒否をテストする。
- `npm run test:api` は本番Workerをループバックに起動し、一時D1で認証境界・別Origin・ユーザー分離・二重送信・同時更新・再起動後の復元を検証する。合成ユーザーのIDヘッダーはローカル検証専用で、本番への認証手段ではない。
- 認証・Originで早期拒否するときは未読のリクエスト本文を解放する。403の直後に不正JSONを送る組を20回繰り返し、拒否後もAPIが応答し続けることを検証する。
- API検証はMiniflareから同じコンパイル済みAPI・互換設定・D1宣言を使ってworkerdを直接起動する。Wranglerの開発用プロキシと静的資産ルーティングはこの検証に含めない。移行SQLの適用と保存先の再利用を明示し、再起動後にも同じ仕事が読み出せることを確認する。
- `npm run verify` で進捗同期、型、対象コードlint、ユニットテスト、本番ビルド、API検証をまとめる。CIでも実行する。
- R1ではブラウザ画面操作は未実施。R2で合成データを使い、記事仕事の作成・サンプル非通過・実行・最終確認・完了・再読込を画面から検証する。実ウォレット・外部応募や決済は引き続き対象外。結果と未検証事項は [docs/validation.md](docs/validation.md) に記録する。

## R2: 画面確認とサイト反映

利用者の「実施と更新して」を受け、ブラウザの操作確認と既存Sitesへの反映を実施する。現在の閲覧権限は本人限定であり、この範囲を変えない。GitHubの公開リポジトリと、本人限定の稼働サイトは区別する。

1. ローカルの標準サインインで合成データを作り、ホーム・仕事画面と一連の状態遷移を確認する。
2. 不具合があれば修正し、`npm run verify` を通す。
3. 同一ソースを配信用リモートへ保存し、ビルド成果物と追加DB移行をSitesで公開する。
4. 公開状態と画面/APIを確認し、バージョン・検証範囲・残課題を本書とREADME、検証記録へ反映する。

ローカル画面確認で、記事仕事の完了・再読込後の復元と、条件不一致の非通過・中止を確認済み。テンプレートの内部ID表示を日本語名へ修正し、1180px以下ではホームに専用の仕事入口を表示する。料金・分配式、認証と保存契約は変更しない。

### 公開停止と再開条件

検証済み修正 `89d2d66` はrock/mainへ保存され、GitHub Actionsも成功した。一方、配信用のsites/mainには共通祖先以降に別の2commitがあり、通常pushはfetch firstで拒否された。取得して比較した結果、`/api/jobs` の契約とDrizzleの0002ジャーナル/スナップショットに衝突がある。ホームもアプリ型UIへ変更され、実行管理・端末管理・手入力台帳が追加されていた。

強制push、どちらかの一括優先merge、Sitesのversion保存・公開は行わない。既存の追加機能を残してrockへ統合する方針を利用者に確認してから再開する。[衝突の根拠と統合案](docs/deployment-integration.md) に詳細を記録した。現在の本人限定の権限と稼働サイトは変更していない。

## リポジトリの対応

- ローカル正本: `/Volumes/Extreme SSD/gg`。
- `origin`: <https://github.com/k999ln/rock>。通常の開発・README・進捗をここへ保存。
- 製品は`RockstarOS`の1つ。`rock`は製品・OS・公開契約、非公開`k999ln/Mr.`はTelegram・クラウド・provider運用だけを担当するcomponentとする。
- `k999ln/vvvv`は旧履歴で、新規修正・CI・deploy・runtimeの対象にしない。外部の稼働参照を確認できるまでは削除やarchiveを行わない。
- `k999ln/mr-bot-workrooms`は非公開成果物置場であり、製品source・仕様・進捗の正本にしない。
- 詳細、78件の完全一致blobの分類、共有方法と禁止事項は [Gitプロジェクト統合方針](docs/git-consolidation.md) と [repository map](data/repository-map.json) を正本とする。
- `sites`: 既存サイトの配信用リモート。`.openai/hosting.json` とD1を維持。
- 元の `rock-star/` 内をgg直下へ移動し、入れ子のGit管理を解消。履歴は保持。
- GitHubへの保存とSitesへの再公開は別作業。公開サイトへ反映した場合だけ検証記録に記載。

2026-09-07、`repository:check`で製品正本1件、active sourceの`vvvv`参照なし、固定Mr.原本4件のblob/SHA-256一致を確認した。既存の型・lint・34テスト・buildも成功し、ローカルAPIは143 assertionsに成功した。整理commit `42371f0`はrock/mainへ保存され、[GitHub Actions](https://github.com/k999ln/rock/actions/runs/34170597685)も成功した。GitHub repositoryのarchive、公開範囲変更、運用先切替は実施していない。

R1実装は `b460ccf`、追加の検証改善は `7103e55` としてrockのmainへ保存し、GitHub Actionsで検証済みです。READMEと本書の更新も同じmainに継続して保存します。実際の実施結果は [検証記録](docs/validation.md) のR1欄に残します。

## 進捗の更新方法

2026-09-14、既存WalletフロントへBase Mainnet USDCの本番受取レールを追加した。外部EIP-1193 WalletはRock受取アドレスの所有署名だけに使い、秘密鍵、seed phrase、token approval、包括的送金権限は保管しない。Billing Workerは署名済みEarning Receiptへ配分済みの `SKY_SERVICE_FEE` だけをD1回収指図へ変換し、公式USDC contract、exactな受取先・金額、成功receipt、finalized blockを照合する。コード・本番配備、ownerのWallet署名、最初の実transferは別々に判定する。[設計・調査・本番gate](docs/rock-wallet-production-rail-20260913.md)。

同日、remote D1 migrationとBilling Workerのproduction deployを完了し、Sites側の既存mainを通常mergeした同一treeをowner限定Siteへversion 35として配備した。一般公開、owner Walletの本人署名、最初の実USDC transferは実施していない。

2026-09-13、外部Wallet会社待ちでRockの回収経路が止まらないよう、Rock Settlement Walletを共通Financial Provider契約の第1号にした。署名検証済み収益から確定したRock利用料のsandbox回収指図と報告だけを持ち、利用者資産の包括保管、任意送金、交換、ファンド運用、LIVE transferは持たない。内製専用経路にはせず、外部Wallet／ファンドも同じadapterで追加できる。[設計と境界](docs/rock-first-party-settlement-wallet-20260913.md)。

2026-09-13、Wallet会社とファンド会社をRockstarOS内製機能へ取り込まず、交換可能な外部Providerとして接続する受け身設計を確定した。Rockはcapability discovery、本人同意、指図、状態、receipt、照合を共通化し、保管、運用、約定、払出し、KYC/AML、地域・税務判断は契約上のProviderへ残す。Provider固有機能はversion付きmanifestで追加し、OS再buildなしの参入・差替えを基本とする。これは実Provider契約、実接続、実資金の有効化ではない。[責任境界と受入順](docs/external-wallet-fund-provider-boundary-20260913.md)。

2026-09-12、最小ローンチ対象をQEMU Developer Previewのローカルバックエンドへ限定して再監査した。Hubの安全終了、実行中worker回収、再起動時の自動再送禁止、情報を出さないヘルスチェックを実装し、22 unit testsと実processの起動→署名ツール実行→SIGTERM→SQLite整合→再起動→receipt復元に合格した。配布8資産、production署名、製品許諾、本人限定Sitesのログイン後確認は未完了のため、全体判定はBLOCKED_FOR_LAUNCHを維持する。[P0/P1/P2と証拠](docs/backend-launch-20260912.md)。

1. 着手時に `data/project-status.json` の状態・更新日・次の作業を更新する。
2. 設計判断を本書、利用方法をREADME、根拠を検証記録へ追記する。
3. `npm run project:update` で両文書の進捗欄を更新する。
4. `npm run verify` を実行し、結果を記録して同じcommitに保存する。

`done` はそのタスクの成果物と検証が完了した場合だけ使用。設計タスクの完了は実装完了を意味しません。`blocked` は理由を記録し、予定を完了数へ含めません。継続的な無人開発や毎時同期が稼働しているという意味ではありません。

## 全taskの作業進捗

<!-- project-status:start -->
最終更新: 2026-10-05 / SIM/eSIM起点のRockstarOSサービス利用開始と料金透明化を実装・受入 / 完了 104/161件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| SIM01 | 物理SIM/eSIM購入からRockstarOS・Sky/Zema・Agentへの一度きり認証と端末別利用開始を通す | 進行中 | [記録](docs/product-baseline.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/os-development-design.md) · [記録](toolkits/esim-bootstrap/README.md) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](app/connect/page.tsx) · [記録](components/home-screen.tsx) · [記録](data/product-baseline.json) · [記録](AGENTS.md) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/service-home.css) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](tests/sim-service-entry.test.mjs) · [記録](docs/prompts/rock-current-next-20261001.md) · [記録](docs/sim-service-entitlement-claims.md) · [記録](lib/rockstar-entitlement-claim.ts) · [記録](app/api/rockstar/entitlements/route.ts) · [記録](lib/rockstar-entitlement-event.ts) · [記録](app/api/rockstar/entitlements/events/route.ts) · [記録](db/schema.ts) · [記録](drizzle/0039_rockstar_service_entitlements.sql) · [記録](drizzle/0040_rockstar_entitlement_events.sql) · [記録](tests/rockstar-entitlement-claim.test.mjs) · [記録](components/rockstar-entitlement-claim.tsx) · [記録](scripts/check-work-api.mjs) · [記録](app/api/sky/a2a-delegations/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](services/sky-agent-runtime/src/worker.ts) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/a2a-pricing-extension.md) · [記録](lib/currency-format.ts) · [記録](tests/currency-format.test.mjs) · [記録](components/workbench.tsx) · [記録](app/work/work.css) · [記録](lib/a2a-price-quote.ts) · [記録](tests/a2a-price-quote.test.mjs) · [記録](app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts) · [記録](lib/remote-ai-pricing-gate.ts) · [記録](lib/remote-ai-rate-card.ts) · [記録](lib/remote-ai-rate-card-registry.ts) · [記録](tests/remote-ai-rate-card.test.mjs) · [記録](tests/remote-ai-rate-card-registry.test.mjs) · [記録](app/api/llm/estimate/route.ts) · [記録](components/sky-chat-workspace.tsx) · [記録](docs/evidence/remote-ai-estimate-api-20261001.json) · [記録](drizzle/0042_remote_ai_rate_cards.sql) · [記録](lib/remote-ai-rate-card-store.ts) · [記録](lib/remote-ai-rate-card-operator.ts) · [記録](app/api/internal/remote-ai/rate-cards/route.ts) · [記録](drizzle/0043_a2a_delegation_fanout_limits.sql) · [記録](lib/a2a-delegation-store.ts) · [記録](tests/a2a-client.test.mjs) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](app/api/llm/text/route.ts) · [記録](app/api/legal-guidance/route.ts) · [記録](app/api/patent-research/route.ts) · [記録](app/api/jev-evaluation/route.ts) · [記録](lib/sky-service-status.ts) · [記録](tests/sky-service-status.test.mjs) · [記録](docs/evidence/remote-ai-price-gate-20261001.json) · [記録](drizzle/0044_a2a_live_usage_snapshots.sql) · [記録](lib/a2a-live-usage.ts) · [記録](app/api/sky/a2a-delegations/[id]/usage-snapshots/route.ts) · [記録](tests/a2a-live-usage.test.mjs) · [記録](docs/evidence/a2a-live-usage-local-20261001.json) · [記録](docs/evidence/mcp-pricing-gate-local-20261001.json) · [記録](docs/evidence/product-direction-regression-20261001.json) · [記録](docs/evidence/android-a2a-usage-verifier-20261001.json) · [記録](docs/evidence/android-a2a-wallet-reservation-20261001.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletReservationTest.java) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](docs/provider-contract-readiness-20260930.md) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/workstreams/02-sky-mcp.md) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AWalletSettlementSync.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AWalletHandoffRequest.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletHandoffRequestTest.java) · [記録](android/core/src/test/resources/a2a-wallet-handoff-request-v1.json) · [記録](tests/a2a-wallet-handoff-auth.test.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/A2ABrokerDeviceKeyStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/A2ABrokerDeviceKeyStoreTest.java) · [記録](docs/rockstar-device-link.md) · [記録](docs/evidence/rockstar-device-link-local-20261001.json) · [記録](lib/rockstar-device-link.ts) · [記録](lib/request-auth.ts) · [記録](app/api/rockstar/device-authorizations/route.ts) · [記録](app/api/rockstar/device-authorizations/approve/route.ts) · [記録](app/api/rockstar/device-sessions/route.ts) · [記録](app/connect/device/page.tsx) · [記録](components/rockstar-device-authorization.tsx) · [記録](android/core/src/main/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlow.java) · [記録](android/core/src/test/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlowTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceAuthorizationTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceSessionStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/RockstarDeviceAccountLinkTest.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](android/automation/src/main/AndroidManifest.xml) · [記録](android/automation/build.gradle) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](drizzle/0045_rockstar_device_sessions.sql) · [記録](drizzle/0046_remote_ai_text_executions.sql) · [記録](lib/remote-ai-text-store.ts) · [記録](app/api/rockstar/device-home/route.ts) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](scripts/check-os-contracts.mjs) · [記録](app/api/llm/quotes/route.ts) · [記録](app/api/llm/quotes/[id]/route.ts) · [記録](lib/remote-ai-text-http.ts) · [記録](tests/remote-ai-pricing-gate.test.mjs) · [記録](tests/remote-ai-text-public-record.test.mjs) · [記録](docs/sky-cloud-continuity.md) · [記録](lib/remote-ai-text-input.ts) · [記録](lib/remote-ai-text-execution.ts) · [記録](services/sky-agent-runtime/wrangler.jsonc) · [記録](drizzle/0047_remote_ai_text_durable_inputs.sql) · [記録](tests/remote-ai-text-input.test.mjs) · [記録](drizzle/meta/0047_snapshot.json) · [記録](tests/remote-ai-text-store.test.mjs) · [記録](scripts/database-status.mjs) · [記録](tests/database-status.test.mjs) · [記録](docs/database-status.md) · [記録](docs/evidence/remote-ai-cloud-workflow-local-20261002.json) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](AGENTS.md) · [記録](docs/rockstaros-product-system-map.md) · [記録](docs/product-north-star-20260915.md) · [記録](docs/workstreams/01-product-ux.md) · [記録](app/connect/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](tests/sim-service-entry.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](tests/migration-union.test.mjs) · [記録](tests/database-status.test.mjs) · [記録](docs/evidence/sim-service-entry-local-20261002.json) · [記録](app/api/llm/estimate/route.ts) · [記録](components/workbench.tsx) · [記録](lib/currency-format.ts) · [記録](tests/currency-format.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](docs/workstreams/01-product-ux.md) · [記録](docs/sky-cloud-continuity.md) · [記録](docs/evidence/sim-service-usage-rates-local-20261002.json) · [記録](docs/evidence/sim-service-claim-file-import-local-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/UsageCurrencyFormatter.java) · [記録](docs/evidence/sim-service-android-usage-status-local-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell/src/main/AndroidManifest.xml) · [記録](docs/evidence/sim-led-product-direction-audit-20261002.json) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceRefStore.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AUsageTrustConfig.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/AndroidA2AUsageTrustConfigTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockApplication.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AUsageReceiptVerifier.java) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](android/core/src/test/java/dev/rock/core/platform/A2AUsageReceiptVerifierTest.java) · [記録](android/core/src/test/resources/a2a-price-quote-v1.json) · [記録](docs/evidence/android-a2a-price-quote-verifier-20261002.json) · [記録](docs/evidence/android-a2a-reservation-bridge-audit-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ABrokerAuthorization.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ABrokerAuthorizationTest.java) · [記録](android/core/src/test/resources/a2a-wallet-reservation-v2.json) · [記録](android/core/src/test/resources/a2a-broker-authorization-v2.json) · [記録](tests/a2a-wallet-reservation.test.mjs) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](docs/evidence/android-a2a-native-reservation-core-20261002.json) · [記録](docs/evidence/a2a-price-quote-acquisition-local-20261002.json) · [記録](app/api/sky/a2a-price-quotes/route.ts) · [記録](lib/a2a-price-quote-acquisition.ts) · [記録](tests/a2a-price-quote-acquisition.test.mjs) · [記録](lib/a2a-usage-receipt.ts) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](lib/a2a-price-quote-consent-store.ts) · [記録](drizzle/0049_a2a_price_quote_consent_events.sql) · [記録](tests/a2a-price-quote-consent-store.test.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AJson.java) · [記録](docs/evidence/android-a2a-quote-review-source-20261002.json) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/test/java/dev/rock/core/A2AWalletReservationTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceHomeTransport.java) · [記録](app/api/rockstar/device-home/route.ts) · [記録](scripts/check-os-contracts.mjs) · [記録](tests/sim-service-entry.test.mjs) · [記録](docs/evidence/android-a2a-cloud-draft-bridge-20261002.json) · [記録](docs/evidence/android-a2a-cloud-approval-recovery-20261002.json) · [記録](docs/evidence/android-a2a-native-cancel-20261002.json) · [記録](docs/evidence/android-a2a-detail-recovery-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ARecoveryBinding.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ARecoveryBindingTest.java) · [記録](drizzle/0050_rockstar_entitlement_purchase_once.sql) · [記録](docs/evidence/sim-service-claim-file-import-local-20261002.json) · [記録](lib/rockstar-entitlement-issuer.ts) · [記録](tests/rockstar-entitlement-issuer.test.mjs) · [記録](docs/evidence/remote-ai-text-live-estimate-local-20261002.json) · [記録](lib/llm-providers.ts) · [記録](lib/remote-ai-text-pricing.ts) · [記録](drizzle/0051_remote_ai_text_live_estimates.sql) · [記録](drizzle/meta/0051_snapshot.json) · [記録](tests/llm-providers.test.mjs) · [記録](docs/evidence/sim-service-replacement-ack-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-delivery-store-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-delivery-api-local-20261002.json) · [記録](docs/evidence/sim-service-issuer-rate-limit-local-20261002.json) · [記録](drizzle/0054_rockstar_entitlement_issuer_rate_limits.sql) · [記録](tests/rockstar-entitlement-delivery-http.test.mjs) · [記録](lib/rockstar-entitlement-issuer-store.ts) · [記録](drizzle/0052_rockstar_entitlement_issuer_deliveries.sql) · [記録](drizzle/0053_rockstar_entitlement_delivery_key_ids.sql) · [記録](drizzle/meta/0052_snapshot.json) · [記録](drizzle/meta/0053_snapshot.json) · [記録](tests/rockstar-entitlement-issuer-store.test.mjs) · [記録](docs/evidence/sim-service-android-native-claim-local-20261002.json) · [記録](lib/rockstar-service-offers.ts) · [記録](tests/rockstar-service-offers.test.mjs) · [記録](docs/evidence/rockstar-service-offer-profiles-local-20261002.json) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workbench.tsx) · [記録](lib/workflow.ts) · [記録](lib/rockstar-package-handoff.ts) · [記録](lib/sky-package-runtime.ts) · [記録](lib/mcp-hub.ts) · [記録](components/mcp-bot-runner.tsx) · [記録](tests/sky-package-runtime.test.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/rockstar-package-handoff.test.mjs) · [記録](tests/workflow.test.mjs) · [記録](docs/evidence/zema-versioned-plan-local-20261002.json) · [記録](docs/evidence/rockstar-package-zema-handoff-local-20261002.json) · [記録](docs/sim-service-entitlement-claims.md) · [記録](lib/rockstar-service-package-access.ts) · [記録](tests/rockstar-service-package-access.test.mjs) · [記録](lib/sky-commerce.ts) · [記録](tests/sky-commerce.test.mjs) · [記録](lib/sky-package-runtime-binding.ts) · [記録](tests/sky-package-runtime-binding.test.mjs) · [記録](docs/evidence/sky-package-runtime-binding-local-20261002.json) · [記録](drizzle/0055_sky_package_runtime_bindings.sql) · [記録](lib/sky-package-runtime-binding-store.ts) · [記録](lib/sky-tool-package-store.ts) · [記録](app/api/internal/sky-package-runtime-bindings/route.ts) · [記録](docs/evidence/sky-package-runtime-binding-quote-delegation-local-20261002.json) · [記録](docs/sim-led-product-architecture.md) · [記録](docs/sky-a2a-bridge.md) · [記録](docs/evidence/sim-led-product-correction-20261002.json) · [記録](docs/evidence/a2a-two-agent-handoff-local-20261002.json) · [記録](lib/a2a-result-handoff.ts) · [記録](tests/a2a-result-handoff.test.mjs) · [記録](docs/evidence/a2a-zema-result-handoff-local-20261002.json) · [記録](docs/evidence/a2a-two-agent-cloud-workflow-local-20261002.json) · [記録](lib/esim-device-install-store.ts) · [記録](docs/evidence/esim-install-proof-concurrency-local-20261002.json) · [記録](lib/a2a-parent-controller.ts) · [記録](tests/a2a-parent-controller.test.mjs) · [記録](docs/evidence/a2a-parent-controller-local-20261002.json) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](docs/evidence/a2a-deadline-sweep-local-20261002.json) · [記録](drizzle/0057_a2a_parent_sequence.sql) · [記録](drizzle/meta/_journal.json) · [記録](lib/a2a-delegation-recovery.ts) · [記録](tests/a2a-delegation-recovery.test.mjs) · [記録](docs/evidence/a2a-persisted-handoff-link-local-20261002.json) · [記録](docs/sky-cloud-operations-runbook.md) · [記録](lib/rockstar-entitlement-delivery-http.ts) · [記録](app/api/internal/rockstar/entitlement-deliveries/route.ts) · [記録](docs/evidence/sim-led-product-correction-followup-20261002.json) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) |
| SKY21 | Sky独立サービスの基本利用・作者市場・有料販売・OS/他アプリ接続を証拠別に受け入れる | 進行中 | [記録](docs/sky-launch-design.md) · [記録](data/sky-service-launch.json) · [記録](lib/sky-service-status.ts) · [記録](app/api/sky/service-status/route.ts) · [記録](app/sky/help/page.tsx) · [記録](tests/sky-service-status.test.mjs) · [記録](docs/sky-launch-operations.md) · [記録](components/sky-publisher-form.tsx) · [記録](docs/evidence/sky-pixel-service-acceptance.json) · [記録](lib/operations.ts) · [記録](lib/local-guide-history.ts) · [記録](components/local-guide-history-consent.tsx) · [記録](components/legal-intake-runner.tsx) · [記録](components/patent-assistant-runner.tsx) · [記録](tests/local-guide-history.test.mjs) · [記録](tests/operations.test.mjs) |
| ORG01 | 製品・SkyのAI自動化チーム単位からソース、設計、担当作業へ進めるプロジェクト別入口を整備 | 完了 | [記録](PROJECTS.md) · [記録](README.md) · [記録](docs/rockstaros-product-system-map.md) · [記録](docs/workstreams/README.md) · [記録](scripts/check-sky.mjs) |
| MAT14 | R5統合基本設計・PDF/Word・図面8組・計算・参考資料を欠落なく保存し、現行入口と履歴を整理（製造承認保留） | 完了 | [記録](docs/avocado-mini-r5/README.md) · [記録](docs/avocado-mini-r5/package/package_manifest.json) · [記録](docs/avocado-mini-r5/verification.json) · [記録](scripts/verify-avocado-r5-package.py) · [記録](docs/avocado-mini-r5/research/immersive-gta/README.md) |
| MAT15 | R5単体の裸眼空間表示・安全・精密3D入力を成立させ、収納/熱/電源/確定回路/加工図と実機受入を閉じる | 未着手 | [記録](docs/avocado-mini-r5/package/integrated_design.md) |
| UXCHAR01 | Sky/Zemaの共通キャラアイコンとクリック詳細（役割・現在状態・会話内成果） | 完了 | [記録](components/tool-icon.tsx) · [記録](tests/sky-tool-icons.test.mjs) · [記録](components/tool-character.tsx) · [記録](components/tool-character.module.css) · [記録](docs/workstreams/01-product-ux.md) |
| SKY20 | Sky公開・Telegram配布を証拠付きverified Packageへ限定し、失効と利用イベント再送を受け入れる | 進行中 | [記録](drizzle/0016_red_crusher_hogan.sql) · [記録](lib/sky-tool-review.ts) · [記録](lib/sky-review-auth.ts) · [記録](app/api/sky/tool-reviews/route.ts) · [記録](lib/sky-tool-package-store.ts) · [記録](lib/sky-activation.ts) · [記録](lib/sky-tool-events.ts) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](tests/sky-tool-package.test.mjs) · [記録](tests/sky-activation.test.mjs) · [記録](tests/sky-tool-sdk.test.mjs) · [記録](docs/sky-tool-sdk.md) |
| SKY19 | SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） | 進行中 | [記録](docs/sky-network-economy.md) · [記録](docs/sky-billing.md) |
| DOC01 | RockstarOS本体・Sky／Zema・全ready／candidate Tool・Material Inventionの詳細設計入口と被覆監査を正本化 | 完了 | [記録](docs/rockstaros-design-portal.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| DOC02 | RockstarOS設計書完全版v1.0の原本PDF・全文抽出・完全性記録・設計索引をGit正本へ保存 | 完了 | [記録](docs/rockstaros-complete-design-v1.0.pdf) · [記録](docs/rockstaros-complete-design-v1.0.txt) · [記録](data/rockstaros-complete-design-v1.0.json) · [記録](docs/rockstaros-design-portal.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| DOC03 | rocketstar R1.0・衛星・OS付録・ボタン・生成元・旧版を原本と照合し、設計アーカイブと索引へ保存（製造/飛行未認定） | 完了 | [記録](docs/rocketstar-design/README.md) · [記録](docs/rocketstar-design/inventory.json) · [記録](docs/rocketstar-design/verification.json) · [記録](scripts/verify-rocketstar-archive.py) · [記録](data/design-document-index.json) |
| DOC04 | avokado READMEをR5端末・RockstarOS v1.0現行OS・rocketstar R1.0現行ロケット・事業・機能・全設計書の入口へ刷新 | 完了 | [記録](README.md) · [記録](docs/brand/avokado/avokado-r5-editorial-hero.png) · [記録](docs/brand/avokado/avokado-motion-v2.gif) · [記録](docs/brand/avokado/avokado-system-map.svg) · [記録](data/design-document-index.json) · [記録](docs/avocado-mini-r5/package/package_manifest.json) · [記録](docs/rockstaros-complete-design-v1.0.pdf) · [記録](docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf) |
| AI01 | RQ48をAstraで詳細設計しSolの独立監査を反映（設計のみ、runtime完了ではない） | 完了 | [記録](docs/product-baseline.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/ai-native-os-design-audit.md) |
| AI02 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](android/core/src/main/java/dev/rock/core/platform/RuntimeManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ModelProfileManifest.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelPublisherVerifier.java) · [記録](android/core/src/main/java/dev/rock/core/platform/TrustedModelArtifactPipeline.java) · [記録](android/core/src/main/java/dev/rock/core/platform/ResumableModelArtifactStager.java) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/Engine.java) · [記録](android/core/src/test/java/dev/rock/core/PlatformStoreTest.java) · [記録](android/core/src/test/java/dev/rock/core/EngineTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/TrustedModelPublisherVerifierTest.java) · [記録](android/core/src/test/java/dev/rock/core/platform/ResumableModelArtifactStagerTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-ai-profile-v3.patch) · [記録](docs/evidence/local-ai-profile-v3-validation-20261001.json) · [記録](docs/evidence/ai02-core-java-validation-20261001.json) · [記録](android/local-ai-api/src/main/aidl/dev/rock/localai/ILocalAiService.aidl) · [記録](os/physical/local-ai-model-handoff-v4.patch) · [記録](docs/evidence/local-ai-model-handoff-v4-validation-20261001.json) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileActivationCoordinator.java) · [記録](android/automation/src/main/java/dev/rock/automation/ModelProfileOperationLock.java) · [記録](scripts/check-os-contracts.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI03 | モデル非依存の限定記憶・project分離・根拠・削除契約を実装し、projection更新を受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/ai-memory-architecture.md) · [記録](systems/rock-star-os/src/blackberryrock/memory_store.py) · [記録](systems/rock-star-os/src/blackberryrock/memory_access.py) · [記録](systems/rock-star-os/tests/test_memory_store.py) · [記録](systems/rock-star-os/tests/test_memory_access.py) · [記録](docs/evidence/ai03-canonical-memory-store-20261001.json) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI04 | 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入 | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](contracts/compute-device-capabilities.json) · [記録](systems/rock-star-os/os/ai_routes/policy.py) · [記録](systems/rock-star-os/os/ai_routes/store.py) · [記録](contracts/device-capability-snapshot.json) · [記録](android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java) · [記録](android/automation/src/main/java/dev/rock/automation/LocalAiConnection.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](systems/rock-star-os/os/ai_routes/tests/test_policy_budget.py) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI06 | 非金融Game／IP fixtureを共通仕事・限定記憶・Zema進捗へ接続（Fund完成に非依存） | 進行中 | [記録](docs/ai-native-os-architecture.md) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| AI08 | Jev／TypeSafe・Local Qwen・Cloud LLMをcode主導で統合するDecision Fabric全体詳細設計と機械可読安全契約を固定 | 完了 | [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) |
| AI07 | JevのSky明示利用を設計し、DecisionProviderとRouter／Harnessへの統合を受け入れる | 進行中 | [記録](docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md) · [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) |
| MAT01 | RQ49 Material Invention Coreのentity・発明loop・安全境界を設計へ固定 | 完了 | [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/material-invention-core.md) |
| MAT02 | 二物質・複数比率・工程条件のsandbox候補graphとfail-closed安全検査を実装 | 完了 | [記録](contracts/material-invention.json) · [記録](contracts/material-invention-fixture.json) · [記録](lib/material-invention.ts) · [記録](tests/material-invention.test.mjs) · [記録](docs/material-invention-core.md) · [記録](docs/validation.md) |
| MAT03 | Material Invention CoreをZemaの仕事・限定記憶・simulation／外部ラボProviderへ接続して独立受入 | 未着手 | [記録](docs/material-invention-core.md) |
| MAT04 | Material Invention Coreの標準体験としてavocadoMiniの四方向sensor・hand操作・再計算・Patent AI設計を固定 | 完了 | [記録](docs/material-invention-xr.md) · [記録](docs/avocado-mini-spatial-invention.md) · [記録](docs/avocado-mini-hardware-design.md) · [記録](docs/assets/rockstaros-spatial-table-v1.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](docs/assets/avocado-mini-hardware-00-overview.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-exploded.png) · [記録](docs/assets/avocado-mini-hardware-03-power-control-haptic.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v2.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded-v2.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-exploded-v2.png) · [記録](docs/assets/avocado-mini-hardware-03-power-control-haptic-v2.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-v4-thin-tube.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-v4-thin-tube.png) · [記録](data/material-invention-xr-policy.json) · [記録](contracts/material-invention-xr.json) · [記録](contracts/avocado-mini-spatial-interaction.json) |
| MAT05 | Core graphから決定的XR sceneを生成し、四方向pose fixtureのconnect／separate／stale拒否を実装 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT06 | avocadoMini四方向Bench／Full-scale prototypeとMaterial Core→Patent AI provenance bridgeを独立受入 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT07 | 誰でも全体像から担当作業へ合流できるavocadoMini統合完成設計書と全体構成を正本化 | 完了 | [記録](docs/rockstaros-avocado-mini-complete-design.md) · [記録](docs/workstreams/11-material-invention-avocado-mini.md) · [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/rockstaros-1.0-architecture.md) |
| MAT08 | Mini200 E1のゲーム中心・生活拡張・衛星通信方針と20cm本体・音声をREADME・図・参照モデルへ保存（実機未受入） | 完了 | [記録](docs/avocado-mini-mini200-e1/README.md) · [記録](docs/avocado-mini-mini200-e1/design.md) · [記録](docs/avocado-mini-mini200-e1/engineering/verify_all.py) · [記録](docs/avocado-mini-mini200-e1/verification.json) · [記録](docs/avocado-mini-mini200-e1/game-first-life-connectivity.md) |
| MAT09 | Mini200 E1専用入力profile・Core adapter・ゲーム／ASR／console OSと20cm実機を独立受入 | 未着手 | [記録](docs/avocado-mini-mini200-e1/README.md) · [記録](docs/avocado-mini-mini200-e1/game-first-life-connectivity.md) |
| MAT10 | Mini200 E2資料と利用者確定の4本＋中央Core外観をGit正本と公開製品Siteへ同期（実機未受入） | 完了 | [記録](docs/avocado-mini-mini200-e2/README.md) · [記録](docs/product-baseline.md) · [記録](sites/avocado-mini/src/pages/index.astro) |
| MAT11 | 4本のMotion Towerと中央Mini200 E2 Coreの統合engineering package・prototype・実機受入 | 未着手 | [記録](docs/avocado-mini-mini200-e2/README.md) |
| MAT12 | Tower20 E3資料を現行avocadoMini基準へ固定し、4本の固定200mm塔＋別筐体Edge HubをGit正本と公開Siteへ同期（実機未受入） | 完了 | [記録](docs/avocado-mini-tower20-e3/README.md) · [記録](docs/product-baseline.md) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-sensor-v2.png) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-200mm-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-footprint-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-highlight-edge-hub-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-front-cutout-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-side-cutout-v1.png) · [記録](sites/avocado-mini/public/images/tower20-e3-rear-cutout-v1.png) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) |
| MAT13 | Tower20 E3の確定CAD・配線・4camera同期・光学・転倒／滑り・熱・電源・音響・OS image・復旧を同一試作機で受入 | 未着手 | [記録](docs/avocado-mini-tower20-e3/README.md) |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了 | [記録](docs/sky.md) · [記録](components/sky-workspace.tsx) · [記録](scripts/check-sky.mjs) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) · [記録](app/sky/marketplace/page.tsx) · [記録](app/sky/register/page.tsx) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-marketplace.module.css) · [記録](lib/sky-marketplace-policy.ts) · [記録](lib/sky-ai-marketplace.ts) · [記録](components/sky-tool-workspace.tsx) · [記録](lib/sky-tool-compatibility.ts) · [記録](app/workspace.css) · [記録](components/sky-tool-workspace.module.css) · [記録](tests/sky-marketplace.test.mjs) · [記録](tests/jev-router-availability.test.mjs) · [記録](docs/sky-network-economy.md) |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了 | [記録](docs/sky-mcp-architecture.md) · [記録](systems/rock-star-os/docs/MCP-HUB-INTEGRATION.md) |
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SKY05 | Sky画面のsidebarを廃止し、MCP接続・管理とToB掲載をSky本体の操作面へ統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/sky/network/page.tsx) · [記録](app/sky/publish/page.tsx) |
| SKY06 | Sky内MCPを実在するPC接続・既存4自動化・3ステップ導入画面へ統合 | 完了 | [記録](components/sky-mcp-center.tsx) · [記録](components/device-connection.tsx) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](scripts/verify-mcp-flow.mjs) |
| SKY07 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) · [記録](docs/sky-cloud-continuity.md) · [記録](docs/cloud-agent-provider-comparison-20261001.md) · [記録](lib/a2a-client.ts) · [記録](tests/a2a-client.test.mjs) · [記録](lib/a2a-authorization.ts) · [記録](tests/a2a-authorization.test.mjs) · [記録](docs/sky-a2a-bridge.md) · [記録](lib/a2a-delegation-store.ts) · [記録](drizzle/0019_sky_a2a_delegations.sql) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](drizzle/0020_a2a_delegation_events.sql) · [記録](app/api/sky/a2a-delegations/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/route.ts) · [記録](scripts/check-work-api.mjs) · [記録](tests/database-status.test.mjs) · [記録](lib/a2a-input-crypto.ts) · [記録](tests/a2a-input-crypto.test.mjs) · [記録](drizzle/0021_a2a_delegation_inputs.sql) · [記録](drizzle/0022_a2a_delegation_artifacts.sql) · [記録](lib/a2a-artifacts.ts) · [記録](tests/a2a-artifacts.test.mjs) · [記録](app/api/sky/a2a-delegations/[id]/artifacts/route.ts) · [記録](app/api/sky/a2a-delegations/[id]/wallet-settlement/route.ts) · [記録](components/workbench.tsx) · [記録](app/work/work.css) · [記録](services/sky-agent-runtime/src/worker.ts) · [記録](services/sky-agent-runtime/wrangler.jsonc) · [記録](package.json) · [記録](lib/a2a-agent-directory.ts) · [記録](tests/a2a-agent-directory.test.mjs) · [記録](drizzle/0023_a2a_sky_agent_connections.sql) · [記録](app/api/sky/a2a-agents/route.ts) · [記録](app/api/sky/a2a-agents/[id]/route.ts) · [記録](lib/a2a-broker-trust.ts) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](drizzle/0024_a2a_broker_authorizations.sql) · [記録](app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts) · [記録](tests/fixtures/a2a/python_agent.py) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/evidence/sky-a2a-workflow-local-20260930.json) · [記録](drizzle/0033_a2a_offline_continuation_consent.sql) · [記録](systems/rock-star-os/os/mcp_broker/a2a_authorization.py) · [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](lib/a2a-delegation-recovery.ts) · [記録](tests/a2a-delegation-recovery.test.mjs) · [記録](systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py) · [記録](docs/evidence/a2a-cloud-python-wallet-handoff-20261001.json) · [記録](docs/evidence/android-device-owner-session-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/RockstarDeviceAuthorizationFlow.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidRockstarDeviceSessionStore.java) · [記録](lib/rockstar-device-link.ts) · [記録](docs/evidence/android-a2a-p256-broker-key-20261002.json) · [記録](android/automation/src/main/java/dev/rock/automation/A2ABrokerDeviceKeyStore.java) · [記録](lib/a2a-broker-authorization.ts) · [記録](lib/a2a-wallet-handoff-auth.ts) · [記録](lib/a2a-broker-trust.ts) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](tests/a2a-wallet-handoff-auth.test.mjs) · [記録](app/api/rockstar/broker-devices/route.ts) · [記録](lib/a2a-broker-device-store.ts) · [記録](scripts/check-work-api.mjs) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceRefStore.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerDeviceTransport.java) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2ABrokerEnrollment.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](tests/sim-service-entry.test.mjs) · [記録](scripts/check-os-contracts.mjs) · [記録](android/automation/src/androidTest/java/dev/rock/automation/A2ABrokerDeviceKeyStoreTest.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](android/automation/build.gradle) · [記録](android/automation/src/main/java/dev/rock/automation/AndroidA2AUsageTrustConfig.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/AndroidA2AUsageTrustConfigTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockApplication.java) · [記録](android/core/src/main/java/dev/rock/core/platform/A2AUsageReceiptVerifier.java) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](docs/sim-service-entitlement-claims.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/evidence/sim-led-product-direction-audit-20261002.json) · [記録](android/core/src/test/java/dev/rock/core/platform/A2AUsageReceiptVerifierTest.java) · [記録](android/core/src/test/resources/a2a-price-quote-v1.json) · [記録](tests/a2a-price-quote.test.mjs) · [記録](docs/evidence/android-a2a-price-quote-verifier-20261002.json) · [記録](docs/evidence/android-a2a-reservation-bridge-audit-20261002.json) · [記録](android/core/src/main/java/dev/rock/core/platform/A2ABrokerAuthorization.java) · [記録](android/core/src/test/java/dev/rock/core/platform/A2ABrokerAuthorizationTest.java) · [記録](android/core/src/test/resources/a2a-wallet-reservation-v2.json) · [記録](android/core/src/test/resources/a2a-broker-authorization-v2.json) · [記録](tests/a2a-wallet-reservation.test.mjs) · [記録](docs/evidence/android-a2a-native-reservation-core-20261002.json) · [記録](docs/evidence/a2a-price-quote-acquisition-local-20261002.json) · [記録](app/api/sky/a2a-price-quotes/route.ts) · [記録](lib/a2a-price-quote-acquisition.ts) · [記録](tests/a2a-price-quote-acquisition.test.mjs) · [記録](lib/a2a-usage-receipt.ts) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](lib/a2a-price-quote-consent-store.ts) · [記録](drizzle/0049_a2a_price_quote_consent_events.sql) · [記録](tests/a2a-price-quote-consent-store.test.mjs) · [記録](docs/evidence/a2a-two-agent-handoff-local-20261002.json) · [記録](lib/a2a-result-handoff.ts) · [記録](tests/a2a-result-handoff.test.mjs) · [記録](docs/evidence/a2a-zema-result-handoff-local-20261002.json) · [記録](docs/evidence/a2a-two-agent-cloud-workflow-local-20261002.json) · [記録](lib/esim-device-install-store.ts) · [記録](docs/evidence/esim-install-proof-concurrency-local-20261002.json) · [記録](lib/a2a-parent-controller.ts) · [記録](tests/a2a-parent-controller.test.mjs) · [記録](docs/evidence/a2a-parent-controller-local-20261002.json) · [記録](docs/workstreams/02-sky-mcp.md) · [記録](docs/sim-led-product-architecture.md) · [記録](docs/evidence/a2a-deadline-sweep-local-20261002.json) · [記録](db/schema.ts) · [記録](drizzle/0057_a2a_parent_sequence.sql) · [記録](drizzle/meta/_journal.json) · [記録](docs/evidence/a2a-persisted-handoff-link-local-20261002.json) · [記録](docs/evidence/a2a-parent-plan-binding-local-20261002.json) · [記録](lib/workflow.ts) · [記録](lib/work-store.ts) · [記録](app/api/work-jobs/route.ts) · [記録](tests/workflow.test.mjs) · [記録](docs/evidence/a2a-runtime-recheck-20261002.json) |
| SKY08 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY09 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/api/sky/connections/route.ts) · [記録](docs/sky-identity-connection.md) |
| SKY10 | Skyをアプリ選択と接続へ絞り、Chatを依頼・状況・結果の受取画面として分離 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/chat/page.tsx) · [記録](app/polymarket/page.tsx) · [記録](docs/workstreams/01-product-ux.md) · [記録](README.md) |
| SKY11 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了 | [記録](lib/mcp-inspection.ts) · [記録](app/api/sky/mcp/inspect/route.ts) · [記録](lib/device.ts) · [記録](components/sky-publisher-form.tsx) · [記録](components/device-connection.tsx) · [記録](tests/mcp-inspection.test.mjs) · [記録](tests/device-lifecycle.test.mjs) |
| SKY12 | ChatをSky Auto既定の一画面へ整理し、事前のアプリ選択を任意化 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](docs/sky-identity-connection.md) |
| SKY13 | GrokをモチーフにChatの表示・入力を改善し、依頼から実行・結果までを会話内へ統合 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mr-tool-runner.tsx) · [記録](app/workspace.css) · [記録](lib/operations.ts) · [記録](tests/operations.test.mjs) · [記録](docs/chat-usability-20260912.md) · [記録](docs/workstreams/01-product-ux.md) · [記録](README.md) |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mcp-bot-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](scripts/sky-local-runtime.mjs) · [記録](lib/sky-local-runtime.ts) · [記録](tests/sky-local-runtime.test.mjs) · [記録](components/delivery-runner.tsx) · [記録](docs/sky-tools-complete-design.md) · [記録](docs/workstreams/02-sky-mcp.md) · [記録](docs/chat-mcp-control-room-20260913.md) |
| SKY15 | Sky SDKコードを既存ツールへ追加し、起動時にPackage登録・MCP公開・利用記録まで行うStudioを実装 | 完了 | [記録](components/rock-studio.tsx) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](app/studio/page.tsx) · [記録](app/sky/publish/page.tsx) · [記録](tests/sky-code-intake.test.mjs) · [記録](tests/sky-studio-chat.test.mjs) · [記録](docs/sky-tool-sdk.md) |
| SKY16 | SkyのTool選択と自然文依頼をZemaへ一回引き継ぎ、job状態を即時同期 | 完了 | [記録](components/sky-candidate-runner.tsx) · [記録](lib/sky-zema-handoff.ts) · [記録](lib/operations-client.ts) · [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/chat-live-progress.tsx) · [記録](tests/sky-zema-handoff.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/sky.md) |
| SKY17 | Jev Ultrafastを権限制御されたbrowser agent候補としてSky catalogと全Tool設計へ追加 | 完了 | [記録](lib/catalog.ts) · [記録](docs/jev-ultrafast-integration-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| SKY18 | Jev ecosystem 10 repositoryを判断・browser・PC・mobile・review・routing・PAPER市場・referenceへ分離して候補登録 | 完了 | [記録](lib/catalog.ts) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/jev-ultrafast-integration-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) · [記録](scripts/check-sky.mjs) |
| WEB02 | Developer Preview紹介をOSインストールとSky開発者コード中心の一画面へ再設計 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) |
| WEB03 | Developer Preview紹介とRock Studioを共通の黒・黄緑visual systemへ統一 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](components/rock-studio.tsx) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) |
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/system-settings.module.css) · [記録](components/csv-business-workspace.module.css) · [記録](components/workspace-shell.tsx) · [記録](components/sky-surface.module.css) · [記録](components/sky-workspace.tsx) · [記録](components/sky-workspace.module.css) · [記録](components/sky-tool-card.tsx) · [記録](components/sky-tool-card.module.css) · [記録](components/sky-marketplace.tsx) · [記録](components/sky-marketplace.module.css) · [記録](components/sky-tool-workspace.tsx) · [記録](components/sky-tool-workspace.module.css) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](components/fashion-brand-ops-runner.module.css) · [記録](components/sky-connection-center.tsx) · [記録](components/sky-connection-center.module.css) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/sky-publisher-form.module.css) · [記録](lib/use-sky-tool-context.ts) · [記録](components/rock-studio.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](components/coconala-team-workspace.module.css) · [記録](app/workspace.css) · [記録](components/sky-chat-workspace.tsx) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/workstreams/01-product-ux.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) · [記録](lib/sky-result-library.ts) · [記録](tests/sky-result-library.test.mjs) · [記録](app/sky/layout.tsx) · [記録](app/sky/manifest.webmanifest/route.ts) · [記録](lib/sky-app-manifest.ts) · [記録](tests/sky-app-manifest.test.mjs) · [記録](docs/sky.md) |
| BRD01 | 正式製品名をRockstarOS、内部識別子をdev.rockで固定 | 完了 | [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](app/layout.tsx) · [記録](app/manifest.ts) · [記録](components/home-screen.tsx) · [記録](android/automation/src/main/java/dev/rock/automation/ApprovalActivity.java) · [記録](tests/product-baseline.test.mjs) |
| WEB05 | avocadoMiniの製品紹介と回転ツアーをP0.2設計書と黒い製品写真のデザインへ統一 | 完了 | [記録](README.md) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/pages/guide/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/tower-scene.js) · [記録](sites/avocado-mini/dist/client/index.html) · [記録](sites/avocado-mini/public/images/avocado-mini-hero.png) · [記録](sites/avocado-mini/public/images/avocado-mini-detail.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-front-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-side-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-rear-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-sensor-macro.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-four-point.png) · [記録](sites/avocado-mini/public/images/avocado-mini-kit.png) · [記録](sites/avocado-mini/public/images/avocado-mini-head-p0.png) · [記録](sites/avocado-mini/public/images/avocado-mini-base-p0.png) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](public/rockstaros/avocado-mini-concept.png) · [記録](docs/product-baseline.md) |
| WEB06 | GitHubと製品紹介から主要アプリへ進む入口を整え、既存Siteの一般公開と最新版同期を確認する | 進行中 | [記録](README.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](app/api/health/route.ts) · [記録](scripts/check-work-api.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](lib/csv-job-store.ts) · [記録](scripts/check-csv-storage.mjs) · [記録](docs/evidence/sky-csv-storage-hardening.json) |
| WEB07 | 利用者の目的とAIの役割を先に伝える製品紹介へGitHub冒頭とWebページを改訂 | 完了 | [記録](README.md) · [記録](docs/assets/rockstaros-intro.gif) · [記録](docs/assets/cover-avocado-mini.gif) · [記録](docs/assets/cover-rockstaros.gif) · [記録](docs/assets/cover-sky.gif) · [記録](docs/assets/cover-zema.gif) · [記録](docs/assets/cover-material-studio.gif) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) |
| WEB09 | avocadoMiniクラファン企画を提示し、募集確定後に公開支援リンクを設置する | 進行中 | [記録](README.md) · [記録](docs/avocado-mini-crowdfunding.md) · [記録](app/rockstaros/crowdfunding/page.tsx) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB10 | 製品・OS導入ホームに各サービスの役割と利用範囲を示す入口を追加 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](docs/product-baseline.md) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB11 | 製品構想モデルをスクロールで一周見せ、参考価格・購入準備中・OS導入へつなぐ | 完了 | [記録](components/avocado-turntable.tsx) · [記録](components/avocado-turntable.module.css) · [記録](app/rockstaros/page.tsx) · [記録](docs/product-baseline.md) |
| WEB12 | 利用者提供の伸縮式センサータワーを製品サイトとGitHubの主役にする | 完了 | [記録](public/rockstaros/avocado-mini-tower-concept.png) · [記録](components/avocado-turntable.tsx) · [記録](components/avocado-turntable.module.css) · [記録](app/rockstaros/page.tsx) · [記録](README.md) · [記録](docs/avocado-mini-hardware-design.md) |
| WEB13 | 旧URLをavocadoMini公開商品Siteへ転用し、OS操作画面を管理者限定の別Siteへ移す | 進行中 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/pages/guide/index.astro) · [記録](sites/avocado-mini/src/pages/crowdfunding/index.astro) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](components/avocado-turntable.tsx) · [記録](components/avocado-turntable.module.css) · [記録](README.md) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/main.js) · [記録](project.md) · [記録](sites/avocado-mini/src/pages/rockstaros/index.astro) · [記録](sites/avocado-mini/astro.config.mjs) · [記録](sites/avocado-mini/src/pages/rocket-star/index.astro) · [記録](sites/avocado-mini/rocket-star/main.js) · [記録](sites/avocado-mini/rocket-star/design.css) · [記録](sites/avocado-mini/scripts/build-rocketstar.mjs) · [記録](docs/evidence/rocketstar-site-r1.json) · [記録](sites/avocado-mini/public/downloads/rocketstar-complete-design-r1.0.pdf) · [記録](sites/avocado-mini/public/downloads/rocketstar-complete-design-r1.0.zip) · [記録](sites/avocado-mini/public/rocket-star/design/index.html) · [記録](sites/avocado-mini/public/rocket-star/design/source.md) |
| WEB14 | RockstarOS導入入口を製品ページへ置き、Pixel 10向け実インストーラーを配布・安全ゲート合格後に接続する | 進行中 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/pages/install/index.astro) · [記録](sites/avocado-mini/astro.config.mjs) · [記録](data/android-first-flash-gate.json) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB15 | avocadoMiniの予約販売画面と決済バックエンドを用意し、販売条件確定後に全額決済を有効化する | 進行中 | [記録](sites/avocado-mini/src/pages/preorder/index.astro) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/db/schema.ts) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](package.json) · [記録](tests/verify-coverage.test.mjs) |
| WEB16 | 公開avocadoMini Siteを現行R5へ同期し、旧E3商品構成・価格を販売導線から撤去する | 完了 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/pages/preorder/index.astro) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](sites/avocado-mini/public/downloads/avocadoMini-R5-integrated-design.pdf) · [記録](docs/evidence/avocado-mini-site-r5.json) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| WEB17 | 公開avocadoMini SiteをAstroへ移行し、承認済みデザイン・全route・Worker配布契約を維持する | 完了 | [記録](sites/avocado-mini/package.json) · [記録](sites/avocado-mini/astro.config.mjs) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/pages/rocket-star/index.astro) · [記録](sites/avocado-mini/src/pages/preorder/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| WEB18 | 公開avocadoMini Siteの画像原本を保護し、表示・導線・アクセシビリティ・SEOの不具合を解消する | 完了 | [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/worker/index.js) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](sites/avocado-mini/tests/preorder.test.mjs) · [記録](sites/avocado-mini/public/robots.txt) · [記録](sites/avocado-mini/public/sitemap.xml) · [記録](docs/evidence/avocado-mini-site-r5.json) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](project.md) |
| WEB19 | 利用者指定のTower20 E3公開Siteを承認済み画像・英語UI・180度演出ごとAstroで復元して本番配備する | 完了 | [記録](sites/avocado-mini/docs/experience-images-v4.md) · [記録](sites/avocado-mini/src/pages/index.astro) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/tests/astro-build.test.mjs) · [記録](docs/evidence/avocado-mini-site-e3-restoration.json) · [記録](project.md) |
| BIZ01 | 無料配布の対象とOS従量課金の計量単位・単価・上限を確定する | 進行中 | [記録](README.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/sky-billing.md) |
| VER01 | RockstarOS 1.0と将来の1.5／2.0版更新規則を一元管理 | 完了 | [記録](data/product-identity.json) · [記録](lib/product-identity.ts) · [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](components/workspace-shell.tsx) · [記録](components/system-settings.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/product-baseline.test.mjs) |
| WLT01 | Walletの受取予定・収益内訳・Receipt・精算ルールを一画面で確認できるフロントを実装 | 完了 | [記録](docs/wallet-front-design.md) · [記録](components/sky-billing.tsx) · [記録](components/operations-workspace.tsx) · [記録](app/workspace.css) |
| WLT02 | 本人別の残高・売上・経費・取消履歴をD1へ保存するWallet専用APIと操作画面を実装 | 完了 | [記録](app/api/wallet/route.ts) · [記録](components/wallet-workspace.tsx) · [記録](lib/operations.ts) · [記録](tests/wallet-backend.test.mjs) |
| WLT03 | Wallet／ファンド会社を交換可能な外部Providerとして受ける責任境界とadapter契約を固定 | 完了 | [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](docs/validation.md) |
| WLT04 | Rock Settlement Walletを最初のProviderとして自社利用料のsandbox回収契約を実装 | 完了 | [記録](lib/financial-provider.ts) · [記録](tests/financial-provider.test.mjs) · [記録](docs/rock-first-party-settlement-wallet-20260913.md) · [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/validation.md) |
| WLT05 | Base Mainnet USDCの所有確認付き受取先とfinalized着金照合を本番Wallet・Workerへ接続 | 完了 | [記録](components/rock-settlement-wallet.tsx) · [記録](lib/rock-wallet.ts) · [記録](services/sky-billing/src/worker.ts) · [記録](services/sky-billing/migrations/0004_rock_settlement_wallet.sql) · [記録](tests/rock-wallet.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](docs/rock-wallet-production-rail-20260913.md) |
| WLT06 | owner受取Walletを本人署名で登録し、最初の実USDC回収をEarning Receiptへ照合 | 進行中 | [記録](docs/rock-wallet-production-rail-20260913.md) |
| MKT01 | あらゆる型付き価値を扱うPAPER市場とexact approval・risk・receipt・position台帳を実装 | 完了 | [記録](app/market/page.tsx) · [記録](app/api/market/route.ts) · [記録](components/everything-market.tsx) · [記録](lib/everything-market.ts) · [記録](lib/everything-market-store.ts) · [記録](drizzle/0009_sad_giant_girl.sql) · [記録](tests/everything-market.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| MKT02 | Web PAPER市場のapproval・reservation・receipt・position関係をD1で強制 | 完了 | [記録](drizzle/0012_marketplace_relation_guards.sql) · [記録](tests/everything-market.test.mjs) · [記録](scripts/check-web-schema.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) · [記録](docs/data-storage-boundaries.md) |
| DB01 | 全データ境界・table・migration・本番readback状態を一つの監査レポートへ統合 | 完了 | [記録](scripts/database-status.mjs) · [記録](data/database-deployments.json) · [記録](data/database-status.json) · [記録](docs/database-status.md) · [記録](tests/database-status.test.mjs) |
| SPN01 | native Walletへsimulation/PAPER限定のValue/Spend台帳・exact approval・再照合を統合 | 完了 | [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/src/blackberryrock/wallet.py) · [記録](systems/rock-star-os/src/blackberryrock/hub_server.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) · [記録](docs/value-spend-runtime.md) |
| FND01 | ツールの検証済み純収益・実費・receipt・失敗から構成と観測利回りを30秒ごとに再計算 | 完了 | [記録](lib/automation-fund.ts) · [記録](lib/automation-fund-store.ts) · [記録](app/api/automation-funds/route.ts) · [記録](components/autonomous-fund-market.tsx) · [記録](tests/automation-fund.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| WEB01 | 主要画面のstyle契約と配備asset closureを検査し、GitHubと既存Sitesを同一commitへ固定 | 停止中: 一般公開の意思は確認済み。既存Sitesは現在の接続アカウントでAccess Denied／project_not_foundとなり、所有workspaceの接続なしでは公開設定変更、同一SHA配備とD1本番readbackを実行できない。 | [記録](tests/web-route-style-contract.test.mjs) · [記録](scripts/check-web-asset-closure.mjs) · [記録](tests/web-asset-closure.test.mjs) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) · [記録](docs/evidence/launch/sites-owner-auth-blocker-20260915.json) |
| HOME01 | iPhone着想のホーム、端末内カスタマイズ、OS運用設定アプリを実装 | 完了 | [記録](app/page.tsx) · [記録](app/sky/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](app/settings/page.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-settings.module.css) · [記録](docs/product-baseline.md) |
| HOME02 | Home以外の全画面へ直接Homeへ戻る導線を常設し、共通・独自レイアウトの回帰を防止 | 完了 | [記録](components/workspace-shell.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-maintenance.tsx) · [記録](app/fund/page.tsx) · [記録](app/fund/legacy/page.tsx) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/product-baseline.md) |
| SYS01 | 端末診断・暗号化設定バックアップ・復元・Web更新確認を設定へ実装 | 完了 | [記録](app/settings/system/page.tsx) · [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS02 | 通知・保存保護・診断共有・安全な初期化と公開審査gateを設定へ実装 | 完了 | [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS03 | 公開方法別の最低条件を機械判定し、Web/npm SBOMと設定画面へ統合 | 完了 | [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](components/system-maintenance.tsx) |
| SYS04 | QEMU rc2を同一候補10要件へ固定し、rc2固有native SBOMを生成して旧inventoryの誤転用を拒否 | 完了 | [記録](data/qemu-release-audit.json) · [記録](data/qemu-rc2-legal-info/manifest.csv) · [記録](data/qemu-rc2-legal-info/host-manifest.csv) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/qemu-release-completion-audit-20260912.md) · [記録](components/system-maintenance.tsx) |
| SYS05 | 候補準備・法務承認・保護署名・本人署名の64拒否境界試験を全体verifyへ統合 | 完了 | [記録](scripts/check-release-signing.mjs) · [記録](scripts/release_signing.py) · [記録](scripts/release_signing_owner.py) · [記録](scripts/prepare_release_candidate.py) · [記録](scripts/verify_owner_legal_approval.py) · [記録](tests/test_release_signing.py) · [記録](tests/test_release_signing_owner.py) · [記録](tests/test_prepare_release_candidate.py) · [記録](tests/test_owner_legal_approval.py) · [記録](docs/release-signing-operations.md) |
| SYS06 | Android物理端末とマイナンバー連携を独立監査し、証拠なしの互換・GMS・販売・個人番号有効化を拒否 | 完了 | [記録](data/android-physical-release-audit.json) · [記録](data/personal-number-release-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/android-and-personal-number-gates-20260913.md) · [記録](docs/release-minimum-gates.md) |
| SYS07 | Web/PWAのHTTP防御を正本化し、Worker・static asset両経路の実responseを検査 | 完了 | [記録](data/web-security-policy.json) · [記録](next.config.ts) · [記録](public/_headers) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/web-security-policy.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS08 | PWA新版の自動即時切替を廃止し、本人確認後の適用・旧cache整理・再読込へ変更 | 完了 | [記録](public/sw.js) · [記録](components/system-maintenance.tsx) · [記録](tests/service-worker-update.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS09 | PWAの同一性・scope・iPhone/Android向けinstall iconを固定し、実HTTP manifestを検査 | 完了 | [記録](app/manifest.ts) · [記録](public/rock-icon-192.png) · [記録](public/rock-icon-512.png) · [記録](public/rock-icon-maskable.svg) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/pwa-installability.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS10 | Web第三者依存のlock hash・47要review componentのPURL一覧を公開gateへ固定 | 完了 | [記録](package-lock.json) · [記録](data/web-third-party-license-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS11 | Vite生成chunkのnpm componentをbuild時に記録しlicense監査へ照合 | 完了 | [記録](vite.config.ts) · [記録](scripts/web-bundle-inventory.mjs) · [記録](scripts/check-web-bundle-inventory.mjs) · [記録](tests/web-bundle-inventory.test.mjs) · [記録](package.json) · [記録](data/release-readiness.json) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS12 | 運営1名で開始できる緊急保護・限定保守accessの脅威モデルと端末側制御契約を固定 | 完了 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](docs/product-baseline.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SYS13 | 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 | 進行中 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](services/operator-dock/public/index.html) · [記録](services/operator-dock/src/worker.ts) · [記録](services/operator-dock/src/access-auth.ts) · [記録](services/operator-dock/src/operator-control.ts) · [記録](services/operator-dock/src/device-channel.ts) · [記録](services/operator-dock/migrations/0001_operator_device_control.sql) · [記録](services/operator-dock/migrations/0002_signed_device_channel.sql) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentJobService.java) · [記録](tests/operator-control.test.mjs) · [記録](tests/operator-device-channel.test.mjs) · [記録](tests/operator-access-auth.test.mjs) · [記録](tests/operator-dock-isolation.test.mjs) · [記録](android/operator-agent/src/androidTest/java/dev/rock/operator/agent/OperatorAgentIntegrationTest.java) · [記録](android/operator-agent/src/main/res/values/overlayable.xml) · [記録](scripts/stage-operator-agent-overlay.py) · [記録](tests/test_stage_operator_agent_overlay.py) · [記録](os/physical/operator-agent-overlay/README.md) · [記録](docs/evidence/android-operator-agent-emulator-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](docs/evidence/android-operator-overlay-stager-20260916.json) |
| SYS15 | Spider Security AgentのGitHub検査・コード検査・OS常駐監視・送信前拒否・native表示・boot監督を統合する（ROCK・同一image起動未受入） | 進行中 | [記録](docs/spider-guard.md) · [記録](docs/evidence/spider-guard-source-validation.json) · [記録](docs/workstreams/04-security-identity-compliance.md) · [記録](docs/product-baseline.md) · [記録](docs/rockstaros-complete-design.md) · [記録](data/design-document-index.json) · [記録](systems/rock-star-os/os/platform/sensitive_guard.py) · [記録](systems/rock-star-os/os/platform/supervisor.py) · [記録](systems/rock-star-os/os/platform/service.py) · [記録](systems/rock-star-os/os/platform/runner_control.py) · [記録](systems/rock-star-os/os/platform/install-target.sh) · [記録](systems/rock-star-os/os/ui/security-ui.inc) · [記録](systems/rock-star-os/os/ui/test_ui.c) · [記録](systems/rock-star-os/tests/test_sensitive_guard.py) · [記録](systems/rock-star-os/tests/test_os_security_guard_integration.py) · [記録](systems/rock-star-os/tests/test_os_runner_control.py) · [記録](systems/rock-star-os/os/ui/spider-motion.c) · [記録](systems/rock-star-os/os/ui/spider-motion.h) · [記録](systems/rock-star-os/os/ui/pin-readiness.json) · [記録](scripts/review-native-pin-source.py) · [記録](systems/rock-star-os/tests/test_ui_pin_source_profile.py) · [記録](scripts/build-spider-inspector.mjs) · [記録](toolkits/spider-guard/README.md) · [記録](toolkits/spider-guard/inspector.html) · [記録](toolkits/spider-guard/program-inspector.mjs) · [記録](toolkits/spider-guard/program-inspector.d.mts) · [記録](tests/spider-inspector-artifact.test.mjs) · [記録](tests/spider-program-inspector.test.mjs) · [記録](systems/rock-star-os/os/platform/code_inspector.py) · [記録](systems/rock-star-os/tests/test_code_inspector.py) · [記録](SECURITY.md) · [記録](.github/workflows/spider.yml) · [記録](.github/workflows/spider-codeql.yml) · [記録](.github/spider/gitleaks.toml) · [記録](scripts/spider-repository-scan.py) · [記録](tests/test_spider_repository_scan.py) · [記録](tests/test_spider_gitleaks_policy.py) · [記録](tests/spider-codeql-workflow.test.mjs) · [記録](docs/evidence/spider-github-source-validation.json) · [記録](scripts/spider-feedback.mjs) · [記録](tests/spider-feedback.test.mjs) · [記録](.github/workflows/spider-regressions.yml) · [記録](tests/service-worker-update.test.mjs) · [記録](toolkits/fashion-brand-ops/test/http-security.test.mjs) · [記録](docs/evidence/spider-improvement-cycle.json) · [記録](tests/mcp-local-descriptor.test.mjs) · [記録](tests/test_mr_delivery_boundary.py) · [記録](tests/test_mr_http_deadline.py) · [記録](scripts/select-native-artifacts.py) · [記録](systems/rock-star-os/tests/test_native_artifacts.py) · [記録](docs/native-os-validation.md) · [記録](systems/rock-star-os/os/desktop/launcher.py) · [記録](systems/rock-star-os/tests/test_os_desktop_browser.py) · [記録](systems/rock-star-os/os/desktop/README.md) · [記録](systems/rock-star-os/os/platform/guest-test.py) · [記録](systems/rock-star-os/tests/test_os_platform_isolation_proof.py) · [記録](systems/rock-star-os/tests/test_game_exchange_deadlines.py) · [記録](scripts/verify-mcp-flow.mjs) · [記録](tests/mcp.test.mjs) · [記録](tests/mr-tools.test.mjs) · [記録](tests/csv-transform.test.mjs) · [記録](tests/fixtures/csv-report.html) · [記録](tests/mcp-connector.test.mjs) · [記録](systems/rock-star-os/os/mcp_broker/http.py) · [記録](systems/rock-star-os/tests/test_mcp_http_deadline.py) · [記録](tests/undici-tls-options.test.mjs) · [記録](data/web-third-party-license-audit.json) |
| SYS14 | 製品目的から全層の選択・接続・実証状態を一つの構成監査へ固定 | 完了 | [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](scripts/check-system-composition.mjs) · [記録](tests/system-composition.test.mjs) |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) · [記録](docs/native-ci-partition-fix-20260910.md) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 完了 | [記録](docs/deployment-integration.md) · [記録](docs/release-followup-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/os-development-design.md) |
| DSP01 | 共通Core・機種別Device Support Package・4提供区分の設計と検査 | 完了 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) · [記録](scripts/check-device-support.mjs) |
| OS02 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 | [記録](docs/os-development-design.md) · [記録](docs/phone-preview-20260911.md) · [記録](os/physical/frankel-source-lock.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| OS07 | Local Action Assistantの固定source・オフラインLLM契約・署名限定Binder client/server・APK staging gateを実装 | 完了 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-action-assistant-source-lock.json) · [記録](docs/evidence/local-ai-overlay-validation-20260915.json) |
| OS08 | Local Action AssistantのKotlin・arm64 APKをnative buildし、artifact lockとSoong OS imageへ接続 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](.github/workflows/local-ai-apk.yml) · [記録](scripts/build-local-ai-apk.sh) · [記録](scripts/stage-local-ai-apk.py) · [記録](os/physical/local-action-assistant-artifact-lock.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) |
| OS09 | 確定した対象端末でGGUF import・機内モード推論・変更確認・30分連続温度試験を完走 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](docs/evidence/android-pixel-10-gl066-local-ai-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) |
| OS10 | Tool／MCP／Provider共通APIとnative Zema選択Tool経路、本人承認、Wallet台帳、暗号化backup、署名更新gateを実装 | 進行中 | [記録](docs/platform-core.md) · [記録](docs/os-prototype.md) · [記録](contracts/platform-api.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](scripts/check-android-release-architecture.mjs) · [記録](tests/android-release-architecture.test.mjs) · [記録](android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl) · [記録](android/automation/src/main/java/dev/rock/automation/RockPlatformService.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/tool-sdk/src/main/java/dev/rock/sdk/ZemaToolPlan.java) · [記録](docs/evidence/android-zema-selected-tool-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](android/sepolicy/private/rockstar_platform.te) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceCapabilitySnapshotTest.java) · [記録](contracts/device-capability-snapshot.json) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](scripts/check-os-contracts.mjs) |
| OS11 | Platform CoreをAOSPでbuildしSELinux enforcing boot、production署名更新、OTA rollbackを実機検証 | 未着手 | [記録](docs/platform-core.md) · [記録](docs/phone-preview-20260911.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| G03 | Web DBの保存境界・互換migration・重複防止checkを整理 | 完了 | [記録](docs/data-storage-boundaries.md) · [記録](scripts/check-web-schema.mjs) · [記録](tests/migration-union.test.mjs) |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/product-north-star-20260915.md) · [記録](docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](app/api/earnings/receipts/route.ts) · [記録](lib/earning-bridge.ts) · [記録](tests/earning-bridge.test.mjs) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) · [記録](docs/evidence/pixel-tool-wallet-correlation-20260916.json) |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| B06 | ココナラ代表受注・制作担当者への個別発注と入出金を安全に管理 | 進行中 | [記録](docs/sky-tools-complete-design.md) · [記録](docs/workstreams/09-business-pilots.md) · [記録](app/sky/tools/[toolId]/page.tsx) · [記録](components/coconala-team-workspace.tsx) · [記録](app/api/coconala-team/route.ts) · [記録](lib/coconala-team.ts) · [記録](tests/coconala-team.test.mjs) · [記録](tests/coconala-sky-entry.test.mjs) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/os-readiness-audit-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) · [記録](docs/evidence/rls01/final-d6-ci-20260910.json) · [記録](docs/evidence/rls01/final-d6-root-audit-20260910.json) · [記録](docs/os-local-final-20260910.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](docs/implementation-checkpoint-20260909.md) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-contract-implementation-plan.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| N04 | Pixel 10受入後だけ二機種目のDevice Support Package候補を再評価 | 未着手 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) · [記録](docs/release-followup-20260910.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH03 | production署名・保護環境・失効運用 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/sites-owner-private-20260913.json) |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH07 | 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了 | [記録](docs/backend-launch-20260912.md) · [記録](docs/evidence/launch/backend-rc3-local-20260912.json) · [記録](systems/rock-star-os/scripts/verify-backend-launch.py) · [記録](systems/rock-star-os/tests/test_hub.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| FB01 | Instagram運用・受注型ブランド管理をRockstarOS Hub商品とMCPへ統合 | 完了 | [記録](docs/fashion-brand-ops-integration.md) |
| FB02 | 売上・数量・粗利・期限からCampaign Autopilotの計画と次アクションを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB03 | DM履歴・購買意向・顧客情報からAI Sales Conciergeと営業パイプラインを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB04 | 入金確認後の制作計画・原価・納期・工程をProduction Cockpitで管理 | 完了 | [記録](toolkits/fashion-brand-ops/db/migrations/003_autonomous_operations.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB05 | 改善版Skyの役割フィードへブランド運営役と40 MCP操作を統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| FB06 | Instagram画面の写真から未確認候補を作り、Meta確認後だけ運用対象へ進める | 完了 | [記録](docs/instagram-photo-onboarding-20260912.md) · [記録](toolkits/fashion-brand-ops/db/migrations/004_screenshot_account_intake.sql) · [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) · [記録](components/fashion-brand-ops-runner.tsx) |
| BIL01 | 旧888 cents収益精算の試験実装を保持し、現行ToC料金は動線確定まで停止 | 完了 | [記録](docs/sky-billing.md) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](services/sky-billing/migrations/0002_earnings_settlement.sql) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 | [記録](docs/sky-billing.md) · [記録](docs/workstreams/03-wallet-billing-providers.md) · [記録](tests/billing-worker.test.mjs) · [記録](docs/evidence/launch/sky-billing-fee-hold-20260924.json) · [記録](lib/sky-commerce.ts) · [記録](lib/sky-commerce-store.ts) · [記録](lib/sky-stripe.ts) · [記録](components/sky-commerce.tsx) · [記録](drizzle/0018_sky_commerce.sql) · [記録](tests/sky-commerce.test.mjs) · [記録](tests/sky-stripe.test.mjs) · [記録](toolkits/esim-bootstrap/README.md) · [記録](toolkits/esim-bootstrap/core.mjs) · [記録](tests/esim-bootstrap.test.mjs) · [記録](lib/esimgo-webhook.ts) · [記録](app/api/esim/webhooks/esim-go/route.ts) · [記録](drizzle/0029_esim_profile_order_binding.sql) · [記録](tests/esimgo-webhook.test.mjs) · [記録](docs/provider-contract-readiness-20260930.md) · [記録](docs/evidence/esim-provider-idempotency-research-20261001.json) · [記録](lib/esimgo-provider.ts) · [記録](drizzle/0030_esim_provider_order_once.sql) · [記録](lib/esim-plan-catalog.ts) · [記録](lib/esim-public-catalog.ts) · [記録](app/api/esim/catalog/route.ts) · [記録](app/sky/esim/page.tsx) · [記録](components/esim-catalog.tsx) · [記録](components/sky-commerce.tsx) · [記録](components/sky-commerce.module.css) · [記録](tests/esim-public-catalog.test.mjs) · [記録](app/api/esim/orders/[orderId]/issue/route.ts) · [記録](app/api/esim/orders/[orderId]/status/route.ts) · [記録](app/api/esim/orders/[orderId]/reconcile/route.ts) · [記録](tests/esim-plan-catalog.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](lib/esim-install-material.ts) · [記録](app/api/esim/orders/[orderId]/install-material/route.ts) · [記録](components/esim-purchase-setup.tsx) · [記録](drizzle/0031_esim_install_material_delivery.sql) · [記録](tests/esim-install-material.test.mjs) · [記録](scripts/check-work-api.mjs) · [記録](drizzle/0032_esim_order_pricing_snapshot.sql) · [記録](lib/esim-reconciliation-worker.ts) · [記録](tests/esim-reconciliation-worker.test.mjs) · [記録](systems/rock-star-os/os/mcp_broker/broker.py) · [記録](systems/rock-star-os/tests/test_mcp_broker_core.py) · [記録](systems/rock-star-os/docs/MCP-BROKER.md) · [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/src/blackberryrock/wallet.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) · [記録](docs/value-spend-runtime.md) · [記録](scripts/check-sky-a2a-workflow.mjs) · [記録](tests/a2a-broker-authorization.test.mjs) · [記録](tests/a2a-client.test.mjs) · [記録](tests/a2a-delegation-store.test.mjs) · [記録](tests/a2a-usage-receipt.test.mjs) · [記録](services/sky-agent-runtime/vitest.config.ts) · [記録](services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs) · [記録](docs/evidence/sky-a2a-workflow-local-20260930.json) · [記録](docs/workstreams/07-android-device-local-ai.md) · [記録](docs/evidence/esim-host-validation-20261001.json) · [記録](lib/esim-device-entitlement.ts) · [記録](lib/esim-device-entitlement-store.ts) · [記録](app/api/esim/orders/[orderId]/device-entitlement/route.ts) · [記録](android/core/src/main/java/dev/rock/core/platform/EsimDeviceEntitlement.java) · [記録](android/core/src/test/java/dev/rock/core/platform/EsimDeviceEntitlementTest.java) · [記録](android/core/src/test/resources/esim-device-entitlement-p256-vector.json) · [記録](docs/evidence/android-esim-gateway-contract-20261001.json) · [記録](drizzle/0035_esim_device_gateway_entitlements.sql) · [記録](tests/esim-device-entitlement.test.mjs) · [記録](components/esim-purchase-setup.tsx) · [記録](android/automation/build.gradle) · [記録](android/automation/src/main/java/dev/rock/automation/EsimDeviceGatewayKeyStore.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/EsimDeviceGatewayKeyStoreTest.java) · [記録](drizzle/0036_nostalgic_miek.sql) · [記録](app/api/sky/a2a-delegations/[id]/wallet-settlement/route.ts) · [記録](systems/rock-star-os/scripts/accept-cloud-wallet-handoff.py) · [記録](docs/evidence/a2a-cloud-python-wallet-handoff-20261001.json) · [記録](services/android-attestation-verifier/README.md) · [記録](services/android-attestation-verifier/UPSTREAM.json) · [記録](services/android-attestation-verifier/src/main/kotlin/dev/rock/attestation/AttestationVerification.kt) · [記録](services/android-attestation-verifier/src/main/kotlin/dev/rock/attestation/Main.kt) · [記録](services/android-attestation-verifier/src/test/kotlin/dev/rock/attestation/AttestationVerificationTest.kt) · [記録](docs/evidence/android-key-attestation-verifier-20261001.json) · [記録](lib/android-key-attestation-client.ts) · [記録](tests/android-key-attestation-client.test.mjs) · [記録](drizzle/0038_android_attested_gateway_keys.sql) · [記録](docs/evidence/android-key-attestation-verifier-20261001.json) · [記録](tests/esim-device-entitlement-store.test.mjs) · [記録](contracts/device-capability-snapshot.json) · [記録](android/core/src/main/java/dev/rock/core/platform/EsimProvisioningCompatibility.java) · [記録](android/core/src/test/java/dev/rock/core/platform/EsimProvisioningCompatibilityTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/DeviceCapabilitySnapshot.java) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceCapabilitySnapshotTest.java) · [記録](android/shell/src/main/java/dev/rock/shell/MainActivity.java) · [記録](tests/sky-marketplace.test.mjs) |
| BIL03 | メルカリを最初の収益経路として出品準備・費用計算・承認・未照合売上の安全な状態管理をSkyへ追加 | 完了 | [記録](docs/mercari-revenue-loop.md) · [記録](lib/mercari-revenue.ts) · [記録](app/api/revenue/mercari/route.ts) · [記録](components/mercari-revenue-starter.tsx) · [記録](tests/mercari-revenue.test.mjs) |
| CSV00 | CSV仕事の35作業を名前空間付きで管理し、コード完成と外部実績gateを分離 | 進行中 | [記録](data/csv-business-tasks.json) · [記録](docs/csv-business-v1.ja.md) · [記録](lib/csv-transform.ts) · [記録](lib/csv-job-store.ts) · [記録](components/csv-business-workspace.tsx) |
| G04 | 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合、SPIDERの検証を継続 | 進行中 | [記録](docs/git-consolidation.md) · [記録](docs/evidence/common-foundation-integration.json) · [記録](tests/sky-zema-contract.test.mjs) · [記録](tests/shared-stripe.test.mjs) · [記録](tests/mcp-client.test.mjs) · [記録](tests/owner-revision-json-store.test.mjs) · [記録](docs/evidence/pr-consolidation-20261005.json) · [記録](docs/research/rockstar-patent-research.html) · [記録](docs/research/rockstar-patent-sources.json) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | 旧b8287bc候補のOS起動・安全基礎（現rc2の全体合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をSkyで実処理・保存 | 合格 | V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) · [記録](docs/value-spend-runtime.md) · [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| V01-ACCEPT | V01 | 旧9abf78a候補でD0〜D6縦断合格（現rc2へ転用しない） | 合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/gx00/integration.json) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 合格 | GX00-ISOLATION | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) · [記録](docs/evidence/release-candidate-9abf78a/native-ci.json) · [記録](docs/gx01-dx01-acceptance-20260910.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 合格 | GX01-CONTRACT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| PREVIEW-INSTALL | RLS01 | 旧9abf78aのfresh導入・起動・保存・復旧・削除を完走（現rc2へ転用しない） | 合格 | V01-ACCEPT | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) |
| ANDROID-PREFULL | OS11 | 有料full build前に単体APK・emulator・純正Pixel offline AI・Sky→Zema→Tool→Walletを完走してfreeze | 未合格 | PREVIEW-INSTALL | [記録](docs/phone-preview-20260911.md) · [記録](docs/product-baseline.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](tests/product-baseline.test.mjs) · [記録](tests/test_prepare_phone_build.py) · [記録](tests/test_stage_local_ai_apk.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| DEVICE-INSTALL | RLS02 | 初回flash gate 4/4後、対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL · ANDROID-PREFULL | [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |

次の作業: Canonical offer is physical SIM/eSIM-led RockstarOS service access across purchase channels; carrier activation, service entitlement, account, OS/client install, cloud execution and AI billing remain distinct states. The local signed claim issuer and encrypted/idempotent seller delivery API are implemented; the Android Shell quote→device-credential Wallet hold→Broker proof→explicit Cloud approval→same-ID recovery source flow is wired and locally contract-tested. Current repository verification passes: Node 757/757, Worker/D1 API 1,048 assertions, CSV Worker/D1/R2 113 assertions, Fashion 19/19, typecheck, product lint, production build and release checks. Next run Android Core/AIDL/APK/instrumentation on an equipped CI/device host; then connect contracted seller checkout/delivery, carrier, Provider rates/meters/invoices and funded settlement. Production D1 readback is 0/6; local fixtures are not production billing, carrier activation, or successful exact-SKU OS installation.
<!-- project-status:end -->

## 次段階の設計

今後は [製品ベース](docs/product-baseline.md) と [次の実行プロンプト](docs/prompts/os-operational-base-next.md) に従い、native OSの稼働受入、既存商品の実利用、Wallet、作者向けゲーム連携へ進めます。従来のG0→Cuttlefish→Pixel→StoreはAndroid/AOSPの過去計画。旧 [初期仕様](docs/product.md) は履歴として保持します。

## 2026-09-20 — avocadoMini製品サイト全体のデザイン統一

利用者の指示で、センサーが正面を向く場面の深い青と青白い光を、冒頭、製品ハイライト、デザイン説明、価格、OS導入案内、導入・クラファンの下層ページまで共通の表現にした。冒頭の早すぎる価格表示を取り除き、一周後だけに残した。390px幅では光の位置と見出しの折り返しを調整。製品Site v18（source `12801994b732746f6a1eccc7b1e0e5d1296001d7`）を公開し、公開画面で見出しが1行であることを確認した。GitHub mainは未反映で、既存PRへ更新する。

# 2026-09-21 — Rocket Star orbital communication access page

- Added `/rocket-star/` as a dedicated public concept page for a planned orbital communication network connecting Rocket Star spacecraft with compatible avocadoMini hardware through RockstarOS.
- Created original orbital artwork in the avocadoMini satin-metal and cyan-sensor language, plus a full-height scroll sequence covering launch, relay, receiver hardware, and future software activation.
- The page explains that a RockstarOS update still requires certified radio hardware, spectrum access, service availability, and network validation. It does not claim that software alone can add missing receiver hardware.
- Funding access remains fail closed. No payment, investment, reward, ownership, return, or launch allocation is accepted until the operator identity, mission scope, use of funds, contributor rights, schedule, risks, cancellation terms, and payment handling are published.
- Published as avocadoMini Site v33 from source `c1fa00ab7299d2c4174c0e55fdeee397e537f18b`; the public `/rocket-star/` route, artwork, navigation, scroll chapters, receiver explanation, and disabled funding state were verified on desktop and mobile layouts.

# 2026-09-21 — Rocket Star ground-to-orbit launch film

- Rebuilt `/rocket-star/` around three messages only: Purpose, What it does, and Funding.
- Replaced the static orbit tour with an original multi-launch ground scene and a separate foreground Rocket Star that rises from its cyan launch ring, ignites, clears the ground, crosses the atmosphere, and reaches orbit as the visitor scrolls.
- Matched the avocadoMini visual language with black studio space, oversized white type, satin metal, cyan sensor light, soft blur transitions, a compact progress rail, and responsive mobile composition.
- Funding stays display-only and fail closed. The call to action remains disabled and explicitly states that payments are not open.
- Published as avocadoMini Site v34 from source `1a78977a0b9272310dfc7e2a062c2ff8bafd7b2e`; the public route and desktop/mobile layouts were verified before release.

## 2026-10-01 — Cloud A2A利用receiptをnative Walletへ渡すfixture

Cloud Workerとnative Wallet間でusage amount fieldを統一し、Node/Python双方のEd25519 canonical signatureを共通RFC test vectorで照合。localhost DEVELOPMENT Hubではoperatorが`ROCKSTAR_A2A_TRUSTED_USAGE_KEYS`を設定した時だけverifierが有効になる。合成WalletにUSD 20.00をholdし、署名済み利用USD 6.50を確定、未使用USD 13.50を返すHub HTTP結合fixtureが通過。receipt 3件、Wallet runtime 17件、Hub API 10件、TypeScript全体・lint/build/API checks・`npm run verify`も成功し、API統合301 assertionsを確認した。RFC公開test keyとsynthetic balanceだけであり、production provider key、実資金、Cloud D1からnative deviceへの自動receipt配信／同期、provider sandboxや端末受入を示さない。全体release readinessは公開対象0/6 ready、Pixel初回flash gate 0/4のまま。次工程はcontract後のprovider task lookup/cancel/signed receipt sandbox受入、その後production key custody、D1-native Gateway配線、funded Wallet debit reconciliationと実端末受入。

## 2026-10-01 — A2A非同期taskの進捗・成果・利用量を縦断検証

Workers Vitestの管理下にある制御service-binding Agent Card／A2A 1.0 test agent fixtureが`SendMessage`受付後にtask IDを返し、別のreconciliation実行でsubmitted→working→completedへ進む試験を追加。terminal状態になった段階で暗号化artifactを保存し、owner/job/task/agentに束縛された署名済みusage receipt 42 centsだけを子予算から一度settleすること、途中では予約を保持すること、remote send claimを二度作らないことを確認した。`npm run sky:a2a:workflow:positive` 4/4、独立Node/Python agent相互運用7/7、typecheck、Worker dry-runが成功。これはlocal Worker/D1 fixtureであり、実Providerのtask reconciliation、請求仕様、production credentials/D1、実端末Cloud Gatewayの受入ではない。Provider sandbox契約後に同じケースを実装接続先へ適用する。

2026-10-01 全体検証: 非同期task fixture追加後に`npm run verify`がexit 0。Node 530/530、release-signing 64/64、Worker/D1 API 301 assertions、型・lint・production build・bundle/assets checksが成功。個別のCloudflare Workers Vitest 4/4とNode/Python A2A interop 7/7も成功。公開対象は0/6 ready、Pixel初回flashは0/4、production D1 readbackは0/6のまま。実Provider・production・実機受入の証拠ではない。

## 2026-10-01 — eSIM導入UIの契約準備記述を実装証拠へ同期

`components/esim-purchase-setup.tsx`とeSIM host evidenceを読み、供給元準備書の導入UI記述を修正。購入履歴向け画面は状態照会、本人の明示操作による導入情報取得、検証済みApple/Android install linkまたは手動LPA情報の表示、導入後のサーバー暗号文削除を備える。一方、サインイン済みブラウザー受入、QR画像fallback、購入前の能力判定、実LPA導入、端末導入証明と利用権接続は未受入と明記した。製品コードや発行gateは変更していない。`docs/evidence/esim-host-validation-20261001.json`の38/38はhost fixture試験であり、画面・Provider・実機受入へ換算しない。

## 2026-10-01 — eSIM注文状態と端末導入／OS利用権を分離

公式Android API資料を確認。注文profileがSky orderへbinding済みでも、通常アプリが端末内のeSIM追加完了を直接検証できるとは限らない。`EuiccManager.downloadSubscription`管理にはsystem permissionまたはcarrier privilegeが関わり、active subscription一覧には`READ_PHONE_STATE`またはcarrier privilegeが必要なため、既存の最小権限方針（ICCID/EID/profile一覧を読まず、`READ_PHONE_STATE`を要求しない）を維持。eSIM status APIは`providerProfileBoundToOrder`、`deviceInstallState=unverified`、`esimDeviceEntitlementState=not_connected`を別々に返し、導入UIにも未確認を表示する。API status assertionsを追加し、全38 eSIM tests、Worker/D1 API 315 assertions、全体`npm run verify`（Node 537件・Fashion 19件・production build）が成功。これはhost/local fixtureで、Android LPA、signed provider/OEM install proof、実機利用権有効化の受入ではない。契約先には注文digestとowner/device challengeへ結ぶ署名付きinstall receipt、またはcarrier/OEM privileged pathの提供可否をsandbox質問として求める。

## 2026-10-01 — eSIM初期Agent PackをSky Package版へ固定

eSIM server planに初期pack ID・版・Sky Package key/manifest SHA-256を必須化し、既存pricing snapshotのcanonical JSON/hashで注文単位に固定した。新規issue直前に現行Sky Registryから正確なPackageを引き直し、`verified`・期限内review・manifest再計算hashが全件一致しなければProvider送信より前に拒否する。Lifeline／Developerは別packを選択できる。parser拒否、現在review済みのexact manifest許可、未審査・失効相当・hash違い拒否、注文snapshotの再利用、別pack型を試験。eSIM host suite 40/40、Worker/D1 API 315 assertions、typecheck、lint、Agent Runtime dry-runは通過。全体の`npm run verify`もこの変更を含めてexit 0（Node 539/539、Fashion 19/19、Worker/D1 API 315 assertions、production build成功）。これは初期候補packageを固定する処理で、Sky Packageを端末へ導入・有効化・実行許可する処理ではない。実Lifeline/healthcare・Developer package登録、install proof、entitlement activation、provider sandbox、実機受入は残る。

## 2026-10-01 — eSIM install proofから端末利用権へのgateway adapter

有料・未返金Sky注文へboundされたprofileと、現在trustedなcarrier/OEM install receiptを前提に、owner-only `POST /api/esim/orders/{orderId}/device-entitlement`を追加。5分challengeはowner/device/order/profile digest、install receipt hash、現在review済みstarter-pack ID/version/bundle hashを固定する。端末gatewayのdomain-separated Ed25519またはES256 (ECDSA P-256/SHA-256) receiptは運営管理`ESIM_DEVICE_GATEWAY_KEYS`のexact owner/device/key/algorithmと照合し、D1で一度だけentitlementを保存する。重複submit、別owner/device/manifest、install issuerまたはdevice keyの失効、返金・package driftをfixture試験し、Status APIと購入UIにactive／pending／revokedを分けて表示する。Android互換ES256署名を含むeSIM host 50 tests、53-table schema、Worker/D1 API 375 assertions、typecheck、lint:product、production buildは通過。full `npm run verify`は後続のdated implementation noteで記録する。ES256は署名受入のみで、Android attestation/Binder gateway/実機統合ではない。

この変更を含む`npm run verify`はexit 0（Node 548/548、Fashion 19/19、Worker/D1 API 375 assertions、typecheck、lint、production build、bundle/assets checks）。これはsigned test keyのhost/local fixtureである。実OEM hardware-backed key enrollmentとattestation、OS build binding、Android Binder gateway wire、実carrier/OEM install receipt、provider sandbox、production trust/D1は未受入。端末通常アプリのread_PHONE_STATE権限を増やさず、ICCID/EIDを読まない。実機のactive entitlementとは記録しない。

同日、Android hardware-backed P-256鍵に合わせES256 receipt検証を追加し、署名方式をtrust entryごとに固定した。eSIM host suite 50/50、typecheck、対象ファイルlintが成功。更新後の`npm run verify`もexit 0（Node 549/549、Fashion 19/19、Worker/D1 API 375 assertions、production build、bundle/assets checks）。release readinessは0/6、Pixel実機flashは0/4 gateのまま。合格範囲はhost/local fixtureまでで、Android attestation、Binder gateway、OEM/provider sandbox、production trust key/DB、実機eSIM導入・通信は未受入。

## 2026-10-01 — Android鍵attestation verifierの隔離JVM実装

公式`android/keyattestation`を固定commitでvendoringし、Google root trust anchors／オンライン失効確認を使うJDK 21 verifier serviceを追加。fresh challenge、完全一致する許可package・minimum version・signing digest、TEE/StrongBox、locked Verified Boot、P-256鍵を要求し、既定でloopbackへbindする。service policy/parser test 4/4とupstream test 180/180が成功。[証拠](docs/evidence/android-key-attestation-verifier-20261001.json)。これはサーバー側の検証部品とhost testsまで。Worker/D1 enrollment、AndroidKeyStore/Broker/AIDL、production config/deploy、Android SDK/device試験、OEM eUICC install proof、Provider sandboxは未受入。

同日、Workerのdevice-entitlement routeへ認証済みVerifier clientとD1のattested gateway-key registryを接続するsource implementationを追加した。challengeに結びつくcertificate chainだけをVerifierへ送り、検証済み鍵とpaid/unrefunded order entitlementをD1 batchで登録する。Verifier service 4/4、pinned upstream 180/180、client boundary tests 4/4、typecheck、database:check (109 tables) は成功。既存Worker/D1 API 410 assertionsはstatic/operator-key経路で、新dynamic routeのVerifier→Worker→D1 end-to-end acceptanceではない。AndroidKeyStore enrollmentとBroker/AIDL呼出し、Android SDK/実機、production TLS/config、OEM/provider evidenceは未受入。

## 2026-10-01 — Android Core eSIM receipt builderとchallenge context

device-entitlement challenge responseへowner/order/profile digest/device/install receipt hash/starter pack ID/versionを`receiptContext`として追加した。Android-independent Java Core `EsimDeviceEntitlement`はこのcontextをcarrier/OEM installer adapterの`verified + installedEnabled` evidenceへ照合し、hardware-backed P-256 key adapterからdomain-separated ES256 receiptを生成する。Java JCA DER signatureを64-byte P1363へ変換し、自分のpublic keyでも署名を検証してから返す。challenge期限切れ、別owner/order/profile/device/install hash、evidence無し・未有効、software/revoked/別曲線keyを署名前に拒否する。ICCID/EIDやprofile secretを処理せず、Android telephony permissionも追加していない。

Java Core 51/51 JUnit、eSIM host suite 51/51、JavaとTypeScriptの共通canonical vector、typecheck、対象lint、production build、Worker/D1 API 376 assertionsを確認した。更新後の`npm run verify`はexit 0（Node 550/550、Fashion 19/19、Worker/D1 API 376 assertions、build、bundle/assets checks）。AndroidKeyStore実装・key enrollment/attestation、Broker AIDL/Binder wiring、実OEM eUICC install evidence、APK/instrumentation build、provider sandbox、production credentials/database、実機eSIM接続は未実施。release readinessは0/6、Pixel初回flash gateは0/4。

2026-10-01の後続確認では、Android attestationクライアント境界テスト4/4、typecheck、database:check (109 tables)、従来Worker/D1 API 410 assertionsが成功した。新しい動的Verifier→Worker→D1経路をMiniflareへService Binding mockで接続する試験も試みたが、APIハーネスからmockへ到達せず503 `device_key_attestation_unavailable`となった。試験ハーネスを通せていないため、動的routeの統合合格とは記録しない。次はMiniflare互換のNode handler bindingまたはJVM/local HTTP統合ハーネスで、支払済みorderからattested key/entitlementのatomic保存、重複/replay、status/revocationを通す。

## 2026-10-01 — repository regression and A2A workflow recheck

`npm run verify` passes after removing an unused Android verifier-client helper and updating the DB/migration tests for the added `esim_device_gateway_keys` table (web schema 55, all D1 boundaries 109, migrations 39). It includes the full Node suite, typecheck, product lint, production build, asset closure, and Worker/D1 API (410 assertions). Separate `npm run sky:a2a:workflow:test` confirms restart recovery and fail-closed no-proof/expired-proof/revoked-proof behavior; `npm run sky:a2a:workflow:positive` passes 4/4 Cloudflare Workers Vitest cases, including an independent fixture agent and ambiguous-send no-retry. Both A2A checks are local fixtures, not production cloud or provider acceptance. Release readiness remains 0/6 public targets ready and first Pixel flash 0/4. The dynamic Android attestation route is still not end-to-end accepted: current Miniflare V4/Workerd harness fails to deliver configured service/outbound binding mocks; retain that as a test-harness gap and do not treat the source wiring as verified.

## 2026-10-01 — eSIM device-entitlement D1 atomicity

Added `tests/esim-device-entitlement-store.test.mjs`, which applies the repository's commerce, provider-order, install-receipt, device-entitlement, and attested-key migrations to Workerd D1. It passes 4/4 checks: attested P-256 public key fingerprint and key row are saved with the entitlement in one batch; only a paid, unrefunded order with a matching signed-install receipt and live unused challenge qualifies; replay is idempotent; refunded orders and expired challenges leave neither key nor entitlement. A missing migration in the first fixture setup was corrected to apply 0036 before 0038. This is component-level D1 acceptance; it does not prove the API route invoked the JVM verifier, and dynamic route acceptance remains pending because the current Miniflare test harness cannot dispatch a service-binding mock.

Current re-run after adding the Workerd D1 store suite: `npm run verify` exits 0. This now includes the new 4/4 eSIM gateway-key persistence tests. It still does not run the dynamic attestation API route through a verifier binding; that integration remains explicitly pending.

## 2026-10-01 — active A2A task recovery after durable Workflow restart

Extended the local Cloudflare Workers workflow acceptance to restart the same reconciliation Workflow after its external task has reached `working`. The restarted controller reads the persisted remote task ID, completes reconciliation, captures the encrypted result, settles the signed fixture usage once, and preserves one remote-send claim. `npm run sky:a2a:workflow:positive` passes 4/4. Evidence: [active task restart fixture](docs/evidence/a2a-active-task-workflow-restart-20261001.json). Miniflare prints engine-abort diagnostics for explicit restart and deliberate failure fixtures while Vitest exits 0. This is a local durable-checkpoint test, not process loss during an in-flight activity or provider/production acceptance. Cloudflare production, contracted task lookup/cancel, funded Wallet, and native device Gateway are still pending.

## 2026-10-01 — full regression and separate Worker process restart recheck

After the active-task fixture change, `npm run verify` passes: Node 595/595, Fashion 19/19, Worker/D1 API 424 assertions, typecheck, product lint, production build, and asset checks. `npm run sky:a2a:workflow:test` also passes across two local Wrangler/Workerd processes sharing synthetic D1: three prepared jobs survive process restart and fail closed before Agent discovery because Broker proof is absent, expired, or revoked; there are zero remote send claims. [Recheck evidence](docs/evidence/a2a-cloud-recovery-recheck-20261001.json). Release readiness remains 0/6 and Pixel first-flash 0/4. Android build and instrumentation remain unrun because this host has no Java runtime or Android platform/build-tools, and ADB cannot start its local daemon.

## 2026-10-01 — eSIM provider response-loss contract gate

Rechecked the current official eSIM Go API schema and clarified a material recovery gap: `POST /orders` debits the organization balance and returns `orderReference`, while its published request schema does not list a caller idempotency key/reference; `GET /orders/{orderReference}` requires the reference. If the accepted POST response is lost, the current safe behavior is to keep the paid order in `reconciliation_required` and never issue another debit, but it cannot automatically recover the profile. Date-filtered order-list matching is not proof of a unique job correlation. 1GLOBAL documents general Idempotency-Key handling and a default 24-hour retention, but its exact activation-order endpoint support is still unconfirmed. Added exact endpoint/replay requirements to the provider contract gate and kept issuance default-off. [Research evidence](docs/evidence/esim-provider-idempotency-research-20261001.json). This is a public-doc review and local policy clarification, not provider contract or sandbox acceptance.

## 2026-10-01 — A2A remote cancellation after restart

Added a controlled Cloudflare Workflow case that dispatches a working task, persists the cancellation request, receives `TASK_STATE_CANCELED` from the A2A agent, and settles its signed final usage receipt once. The new restart check exposed that a completed cancellation could be polled again after Workflow restart; reconciliation now returns from the persisted terminal state before Agent discovery or another provider request. `npm run sky:a2a:workflow:positive` passes 5/5, including one remote cancel claim and 11 minor units settled from the held fixture reservation. [Evidence](docs/evidence/a2a-cancel-workflow-local-20261001.json). This is local controlled-agent evidence only; production cloud stop enforcement, provider cancellation semantics, funded Wallet settlement, and offline-device UI remain unaccepted.

## 2026-10-01 — remote completion wins the cancellation race

Extended the Cloudflare Workflow fixture so `CancelTask` may return a terminal completed task instead of a canceled task. Reconciliation preserves `remote_completed`, captures and encrypts the returned artifact, settles the matching signed usage receipt once, and does not issue another request after restart. `npm run sky:a2a:workflow:positive` passes 6/6, including the canceled and completion-wins cases. [Race evidence](docs/evidence/a2a-cancel-completion-race-local-20261001.json). This exercises a controlled local A2A service; the provider-specific race contract, production worker stopping, and Wallet handoff still require external acceptance.
## 2026-10-01 — SIM/eSIMをRockstarOSサービスの入口とする製品方針へ更新

利用者の最新要件を製品正本として採用。物理SIM/eSIM購入にRockstarOS、Sky、Zema、Agentの利用権を含めるサービスを主製品にし、OS binaryをSIMへ格納する想定やeSIMのみ/OS内eSIM store/ハードウェア先行の前提を退けた。RockstarOS公開入口(`/rockstaros`)をSIM/eSIMサービス案内へ変更し、R5のturntableページは独立した`/avocado-mini`へ分離。Homeに利用開始案内を追加し、端末適合→回線有効化→一度のRockstar ID連携→正確な端末でのOS導入または既存OS client/browser→Sky/Zemaという導線を示した。別のavokado public site sourceもサービス案内へ差し替えたが、本番publishはしていない。AGENTSと現行実行promptも新方針へ揃えた。product baseline、全体設計、Android workstream、Cloud価格/利用量要件、Skyローンチ設計、機械可読進捗へ反映し、SIM01を進行中に追加した。

監査で再利用可能と確認: A2A cloud workflow/restart/recovery、owner authentication、device capability/attestation、署名付きusage receipt、Walletの予算予約、HomeのSky/Zema入口。未達: 複数販売チャネルの購入権claim、物理SIM fulfilment、carrier/eSIM activation、同一IDによるSIM購入権連携、provider別のproduction見積/live meter/itemized billing UI、Android OS/client/device受入、production cloud/provider acceptance。画面/host/Worker fixtureの合格を販売・請求・回線・OS導入の証拠にはしない。次は署名済みchannel-neutral entitlement claimと共通activation state、Zemaの価格見積/実行中残額/完了receipt表示を実装する。Root appのtypecheck/build/API Worker-D1 433 assertionsと全体`npm run verify`は通過。Astro本体はこのcheckoutに依存がなく静的site buildは未検証 (`astro: command not found`); source test 1/1は通過。本番public siteは未publish。

## 2026-10-01 — SIM service entitlement refund/revocation

Product correction follow-up: the claim path and `/connect` were already implemented as local source, with feature-flagged gates on Zema new work, Sky A2A/MCP, cloud LLM requests, and new agent delegation. Added Ed25519-signed issuer refund/revocation events at `/api/rockstar/entitlements/events`, event-ID replay idempotency, conflicting replay rejection, and one-way entitlement revocation in D1; the route is issuer-signed and does not accept a user session or PII. Added migration `0040` and updated migration-union expectation to 57 tables. Local built Worker/D1 API suite passes 496 assertions, claim tests 3/3, migration convergence 9/9, typecheck, `lint:product`, and production build. Full `npm run verify` was attempted: earlier product/readiness/schema checks and focused lint passed, but `npm test` still has failures in unrelated existing Stripe commerce tests (502 when test fetches Stripe) and migration-union table count (fixed afterward and focused convergence now passes); rerun remains pending. This establishes local implementation only. Production issuer contract/key deployment and real refund webhook, purchase/billing, carrier activation, and device-specific RockstarOS installation remain unaccepted; local usage and fixtures are not production billing evidence.

Further dispatch-boundary audit found that entitlement checks only on create/approve would leave a prepared Agent delegation dispatchable from Cloudflare Workflow after refund. Added checks to A2A approval, the Workflow immediately before execution, and the scheduled prepared-delegation scanner. Reconciliation and owner result/cancellation reads remain available. The local Workflow test revokes the seeded owner entitlement and verifies the task stays `prepared` with no remote task ID; `npm run sky:a2a:workflow:positive` passes 7/7. Rebuilt Worker/D1 HTTP suite passes 499 assertions, including approval denial after refund. This still does not prove production Workflow deployment or external agent/cost enforcement.

## 2026-10-01 — SIM/eSIM主導オンボーディングと料金透明化の監査・反映

要件監査では、channel-neutralな購入claim、/connect、owner authentication、entitlement失効、A2A cloud jobの継続・復旧、端末attestation境界、予算予約、最終Provider署名usage receiptを再利用できることを確認。eSIM profile/order/installはサービス利用権から分離し、物理SIM/eSIM購入にRockstarOS/Sky/Zema/Agentアクセスを含める方針、複数販売チャネル、短い利用開始、端末別OS/client/browser分岐を製品基準・設計・SIM01へ反映した。SIMにOS binaryを格納したりOS内でeSIMを購入させる前提は置かない。

Workbenchの通貨最小単位表示をISO通貨桁数に基づく金額表示へ修正し、利用者上限を見積と誤認させない説明、未接続のrate/quote/live meter gate、完了taskでのowner-scoped Provider署名usage receiptと内訳表示を追加。`docs/a2a-pricing-extension.md`にsigned rate card/quote、quote-only同意、request/Agent/rate版binding、最大額・親budget予約、署名receipt settlementをProvider契約用設計として記録した。価格表示テスト2/2、`npm run typecheck`、`npm run lint:product`、`npm run build`成功。Worker/D1 APIは直前の更新で499 assertions、Cloudflare Workflowは7/7、migration convergenceは9/9。ただし今回のUI/formatter変更後に全体`npm run verify`は再実行しておらず、直近の全体verifyをこの変更の証明に含めない。

実装済みとローカル確認済みなのは画面の金額換算・予約上限と見積の区別・既存署名usage receiptの表示経路、および局所テスト/buildまで。rate card/quote provider接続、実行中meter、paid dispatch受入、production billing、実購入claim連携、carrier activation、複数チャネルのfulfillment、実端末OS installationは未受入。次は残り全有料Sky Tool/Broker/background enforcementのbypass監査と、provider-independent quote/receipt validation boundaryを実装可能な範囲で進める。

## 2026-10-01 — A2A Broker entitlement gateと署名見積検証基盤

失効後も`/api/sky/a2a-delegations/{id}/broker-authorization`が端末Broker証明を登録できる監査漏れを修正。`ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED=true`で`agents` scopeを再検証し、ローカルWorker/D1 API試験でrefund済みownerからのBroker証明登録が403 `SERVICE_ENTITLEMENT_REQUIRED`となることを追加確認。既存結果・成果・cancel・settlement reconcile経路は閉じず、既に受付済みの仕事を利用者が照合できる境界を維持。API suiteは502 assertions、typecheck、product lint、production build成功。

Provider契約なしに進められるwire-level基盤として`lib/a2a-price-quote.ts`を追加。Ed25519 provider signatureと信頼鍵resolver、Agent HTTPS origin/名前/版、request hash、pricing version/hash、rate arithmetic、estimate合計、max amount、利用者budget cap、24時間quote期限を照合し、approval bindingに使えるsigned terms digestを計算する。合成keyのテスト4/4が成功し、改ざん・別request/版・誤算・budget超過・期限切れ・未知鍵を拒否する。

この時点での未接続記録は次の2026-10-01追記で更新した。signed quoteの受付・保存・一回限り制約・approval/Broker/Wallet binding・dispatch前検証、D1へのProvider署名rate-card登録/失効、estimate-only API/Zema表示は実装済み。quote-only Provider API、実Providerによる価格/メーター意味受入、live meter、最終usage照合、production billingは未実装または未受入。有料実行は既定無効のままである。

## 2026-10-01 — A2A価格quoteをapprovalとdispatchへ固定

監査で再利用: Cloudflare durable Workflowの受付・進捗・継続・復旧、owner認証、端末attestation/Broker proof、予算予約、署名usage receipt、Sky/Zema入口。変更が必要だったのは、quote verifierが単体のままで委任API、保存、owner承認、Broker証明、Wallet hold、dispatch前検証へ結ばれていない点。missing: Providerからのquote-only取得と明示同意、rate-card registry/contract、見積表示、実行中meter、production billing、carrier購入・activation、実端末OS導入受入。

migration `0041_a2a_price_quotes.sql`で署名quoteとdigestをdelegationへ保存し、partial unique indexで同じquoteの再利用を拒否する。作成時にrequest/agent/currency/max budgetを検証し、digestをowner approvalとnative Broker authorizationへ追加。approvalは保存quoteの署名/期限とWallet reservation capの一致を確認する。Workflowは外部Agent discoveryより前に署名、request/agent binding、digest、期限、entitlementを再検証し、legacy quote-less prepared workは外部送信せず保留する。Provider quoteが取消・期限切れなら新しいquoteとidempotency keyを要求する。fixtureの別委任は別々の署名quoteを使い、APIでquote replay拒否も確認した。

ローカル検証: Worker/D1 API 540 assertions、Cloudflare Workflow 9/9、price quote/store/Broker関連28/28、quote verifier 4/4、typecheck、`lint:product`は成功。Workflowの意図的なrestart/failure fixtureはWorkerd engine-abort diagnosticを出すがsuiteはexit 0。直近API再試験で`text llm failed UNKNOWN_LLM_PROVIDER`も表示される既存fixture警告はあるが、suite passを妨げない。production buildとmigration convergence 9/9も後続で合格。これらは合成鍵・ローカルD1/Worker/Workflowの証拠で、production billing、外部Providerのquote/実行・課金、carrier activation、物理SIM fulfillment、端末OS installの証拠ではない。追加の価格gate受入は[local evidence](docs/evidence/remote-ai-price-gate-20261001.json)に記録。

## 2026-10-01 — 直接remote LLM経路の価格・利用権gate

経路監査で、`/api/llm/text`、`/api/legal-guidance`、`/api/patent-research`、`/api/jev-evaluation`がAgent A2Aの見積検証を通らず直接Providerへ送れることを確認した。特にLLM routeはremote consentと`SKY_REMOTE_LLM_ENABLED`があればprovider cost/usage capなしで実行可能で、legal/patent/Jevも同様にCloud flagとcredentialで外部送信できる実装だった。固定単価・task quote・user cap reservation・signed usage settlementが未接続なので、四routeを`REMOTE_AI_PRICING_GATE_UNAVAILABLE`でfail closedにした。Sky tool routesはfeature enforcement時に`sky` scopeも再確認する。LLM provider labelが`ollama`/`local-model`/`openai-compatible`でも、configured endpointがnon-loopbackならremote扱いして同じgateへ通す。local loopback providerとbrowser/OS内処理は引き続き別扱い。

Provider設定・Cloud flag・remote consentだけでは、Sky statusやTool cardに利用可能と表示しない。料金見積・上限管理の接続待ちと示し、法務local guide・patent draftは続けられる。API integrationはCloud flagと同意付きOpenAI要求の拒否、non-loopback Ollama/local-model/OpenAI-compatible endpointの拒否、Sky scopeがない利用者の拒否をWorkerd/D1 fixtureで確認。API 540 assertions、`npm run build`、`npm run typecheck`、`npm run lint:product`、Sky status 7/7はpass。A2A Workflow 9/9、quote/store/Broker 28/28、migration convergence 9/9、schema/database checksもpass。次はtrusted provider rate-card/quote-only protocolと費用見積UIを実装し、他の有料Tool/background/event pathsを監査する。すべてローカルのみでありProvider usage、production billing、実注文や決済の証拠ではない。

## 2026-10-01 — Provider署名rate cardと支出上限見積の基盤

直接remote LLMの価格gateを解除せず、Provider契約や実料金なしで進められる境界として`lib/remote-ai-rate-card.ts`を追加。operatorが信頼するEd25519鍵、provider/model/currency、pricing version、単価、公式またはHTTPS pricing source、発効/失効時刻を検証し、カード署名対象からdigestを生成する。入力はUTF-8 byte数+明示framing allowanceをtoken上限候補とし、ユーザー指定output-token上限との最大費用をBigIntで計算して通貨minor unitへ切り上げ、予算を超える場合はestimateを拒否する。テスト4/4で署名・改ざん・intent/key/source mismatch・期限・安全範囲・Unicode bound・切り上げ・budget capを検証。

これはrate ingestion・provider tokenizer/framing acceptance・tool/cache/other billable meters・同意UI・Wallet reservation・execution authorization・live meter・請求精算を含まない。従って直接remote LLMはfail-closedのまま。Providerのrate card/quote-only契約・API、画面上の見積と実行前の承認/上限超過承認、実行中支出、最終usage reconciliationを順に接続する必要がある。合成鍵のlocal testはproduction rate、usage、billing、carrier activation、SIM fulfillment、OS installの証拠ではない。

## 2026-10-01 — 認証済みLLM料金見積APIとZemaの見積表示

`POST /api/llm/estimate`はowner認証、remote-AI rate-limit、RockstarOS entitlement、厳密なprovider/model/currency、active operator-trusted key、署名・期限確認を通す。本文/system promptはRockstarOS API内で最大値計算にだけ使い、LLM Providerへ送らない。応答は`providerSubmission=not_performed`、`executionAuthorized=false`を明示し、利用者capを超えてもestimateを隠さず超過表示する。Provider署名料金表はmigration `0042_remote_ai_rate_cards.sql`のD1 tableへ不変IDで保存し、同じcard retryは冪等、変更ID再利用は拒否、失効は一方向とする。Bearer operator endpoint `/api/internal/remote-ai/rate-cards`から登録/失効し、現在のProvider key trust rootは`REMOTE_AI_TRUSTED_RATE_KEYS`から再検証する。5 KB環境変数制限はtrust key listだけに適用され、カード本文のcatalog上限ではない。

Zema composerは外部providerを選択した状態で「料金を見積もる」を実行し、最大費用、入力/出力上限、価格版、期限、source、通貨に合わせた一件ごとの支出capとcap判定を表示する。入力変更やProvider/model変更で旧見積を破棄する。現在は見積専用と明示し、paid execution routeは引き続きfail-closed。

検証: Worker/D1 API integration 572 assertions (entitlement/auth, no-card fail-closed, synthetic signed-card registration/idempotency/estimate/revocation, no Provider submission or execution authorization, cap超過でも見積保持); rate-card/quote focused tests 9/9; migration convergence 9/9; `npm run typecheck`, `npm run lint:product`, `npm run build` succeeded. Synthetic card/key are not Provider-supplied; prompt is not sent to an LLM Provider. This is not evidence of live price/usage, production billing, carrier activation, SIM fulfillment, or device OS installation. See [evidence](docs/evidence/remote-ai-estimate-api-20261001.json). Remaining next: Provider quote-only contract/API and accepted rate/meter semantics; signed per-request quote/consent authorization; atomic Wallet hold, live spend/stop policy, signed usage settlement and itemized task UI. Continue auditing paid Tool/background paths.

## 2026-10-01 — A2A委任の深さ・fan-out・同時実行制限

Requirement audit found that the existing parent-job shared budget prevented overspending but did not bound the number of draft/child delegations or concurrent tasks. A2A has no recursive parent-delegation graph: Rockstar creates only direct owner-authorized children of a root Zema job, and it does not pass owner credentials or a new Broker proof to a remote agent. Added D1 triggers in `drizzle/0043_a2a_delegation_fanout_limits.sql` to cap each root job at 8 delegations and 4 simultaneously active/pending delegations. `indeterminate` tasks retain a slot; terminal cancellation/completion releases concurrency. Idempotent recovery bypasses new-task limits only when the existing owner/idempotency record is reused. The API returns 429 with a stable code, and Workbench states the one-level, 8-task, 4-concurrent policy.

Worker/D1 API suite passes 622 assertions, including rejection of a fifth concurrent task, release/reuse after cancellation, rejection after the eighth total task, same-intent retries at capacity, and attempted recursive parent IDs. A2A Node/Python HTTP plus store/auth tests pass 31/31; Cloudflare Workflow/D1 suite passes 9/9 with the new migration; fresh/release/sites migration convergence passes 9/9. Runtime bundle dry-run, typecheck, product lint, production build and schema check pass. Limits are local-source policy and have not been applied/read back in production D1. External Provider internals cannot be prevented from self-delegating; recursive Rockstar-mediated delegation would require an explicit child-of-delegation contract, rights/budget attenuation and cycle detection before being enabled.


## 2026-10-01 — A2A実行中の署名meterと暫定支出表示

製品要件の再監査で、実行前の署名見積、上限予約、完了後の最終receiptはある一方、実行中の費用をProvider報告値で更新する接続契約が欠けていた。Provider契約がなくても境界を先に検証できるよう、`rock-a2a-provider-live-usage/1`累積snapshot、`POST /api/sky/a2a-delegations/{id}/usage-snapshots`、D1 migration `0044_a2a_live_usage_snapshots.sql`を追加した。

Ed25519署名とtrusted key、owner/root/delegation/task/Agent版/currency/price versionを検査し、sequence・issuedAt・累積費用の逆行、予約cap超過、異なる内容でのevent replay、終端後のmeter更新を拒否する。最終receiptは最後のmeter以上、同じProvider/task/price versionでなければ内部poolを精算しない。Zema/Workbenchはactive delegation中に10秒ごとに一覧を同期し、Provider報告累計を「暫定」として示す。署名final receiptとは別に表示し、meterが届かない場合に0円や推測額を出さない。

検証: `tests/a2a-live-usage.test.mjs` 1/1、Cloudflare durable Workflow/D1 9/9、`npm run test:api` 638 assertions（callback accept/idempotency/tamper/signature rejection/final reconciliation含む）、`npm run typecheck`、`npm run lint:product`、`npm run build`、`npm run schema:check`成功。記録は[local evidence](docs/evidence/a2a-live-usage-local-20261001.json)。これはlocal Worker/D1と合成Provider鍵による試験で、Provider sandbox通知/finality/reversal semantics、Provider側cap stop保証、funded Wallet reservation/debit、production billing/invoice reconciliationを受け入れたものではない。Provider契約確認項目を[contract readiness](docs/provider-contract-readiness-20260930.md)へ追加した。次は実Provider sandboxのquote/meter/cancel/reversal照合、権威あるfunded Wallet holdとAndroid handoff、paid Tool/background経路監査を進める。

## 2026-10-01 — SIM複数販売チャネルの契約境界

公式の1GLOBAL資料で、Connect APIによるpartner website/app/marketplace販売と他offerへのbundle、Consumer RSPでの店頭POS・個別QR/link・一括QR・in-app/eID配布を確認した。[provider contract readiness](docs/provider-contract-readiness-20260930.md#販売チャネル設計製品要件-2026-10-01)へ、Rockstarの複数販売チャネルは共通署名claimへ集約し、通信購入/開通、claim、端末適合/OS導入、AI利用料は別状態のまま追跡する契約項目を追加。[SIM entitlement design](docs/sim-service-entitlement-claims.md)にもissuer IDと配布チャネル台帳、個人情報/ICCID/eSIM秘密値をclaimへ含めない境界を明記した。公開API説明はeSIMの販売optionのみを示し、物理SIMの流通・国内再販権・Rockstarとの契約・実注文/発行は未受入。次は有料Tool/background provider egressを横断監査し、既存の認可/課金gateを通らない処理を閉じる。
## 2026-10-01 — Android-independent A2A Wallet hold・receipt精算・復旧

前回の端末usage receipt verifier単体から次の最優先実装へ進み、`PlatformStore` schema v4にA2A予算予約の永続状態を追加した。利用者がBrokerのexact job・price version・上限へ一度承認すると、既存Wallet ledgerからその額を保留し、他の支出は残額しか使えない。dispatch前の確認済み中止だけholdを戻し、dispatch済みで応答が不明なら予約を残す。端末復旧では`RECOVERY_REQUIRED`へ変換して再dispatchと先行解放を禁止する。Cloud/Python共有形式のProvider署名usage receiptを元のowner・job・delegation・task・agent・通貨・価格・上限へ再照合してから、exact debitを追記し未使用額を解放する。さらに`rock-a2a-wallet-settlement-handoff/1` envelopeと`a2a.budget.settle` commandをholdへ照合してから適用するCore入口を追加し、親job不一致のhandoff拒否も試験した。request keyとProvider receipt参照の一意性で再適用を防ぐ。

検証で合成Provider fundingから700 minor-unitをholdし、別の承認済み400支出を拒否、pre-dispatch release、indeterminate状態から650の署名receiptを一回精算、残350を返すことを確認した。別DBへ復元すると予約全額を保持した`RECOVERY_REQUIRED`になり、復旧後の再送/解放を拒否し、最終receiptのみで精算を再開する。Temurin 17／cached Gradle 8.11.1 offlineのAndroid Core JUnitは65/65、reservation/settlement/recoveryは3/3 pass。[検証証拠](docs/evidence/android-a2a-wallet-reservation-20261001.json)。

これはAndroid-independent Core fixtureであり、Android BrokerがCloud HTTP endpointからhandoffを取得してこの入口を呼ぶ配線、AIDL/APK/Binder実機受入、production trust key、実際に入金されたWallet、Provider契約/sandbox、請求・通信開通・SIM fulfilment・RockstarOS導入を証明しない。証拠にある合成残高とRFC公開test keyは顧客資金やproduction billingではない。次は残りの有料Tool/background egressを監査し、Android Broker/Shellの認証済みhandoff fetchとWallet UIへ接続する。その後、Provider sandboxとsupported-device受入を契約準備項目どおり確認する。

## 2026-10-01 — 遠隔MCPの「free」申告による直接実行を遮断

監査で、remote MCPが自身の`_meta['rockstaros.dev/pricing'].model = free`だけで単発実行へ進める穴を確認した。MCPには署名見積・Wallet予約・usage receiptの共通契約がないため、提供元申告をUIには「未検証」と表示しつつ、remote `free`も`prepare`で拒否する。local SDK descriptorはユーザーPC内の別経路として既存の一回承認を保つが、その`free`申告も外部サービス料金ゼロの証拠ではない。回帰testは合成remote MCPの表示と拒否を確認する。[証拠](docs/evidence/mcp-pricing-gate-local-20261001.json)。

同じ範囲でCloud LLM、法務、特許、Jevの直接remote routesは価格・上限・精算未接続のためfail-closed、料金付きCloud AgentはA2A quote/cap/live usage/final receipt経路へ限定されることを再確認した。今回の監査は該当connectorと記載routeのソース・fixtureを確認した範囲で、すべてのbackground egressの不存在までは主張しない。Focused connector/SDK tests 13/13 pass。これはlocal fixtureであり、Provider価格の真実性、契約受入、実利用量・本番請求、SIM開通やOS導入の証拠ではない。Android BrokerからCloud handoffを取得してAndroid Walletへ適用する配線と、残るbackground egress監査は未完了。

## 2026-10-01 — SIM/eSIM起点のAndroidサービスホームとCloud成果取得

要件監査で、共通Rockstar account link、Android Keystore内session vault、owner-scoped entitlement/A2A/LLM APIは再利用可能だが、Android ShellからCloudの利用権・仕事状態・成果を取得するauthenticated bridgeが欠けていると確認した。`GET /api/rockstar/device-home`を追加し、本人に限りSky/Zema/Agent access scope、利用権、直近LLM見積/状態/保存済み成果snippet、Agent状態とowner-only status/result endpointを返す。promptは返さず、請求確認済み・funded walletとは表示しない。

Android Brokerは暗号化sessionから固定originのHTTPS GETを行い、no-cookie/no-redirect、JSON/UTF-8/schema/size確認を実施する。AIDL v8はservice-homeに加え、種類と検証済みjob IDからのみLLM明細、Agent状態/meter/receipt、Agent成果APIのpathを構成し、利用者が選んだ記録だけをShellへ返す。Shellから結果を選択して取得できるsourceを追加した。取得URLを一覧endpointへ固定していた実装不整合も検出・修正した。

検証: `npm run typecheck`、`npm run build`、`npm run os:check`、`npm run baseline:check`、`npm run project:check`、`node --test tests/sim-service-entry.test.mjs`、対象Oxlint、`git diff --check` pass。`npm run test:api`の統合D1検証はlocalhost `listen EPERM 127.0.0.1`で起動できず未実行。`npm run lint:product`全体は既存WorkbenchのReact Compiler `setState`警告で失敗。Android SDKがないためAIDL/APK/Binder/deviceは未ビルド・未受入。これはlocal source/build evidenceであり、production billing/provider、実SIM回線、またはOS installの証明ではない。次はSDK/device受入のほか、Android native Cloud task送信の見積→明示予算承認→実行中料金・進捗→圏外継続→再接続成果取得をつなぎ、外部契約が必要な領域を別gateで維持する。


## 2026-10-02 — Android Cloud LLM見積・同意と料金明細

製品要件監査で、Android側は共有sessionによる仕事status/artifact readbackまで接続したものの、端末から依頼を準備し料金を確認する操作が不足していた。Broker-only HTTPS POSTで`/api/llm/quotes`へ見積要求を作成し、署名rate-cardの版/単価/出典、入力・出力上限、推定最大額、利用者が指定したjob cap、結果保存選択を表示するAndroid Shell UIを追加した。`remoteAiTextPublicRecord`とdevice-homeには検証済みrate-cardの公開用単価を追加し、provider key/signature/owner IDは含めない。A2A homeにはowner-bound最新累積meterの額・通貨・価格版・受信時刻を追加し、暫定値として表示する。

見積後の入力/cap/currency/save-result変更を端末が拒否し、server側request digestも照合する。別の同意checkboxと「支出上限を承認して実行」buttonからBrokerがquote capをreserve後、同じ本文を`/api/llm/text`へ送るsource経路も追加した。APIは価格acceptance gate、remote enablement、provider keyの三条件が揃うまで実行可と報告しない。現在の`remoteAiPricingGateAccepted()`は常にfalseのため、Android実行buttonは非表示でありProviderへ送信しない。送信後の通信不明は自動再送せず、pre-send状態で許される場合のみ取消を試す。quote reserveは予算予約であり請求・支払ではない。

直接LLM endpointは現状request/responseであり、端末切断後の独立継続を保証しない。durable Cloudflare Workflowで受付済みのA2A/Agent jobとは区別し、直接LLMのCloudflare Workflow化、実行中meter、停止/期限、offline/reconnect、final receipt/invoice整合は次の開発対象とした。

検証: TypeScript、production web build、OS/AIDL source contract、署名rate/public record・価格gate・SIM entry focused tests (13/13)、targeted OxLint pass。`npm run test:api`はloopback `listen EPERM`でD1統合を起動できず、Android SDK/APK/AIDL/Binder/端末試験は未実施。全体`npm run lint:product`はWorkbench React Compiler warning、production buildは既存chunk/CSS-name警告を出すが完了。provider契約、本番請求、carrier/eSIM開通、物理SIM出荷、RockstarOS installは受け入れていない。

## 2026-10-02 — 承認済みCloud LLMを永続queueへ接続

前回残っていた「直接LLMは同期HTTPで、端末切断後の継続はA2Aのみ」という差を埋めるため、Remote OpenAIの送信路を変更した。`/api/llm/text`は同期推論を待たず、quoteと予算予約・利用者同意・正確な入力digestを再確認した後、prompt/system/modelを専用AES-256-GCM鍵で暗号化してD1へ保存する。応答は永続受付receipt（202）で、推論結果ではない。owner/executionへ暗号学的に結合し、受付要求再送は同一暗号化input hashで照合する。

Sky Agent Runtimeのminutely scannerがreserved+encrypted inputのみを決定的`llm-{executionId}`Workflowへ渡す。WorkflowはownerのRockstarOS利用権、input暗号、現在有効な署名rate card、親budget予約を再確認する。quoteは承認の短い期限を持つが、受付済みqueueにはquote expiryから24時間の固定実行期限を保存し、承認済み仕事が圏外中にquote期限だけで失効しない。期限到達・停止・完了・不確定結果を分け、Provider sendには一意・不変のclaim行を使い、Workflow callback replay/dispatch後の結果不明で自動再送しない。端末はquote statusで受付済みqueue状態と期限を再取得でき、保存済みprompt本文をstatus APIへ返さない。Android UIの成功表示を「応答を記録」から「永続受付済み、後で進捗/成果取得」へ修正。

検証: remote pricing/rate, encrypted input, D1 store/state, queue expiry/privacy、database-status tests 29/29。`npm run typecheck`, `npm run build`, `npm run schema:check`, `npm run database:check`, `npm run baseline:check`, `npm run project:check`, `npm run os:check`, `npm run android:architecture:check`, 対象OxLint、Cloudflare Worker dry-run bundle、`git diff --check` pass。buildは既存chunk/CSS filename warningあり。Cloudflare Workflow/VitestとAPI/D1統合はlocalhost `listen EPERM`で開始できず、Worker/D1の実行・再起動・取消競合の試験は未実施。価格gateはfalse、Provider外部送信0。本番Cloudflare D1/Workflow、secret配備、provider signed usage/invoice照合、Android SDK/device acceptanceは未確認。次はlistenerを許可する隔離test hostでWorkflow/D1 suiteを実行し、同一send claim/再送拒否/terminal input cleanupを確認してからprovider contract sandbox準備を進める。


## 2026-10-02 — Cloud継続縦断テストをloopbackで再検証

以前`EPERM`で起動できなかったlocal Worker/D1/Workflow suiteを、今回turn限定のlocalhost listener権限で再実行。`npm run test:api` 862 assertions、`npm run sky:a2a:workflow:positive` 10/10、Remote AI暗号化入力/store/public recordとA2A clientの22 tests（Node/Python独立HTTP agent fixtureを含む）、`npm run typecheck`がpass。API試験は合成入力をowner/execution-bound AES-GCMで保存してからsynthetic coordinatorを実行するよう更新。追加Workflow試験はRemote AIのhard pricing gateが閉じている間に`execution_disabled`となり、provider-send claim 0件を確認する。意図的restart/response-loss fixturesのworkerd診断は出るがVitest exit 0。

これはuncommitted local sourceと合成Worker/D1/Workflowだけの受入。価格gateはfalse、Remote AI成功dispatchは未検証、実Provider network call・Cloudflare本番durability・請求/invoice・実SIM/eSIM activation・Android APK/Binder/実機・OS installは未受入。[検証記録](docs/evidence/remote-ai-cloud-workflow-local-20261002.json)。次は外部送信gateを閉じたままCloud queueの取消・期限・再起動受入を増やし、Android Wallet handoff transportとProvider契約後のmeter/invoice照合準備を続ける。


## 2026-10-02 — Cloud LLM取消時の入力消去

2026-10-02 追加修正: 端末/利用者がreserved状態のCloud LLMを取消した後も、暗号化promptが最大24時間残ることをレビューで確認。`RemoteAiTextStore.cancelBeforeSend`はcancelledの永続確認後すぐ `remote_ai_text_inputs` を削除し、同じ取消の再試行もcleanupするよう修正。共有budgetの解放と並行cancelが一度だけであることを含めstore tests 16/16、API/D1 862 assertions、focused input/store/public/A2A tests 23/23、typecheck pass。Gateはfalseのまま、実LLM送信なし。[証拠](docs/evidence/remote-ai-cloud-workflow-local-20261002.json)。

## 2026-10-02 — Android account linkで認証済み所有者を保持

端末の一度限り認証poll応答に、ブラウザで承認されたRockstar account subjectを追加。Coreはsubjectがない・長すぎる・制御文字を含むgrantを受け付けず、Android session store v2は所有者IDをopaque token・expiryと同じAndroidKeyStore AES-GCM暗号化・package/origin binding内に保存する。これにより端末側はOSローカルの仮IDではなく、cloud APIの正しいowner identityを後段のWallet/recoveryへ渡せる。`npm run test:api` 863 assertions、`npm run typecheck`、`npm run build`、Android architecture check、`git diff --check`を確認。Android Core JVM/instrumentationはSDKがないため未実行。Broker鍵/authority/device server enrollmentおよびShell/AIDLからWallet settlement syncを呼ぶ経路は引き続き未実装。本番アカウント接続・請求、carrier activation、端末受入・OS導入の証拠ではない。[証拠](docs/evidence/android-device-owner-session-20261002.json)。

## 2026-10-02 — Android Broker鍵attestation方式の修正

Broker鍵の前提を公式Android資料と既存検証器の契約に照らして再監査。AOSP Key Attestation schemaではattested asymmetric algorithmがRSA/EC/ML-DSAと記載され、repositoryの独立VerifierもP-256鍵だけを返す。従来のAndroid Ed25519鍵実装はこのattestation経路へ接続不能なまま、attestation chainが取れることをhardware identityの根拠のように扱っていたため、Android KeyStore Broker signerをP-256へ変更。非exportable P-256 key、challenge binding、TEE/StrongBox、raw point hash keyIdを使い、Java ECDSA DERを64-byte P1363へ変換する。Cloud A2A owner-approval proof、Wallet handoff request、operator key inventoryにP-256検証を加え、既存Ed25519 fixture互換は維持した。`tests/a2a-broker-authorization.test.mjs`と`tests/a2a-wallet-handoff-auth.test.mjs`計9/9、API/D1 863 assertions、Cloudflare Workflow fixture 10/10、typecheck、production web build、Android architecture check、git diff checkがpass。Android SDK/JDKがこのhostにないためAndroid生成鍵・Java変換コードのcompile/instrumentationは未検証。server-issued enrollment/revocation、D1 dynamic trust resolver、Shell/AIDL handoff接続、production trust provisioningも未実装/未受入。[検証証拠](docs/evidence/android-a2a-p256-broker-key-20261002.json)・[AOSP Key Attestation schema](https://source.android.com/docs/security/features/keystore/attestation)。

## 2026-10-02 — SIM/eSIM-led onboarding correction and product-direction audit

Requirement audit found the core direction already present across the product baseline, entitlement design, Cloud recovery, billing architecture, and Home: a physical SIM/eSIM offer includes RockstarOS service access; one account reaches Sky/Zema/agents; a supported exact device receives a separately delivered OS/client; cloud tasks persist across client disconnection; cost approval and receipts are task-bound. Reusable implementation includes signed channel-neutral entitlement claims, owner/device sessions, capability and attestation contracts, durable jobs/recovery, signed rates/quotes, budget holds, meter snapshots, and itemized usage UI. Missing external acceptance remains seller claim distribution, carrier activation/physical SIM fulfillment, production pricing/meter/invoice/funded billing, and Android device plus exact-SKU OS/client acceptance.

Corrected `/connect` so the eSIM catalog is a secondary technical reference, and the main status view distinguishes purchase/line activation, Rockstar service entitlement, and device installation while representing physical SIM and multi-channel distribution. Added a seller-neutral one-time handoff format in the URL fragment; the browser removes it after same-tab capture, requires explicit registration, and retains file/paste fallback. Updated the canonical OS architecture intro, product system map revision, product UX backlog, SIM claim design, and current execution prompt/status pointer. Seller-specific issuer delivery terms remain external. Validation: entitlement tests 5/5, SIM entry test 1/1, `npm run project:check` 104/159, `npm run baseline:check`, `git diff --check`, and full `npm run verify` pass (Node 672/672, Fashion 19/19, Worker/D1 API 869 assertions). Database source status is 6/6 while production readback is 0/6. These local results are not evidence of production billing, carrier activation, or successful device OS installation. Evidence: `docs/evidence/sim-led-product-direction-audit-20261002.json`.

2026-10-02 continuation: connected the Android Shell's saved quote-bound Agent draft to separate device-credential-gated Wallet cap approval, exact local hold reservation, same-hold idempotent recovery, and a pre-dispatch release guard. After a second explicit Cloud/offline-continuation consent, Core signs the Broker proof only from that exact HELD row; the Shell registers it with the Cloud endpoint and recovers an uncertain POST through owner-scoped metadata readback without automatic repost. The UI keeps the Cloud draft visibly awaiting approval, and does not call the Provider or dispatch. Shell API v15 now identifies the remaining stage: an atomic final Cloud approval/dispatch handoff that compares Cloud and native Wallet state. Validation: full `npm run verify` passed, including typecheck, product lint, build, Worker/D1 API 948 assertions, and CSV Worker/D1/R2 95 assertions; project status remains 104/159 and production database readback remains 0/6. Android Java/AIDL/APK compile and device tests are unavailable on this host (no Java/Gradle/Android SDK); production billing, actual SIM/carrier activation and OS installation are not established. Evidence: `docs/evidence/sim-led-product-direction-audit-20261002.json`.


### Sky 全34 Toolの個別実行監査と候補テンプレート修正

ROCK／WEB04: v28と公開環境rev2を確認し、全34画面・20候補の実Worker/D1完了記録・記事/出典/CSV成果・PAPER/案件/メルカリの保存を合成環境で照合した。限定本番3/local14/接続必須16/当環境利用不可1で、外部実行や全本番journeyの合格へ転用しない。入力に反する固定interviewテーマとcalendar条件を再現し、定型・未分析の明示、本文非保存、未記入の確認欄へ修正した。デザインと既存実行/保存契約を維持。再build、入力反例の再受入、必要検査、同じSkyへの配備が次。Cloud Provider credential/rate、owner Pixel・desktop復旧、Apple Payは未受入。証拠はdocs/evidence/sky-individual-tool-verification.json。

追加: 直接Toolのsignin遷移で入力を失うことを合成UIで確認し、元画面保持・別タブsignin・明示read-only接続確認へ共通部を修正。接続確認で処理を再送せず、APIの失効/redirect/通信失敗を成功にしない。再build/候補と記事の復帰試験/全体verify/公開はこの追加差分でも実施する。追加前の全体verifyは692 Node・19 Fashion・939 Worker/D1、exit0。

配備受入: 既存Sky v30/source 5bdb4ecc0a1f12eb7036163818c4bbb86e224e78、env rev2で公開成功。20候補の処理と保存サイズ照合、2入力反例、candidate/articleの別タブsignin復帰・503時停止・手動2回だけの記録を合成Worker/D1/UIで確認。公開未認証UIで新案内・別タブtarget・実行停止を読み戻した。正本verify692/19/948・exit0、Site type/lint/build/bundle/assets合格。Site全設計検査は元v28に欠けているeSIM設計参照で失敗し、全体greenに換算しない。旧50円completed/stripe_verified/attempt1/rev3を配備後も確認し、新規課金なし。実Cloudは0件/資格情報なし、Pixel 10は現時点Keyguard showing=true。owner desktop/Pixel、Apple Payと実Providerは未受入。GitHub mainはb3e2676、今回の正本変更は未pushでSitesソース保存と区別する。


## 2026-10-02 — CSV受付衝突の保存保護と実公開認証境界

WEB04/ROCK: 旧v30の合成Worker/D1/R2で、別ownerが既存受付IDを指定するとHTTP500になり、先のownerのR2入力が消えることを再現した。全IDの衝突を409として拒否し、同時受付ごとの一意input keyを保存rowへ結ぶ。INSERT応答が不明な時は保存rowを照合し、勝者のinputを削除せず、DB照合不能なら入力を保持する。修正したbuildのCSV実API回帰95項目（同owner replay、別owner、同時受付、成果4種、再起動、削除、期限切れ）が合格。旧v28→v30→v28の更新・rollbackでも同一成果hashを保ったが、停止・バックアップ復元を含む本番復旧gateの合格にはしない。実公開v30で公開2件200、私有API6件と偽認証2件401を確認。非user platform credentialは本人signinの代替ではなく、匿名拒否をowner成功へ換算しない。Pixel 10はshowing/inputRestricted=true。追加課金・実Provider送信なし。証拠docs/evidence/sky-csv-storage-verification.json、docs/evidence/sky-production-auth-verification.json。Site公開と正本全体verifyはこの修正ではまだ未完了。


配備完了（CSV保存保護）: 既存Sky v31/source c89a651d9e2cd29011f2f6153201a93a82033643、deployment appgdep_6abf90330634819184f3095d248bc118、env rev2で公開成功。配布アーカイブのlocal永続D1/R2による138項目が合格し、旧固定input_keyの成果4種hashを更新後も保持した。旧v28へのrollbackは合成データの読み戻し試験だけであり、既知の衝突不具合を戻す本番復旧手順として使わない。全体verify exit0（692 Node/19 Fashion/948 Worker-D1＋95 CSV-D1-R2）、最後の検査コードlint修正は対象lintと95項目で再確認。公開v31では公開2経路200、私有6経路・偽認証2経路401。旧JPY50円CSVはcompleted/stripe_verified/attempt1/revision3、成果hash99fbb674…を公開D1で再確認した。デザイン・env設定維持、追加課金なし、Cloud実行0。本人の既存ブラウザーはreload後signin待ち、Pixelはロック中。実owner、実Provider資格情報/信頼料金/予算、Apple Pay、停止/backup復元、サポート条件の受入が残り、完全ローンチ未完了。正本変更は未push、Site保存とGitHub main統合を区別する。証拠docs/evidence/sky-csv-storage-verification.json、docs/evidence/sky-csv-storage-publication-verification.json。


## 2026-10-02 — 私有CSVの期限切れ再試行と対の保存復元

WEB04/ROCK: 公開v31の実アーカイブで合成CSVをquality_failedにし、入力を復旧して期限切れへ変更したところ、retryがHTTP200/completed/attempt2になった。取得/初回acceptだけの期限確認では不十分なため、共通processCsvJobのclaim前にも期限を確認し、ownerのexpired rowとobjectsを削除して410を返す。匿名/別ownerは削除へ進めず、期限内の品質再試行は引き続き可能とする。修正build、API回帰、全体verify、公開はこの差分では未完了。

別の合成stagingではv31 Workerを停止しD1/R2を対でsnapshot、保存領域を実際に喪失させ、整合manifestを確認して対で復元した。owner row、入力hash/metadata、成果4種hash、実行event、snapshot前の削除保持、復元済み期限切れの410・purge、別owner/匿名拒否、改変snapshot拒否の82項目が合格。復元観測349msはlocal fixtureだけであり本番RTOではない。snapshot後のowner書込は0。本番Sites backup/restore、offsite暗号化・保持期間、snapshot後の削除journal replay、停止操作の受入は残る。旧脆弱版へのproduction rollbackは使わない。証拠docs/evidence/sky-paired-storage-recovery-verification.json、docs/evidence/sky-csv-expiry-verification.json。追加課金・実Provider送信・本番データ喪失なし。


配備完了（期限切れ再試行）: 既存Sky v32/source 5fcfe884d7038723e228156a54bfd78bfcabde89、deployment appgdep_6abf94008be08191953fc7c67e647eb0、env rev2で公開成功。正本verify exit0（692 Node/19 Fashion/948 Worker-D1＋113 CSV-D1-R2）。Site type/lint/build/bundle/assetsと113回帰が合格し、同じ配布アーカイブでexpired retry 410、対snapshotの実喪失/復元を84項目確認。旧JPY50円受付と成果hashを公開D1で再確認し、追加課金なし。環境keyは既存Stripe4件のみでOPENAI_API_KEYなし。本人desktop接続確認はsignin待ち、Pixel 10はshowing/inputRestricted=true。実Provider key/信頼料金/予算と両端末owner・Apple Pay・本番backup/削除journal・サポート条件は未受入。正本未pushとSite保存を区別し、完全ローンチは未完了。証拠docs/evidence/sky-csv-expiry-verification.json、docs/evidence/sky-csv-expiry-publication-verification.json。


## 2026-10-02 — GitHubへのCSV修正の切り出し

WEB06/ROCK: 正本main b3e2676から今回のCSV受付衝突/競合cleanupと期限切れprocessing/retryだけをbranch codex/sky-csv-storage-retentionへ切り出し、commit05f676338944f60e05552b22dddc6f50453e3be6とdraft PR https://github.com/k999ln/rock/pull/51 を保存した。main自体のlockfile・migrationでtype/lint/build/design、172 Worker API＋113 CSV-D1/R2が合格。全文verifyは既存visual-system baseline不整合でexit1。Node全体440中429pass/11failで、PR差分を退避した未変更main controlも同じ11失敗。GitHub同一HEADのCI run37002726882もNode22.23.3の同じbaseline assertionでfailure。署名制御CIはsuccessであり一般verifyの代わりにしない。デザインや未反映のStripe/Cloud/SIMをこの差分へ混ぜず、mainへのmergeは未完了。公開Skyはv32/source5fcfe884を維持し、PRは公開版の全sourceではなく同等CSV修正だけ。自分の合成runtimeとGitHub保存済み一時worktreeを整理し、正本・本番データを触らなかった。次は既存mainの検査/文書/migration不整合を既存デザインを維持して解消してからCI/mergeを判断し、owner desktop/Pixel・実Provider credential/rate/budget・Apple Pay・本番復旧/運営受入を続ける。証拠docs/evidence/sky-csv-github-sync-verification.json。完全ローンチ未完了。


2026-10-02 Sky引継ぎ（GitHub検証復旧）: PR #51のhead `691fb279a3c4238ef46f956a76b558c987bac850`でfresh npm ci／Node22.23.3の全体CI `37004335830`とrelease-signing `37004335480`がsuccess。既存pale-blueにbaselineを合わせ、英語README、37-table migration union、Fashionの現行保存buttonを検証する。CSS/componentは変更せず、CSV保存衝突・期限切れretry修正は維持。CIはNode441、Fashion19、Worker-D1 172、CSV-D1/R2 113、bundle131・asset114/missing0と公開crypto fixture303/rejection142を通過した。証拠`docs/evidence/sky-release-verification-alignment.json`。canonical dirty treeの同名tests/migration-unionは別の67-table作業を含むため、37へ上書きしない。PRはdraft、mainはb3e2676で未merge。live Skyは同じprojectのpublic active v32をnative取得で確認し、env revision2はStripe用4キーだけ。初回publicationフィールドのv28とは別にcurrentRuntimeReadbackへ最新v32を明記した。desktopはサインイン待ち、Pixelはkeyguard表示。実Cloud/owner journey/Apple Pay/production復旧は未受入。次は不足するproviderの本人設定とowner実機・desktop受入、main統合判断、運用gateを進める。キーをchatへ貼らせず、owner操作を代行認証しない。

2026-10-02 SIM/eSIM issuer delivery continuation: implemented authenticated internal `POST`/`GET`/`PATCH /api/internal/rockstar/entitlement-deliveries` backed by the encrypted idempotent seller package store. Same seller/order retries recover the exact signed package; changed terms and cross-issuer credentials fail closed; delivery acknowledgement clears encrypted claim-code material. Focused issuer/store/HTTP tests pass 18/18, `npm run typecheck`, focused Oxlint, production `npm run build` (route present), and `git diff --check` pass. Evidence: `docs/evidence/sim-service-issuer-delivery-api-local-20261002.json`. This is local source/build verification only: no seller checkout/webhook, buyer notification or real purchase, production issuer/key/D1 deployment, carrier activation, production billing, Android APK/device acceptance, or OS install was performed. Next: contract/sandbox-dependent seller checkout/refund integration and Android SDK CI acceptance for the existing same-job recovery path.

2026-10-02 SIM/eSIM seller API rate-limit continuation: added migration `0054` and a single-row-per-issuer atomic D1 minute counter. Authenticated registration/recovery/ack calls share 120 requests per minute; excess receives `429 Retry-After`. The SQLite API regression verifies threshold, retry delay, next-minute reset, and independent seller buckets. Issuer/store/HTTP suite passes 19/19, typecheck and targeted lint pass; 69-table web schema, 124-table source database union across six boundaries, project status 104/159, product baseline, `npm run build` and `git diff --check` pass. Production readback remains 0/6; no external seller, carrier or payment calls were made; no Android runtime is installed here (Java runtime/Gradle/SDK manager unavailable), so native suite/device acceptance remains pending. Evidence: `docs/evidence/sim-service-issuer-rate-limit-local-20261002.json`.

2026-10-02 SIM/eSIM product audit follow-up: re-read the authoritative product requirements and found stale Android workstream text claiming the quote-bound Wallet hold, Broker proof, offline-consent and final Cloud approval path were still unimplemented. Reconciled the current table/backlog against Shell API v16 and the latest Cloud approval/recovery evidence: these pieces are source-connected, while the paid dispatch flag, actual Agent/provider usage, production billing, Android JVM/AIDL/APK/device acceptance remain unverified/disabled. Also corrected the entitlement design's obsolete “seller API not implemented” phrase; the internal issuer delivery API now exists, while seller checkout, buyer delivery and carrier integration remain external. `npm run os:check`, `npm run android:architecture:check`, SIM entry test 1/1, project check 104/159 and `git diff --check` pass. Historical audit links retain their original checkpoint scope.

Follow-up contract prep: added the seller API's concrete POST/GET/PATCH message shapes and status/retry semantics to `docs/sim-service-entitlement-claims.md`, including the meaning of provider enqueue acknowledgement, the one-key-per-entitlement rule, and the 429/Retry-After contract. The API can now be handed to a prospective seller adapter developer without implying a connected checkout, customer notification, carrier activation, or purchase.

## 2026-10-02 — Android ShellでSIM/eSIM購入claimを登録

既存のWeb `/connect`への離脱を減らすため、端末ホームのentitlement状態に、issuer設定由来のclaim登録可否を加えた。Android Shell API v18から、Brokerが現在のowner-bound device sessionを使って同じ署名検証・一度限りbindingのAPIへ購入claim JSONを送る。Shellは登録欄をserverが許可した時だけ表示し、入力をsaved stateから除外、現在のRockstar IDへの結び付けを明示承認、通信不明時に自動再送せず、成功後に入力を消す。回線開通、購入の実在、OS導入は独立状態として残す。

ローカル検証: `tests/sim-service-entry.test.mjs` 1/1、`npm run os:check`、`npm run android:architecture:check`、`npm run typecheck`、`npm run build` pass。claim API/D1 testはlocalhost listenerを起動できず`listen EPERM`でredeem case未実行。Android Java/AIDL/APK/実機もSDK/JDK未用意のため未検証。販売元からの購入/handoff、物理SIM履行、carrier/eSIM activation、本番billing/deploy、対応端末へのOS導入を行った証拠ではない。[証拠](docs/evidence/sim-service-android-native-claim-local-20261002.json)。次はAndroid SDK CIでcompile/instrumentation、名前を固定した対応端末で購入claimからSky/Zema/Agent入口までの受入、listener有効なhostでclaim API/D1試験を行う。

## 2026-10-02 — SIM claim API integration再確認

前回sandboxで拒否されたloopback listenerをテスト限定の許可で起動し、`npm run test:api`を再実行。Worker/D1は960 assertions、CSV Worker/D1/R2 regressionは113 assertionsでpass。SIM関連ではoperator-configured issuerに対する署名済み初回claim、同一owner再送、別owner拒否、claim code/署名改ざん拒否、Android device-homeのredeem availabilityを合成SQLite/Workerで確認した。これはローカルAPI実装の検証で、実販売・販売元webhook・本番D1・回線開通・AI provider請求を証明しない。

Android側はこのhostでJDKが起動せず、Gradleもなく、SDKは空の`.sdk` cacheのみ。`adb`はsandbox内でdaemon loopback bindを拒否した。既存`.github/workflows/android.yml`にはAIDL/APK buildとemulator instrumentationが定義されているが、現在のmain commit/working treeは未pushでworkflow実行証拠はない。次はこの実装をCIでcompile/instrumentationし、対応端末を固定してclaimからSky/Zema/Agent入口までを受入する。claim機能のローカル境界は[証拠](docs/evidence/sim-service-android-native-claim-local-20261002.json)を参照。

同じ確認で`tests/sim-service-entry.test.mjs`にnative claimの回帰契約を追加: 16 KiB制限、exact envelope、allowlisted POST、main-thread network拒否、request bytes消去、owner session認証、明示binding確認、自動再送なしを検査する。focused source test 1/1、OS contract、typecheck、diff checkがpass。これはAndroid runtime試験の代替ではない。

同日Cloud continuity再確認: `npm run sky:a2a:workflow:positive`をloopback対応環境で実行し2 files / 10 tests pass。fixtureは異なるAgent実装とのdispatch、signed final usage/artifact、offline continuation consent、cancel/restart/race、ambiguous-send no-replayを含む。`npm run test:api` 960 Worker/D1 assertionsとCSV 113 assertionsもpass。故意のrestart/ambiguous-send試験はWorkerd engine-abort diagnosticsを出したがVitestはexit 0。外部Provider callは0、hard pricing gateはclosedのまま。合成fixtureの継続はCloudflare本番永続性、実Agent相互接続、production billingの受入ではない。[Cloud evidence](docs/evidence/remote-ai-cloud-workflow-local-20261002.json)。

続けて`npm run sky:agent-runtime:check`を現行sourceで再実行。Remote AI Workflow / A2A Workflow / D1 bindingsを含む251.35 KiB bundleのdry-run buildが成功した。Cloudflareへのdeploy・secret設定・production D1/Workflow稼働は行っていない。

## 2026-10-02 — 販売offer別の初期Agent構成を購入claimへ接続

監査で、eSIM plan試作にはLifeline/Developer starter pack設定がある一方、複数販売チャネル共通の署名済みservice entitlementとはつながっていないと判明した。`ROCKSTAR_SERVICE_OFFER_PROFILES`を追加し、claimの`issuerId + offerId`から版固定のSky Package key/hashを解決する。現在verifiedでmanifest hashも一致するPackageだけをready表示し、claim自体では自動install・executeせず、本人選択を要求する。Web entitlement UI、Android Shell service-home表示、entitlements APIとdevice-homeへ接続した。profile未設定やpackage review/hash driftは基本service entitlementを無効化しない。設計、operator config例、offer version運用、Healthcare packageが未契約/未レビューである境界をSIM entitlement文書、Android workstream、current promptへ記録した。

検証: `tests/rockstar-service-offers.test.mjs`と`tests/sim-service-entry.test.mjs` 4/4、Worker/D1 API 972 assertions、CSV regression 113 assertions、`npm run typecheck`、`npm run build`成功。ローカルAPI fixtureはsynthetic issuer/package/reviewのみ。実Healthcare/Lifeline package、実販売/checkout、carrier activation、production billing、Android Java/AIDL/APK/device UI、RockstarOS installは証明していない。[証拠](docs/evidence/rockstar-service-offer-profiles-local-20261002.json)。次はAndroid CI instrumentationと実package/issuer運用契約の準備。

全体回帰検証の追記: 初回`npm run verify`で、今回追加したparserのLint違反と、既存database status/migration収束testの古い固定件数（web 67 / total 122 / migration 0050）が見つかった。parserの制御文字検査をcode-unit loopにし、型を明示。DB正本は現在web 69 tables / 55 migrations / source 124 tables / 6 boundaries / production readback 0/6のため、古いtest期待値だけを正本へ合わせた。Migration unionはfresh/release/sitesのfilename/Drizzle 6通りすべて収束し、`npm test` 719/719、`npm run verify`全体成功。これはlocal verificationでありproduction D1をreadbackした結果ではない。

offer別初期Packageの利用開始導線を追加: `/connect`のready Packageから`/sky/marketplace?package=<exact-key>`へ移動し、現在reviewed+installableなRegistry itemだけを自動で詳細表示する。Registryでkeyが見つからない場合は購入権を保ちつつ見つからない旨、Registry接続自体に失敗した場合は審査状態を確認できない旨を分けて表示し、未確認Packageを選ばない。source contract test 4/4、`npm run lint:product`、`npm run build` pass。導入・実行・paid dispatchは自動化せず、既存の利用者承認と料金gateを使う。[証拠](docs/evidence/rockstar-service-offer-profiles-local-20261002.json)。


2026-10-02 Zema A2A継続: migration `0057_a2a_parent_sequence.sql`で子委任に前段delegation IDを永続化し、DB triggerは同じ本人・親jobの`remote_completed`かつ成果保存済みを要求、partial unique indexで成果から後続1件に制限する。Zemaの結果引継ぎdraft、API、lost-response照合を同じsource IDへ束縛し、再読込後も前段を表示。後続Agentは従来どおり新しい見積・予算上限・本人承認が必要で自動送信しない。A2A store/result/recovery 28/28、typecheck/lint、schema/database check、API 1024 assertions、CSV 113 assertions成功。証拠`docs/evidence/a2a-persisted-handoff-link-local-20261002.json`。本番D1 readback 0/6、Provider相互接続/請求、実キャリア、Android/OS実機受入は未完了。次は順序付き親plan/status lifecycleと運用復旧手順を実装する。
2026-10-02 A2A前段リンクの全体検証: migration数の固定期待値を0057へ同期し、sandboxがloopbackを拒否したケースを区別して再実行。`npm run verify` PASS（Node 753/753、Fashion 19/19、build、Worker/D1 API 1,024 assertions、CSV Worker/D1/R2 113 assertions）。buildは既存の大きいchunkとCSS出力名重複をwarning表示。database statusはsource 6/6、production readback 0/6。全てlocal verificationであり、本番課金・carrier activation・実機OS installationの受入根拠ではない。証拠: `docs/evidence/a2a-persisted-handoff-link-local-20261002.json`。
2026-10-02 A2A redelegation limit: audit found `A2A_MAX_REDELEGATION_DEPTH=1` declared but unenforced. The owner-scoped store now computes predecessor lineage depth, the API returns a conflict for a second successor hop, and migration 0057's D1 trigger rejects the same invalid edge even outside the application path. The tested flow allows one separately quoted/approved follow-up after a captured result; further work uses a new independent parent job. Recovery notes in the Sky/MCP workstream now specify same-key/hash read-only reconciliation, no resend for unknown acceptance, hold retention during uncertain execution/cancel, and artifact-capture prerequisite. Focused A2A tests 29/29; typecheck, product lint, schema, and database checks pass. Production D1 readback remains 0/6.
2026-10-02 A2A redelegation depth full regression: `npm run verify` completed successfully after the store/API/D1 limit and recovery runbook changes. Node 754/754, Fashion 19/19, production build, Worker/D1 API 1,024 assertions, CSV Worker/D1/R2 113 assertions. Focused lineage suite 29/29 includes an actual local SQLite migration run, successful one-hop handoff, third-hop store rejection, and direct SQL trigger rejection. Existing build warnings: one >500KB bundle and duplicate CSS emitted filename. Production D1 readback remains 0/6; no live provider, carrier, invoice, or device-install proof.

2026-10-02 persisted parent-plan binding: the fixed Zema `cloud-agent` WorkJob's ordered step events now retain their delegation ID. `/api/work-jobs` validates the same-owner/same-parent stored quote before accepting the quote step and requires a remotely completed task, captured artifact rows, and a stored usage receipt before accepting result review or final completion. It rechecks historical step evidence on later updates, preventing a generic success command or random ID from completing the plan. The local Worker/D1 API regression rejects a forged Cloud Agent progress event; `npm run test:api` passes 1,029 API assertions and 113 CSV assertions, `npm run build`, `npm run typecheck`, `npm run lint:product`, and focused workflow/controller tests pass. This remains a fixed two-step user-directed workflow; the evidence is synthetic, and a usage receipt is not an invoice. See `docs/evidence/a2a-parent-plan-binding-local-20261002.json`.
2026-10-02 parent-plan binding full verification: after linking `cloud-agent` WorkJob events to validated A2A delegation IDs, `npm run verify` passes. Node 754/754, Fashion 19/19, build, Worker/D1 API 1,029 assertions, CSV 113. Quote-stage progress requires the same-parent stored signed quote; result-stage/final review rechecks remote completion, captured artifact rows, and stored usage receipt. The API harness rejects a random non-existent delegation ID. This is local/synthetic behavior only; production D1 readback remains 0/6, and a usage receipt is not invoice settlement. Existing build warnings remain: a >500KB chunk and duplicate emitted CSS filename. Next: design and validate an extensible versioned parent plan schema, preserving explicit user approvals and prohibiting false completion/replay.


## 2026-10-02 — SIM/eSIM product direction audit and cloud operations follow-up

Re-audited the repository against the SIM/eSIM-led service requirements. Reused signed entitlement claims, shared Rockstar identity, Sky/Zema/Home, device capability and attestation, durable A2A/Workflow recovery, signed quotes and usage receipts, budget reservations, and itemized usage. `/connect` separates carrier activation, service entitlement, device route, and cloud work; Home exposes Sky, Zema, and Agent work entry points. Corrected the remaining `PROJECTS.md` description that called the eSIM adapter an eSIM-only product and marked the older project-history heading as superseded. Added [the cloud operations runbook](docs/sky-cloud-operations-runbook.md) for configuration, release gates, monitoring, stop, recovery, and evidence; linked it from product architecture, Wallet/Billing workstream, and README. Focused tests 28/28, expanded Worker/D1 API 1,048 assertions, typecheck/lint/product checks pass. The earlier full verify passed at 1,028 API and 113 CSV assertions; a later test:api run passed the API suite but its separate CSV Miniflare process failed SQLite initialization (`SQLITE_IOERR_SHMSIZE`) with 171 MiB free. This is an incomplete rerun. Production D1 readback remains 0/6; seller/carrier integration, provider invoice reconciliation, Android runtime, and exact-device OS acceptance remain open.
