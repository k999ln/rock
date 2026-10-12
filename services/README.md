# services/ — 別に配備するサービス

Webアプリ本体（[`app/`](../app/)）とは **別の単位で配備する** Workerやサービスです。それぞれ独自の設定（`wrangler.jsonc` など）とDBを持ち、本体のDBや利用者向け画面と混ぜません。

| フォルダ | 何か | 配備の状態 | 設計・手順 |
| --- | --- | --- | --- |
| [`sky-agent-runtime/`](sky-agent-runtime/) | クラウドAgentの実行Worker。リモートAIのテキスト処理、Agent間委任（A2A）、1分ごとの期限sweep | 本番のD1・secret・cronは未設定。ローカルのWorkflow fixtureで検証 | [A2A Bridge](../docs/sky-a2a-bridge.md) / [Sky Cloud継続実行](../docs/sky-cloud-continuity.md) / [運用runbook](../docs/sky-cloud-operations-runbook.md) |
| [`sky-billing/`](sky-billing/) | 収益・費用の照合と請求のWorker。Walletの実資金受入とは別 | 実販売・決済・払出しProviderは未接続 | [Sky Market決済と旧収益精算](../docs/sky-billing.md) |
| [`sky-web/`](sky-web/) | Sky専用Siteの配備adapter。同じSky UIと認証済みAPIを載せる。既存のOS用DBを初期化・置換しない | [README](sky-web/README.md) を参照 | [Skyローンチ設計](../docs/sky-launch-design.md) / [ローンチ運用](../docs/sky-launch-operations.md) |
| [`operator-dock/`](operator-dock/) | 運営専用の端末管理面。利用者向けOSの画面・API・DBと分離する | 専用hostname・Access・D1・WebAuthnの設定はowner待ち | [README](operator-dock/README.md) / [緊急アクセスとインシデント対応](../docs/security-incident-response.md) |
| [`android-attestation-verifier/`](android-attestation-verifier/) | AndroidのKey Attestationを、端末gatewayの鍵登録前に検証する独立JVMサービス | [README](android-attestation-verifier/README.md) を参照 | [Android / Device / Local AI](../docs/workstreams/07-android-device-local-ai.md) |

dry-runの出力（`services/**/work/`）はGitに入れません。
