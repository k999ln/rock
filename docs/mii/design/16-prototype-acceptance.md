# 16 試作受入と記録票

V1.1設計追補 / 2026-11-02。すべて今回の実機結果は **NOT_RUN**。既存 [11章](11-acceptance.md) の性能目標、従来SC/OI/DP等のgateは維持する。本章は共通OSの一周と試作段階を結ぶ。

## 1. 合格の単位

同一prototype ID、BOM版、software SHA、profile、driver/model版、room/calibration版で測る。途中変更は別attempt。計算、host fixture、実browser、実sensor、光学、本番を別に記録する。動画の見た目やPRのCI成功だけで製品合格としない。

| ID | 試験・入力 | 合格条件 | 証拠・責任 |
| --- | --- | --- | --- |
| A01 | 声で依頼内容を変更、指先で対象選択、確認→保存 | 同じowner/job、expected revisionから1回だけ更新。event読戻し一致 | 原音を含めない操作記録/command ID/前後revision。JOINT |
| A02 | 同じjobを開いた別画面が先に編集 | stale revisionは拒否。上書きせず再読込。別ownerは参照/編集拒否 | API応答とstore読戻し。ROCK→JOINT |
| A03 | 保存送信後に応答を失う | `unknown`表示、自動再送0。再接続後に同じeventを照合 | 通信切断条件とevent数。JOINT |
| A04 | 保存完了後にアプリ終了/OS再起動 | 認証後に同じjob/revision/成果を復元。新jobや再課金を発生させない | 再起動前後record。JOINT |
| A05 | 別端末で同accountを再認証 | 同じjobを継続し、能力不足を表示。旧端末の物理制御権限をコピーしない | 2台のdevice/profileとjob照合。JOINT、未実装差を記録 |
| A06 | 入力対象が複数/古い/校正違い/追跡喪失 | 誤対象への保存・実行0。確認を無効化。入力復旧後に再選択 | negative casesの全件結果。JOINT |
| A07 | 停止、worker応答喪失、display ACK喪失 | job cancel/worker/物理停止を別状態で表示。未確認を成功にしない | journal＋独立した物理観測。JOINT |
| A08 | 2/4 Node全stream＋AI負荷を60分 | drop/skew/queue/p50/p95/p99と最大遅延を記録し11章の各目標を判定 | 実byte数/clock対応/負荷/温度。JOINT |
| A09 | idle/入力/推論/最大出力/起動の電力 | 境界ごとのW・peak・温度を測り仕様内。未知のlossを0として扱わない | meter型番/時系列要約/環境温度。JOINT |
| A10 | 各Node切断・配置変更・再接続 | quality降格、旧校正/epochの拒否、許可と校正確認後に復帰 | topology/quality/出力停止ログ。JOINT |
| A11 | MIC OFF／camera停止／他owner | 無同意取得・保存・送信0。再開には有効な本人とscopeが必要 | 権限と取得状態の読戻し。ROCK→JOINT |
| A12 | 予算不足／model未対応／WAN断 | 有料の代替実行を勝手に開始しない。予約/実費/不明を保持 | 既存budget/usage台帳。実資金は不要 |

A01〜07が通っても全機能の完成ではない。現在sourceの2D編集だけでA05の全端末移行やoffline編集を合格にしない。

## 2. 表示4条件の別受入

| ID | 維持する条件 | 測定するもの・保留条件 |
| --- | --- | --- |
| O01 | 像の場所に板/膜を置かない | 実光路、像位置、遮蔽物、視点ごとの見え方。壁投影はこの条件の合格対象外 |
| O02 | 少ない表示部 | head/光源/光学部品の実数・外形・設置体積。隠れた多数部品を除外しない。許容数は本人判断で固定 |
| O03 | 上下を含む全範囲 | 事前に固定した領域/視点/同時利用条件の成功・未達map。有限格子0未達を連続全域と呼ばない |
| O04 | 低眩しさ | 輝度/視域/露光/反射、通常/故障時、本人の快適性。測定法/限度を光学担当と確定するまで未合格 |

Gen1の運動視差投影はその方式のD試験だけで判定。O01〜04への変更・撤回は今回の「OS共通」回答に含まれない。低眩しさの感想を眼安全の証明にしない。高出力IR・光学は専門担当が試験条件と遮断を整えた後に人体試験へ進む。

## 3. 記録票（複製して使う）

```yaml
test_id: A01
status: NOT_RUN # PASS / FAIL / BLOCKED / NOT_RUN
plane: physical_sensor # host_fixture / browser_synthetic / physical_optical 等
prototype_id: null
attempt_id: null
software_sha: null
bom_revision: null
hardware_profile: null
driver_model_versions: []
room_calibration_revision: null
conditions: {duration_s: null, ambient_c: null, input_rate_hz: null}
instrument: {model: null, calibration_date: null, uncertainty: null}
procedure: null
expected: null
measured: null
artifact: {location_outside_git: null, sha256: null}
failure_and_recovery: null
operator: null
reviewer: null
remaining: null
```

秘密・本人映像/音声・鍵・住所はGitへ入れない。Gitには匿名化した要約、source/BOM/hash、再現手順だけを残す。生データの保存場所と保持期間は本人の同意で決める。

## 4. 次の設計確定に必要な入力

[18章](18-parts-wiring.md)でMac実機情報とP0b/P1aの型番・端子・W-A01〜07を定義した。次は選定品の現物/board版を照合し、W-A01〜04の組立・列挙を測る。projector型番は未確認で、P0は内蔵画面を使う。未所持なら [部品相談資料](17-component-evaluation-brief.md) の必要品を用意する。P0一式を確定→A01〜04/06/11/12→P1の同期・精度→P2の拡張→製品光学/筐体の順に進む。全体予算・製品形状が未確定でも既存sourceの確認と試験手順の整備は継続できる。

P0のcamera/micはbrowserで実選択した機材を記録する。現在sourceは640×480・15fps ideal/最大30fps。日本語端末内ASRが利用不可ならA01の音声をBLOCKEDにしtext試験と分ける。P1aのLAN疎通は撮像adapter・2台同期・3D精度の合格ではない。
