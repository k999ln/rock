# RockstarOS AVB rollback index運用

決定日: 2026-09-16
状態: **運用規則決定済み／正確なlocation・初期値・実機試験は未完了**

正本は`data/android-rollback-index-policy.json`。対象はGoogle Pixel 10 / `frankel` / GL066。

## 採番

RockstarOSが管理するrollback indexは、署名対象のrelease manifestへ事前固定したUTC Unix秒`releaseEpochUtcSeconds`を使う。build時の現在時刻を読み取って勝手に採番せず、署名前にreviewした値だけを使う。同一release内のRockstarOS管理locationは同じ値を使用できるが、直前のproduction releaseより必ず大きくする。

`1.0`、`1.5`、`2.0`などの商品versionとは連動させない。version名を戻したりbranchを作り直してもrollback indexは戻さない。

Googleが管理するbootloader、radio、vendor firmware等のrollback値は、対象の純正source／binaryが持つ値をそのまま維持する。RockstarOS側で代替値を作らず、Android 16の古いbootloaderを復旧用として書き込まない。

## location

rollback index location番号は事前に推測しない。最終full buildのtarget-files、BoardConfig、署名後AVB metadataから全locationと値を抽出し、同一artifactの証拠として保存する。現在の`approvedMap`は空であり、この状態ではgateを通さない。

## A/B更新

- trial中の新slotからstored rollback indexを進めない。
- 新slotが正常起動し、A/B metadataで`SUCCESSFUL`になった後だけstored indexを進める。
- 新slotが失敗した場合は、それまで起動可能だった旧slotへ戻す。
- fallbackのためにstored indexを下げない。
- index確定後に旧slotが新しいstored indexを満たさなくなった場合、その旧slotをfallback可能とは表示しない。

## downgradeと復旧

署名が正しくても、保存済みindexより小さいimageは拒否する。data救出、保守、緊急診断を理由に例外を作らない。復旧には現在のrollback条件を満たすmatching full OTAまたはfactory imageを使う。

## 合格条件

1. 最終target-filesから全location/valueを抽出する。
2. 署名後imageのAVB metadataが台帳と一致することを確認する。
3. trial slotではindexが進まず、成功確定後にだけ進むことを実機で読む。
4. 失敗したtrial slotから旧slotへ戻れることを確認する。
5. stored indexより古い署名済みdummy imageが拒否されることを確認する。
6. 現行純正full OTA／factory imageで、indexを下げずに復旧する。

この証拠が揃うまで`rollback-index-operations`はblockedのままにする。
