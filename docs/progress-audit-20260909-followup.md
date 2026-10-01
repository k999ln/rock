# Rock進捗監査の追補 — 相違解消プロンプトの改訂

確認: 2026-09-09 15:01 UTC。改訂前の入力snapshotであり、以後の最新状態を保証しない。[初回監査](progress-audit-20260909.md)は変更せず履歴として保持する。

## GitHubとコードの確認

- main: `f9b1cbd99eeaa20f7cbc80bd2d88909949cca863`。製品ベース/監査/作成規約と検査を保存済み。[同SHAのverify成功](https://github.com/k999ln/rock/actions/runs/34361956139)。
- native: `codex/integrate-native-os-20260909` / `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`。変更なし。[PR #1](https://github.com/k999ln/rock/pull/1)はOPEN、mergedAt=null、main未統合。
- native同SHAのCI: [source-tests](https://github.com/k999ln/rock/actions/runs/34318525801)、[Android prototype](https://github.com/k999ln/rock/actions/runs/34318525747)、[Web verify](https://github.com/k999ln/rock/actions/runs/34318525748)はsuccess。
- `npm run prompt:context` で全branch、open PR、直近closed PR、各SHAのchecksを読み取り。入力時の作業checkoutはmainと同じSHAでclean。対象のAGENTS、README、project/status、CHECKPOINT、native統合/検証資料、商品制限・runner・Wallet試験/資料を照合した。
- mainへのベース保存以降に、nativeで要望に反する新しい実装が進んだ証拠はない。ただし未反映・未実装・未検証は残っている。

## 解消すべき問題

| ID / 対象RQ | 確認した事実と原因 | 修正担当・順序 | 解消の証拠と残る境界 |
| --- | --- | --- | --- |
| GAP01 / RQ09〜10 | nativeに新しいベース/作成規約がなく、`AGENTS.md`、`CHECKPOINT.md:84`、statusの次作業は起動→機種選定が先 | Rock基盤担当。段階0/B04でベースとnativeを分離作業branchへ統合し、全入口・次作業を同期 | 両入力SHA、統合commit、競合解消内容、次作業、baseline/project検査。main保存のみでは解消でない。元native/mainへの未反映は別記録 |
| GAP02 / RQ03〜05、08 | `systems/rock-star-os/src/blackberryrock/packages.py:149`はUSD 0/run以外を拒否。runnerのcloudはTLS loopback、pc_usbはUnix socket fixture | Rock共通契約/adapter担当。段階1の実利用で不足を特定し、段階2/B02で互換な商品条件・資格・費用・実行を接続 | 非ゼロ料金/外部契約/BYOKの開始・拒否・adapter実行・receipt/費用照合。JSON追加だけで完了にしない。実provider対応は別の接続証拠 |
| GAP03 / RQ06、08 | Walletの既存台帳はあるが、`CHECKPOINT.md:73`と`os/wallet_backend/README.md`に実売上/金融provider未接続。合成売上を実収益と数えられない | Rockの取引/台帳adapter担当。段階3/B03で商品/Run/取引/費用/売上を既存台帳へ関連付け | コード・fixture・provider sandbox・認証済み実取引を別状態で判定。fixtureだけなら実収益未接続は未解決。実資金の開始は別承認 |
| GAP04 / RQ01、07、11 | 既存native商品と過去のhost/guest試験はあるが、新要望のPC比較/準備込み実利用/不便の改善前後測定は未実施。mainのB02/B03はplanned | Rock Hub/UI/adapter担当。段階1で改善前を測り、段階4で同条件の再試験 | 提案・引用・PC1商品をHubから実処理、操作/時間と改善内容を記録。host画面だけで携帯実機の価値を実証したとはしない |

段階0→1→2→3→4を主順序にする。N02起動/安全性がHub試験を妨げる場合は最小の修正を先行する。NタスクやBlackBerry実機計画は削除せず、独立したHub/Wallet試験を実機待ちで一律に止めない。OS02〜OS05はAndroid/AOSP別トラックと分かる表題にする。

## 今回の保存範囲

利用者の「指摘した問題を解決する内容を含めて作業を進めるプロンプトを作る」に従い、[改訂プロンプト](prompts/hub-wallet-next.md)と作成規約を更新する。RQ10にこの再発防止を追記し、機能/料金/ハードの確定方針は変えない。

これはプロンプト/引継ぎ文書の保存であり、native PRのmerge、作業branchでのnative統合、Hub実利用、商品料金のruntime拡張、Walletの実売上接続、実機/本番の試験を今回実施した記録ではない。B04/B02/B03/B05はplannedのまま。B02は段階1〜2の基礎、B05はWallet基礎後の最終比較として依存を分け、B03全体の実サービス完了前でも台帳/fixture基礎の証拠を使ってB05へ進める。実行担当は段階ごとの証拠が揃ってから更新する。

今回の文書検査と既存コードの回帰結果は [validation](validation.md) の本改訂欄へ記録する。GitHubに保存する文書のcommitは、この監査の入力SHAとは別である。
