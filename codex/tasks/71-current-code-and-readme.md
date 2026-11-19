# 71 最新コードとREADMEの統合

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

対象resale/workflow29件成功、planner/device関連44件成功、型検査成功。全verify、独立検収、PR同一SHA CI、merge後CIを引き続き確認する。検証ログはGit外、要約はdata/project-status.json#currentGitRefreshへ。

## 実行しない境界

実売買/送金/外部応募/本番DB migration/公開再配備/実機flashはGit整理の成功へ置き換えない。
