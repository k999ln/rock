# Web・画面・導入体験の開発プロンプト

作成: 2026-10-21 UTC。主担当: Web / PWA / Sites（ROCK）。対象: HOME01・WEB04・WEB06・WEB13・SKY14・SKY15・SKY21。参照会話: `codex://threads/01a14d54-daee-7c30-87a8-faea84641a40`「RockstarOSを再設計」。この文書は次の実装指示であり、実装・配備の合格証拠ではない。

## 目的と確定した利用体験

RockstarOSのホームを、投稿そのものがニュース、発見、導入、仕事への入口になる画面として仕上げる。投稿からSkyのModel・Agent・Tool・追加機能を選び、必要な権限・料金・導入条件を確認し、Eveで依頼・現在状態・停止・成果・使用額を扱えるようにする。Walletは既存の本人別保存と承認境界を通す。カード群の一角にtimelineを埋め込む構図へ戻さない。

本人の明示訂正に従い、RockstarOS／Skyは外部API・MCPの受け皿である。X専用API契約や各利用者の開発者登録を導入の必須条件にしない。`sky_timeline_read` / `sky.timeline.v1`を既存MCP Connectorのslot・Passport・prepare・一回承認・executeに接続する。実X投稿を供給する許可済み接続先は未接続であり、fixtureを実投稿やX公式「おすすめ」の合格と呼ばない。X OAuth adapterは任意・初期無効とし、本人または運営の未承認費用を発生させない。

正式ドメインは`avoado.si`＝総合／Sky入口、`avocadomini.si`＝avocadoMini、`avocadopro.si`＝AI専用PC。3サイトの役割、相互リンク、画像の出自、導入可能性を揃える。本人用localhost Lab、秘密値、実機専用情報を公開ドメインへ移さない。一般ローンチ保留を維持する。

## 作業前の読戻しと現在地

最初に`AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`を読み、`docs/workstreams/README.md`と`docs/workstreams/00-responsibility-boundaries.md`で担当を確定する。設計正本は`docs/rockstaros-design-portal.md`、`docs/rockstaros-complete-design.md`、`docs/sky-tools-complete-design.md`、対象の`docs/workstreams/05-web-pwa-sites.md`。承認済み設計は`docs/execution-approval-20260909.md`と`data/execution-approval.json`で確認し、再承認待ちに戻さない。公開・実機・契約の条件付き了承を完了に変換しない。

2026-10-21T06:37ZのGitHub読戻しでは、`main`は`01b6aecd8b4d8bd2385665232dfb4b57029f991f`、作業branch `codex/esim-cloud-access`は`951d82d5a491a284aed4e0d4d280171d835d4b43`。mainの同一SHAで`verify`とWeb security等のcheckは成功、作業branchの同一SHAで確認できたcheckは`source-preparation`のみ。関連open PRは#130（main catchup）、#106（Sites quality integration）、#110（Site feature composition）。mainと作業branchは共通祖先から大きく分岐している。再実行時は`npm run prompt:context`、`git ls-remote`、対象PR・同一SHA CIを再取得し、古いSHAを「最新」と書かない。共有作業ツリーは多数の未コミット差分を含むため、切替・reset・上書きを避け、まずmain/引継ぎ入口/優先順位を安全な分離checkout等で同期する。文書保存、branch反映、main統合を別々に記録する。

既存実装を先に確認する: `components/home-screen.tsx`、`components/sky-social-timeline.tsx`、`components/sky-discovery-feed.tsx`、`components/sky-timeline-connector.tsx`、`lib/sky-timeline-provider.ts`、`lib/mcp-hub.ts`、`lib/workflow.ts`、`components/system-settings.tsx`、`public/sw.js`、`public/offline.html`、`app/manifest.ts`、3サイトのsource。証拠は`docs/evidence/home-native-post-frontend.json`、`docs/evidence/x-account-native-feed.json`、`docs/evidence/launch/web-security-local-current.json`。Homeの投稿型UIと投稿→Eve/WalletはローカルWebで確認済みだが、実X投稿・Pixel/native・一般公開の受入ではない。投稿ソースのMCP schema/parserとfixtureは存在し、実provider、実投稿、更新・停止の共同受入は未完了。PWA offlineの集中4試験とローカルproduction responseは合格しているが、配備source SHA一致、通知、読み上げ、低速、本人別exportは未受入。

## 相違と修正順

| ID | 原因と現在の根拠 | 次の修正 | 合格証拠と未解決条件 |
| --- | --- | --- | --- |
| WEB-GAP01 | 投稿型Homeはローカル証拠にあり、作業branch SHAとGitHub mainには同じ差分がない。#130等の引継ぎも別。 | 既存の未コミット差分を保護し、main/branch/PRの差分と入口・優先順位を同期する。重複実装を避ける。 | 対象SHA、source path、同一SHA CI、文書保存・commit・main統合の別記録。 |
| WEB-GAP02 | Homeの投稿は実装されたが、実X供給元は未接続。`sky.timeline.v1` fixtureは本物の投稿ではない。XのFor You取得経路も未確認。 | 既存MCP Connectorで接続先発見→権限/費用確認→本人承認→取得→Home表示→更新/停止/失効を一周させる。任意のX adapterと汎用受け皿を分離する。 | 許可済み実providerの名称・契約・scope・実投稿ID/出典/時刻・再読込・停止・失効の証拠。実provider不在なら`ROCK_READY`までとし、For Youは別の未解決条件。 |
| WEB-GAP03 | ホーム/導入導線の局所確認はあるが、依頼→状態→停止→成果・費用・持出しと、タッチ/キーボード/読み上げ/低速の一周は未受入。 | `lib/workflow.ts`、本人別保存、revision競合を使い、各入口から同じ仕事へ到達させる。失敗・費用上限・停止受領・成果読戻し・exportを普通の言葉で示す。 | PC・390px・320px、タッチ、Tab/Enter/Escape、読み上げ、低速/切断/再接続の実操作記録。owner越境・二重実行・未承認課金を拒否。 |
| WEB-GAP04 | offline shellは局所合格だが、PWA更新、通知拒否/失敗、配備同一性と3サイトの実URL受入が未完了。 | install/update/offline状態を明示し、通知は本人許可後のみ、失敗時は画面内で確認できるようにする。3ドメインの相互導線、構想画像/公開画像/実機写真の表示を照合する。 | cache/API境界、更新後の版、通知拒否/失敗、DNS/TLS/HTTP、deployment ID・source SHA・response header/asset byteの同一候補読戻し。公開gate未達なら配備/一般公開を合格にしない。 |

## 実装手順

1. **入口同期:** 上記SHA・PR・CIと現ソースを再取得し、現在のdirty checkoutを保護する。`docs/design-implementation-alignment-20260909.md`とstatusの`phaseGates`を読み、文書訂正とruntime修正、mainと未マージbranchを分ける。既存デザインと業務契約を壊さない小さい差分にする。
2. **投稿を仕事へつなぐ:** ホーム全体の投稿型を維持し、Home/Sky/Eve/Wallet/設定の入口を初見で辿れるようにする。投稿の種類（本人/コミュニティー/外部source/catalog metadata）と出典を区別する。Model/Agent/Tool/Walletを「追加」しただけで有料実行・送金を開始しない。依頼、現在状態、停止、成果、itemized usage、データ持ち出しへつなぐ。
3. **投稿ソース受け皿:** `sky_timeline_read`を持つ許可済み接続先を本人が選び、scopeと見積を確認してから取得する。provider結果は非信頼データとしてschema・本人・鮮度・投稿ID・公開範囲・URLを検証する。接続解除、期限切れ、429、空結果、オフライン、古い応答を画面で区別する。一般のAPI/MCP接続先を無制限に同一schemaへ受け入れない。実X供給元が存在しない場合は接続待ちを残し、X風の模擬投稿を実投稿として見せない。
4. **画面品質とPWA:** 3端末幅、タッチ/キーボード/読み上げ、色のコントラスト、明瞭なフォーカス、押しやすい操作領域を確認する。低速回線は初期表示の軽量化と必要時読込を測定する。PWA導入・更新・圏外・再接続の状態を示し、私的APIや古い成果をoffline shellで偽装しない。通知は明示許可と失敗時の画面内代替を用意する。
5. **3サイトと配備:** 正式ドメインの役割、相互リンク、製品構想・生成画像・実機写真のラベル、初見説明、失敗時案内、export導線を揃える。ローカル/preview/公開を分け、本人用localhost Labを公開しない。配備する場合はrelease gateに従い、DNS/TLS・実response・配備版/SHA・sourceとの一致を読み戻す。公開済みと記載するのは実配備証拠がある範囲だけ。

## 検証・成果物

まず変更箇所の意味ある試験を実行する。候補は`node --experimental-strip-types --test tests/home-timeline-frontend.test.mjs tests/sky-timeline-provider.test.mjs tests/sky-timeline-interactions.test.mjs tests/mcp-connector.test.mjs tests/pwa-offline.test.mjs tests/pwa-installability.test.mjs`。実UIも操作し、幅・入力方式・読み上げ・低速/圏外・通知拒否/失敗・exportを同じ候補で記録する。変更後に`npm run project:update`、`npm run design:check`、`npm run baseline:check`、`npm run release:check`、`npm run verify`を実行し、失敗時は環境・停止箇所・未実行範囲を残す。OS component/Sky Toolの契約変更時は`data/design-document-index.json`と全体/Tool詳細設計を同じ変更で更新する。READMEの利用方法が変わる場合は本文も同じcommitで更新する。

`project.md`、`data/project-status.json`、該当workstream、最小限の証拠JSONへ、対象SHA・source hash・command/結果・環境（host/fixture/provider sandbox/実機/本番）・画面読戻し・未解決条件・次の一手を残す。実provider費用、利用者への追加課金、X運営側の契約、一般公開、実機導入は各条件の確認を経て別記録にする。最後にRQ01〜RQ49との矛盾、SIM/eSIM利用権と端末OS適合の分離、費用上限・本人承認・停止・復旧を点検する。
