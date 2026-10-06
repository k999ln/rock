# avocadoMini — 本体SIMによる単独通信

2026-10-05。利用者の明示選択は**「Miniに入れて、Mini単体で通信する」**。Pro、外部PC、スマートフォンのテザリングを携帯回線接続の必須条件にしない。本書は設計追加であり、モデム搭載・開通・実通信の完成ではない。MAT15のMini筐体/電源/熱/実機受入に接続し、SIM01のcarrier接続・service entitlementとは別の状態で追跡する。

## 使い方と役割

Miniへ対応した物理SIMを入れ、外部電源につなぐ。初回にSIM/PIN/回線設定を確認し、対応回線へ接続する。接続後はゲームの取得・オンライン機能・本人が選んだcloud AI等へアクセスできる設計にする。対応国、通信会社、plan/APN、module SKUは未指定で、SIMを挿すだけであらゆる回線へ接続できるとはしない。

Mini本体の基本ゲーム・入力・保存・停止はofflineでも動くR5要求を保持する。携帯回線は処理能力を増やさない。重いPCゲームは任意のPro連携、または別途受入したcloud streaming等で扱う。cloud gamingはservice対応、codec、映像出力、入力、遅延/揺らぎと利用条件を個別に確認する。SIM対応だけで空間表示や全PCゲーム対応を合格にしない。

```text
物理SIM ─ SIMインターフェース ─ 4G/5Gモデム ─ RF/アンテナ ─ 携帯基地局
                                      │
                             Miniの通信driver/接続管理
                                      │
                           RockstarOSのnetwork状態
                                      │
                     ゲーム / Sky / Zema（各権限・本人同意）
```

SIM認識、携帯網への登録、データ通信、Rockstar本人ログイン、サービス利用権、cloud実行、料金確定を分離する。Proなしで回線が使えることと、Pro相当のゲーム性能があることは別。複数Miniは各々の回線が基本候補で、一枚のSIMや一契約の共有を勝手に実装しない。ローカルの複数台協調は既存の認証/校正/停止契約を保つ。

## 追加するハードウェア

- 本体内の物理nano-SIMスロット、SIM interface、ESD対策、アクセス可能なtray。SIM入替の手順は最終module/slot仕様で固定し、hot swapを未検証で約束しない。
- 4G LTE / 5G Sub-6対応のmodem候補。最終SKUは利用国/通信会社/band、driver、供給、消費電力、温度、サイズから選ぶ。5Gへの接続や最大通信速度は保証値にしない。
- 選定moduleに適合した数・bandのセルラーアンテナ、同軸、connector、RF設計。銀色の金属外装の内側へ置くだけで受信できるとせず、樹脂RF窓、離隔、手や床の影響、Wi-Fi/BT・cameraとの同時動作を検証する。
- modem向け電源rail、peak電流余裕、reset/disable、温度監視、USB/PCIe等のhost接続。電圧、pinout、power-on sequenceは取得したメーカー設計資料とexact SKUに従い、推測で通電しない。

設計比較の例としてQuectel RM520N系はM.2・30×52×2.3mm、USB/PCIe driver資料を公開している。これは採用品の決定ではない。メーカーはindustrial/commercial向けと記載しているため、Miniの用途・供給/保守条件を確認する。小さい筒内に収まるとは扱わず、台座内の候補位置もconnector、antenna、電源、放熱、表示/computeとの干渉を含むCADで検証する。[module公式資料](https://www.quectel.com/product/5g-rm520n-series/)

eSIMは将来の追加候補。物理SIMスロットを省略する決定ではなく、eUICC、profile管理、carrier対応、削除/再発行/復旧を別gateで検証する。現行Miniは外部給電のままで、SIM追加を電池内蔵の承認に読み替えない。使用時全高200mmの要求を保持し、cellular部品追加後の収納と熱を再評価する。

## 接続管理と失敗時の動作

状態は `radio_off / no_modem / no_sim / pin_required / registering / no_service / registered_no_data / online / limited / error` を候補とする。signal強度、網への登録、IP/DNS到達、service認証を分けて表示し、「アンテナが立つ」をcloud作業成功にしない。state/eventにはdevice ID、boot ID、connection generation、時刻、network種別、理由codeを持たせ、古い非同期応答で現在の状態を上書きしない。

初回は明示操作で回線を有効化する。PIN/PUKは自動推測・連続再試行せず本人入力。APN等の必要設定はowner別の保護領域へ保存し、秘密値やIMSI/ICCID全値を診断ログへ出さない。再接続は回線層だけを上限付きbackoffで再試行し、古い有料jobやToolを再実行しない。上限超過/認証失敗は理由と再設定入口を示す。

圏外やSIM抜去でもローカルの停止・saveを維持する。通信依存sessionは保存/停止し、オンラインに戻っただけでは支払い・cloud job・ゲーム購入を再送しない。既存のjob ID/operation keyで状態照会し、不明状態は不明のまま表示する。再起動後に前回のonline状態を信用せず、SIM/網/通信/serviceを再確認する。

携帯回線の大容量download、cloud streaming、更新は、metered回線であることと予想量を本人へ提示する。ローミングや追加費用を無断で有効化しない。端末のbyte counterは参考量であり通信会社の請求明細と同一ではない。通信plan費用、クラウドAI費用、ゲーム購入を分ける。自動fallback先への外部送信や予算拡大は禁止し、既存Broker/同意/料金gateへ接続する。

## 保存・更新・復旧

保存するものは接続設定の版、本人設定、必要最小限の診断、modem/driver/firmware版。SIMの加入者秘密やSMS全内容をアプリDBへ複製しない。設定削除時は回線を停止し保護設定を削除するが、carrier契約の解約とは表示しない。modem firmware更新は互換性・署名・電源・rollback/メーカー復旧手順を確認し、OS更新と別版で記録する。回線不良でもローカル復旧・停止に到達できる入口を残す。

## 試作・合格条件

1. 利用国/通信会社を固定し、band・SIM/plan・module・driverと利用条件を確認。OWNERが見積後に購入を判断する。
2. 開発ボードと外部アンテナでbench試験。初回登録、PIN必要/誤入力、圏外、SIM抜去、APN不一致、再起動、再接続、data送受信を確認する。[メーカー評価基板](https://www.quectel.com/product/5g-m2-evb-kit/)の合格を本体内蔵の完成にしない。
3. Mini本体に組み込み、Pro/PC/スマートフォンの接続なし、Wi-Fiを無効にした状態で物理SIMによる実データ通信を確認する。試験用debug接続の有無も記録する。
4. 閉箱でRF、peak電流/電圧降下、連続通信の温度、camera/音声/表示との同時負荷、antenna位置と受信、再起動・save復旧を測る。所定寸法への収納と利用地域の適合条件を担当者と確認する。
5. Online game、cloud AI、cloud gamingはそれぞれ独立に受け入れる。provider/credential/明細照合、実ゲーム/streaming、保存/復旧の証拠がなければ完成にしない。

現在は全物理試験未実施、基板CAD/firmware/driver統合も未実装。通信方式の仕様追加だけで出荷可能にはしない。

## 担当・次の決定

ROCKは接続状態/保存/同意/復旧契約、EXTERNALはcarrierとmodule/antenna/firmware供給、JOINTはRF/電源/熱/実通信/ゲーム受入、OWNERは利用地域/回線・見積後の購入/契約を決定する。主担当はMaterial Invention / avocadoMini、MAT15の通信サブ項目として追跡し、Android / Local AI、SIM01へリンクする。

次の最小入力は利用国と通信会社。未回答ならmoduleやbandを確定せず、host契約と収納比較だけを進める。Proは任意拡張のまま、Miniの携帯回線親機にはしない。
