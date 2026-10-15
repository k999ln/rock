# avocadoMini — 本体SIMによる単独通信

## 2026-10-10 回線方式の確定

利用者が [アカウント入口の確定方針](product-baseline.md) を確定した。Miniの回線は次のとおり。

- 範囲は国内。通信方式は **LTEのみ**（5Gは入れない。10-05の「5G Sub-6候補」は取り下げ）。
- SIMは **IoT向けのdata専用SIM**。試作はカード（nano SIM）、量産はchip（組込み型）。将来の通信partner変更に備えて **SGP.32に対応したSIM** を選ぶ。遠隔のprofile切替は自作しない。
- 回線は自社名義で、通信をサービス料に含める。回線つきは **別modelかoption** とし、回線なしのMiniも作る。
- 試作の合格条件はR5筐体を待たず、開発board＋LTE module＋IoT向けSIMで確認する（確定事項の文書の第4節）。
- 電気通信事業法・携帯電話不正利用防止法・無線の認証・通信partnerの条件は外部確認が残る。モデムの選定・購入・組込み・開通は未実施。

機械可読の正本は `data/avocado-mini-cellular.json` と `data/product-baseline.json` の `miniCellularIntent`。

2026-10-05。利用者の明示選択は**「Miniに入れて、Mini単体で通信する」**。Pro、外部PC、スマートフォンのテザリングを携帯回線接続の必須条件にしない。本書は設計追加であり、モデム搭載・開通・実通信の完成ではない。MAT15のMini筐体/電源/熱/実機受入に接続し、SIM01のcarrier接続・service entitlementとは別の状態で追跡する。

## 使い方と役割

Miniへ対応した物理SIMを入れ、外部電源につなぐ。初回にSIM/PIN/回線設定を確認し、対応回線へ接続する。含まれるLTE通信は自社cloudへの制御・Agent通信・音声のみ。OS/model更新、映像/streaming、game取得等の大容量転送はWi-Fiを使う。初期対象国は日本、通信会社、plan/APN、module SKUは未確定で、SIMを挿すだけであらゆる回線へ接続できるとはしない。

Mini本体の基本ゲーム・入力・保存・停止はofflineでも動くR5要求を保持する。携帯回線は処理能力を増やさない。重いPCゲームは任意のPro連携、または別途受入したcloud streaming等で扱う。cloud gamingはservice対応、codec、映像出力、入力、遅延/揺らぎと利用条件を個別に確認する。SIM対応だけで空間表示や全PCゲーム対応を合格にしない。

```text
物理SIM ─ SIMインターフェース ─ LTEモデム ─ RF/アンテナ ─ 携帯基地局
                                      │
                             Miniの通信driver/接続管理
                                      │
                           RockstarOSのnetwork状態
                                      │
                     自社cloudの制御 / Agent / 音声（各権限・本人同意）
```

SIM認識、携帯網への登録、データ通信、Rockstar本人ログイン、サービス利用権、cloud実行、料金確定を分離する。Proなしで回線が使えることと、Pro相当のゲーム性能があることは別。複数Miniは各々の回線が基本候補で、一枚のSIMや一契約の共有を勝手に実装しない。ローカルの複数台協調は既存の認証/校正/停止契約を保つ。

## 追加するハードウェア

- 本体内の物理nano-SIMスロット、SIM interface、ESD対策、アクセス可能なtray。SIM入替の手順は最終module/slot仕様で固定し、hot swapを未検証で約束しない。
- LTE-onlyの小型modem候補。日本の対象carrier/band、driver、供給、消費電力、温度、サイズと認証を照合してexact SKUを選ぶ。5G候補は現行構成へ採用しない。
- 選定moduleに適合した数・bandのセルラーアンテナ、同軸、connector、RF設計。銀色の金属外装の内側へ置くだけで受信できるとせず、樹脂RF窓、離隔、手や床の影響、Wi-Fi/BT・cameraとの同時動作を検証する。
- modem向け電源rail、peak電流余裕、reset/disable、温度監視、USB/PCIe等のhost接続。電圧、pinout、power-on sequenceは取得したメーカー設計資料とexact SKUに従い、推測で通電しない。

旧2026-10-05のRM520N/5G比較は履歴であり、現行LTE候補の採用品・収納証拠にしない。採用するLTE moduleはメーカーのexact SKU資料とcarrier条件を取得し、connector/antenna/電源/放熱/computeとの干渉をCADと同一試作で検証する。

試作はnano SIMカード、量産はSGP.32対応のchip型IoT SIMを選ぶ。遠隔profile切替は通信partnerの機能を使い、自作しない。2026-10-15に再開したconsumer eSIM商品設計とは別の機器通信契約として、carrier対応、失効/再発行/復旧を受け入れる。現行Miniは外部給電のままで、SIM追加を電池内蔵の承認に読み替えない。使用時全高200mmの要求を保持し、cellular部品追加後の収納と熱を再評価する。

## 接続管理と失敗時の動作

状態は `radio_off / no_modem / no_sim / pin_required / registering / no_service / registered_no_data / online / limited / error` を候補とする。signal強度、網への登録、IP/DNS到達、service認証を分けて表示し、「アンテナが立つ」をcloud作業成功にしない。state/eventにはdevice ID、boot ID、connection generation、時刻、network種別、理由codeを持たせ、古い非同期応答で現在の状態を上書きしない。

初回は明示操作で回線を有効化する。PIN/PUKは自動推測・連続再試行せず本人入力。APN等の必要設定はowner別の保護領域へ保存し、秘密値やIMSI/ICCID全値を診断ログへ出さない。再接続は回線層だけを上限付きbackoffで再試行し、古い有料jobやToolを再実行しない。上限超過/認証失敗は理由と再設定入口を示す。

圏外やSIM抜去でもローカルの停止・saveを維持する。通信依存sessionは保存/停止し、オンラインに戻っただけでは支払い・cloud job・ゲーム購入を再送しない。既存のjob ID/operation keyで状態照会し、不明状態は不明のまま表示する。再起動後に前回のonline状態を信用せず、SIM/網/通信/serviceを再確認する。

OS/model更新、映像/streaming、game取得等のbulk処理はLTEから開始せず、Wi-Fi待ちと再開操作を示す。Wi-Fi切断でLTEへ無断fallbackしない。ローミングや追加費用を無断で有効化しない。端末のbyte counterは参考量であり通信会社の請求明細と同一ではない。通信plan費用、クラウドsi費用、ゲーム購入を分ける。自動fallback先への外部送信や予算拡大は禁止し、既存Broker/同意/料金gateへ接続する。

## 保存・更新・復旧

保存するものは接続設定の版、本人設定、必要最小限の診断、modem/driver/firmware版。SIMの加入者秘密やSMS全内容をアプリDBへ複製しない。設定削除時は回線を停止し保護設定を削除するが、carrier契約の解約とは表示しない。modem firmware更新は互換性・署名・電源・rollback/メーカー復旧手順を確認し、OS更新と別版で記録する。回線不良でもローカル復旧・停止に到達できる入口を残す。

## 試作・合格条件

1. 確定済みの日本国内について通信会社/SKUを固定し、band・LTE SIM/plan・module・driverと利用条件を確認。OWNERが見積後に購入を判断する。
2. 選定LTE moduleに適合した開発ボードと外部アンテナでbench試験。初回登録、PIN必要/誤入力、圏外、SIM抜去、APN不一致、再起動、再接続、data送受信を確認する。評価基板の合格を本体内蔵の完成にしない。
3. Mini本体に組み込み、Pro/PC/スマートフォンの接続なし、Wi-Fiを無効にした状態で物理SIMによる実データ通信を確認する。試験用debug接続の有無も記録する。
4. 閉箱でRF、peak電流/電圧降下、連続通信の温度、camera/音声/表示との同時負荷、antenna位置と受信、再起動・save復旧を測る。所定寸法への収納と利用地域の適合条件を担当者と確認する。
5. LTE上の許可済みcloud si/制御/音声と、Wi-Fi上のOnline game/streamingは経路を分けて受け入れる。provider/credential/明細照合、転送制限、保存/復旧の証拠がなければ完成にしない。

現在は全物理試験未実施、基板CAD/firmware/driver統合も未実装。通信方式の仕様追加だけで出荷可能にはしない。

## 担当・次の決定

ROCKは接続状態/保存/同意/復旧契約、EXTERNALはcarrierとmodule/antenna/firmware供給、JOINTはRF/電源/熱/実通信/ゲーム受入、OWNERは利用地域/回線・見積後の購入/契約を決定する。主担当はMaterial Invention / avocadoMini、MAT15の通信サブ項目として追跡し、Android / Local si、SIM01へリンクする。

利用国は日本で確定済み。次の最小入力は通信会社、回線planとmodule/SKU。未確定ならbandや部品購入を確定せず、host契約と収納比較を進める。Proは任意拡張のまま、Miniの携帯回線親機にはしない。
