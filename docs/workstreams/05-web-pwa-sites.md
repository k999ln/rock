# Web / PWA / Sites

## 目的

Home、Sky、Chat、Wallet、Market、Settings、Studio、事業画面を一つのWeb/PWAとして提供し、GitHub source、build asset、D1 migration、Sites配信版を同じcommitへ固定する。

## 現在地

- `/rockstaros`はavocadoMiniの製品構想を先に紹介し、OS Developer PreviewとSky開発者入口へ続く。Home `/` はOSの作業画面として維持する。
- 製品紹介は利用者の「やってみたい」から入り、Sky／Zema／Studioで得られる役割と体験を明示する。料金方針は販売文句の先頭に置かない。
- 主要画面、PWA manifest、Service Worker、明示更新、security header、D1 APIを実装済み。
- 本人限定Siteは存在するが、最新版sourceとの一致とログイン後の実操作確認が残る。
- GitHub READMEから製品紹介、OSガイド、Home、主要アプリへ直接進めるリンクを記載した。製品紹介ページ内にもHomeと主要アプリの入口を用意した。現在のSites接続では既存配信projectを取得できず、最新版配備と認証後の導線は未確認。
- 一般公開は製品licenseと本人承認が未完了のためblocked。
- GitHub sourceとSites配信版の同一commit確認が残る。sourceの検証結果を配信版の合格へ流用しない。
- 全ローンチ候補のうち本人限定Web/PWA Previewは必須gateが最新版source同期だけ残っており、最短ローンチ経路とする。

主なtask: `WEB01`〜`WEB06`, `R03`〜`R08`, `LCH04`。

## 次に進める順番

1. Web/PWA・D1・進捗の現在差分を、別作業を混入させず一つのcommitへ固定する。
2. typecheck、route style、PWA、security、migration、production buildを実行する。
3. GitHubへ同じcommitを保存し、build asset closureとsource SHAを記録する。
4. ownerの最新版同期承認後、本人限定Sitesへ同じSHAを配備し、認証後の主要導線とAPIをreadbackする。
5. 一般公開はlicenseと公開承認、QEMUはproduction署名、Androidは対象端末を別gateとして通す。

## 完了条件

- GitHub、build、Sites versionが同じsource commitを指す。
- migration unionが過去のD1 dataと新規tableを両方保持する。
- Homeから全主要機能へ到達し、全非Home画面からHomeへ戻れる。
- production responseでPWA identity、asset、security headerを確認する。

## 関連資料

- [Deployment integration](../deployment-integration.md)
- [Release artifact access](../release-artifact-access.md)
- [Web validation](../validation.md)
- [Release readiness](../../data/release-readiness.json)

## 検証

- `npm run typecheck`
- `npm run build`
- `npm run release:web-bundle:check`
- `npm run release:web-assets:check`
- `npm run test:api`
