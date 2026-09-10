# Rock — 実装・検証の保存時点

記録: 2026-09-10 UTC（作業日の現地日付は2026-09-09）。この文書は途中成果の統合記録であり、製品要件や合格条件を変更しない。承認済みの[設計v1.1](os-hub-wallet-game-design.md)、[実行プロンプト](prompts/os-operational-base-next.md)、[製品基準](product-baseline.md)に従う。過去の監査は当時のsnapshotとして保持し、現在の状態はこの記録と[進捗の正本](../data/project-status.json)を参照する。

## 利用形態と公開範囲

Rockの中心は端末上のHubとWallet。Webには既存の検索・PCツール実行・仕事の進捗などがあり、端末の補助・管理入口も担う。Web全体を管理専用画面に変更したわけではない。Macのブラウザで開く今回の試用画面は、専用の仮想端末で動くARM64 Linux OSの画面である。

現在確認対象のPixel 10はGrapheneOSを維持する。用意したAndroid P1 APKは記事処理の試用アプリで、OS置換・Wallet・ゲーム交換を提供するものではない。BlackBerryは実機到着前で型番未確認。いずれも今回、OSを書き込んだ実機試験の成功を主張しない。

準備できた範囲の公開は利用者から承認済み。この保存は作業branchと[PR #2](https://github.com/k999ln/rock/pull/2)への追加であり、mainへのmerge、本番Webの配信切替、スマートフォン用OSの公開を意味しない。実資金試験への意向も、未実装の送金・受取りを利用可能とする根拠にはしない。MetaMaskは既存Webのアドレス接続までで、送金・受取りのproviderは未接続。

## 保存した実装と検証

| 対象 | この時点の成果 | 判定の限界 |
| --- | --- | --- |
| 凍結OS `b8287bc` | Hub商品の実処理・履歴保存、更新・通常終了・復元を含むD0〜D5の限定受入 | QEMU開発条件の結果。後続のゲームruntimeを含まない |
| Mac試用端末 | 修正済みlauncherで3回目の起動、保存結果の再表示、通常終了、停止後データ一致 | このMacの既存環境を利用する入口。別Mac用インストーラーではない |
| GX00接続client | 送信前の要求保存、同じ要求の再送、応答喪失後の再照合、現在の認証・TLS設定の確認 | 合成データのhost client。完成した作者SDKやOS画面ではない |
| GX00 current-copy引継ぎ | Cの実ロックと現在世代の証拠を用い、元のゲームindex・同意・receipt・失効・既存台帳を保持して移行 | 全ownerを止める同一host内の管理fixture。任意の過去backupや別hostへの復旧ではない |
| GX01 | [交換契約の実装計画](gx01-contract-implementation-plan.md)を追加 | 設計のみ。通貨交換・予約・付与・返金は未実装 |

Mac最終確認は[機械記録](evidence/os-base/mac-trial-20260909/final-mac-trial.json)と[実画面](evidence/os-base/mac-trial-20260909/final-result.png)を保存した。電源以外のデータ、3 receipts、1 job、以前の電源2件を保持し、今回の電源1件を追加。通常終了eventとe2fsck終了0を確認した。2回目の監視期限超過は元のFAILとして残る。

ゲーム接続clientとcurrent-copy引継ぎの統合は、実ローカルTLS・SQLiteを使う72件が64.988秒で成功した。[統合試験とsource hash](evidence/gx00/current-game-integration-root.json)、[client仕様](gx00-owner-connection-client.md)、[引継ぎ仕様](gx00-current-game-restore.md)を参照。これだけでGX00全体の合格にはしない。

保存差分のプロジェクト検査は、型・lint・ビルド・正本/進捗整合、54 unit tests、143 API assertionsが[成功](evidence/gx00/checkpoint-project-verify.json)した。独立した[GX00ゲート監査](evidence/gx00/gx00-host-gate-independent-review.md)は未合格と判定し、追加4例は[未実装・未検証の再開記録](evidence/gx00/owner-tls-continuation.json)に留めている。既知課題の修正候補を完成済みコードとして取り込んでいない。

前の公開commit `d16ba2d34e42e69ce9c948101f538658c170a68d` はWeb・Android・nativeのCIが成功し、native Pythonは1357件、skipなし。[同SHAの記録](evidence/os-base/ci-d16ba2d-summary.json)。この件数を新しい差分や凍結OS imageの試験件数へ付け替えない。

## 合格にしていない点

1. **D6は未合格。** run43は正常終了4サイクル後、反復41件まで完了。Macの低電池休止を跨ぎ、次の入力画面認識と観測の期限を超過した。失敗後は通常終了し、既存分を含む47 jobs・55 actions、非対象台帳、A/B、過去receiptの保持を確認した。元の失敗報告を書き換えない。[run43記録](evidence/os-base/43-summary-b8287bc.json)。AC接続下の別run44で同じ5サイクル・61件・60分と元の期限を試験中であり、この保存時点では結果未確定。
2. **GX00-ISOLATIONは未合格。** 同じ認証済みTLS経路での両owner同月各888、多端末の一度だけの請求、片方の残高不足の非波及、他ownerのATM quote/既存receipt拒否、handlerのscope復帰について追加の受入確認が残る。別gameで同じreconcile keyを使うと誤衝突する事例も再現され、修正前の既知課題として残す。今回のowner clientは意図的に `(operation,key)` 単位で要求を保持するため、別gameにも別keyが必要であり、一般SDKのゲーム間key再利用を満たすものではない。
3. **管理復元の範囲は限定。** PREPARED後に作者を失効すると失効は保持され、固定した移行前データと一致しなくなるため、同じIDでも自動再開できない。全ownerの管理停止を保ち調査が必要。DONE再送も通常利用の再開前だけを対象とし、後から過去receiptを読む一般APIではない。
4. **次のOSへの台帳変更は別受入。** 今回のGX00追加を凍結OSに入れたと扱わない。新imageには旧client/旧slot互換、データABI、途中移行、保留・receipt保持、D4/D5の再検証が必要。
5. **公開通貨交換・正式ゲーム・実資金・作者SDKは未完成。** GX00合格前にGX01-CONTRACTを合格へ進めない。月888、ATMのRock手数料0、既存台帳の継続を保持する。計画中のゲーム比率や手数料は明示的な合成fixtureだけで、本番条件を決定したものではない。

再開時は進行中run44の元報告・計画・終了状態を最初に取得し、途中の画面や試験件数だけで合格にしない。次にGX00の既知の衝突と不足する受入例を確認する。すでに成功した限定試験と未完成のゲートを分けたまま、進捗の正本からREADMEとproject.mdを同期する。
