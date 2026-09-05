# 検証記録

確認日: 2026-09-04（米国東部時間）。

## 実施

- 初期ページのローカルHTTP応答: 200。初期版の表示をCodexへ要求（queued）。
- TypeScriptの型確認。
- 試算・ウォレット応答の自動テスト7件: 無収入時の料金0、低収入で控除上限、実コストを含む赤字、月額上限、円丸め、無効値拒否、Ethereumアドレスの形式、ユーザーキャンセル/保留中リクエスト。
- 配信用ビルド。
- 公開API実行: `transcription` でGitHub/Hugging Faceから合計24件の候補を取得、失敗0。取得物は非実行JSONとして保存し、掲載候補として扱う。
- 初期雛形の依存部品に既知の問題11件があったため、互換性を合わせて修正版へ更新。更新後npm installの監査結果は0件。将来の脆弱性まで保証するものではない。

## 未検証・未連携

- ブラウザのクリック・画面サイズ変更・スクリーンショットによるUI検証は未実施（依頼範囲外）。
- WebMCPを実行・検証できる接続手段が今回の環境では見つからず、登録・成功/失敗の実機契約確認は未実施。通常UIは非対応ブラウザでも利用可能。
- 実ウォレットとの接続操作は未実施。アドレス形式と失敗メッセージのテストのみ。
- 認証署名、実決済、ファンド入金、収益分配、ココナラ自動操作は未実装のため検証対象外。
- 稼働収益、ユーザー数、実測電力・通信量の根拠は提供されていない。

## Mr.取り込み後

- GitHubの固定commitから4ファイルを取得し、原本のSHA-256を保存。
- 追加テスト12件: 出典の重複、コード/非リンク出典の保持、出典欄が先にある原稿、出典内のコード、有料本文を残す制約、不正URL等、案件条件、Python原本との照合、結果ファイルの上書き拒否、納品証跡の正常/自己レビュー/改変/パス異常。既存7件と合わせて19件。
- Pythonのローカルパックは架空の原稿・契約・レビューで実行。実アカウントへの応募・納品・投稿は実施していない。

## Fund Club / MCP update

- 27 Node tests pass, including all four real stdio MCP calls, supplied-file delivery verification, tamper rejection, POSIX/Windows path rejection, huge integer resilience, malformed messages, and 1,200 fund accounting cases.
- The production Worker build was run locally with the same migrated D1 state directory. Auth required, per-user plan isolation, plan PUT/GET persistence, invalid plan rejection, Origin checks, and idempotent run metadata all pass. Synthetic test users only.
- Loopback Streamable HTTP: initialize → initialized notification (202) → tools/list (4) → Python delivery sample (PASS). Unauthorized Origin/Bearer, unsupported protocol, GET405, and private-network preflight checked.
- TypeScript, scoped lint of changed product components/routes, and production build pass. npm audit has zero findings after an esbuild override for Drizzle's development dependency. The untouched generated UI catalog retains baseline full-project lint findings.
- The final installable app front has a direct home screen, four ready fund presets, one preparation-only preview, activity history, and settings. No fabricated balances, yields, participant totals, or paid gacha. Real tool completion and sample runs have distinct labels.
- PWA manifest, 192px/512px icons, and service worker endpoints return 200 locally. The app shell does not cache API responses or tool input.
- Browser screenshots/click QA were not requested and were not performed. Loopback HTTP was verified at protocol level; a browser may still require the user's initial local-network permission. WebMCP list_funds/select_fund is feature-detected; the stdio/HTTP MCP transport is the verified execution integration.
