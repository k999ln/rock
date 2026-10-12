# Version boundaries

RockstarOSの版表示は一つの数字ではない。製品表示、Web package、native開発基盤、QEMU配布候補、Android試作を別々の責任境界として扱う。正本は `data/product-identity.json` と `data/version-boundaries.json`、自動検査は `npm run version:check` とする。互換性のため内部識別子 `dev.rock` と既存の `rockstaros-*` schema／URLは変更しない。

| 境界 | 現在値 | 意味 |
| --- | --- | --- |
| 製品表示 | RockstarOS 1.0 Developer Preview | 利用者向けの開発版名称。一般公開済みを意味しない |
| Web package | 0.1.0 | Webアプリのpackage版。OS配布版ではない |
| native foundation | 0.3.0 | Python開発基盤と互換profileの版 |
| QEMU配布候補 | 1.0.0-preview.20260911-rc2 | `b7d819c…`へ固定された非公開候補。現在のWeb mainではない |
| Android試作 | versionName 0.1.0 / versionCode 1 | Broker、Shell、Tool、Operator Agentのsource・emulator試作APK識別。実機公開版ではない |

Gitの現在mainはbuildまたは配備時に外部から解決する。repository内へ「将来mergeされた結果のSHA」を自己記録しない。固定配布候補だけがexact source commitを保持し、GitHub保存、Sites配備、一般公開、署名済みreleaseを別イベントとして扱う。
