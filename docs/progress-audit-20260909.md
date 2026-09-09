# Rockの進捗と確定要望の相違 — 2026-09-09監査

これは日付付きsnapshot。[製品ベース](product-baseline.md)は安定した要望、以下は当日の実装状況。次回は [作成規約](prompt-playbook.md) から最新状態を取得する。

## GitHubで確認した対象

| 対象 | 確認値 | 意味 |
| --- | --- | --- |
| main | `5cec83478fe97bf272869298160a572ef7fcefee` | 今回のベース保存前のmain。Web/PC・Android P1 |
| native branch | `codex/integrate-native-os-20260909` | Linux native開発の取り込みbranch |
| native HEAD | `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5` | mainより10コミット先行 |
| [PR #1](https://github.com/k999ln/rock/pull/1) | OPEN、main向け、mergedAt=null | native実装は監査時点でmain未反映 |
| native HEADのCI | Web、Android prototype、native sourceすべてsuccess | 下記の同一SHAでGitHub API/PR checksを確認 |

CI: [Web 34318525748](https://github.com/k999ln/rock/actions/runs/34318525748)、[Android 34318525747](https://github.com/k999ln/rock/actions/runs/34318525747)、[native 34318525801](https://github.com/k999ln/rock/actions/runs/34318525801)。過去の `f11f9aa` の結果だけをHEADへ代用したものではない。

mainの進捗は当時10/16件、native branchは11/21件。共通タスクがあるので合算不可。今回mainへ保存するベース/プロンプト文書はこの数値の監査後に追加される。上記SHAを「現在のmain」と固定し続けない。

## 実装を読んだ結果

以下のnative pathはすべて `fcedcfe` の `systems/rock-star-os/` 配下。main上にそのディレクトリがなくても未実装と判定しない。

| 能力 / 要望 | main | native開発branchの実装と限界 | 今後の相違修正 |
| --- | --- | --- | --- |
| Hub / RQ01〜03 | 固定4ユーティリティと候補カタログ | `src/blackberryrock/hub.py` に導入/実行/停止/更新/rollback/削除、署名publisher。`os/tools/README.md` に独立package試験 | tob側の商品とRock共通基盤の責任を文書・表示で統一。既存Hubを再利用 |
| 商品契約 / RQ03〜05 | `lib/catalog.ts` はenvironment/cost等が説明文 | `src/blackberryrock/packages.py:108`、`schemas/recipe-manifest-v4.schema.json` にv2/3/4を機械検証 | 「schemaなし」として廃止しない。既存recipeの上に互換な商品契約/adapterを拡張 |
| 商品料金 / RQ05 | 費用と分配の試算 | `packages.py:149` はUSD 0/run以外を拒否。source licenseは非空文字列検査 | 有料商品、外部契約、無料枠、実費/BYOK、ライセンス/再配布判定は不足 |
| 実行先 / RQ04 | ブラウザ内と同一PCのlocalhost MCP | `packages.py:129` のdevice_local/cloud/pc_usb。`os/runner/README.md` のcloudはTLS loopback、pc_usbはUnix socket fixture | self-hostや複数工程、実cloud/実PCとの接続が課題。実USB/一般cloud成功と表示しない |
| AI予算 / RQ04〜05 | 共通実費試算 | `os/ai_routes/policy.py`、`store.py` にroute/外部送信/上限/予約/照合。ただしsimulation_onlyで実モデル実行なし | 商品契約と実providerの測定/停止能力へ接続。Walletとcompute予算を混同しない |
| Wallet / RQ06 | `lib/wallet.ts` はEthereumアドレス接続 | `src/blackberryrock/wallet.py` にUSD整数cents、追記journal、複式保存則、売上確定、出金留保、不明照合、逆転 | 実売上providerとの照合、商品/job/取引の対応、返金/紛争、多通貨の汎用化が残る。ゼロから再実装しない |
| 月額/資格 / RQ05〜06 | 旧上限試算 | `os/wallet_backend/`、`os/wallet_auth/`、`os/service_access/` に購入者/同意/月888c/同一契約複数端末重複防止 | Rock契約gateを商品の利用資格へ拡張する設計が必要。既存月額やclosed購入者方針を今回撤回しない |
| Walletの正本 / RQ06 | サーバーに実残高なし | remote構成ではbackend台帳が正本で端末はproxy/cache。local構成も残り暗黙切替なし。未払いでもoffline Tool・自分のデータ・Wallet回復を残す | 選んだ構成に第二の残高正本を新設しない。外部口座とcacheの鮮度・照合を扱う |
| MCP / RQ04、08 | 4固定ツールのstdio/localhost HTTP | `os/mcp_broker/runtime.py` にowned fixture接続、承認、intent/receipt、unknown照会、再起動復旧 | 外部MCP/OAuth/一般providerの相互運用は未検証。MCP接続成功は売上入金の証拠にならない |
| OS / RQ07、09 | Android P1試験、AOSP設定。独自AOSP未起動 | Linux/Buildroot/ARM64 QEMU基準版の起動証拠。C/Cairo UIと独立サービス | BlackBerry優先・型番未定。実機/実USB/金融/本番は未検証。Pixel中心へ巻き戻さない |

native sourceの[固定SHAツリー](https://github.com/k999ln/rock/tree/fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5/systems/rock-star-os)、[統合方針](https://github.com/k999ln/rock/blob/fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5/docs/native-os-integration.md)、[検証記録](https://github.com/k999ln/rock/blob/fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5/docs/native-os-validation.md)を根拠とする。

## 完了と未完了の境界

既存商品の実利用で確認する対象は、nativeの `org.rockstar.proposal-draft`（1.0.0/1.1.0）、`org.rockstar.citation-organizer`、`org.rockstar.utf8-sha256` と、mainの `toolkits/mr/` にある案件チェック/出典整理/無料版作成/納品記録照合。nativeは3商品・4配布版で、一般AIサービスの完成品ではない。native側は `LicenseRef-Development-Only`、元のMr.原本は固定MIT snapshotで、同名機能でも権利・実装を自動同一視しない。RQ11に基づく新しいHub実利用/不便の比較試験は、この監査では未実施。次のプロンプトへ具体的に引き継いだ。

nativeのN01は公開可能なソースの取り込みと回帰検証。記録されたnative Pythonは1031件＋C、既存Webは34件＋143 API assertions、Androidはbuild/SDK/emulator等のCI。通常gate外では旧ATM fixtureの1エラーとroot必要11skipが記録されており、「全テスト成功」とはしない。

今回の取り込み配置で新しいOSイメージのbuild/bootはNOT RUN。第9基準版のQEMU証拠は履歴引用。`experiments/startup-health/changes.patch` の21ファイルは未適用・未検証。N02起動改善とN03 BlackBerry適合は進行中、N04実機Hub、N05実USB/外部MCP・AI/金融provider/ToB精算/運営pilotは未着手。

外部売上・送金・ATM、本番KYC、実AI品質、BlackBerry実機は未検証。host/fixture/仮想OSの成功をこれらへ拡大しない。

## 以前の説明を訂正する

「Walletはアドレス接続のみ」「OSはまだ一度も起動していない」「PC/cloudは設計がない」「カタログは自由記述だけ」はmainだけを見た過度な一般化だった。nativeには対応試作がある。設計8割/実装3〜4割という数値にも算定根拠がない。

現在の課題は **存在するHub・Wallet・接続/予算基盤を、多様な実商品の実行条件と収益の流れへ結び付けること**。新規Walletやツール内部AIの全面開発、MCP/OAuth一律強制、既存料金の廃止は今回の指示から導かない。

## ベースに掛け合わせる発展案

以下は改善候補。実装済みでも新しい利用者決定でもない。基礎契約の対応後、対象RQを維持して追加する。

| 掛け合わせ | 再利用するものと追加部分 | 利用者への効果 / 検証指標 |
| --- | --- | --- |
| 商品条件 × 接続状態 × 利用資格 | manifest・service_access・healthに共通事前判定を追加 | PC sleep、契約切れ、API不足を実行前に説明。誤開始0、復旧までの操作数/時間を測る |
| 実行receipt × 利用費 × 確認済み売上 | runner/MCP receiptとWallet journalへ取引対応を追加 | 商品ごとの売上・費用・受取額を追跡。二重計上0、未照合件数と照合時間を測る |
| 永続job × offline復元 × モバイル通知 | 既存intent/cache/receiptと通知を接続 | 外出中の通信断後も結果と取消状態を把握。消失/重複0、更新遅延を測る |
| 更新版 × 権限差分 × 費用上限 | 署名更新/rollbackと価格版・再同意を接続 | 料金や送信先の変更を事前把握。旧同意での権限/費用拡大0 |
| 入出力契約 × 複数商品 × Wallet照合 | 既存recipeとadapter、親子Run/取引対応を追加 | 商品A→Bの工程を一つの仕事として管理。中断時の二重副作用0、工程費の説明可能性 |

多通貨の合算には換算時点と参考値表示が必要。出金済みや返金済みは履歴であり、現在の利用可能残高へ足さない。1取引対1Runを強制せず、一括入金や複数商品分の配賦も根拠を持って扱う。
