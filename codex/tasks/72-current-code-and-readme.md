# 72 最新コードとREADMEの統合

本人指示: コードも整理し、GitHub保存・main統合まで進める。READMEに古い情報を載せない。

## 採用範囲

- main 1cb703d0 + PR320（Noah/Eveの画面・URL）、PR318（工程計画・会社受注計算）、PR313（mii研究資料）。
- AMC goal cycle c3e2e494a、本人用Noah resale Web/CLI、全社担当設定。
- 探索全状態の上限と未到達/打切りの区別、競合quorumの支払寄与禁止を追加。
- READMEを現在の名称・製品説明・画像・使用方法・コード・受入範囲へ再構成。受領票はCHANGELOGへ。進捗生成先をproject.mdへ戻し、archiveは変更しない。
- mii研究の「成立」「安全」「保証」の断言を設計目標/未実測へ訂正。

## 保存と採否

旧作業木の2,082pathを `work/git-refresh-20261119/working-tree-before.tar` へGit外保全し、2,075現存fileのSHA256を読戻し確認した。354pathはmain同一、357pathは生成物/ローカル設定。既存 `data/runtime-integration-audit.json` の採否を再利用し、rootのwork-storeや旧URL処理をmainへ上書きしない。

Pixel portable/host/claim/stop、Mini firmware/hardware/spatial、camera/module、Agent共有・作者精算、独自media編集は、main schema/APIへ未再受入の保全候補。特に旧0080〜0084移行を現0020〜0032/別main系列へそのまま適用しない。これらを今回のruntime合格に含めない。

PR308のMATOU aliasは現mainに既存。古いPRのCI成功や未追跡という状態だけで再採用・削除を決めない。生成物・原稿・秘密・実DBをcommitしない。

## 検証

`0211c1892`で全verify成功。本体4,053件中4,049成功・失敗0・環境skip4、build、API、Web asset288/missing0が成功。resale/AMC demoもexit0。独立検収はplanner/research27件、resale24件・リンク照合がpass。実際のmerge状態と同一SHA CIは[PR321](https://github.com/k999ln/rock/pull/321)を正本に確認する。検証ログはGit外、要約はdata/project-status.json#currentGitRefreshへ。

## 実行しない境界

実売買/送金/外部応募/本番DB migration/公開再配備/実機flashはGit整理の成功へ置き換えない。

保存用runtime: [codex/preserved-runtime-source-20261119](https://github.com/k999ln/rock/tree/codex/preserved-runtime-source-20261119) / `7a0e1091`、remote SHA一致・Gitleaks0。旧schema依存の未受入コードへmain合格を転用しない。

原本文書を含む全テキストsourceは[codex/preserved-local-source-20261119](https://github.com/k999ln/rock/tree/codex/preserved-local-source-20261119) / `3f3b0e67`へ保存・remote SHA一致。Gitleaksの19指摘は独立検収で17件のSHA-256と2件の説明文と確認し、実credentialの指摘は0件。生成物・実DB・ローカル設定・媒体はGit外backupに保持する。

最新main `aa533e1df`（PR322）を通常mergeで追加。READMEはNoah単体登録・審査・Mac Runnerの現状へ同期し、過去の日付別実績はCHANGELOGと元taskに保持。Workのresale/outbox/operation/local実行を併存させ、汎用操作の拒否を維持。task71はNoahローンチに割当済みのため本件はtask72へ変更。追加統合後の`4ebe83cd7`でローカル全verify成功、全verify CIを含む8件も成功。本体4,426件中4,422成功・失敗0・skip4。独立検収71試験と汎用操作16通りの拒否・状態不変を確認。merge途中のSPIDER path上限失敗はcommit固定後に解消し、上限を変更していない。

main統合: PR321は`37ef2bfd`へmerge済み。merge後verifyはbrowser fixtureの待機timeoutで失敗し、後続PR324を含むmain `697be21c`では全6チェックが成功。PR324の認証・競合テスト修正を保持し、READMEに戻った公開版番号・過去の修正記録のみ現在の認証案内に整理する。

2026-11-20の明示回答で商品優先順位を確定: miiが主、Noahが最小出発点、最初は本人Mac、次に声/Eve/空間表示のmii体験。SIM/eSIMはOS導入系統。README・baseline・構成/戦略・次回promptへ同期し、元のRQ/料金/実機受入を保持する。参照Noahチャットの現在進捗は個別証拠で再確認し、13/85等の過去限定試験を新しい全体合格にしない。

参照Noahチャットの同一base `697be21c`に残る3差分（Noah受付文言、端末承認の使用済みコード/状態再読込み、UI回帰）も元の作業木を変更せず取り込み。原本hashは進捗JSONのreferenceNoahDeltaに記録。権限発行や本番操作は実行しない。

最終検収: 方針・旧優先順位整理は独立pass。参照Noahの3差分も独立pass・原本hash一致。baseline/Codex対象12件、Noah/端末承認関連26件、型検査と設計/進捗整合は成功。最終headのCIとmain状態は[PR325](https://github.com/k999ln/rock/pull/325)を確認する。
