# Hub初回利用と保存結果の改善

RQ01/03/05/06/07/11 / 逆張りの問い・秘密を探す・0→1 / 初回サンプルが商品に合わず、保存結果の版も見失う / 既存native recipe・Hub履歴・Wallet / 商品別の公開fixtureと実行版の表示 / 有効な初回成果・手動入力・版の誤表示 / 旧OSの実操作＋C操作回帰、最終候補QEMUは別受入。

## 実際に観測した不便

旧OS `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9` を新しい専用deviceで起動し、引用整理の選択・導入・同意・サンプル入力・実行・履歴再表示・Wallet・通常終了をQMPの実入力で操作した。[実画面](evidence/hub-wallet/onboarding-20260910/before-result.png)の結果は `Plan the day` 等の汎用英文で、引用を一つも含まない。既存recipeによる実処理は成功したが、最初の例から商品の用途を確認できなかった。

終了後collectorの誤った `Monitor.drain` 呼び出しで元観測reportはFAIL。その記録を変更せず、別の[停止後読取照合](evidence/hub-wallet/onboarding-20260910/before-closed.json)で、通常終了event、実job1件、元sampleのrequest hash、input bytesと同一output、金融記録0を確認した。69.99秒は自動操作/OCR/起動待ちを含み、人の操作時間や改善率ではない。初回debugfsのPATH不足はboot前に停止し、別runとして保存した。

run44の[削除後の結果](evidence/os-base/run44/0621-result-after-delete.png)では、保存されたv1.0の標準出力に対して、カタログ最新版の「提案下書き（簡潔）」という別名を表示していた。結果自体は保持されており、表示する名前の参照先が原因だった。

## 最小修正

- 「サンプルを入力」は、引用整理では引用と保護対象のコードを含む既存公開fixture、提案下書きでは既存の構造化した案件例を入れる。サンプル選択だけでは実行・課金せず、本人の「実行する」を待つ。商品ロジック・価格・署名packageは変更しない。
- 履歴と結果の名前は実行時の版・package hashに対応するmanifestを使う。削除や更新後も最新版の別名へ置き換えず、対応するmetadataがなければ商品IDを表示する。結果には実行版を併記する。
- 合成Walletの結果画面に、実費・実収益の接続は未接続であること、仕事の成功ではテスト残高が増えないこと、結果は履歴から再表示できることを示す。Walletへ直接移動でき、未接続を0円の実収支へ換算しない。

## 検証と残る範囲

[host検証記録](evidence/hub-wallet/onboarding-20260910/host-tests.json): Linux上で実Cのポインタ操作、sample入力、明示runと既存requestの一致、描画を回帰確認。業務UIの契約/観測器41件がskipなしで成功。[引用sample](evidence/hub-wallet/onboarding-20260910/candidate-citation-sample-host.png)と[削除後の実行版](evidence/hub-wallet/onboarding-20260910/candidate-deleted-result-host.png)はhost rendererの画面であり、新OSの実機画面ではない。

`verify-business.py`の削除後の期待名は実行版へ合わせた。5boot、61jobs、3600秒、元期限、OCR確信度、資源上限は変更していない。旧凍結hosttoolsは変更せず保持する。

次は統合した同一配布candidateで、sample→実処理→成果/Wallet→再起動後再表示を再測定する。native引用recipeとMr.版は出力形式が異なるという既存比較を保持し、成果品質を正規化して同一扱いしない。実PC切断/再接続、手動操作時間、継続利用、実機価値は、このhost修正だけでは未検証。
