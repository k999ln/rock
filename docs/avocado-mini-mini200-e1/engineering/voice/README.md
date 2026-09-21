# Mini200 E1 音声ハードウェア・DSP設計候補

2026-09-21 / VA-E101 / 計算のみ・実測 0 / 製造未承認。

外観は承認前の D0（198 × 178 × 198 mm、前面3窓）を作業参照とする。E1 は内部 x86 計算機＋TV＋手元操作器。外部計算 Hub を前提にしない。この資料は主冊子用の中間設計資料であり、完成回路・配線施工図・量産 BOM ではない。D0 の既存ファイルは変更していない。

## 1. 採用候補と分かっている範囲

候補は Seeed Studio **reSpeaker XVF3800 USB 4-Mic Array / SKU 101991441**、XIAO なし・ケースなし・USB モード、1本体に1枚。[メーカー製品](https://www.seeedstudio.com/ReSpeaker-XVF3800-USB-Mic-Array-p-6488.html)

公開機械図の PCB は直径100 mm、板厚1.20 mm。4マイクは66 mm角の配置、演算用座標は中心から（±33, ±33, 0）mm。図中の側面6.20 mmなどを「端子・ケーブルを含む完成高さ」とは解釈しない。基板版・穴径・USBプラグ突出・導線曲げ・ガスケット厚は未確定。機構担当の **110 × 110 × 20 mm区画は配置予約寸法（REF）**。ロゴ側の底面音孔を上面の音源側へ向け、防振支持とダクト隔壁を設ける。[公式寸法図](https://files.seeedstudio.com/wiki/respeaker_xvf3800_usb/respeaker_xvf3800_2d_mechanical_drawing.pdf)、[メーカー導入資料](https://wiki.seeedstudio.com/respeaker_xvf3800_introduction/)

接続は XMOS 側 USB-C の給電＋USB Audio Class 2.0 を使用。USB capture がマイク→本体、USB playback が本体→AEC参照。I2S/I2C、XIAO、3.5 mm出力、JSTスピーカー出力は初期製品で接続しない。テレビから音を出し、マイク基板にスピーカーが内蔵されているとは扱わない。ヘッダの曖昧なピン番号・配線色は割り当てない。[メーカー導入資料](https://wiki.seeedstudio.com/respeaker_xvf3800_introduction/)、[公式FAQ](https://wiki.seeedstudio.com/respeaker_xvf3800_faq/)

## 2. ファームウェア・データ形式

候補ファイル名を `respeaker_xvf3800_usb_dfu_firmware_v2.1.0_48k2ch.bin` に限定する。公式配布には `v2.1.0_16k6ch` も存在するが、この製品経路には混在させない。48 kHz/2ch の名称だけでは sample width、capture ch0/1 の ASR/会議出力対応、playback endpoint を確定できない。量産版のバイナリ SHA、USB descriptor、保存DSP設定を現物で固定する。旧6chのrawマイク割付や汎用v2.1.0の形式を引き継ぐと断言しない。[公式ファームウェア一覧](https://github.com/respeaker/reSpeaker_XVF3800_USB_4MIC_ARRAY/tree/master/xmos_firmwares/usb)、[変更履歴](https://raw.githubusercontent.com/respeaker/reSpeaker_XVF3800_USB_4MIC_ARRAY/master/xmos_firmwares/usb/changelog.md)

USB取得後、選択したASR向け1chを適正な帯域制限付きで **16 kHz / mono / signed16-bit PCM** へ変換する。48→16 kHz は3:1だが、単純に3標本ごとに間引く実装は禁止。リサンプラ遅延・USB FIFO・ドライババッファは計測対象。DSPの会議用AGC経路とASR向け固定ゲイン経路を混同しない。NPU搭載だけでASRが自動的に高速化されるとはしない。

形式未確認のため帯域は16/24/32bitの感度計算。48k/2chは片方向1.536 / 2.304 / 3.072 Mbit/s、同形式の参照2ch輸送を仮定した双方向合計は3.072 / 4.608 / 6.144 Mbit/s。これはPCM payloadのみで、USB予約帯域・protocol overhead・ホスト共有ポート安定性の合格値ではない。24bitが32bitスロットで運ばれる場合もdescriptorに合わせる。

## 3. AECを成立させる経路と限界

XMOS標準のAECは**1ch mono参照**。USB入力左ch0が参照、右chは無視され、標準DAC出力は同じ左音を左右へ送る。内部音声処理は16 kHz。参考仕様はAEC tail192 ms、固定参照遅延0～500 ms、マイク→I2S最短58 ms。これらはチップ／標準構成の値であり、Seeed基板のUSB実測・テレビ補正限界・総応答時間の保証ではない。[XMOS datasheet v3.2.1、本文pp9–11](https://www.xmos.com/documentation/XM-014888-PC/pdf/xvf3800_datasheet_v3.2.1.pdf)

通常ゲームはステレオHDMI出力を維持する。初期は手元の **PTT（押して話す）＋ゲーム音の一時減衰** を基本とする。PTT は開始指示に過ぎず、音の分離性能を保証しない。収音が悪ければ画面／操作器入力へ切り替える。

AEC検証モードではゲーム音・効果音・TTSなど本体が生成する最終ミックスをPCMで取得し、音量・ducking反映後の同じ信号をHDMIとUSB参照へ分岐する。まず両経路を同じmono素材にして、参照経路・因果性・収束を確認する。通常の独立したステレオL/Rスピーカー音は異なる室内伝達を通るため、L+Rのmono化参照1本で完全に説明できない。ステレオhands-freeの保証には別の多参照AEC設計または別の出力構成を要する。

HDMI機器／TVのリップシンク・EQ・音量・サラウンド処理とUSBのclock/FIFOが別なので、PCMをコピーしただけでは整列しない。基準パルス／既知音で mic–reference の遅延を測り、再生・capture timestamp、適応リサンプリング、遅延再推定を実装する。TV入力切替、映像mode変更、音量変更、USB再接続は再評価する。192 ms tailと500 ms固定bulk delayは別物で、500 msのゆらぎが許容される意味ではない。[XMOS調整手順](https://www.xmos.com/documentation/XM-014888-PC/html/modules/fwk_xvf/doc/user_guide/04_tuning_the_application.html)

TV内蔵アプリ、放送、別HDMI機器から出る音は、本体に一致する参照PCMがなければこのAECの対象外。音楽や他人の声も「除去保証」の対象にしない。基板の最大5 m広告を、ファン稼働・ゲーム音ありの認識保証へ転記しない。

## 4. 音響配置・遅延・電力の計算

4マイク最大間隔は66√2 =93.338 mm。音速343 m/s仮定で最大到達差0.27212 ms、16 kHz換算4.354標本（48 kHzで13.062標本）。これは幾何上限で、角度精度や認識率ではない。TV–マイク0.3/1/3 mの伝搬だけで0.875/2.915/8.746 ms。独立clockの相対誤差100 ppmを仮定すると60秒で6 msずれる。ppm値は感度分析の仮定で、TVやUSBの実測仕様ではない。

XMOS coreのUSB時typical400 mWは、レギュレータ・4マイク・codec・LED等を含む基板全消費電力ではない。基板最大電流は未確認なので、音声系を**設計枠5 W**とする。5 V換算1 Aは予算換算で、USB端子から1 Aを無条件に取ってよい意味ではない。ホストの給電許可・descriptor・起動突入・全LED状態・USB suspendを測り、規定に適合する給電ポート／回路を選ぶ。オンボードスピーカー駆動はこの枠に含めない。[XMOS datasheet本文p2](https://www.xmos.com/documentation/XM-014888-PC/pdf/xvf3800_datasheet_v3.2.1.pdf)

主設計の旧78 W内にあった音声3 Wを5 Wへ**置換**するので、非音声75＋音声5＝80 W DC。仮定効率90%なら入力88.889 W、変換損失8.889 W。これを全て箱内熱と置く保守モデルで、実消費・電源定格の決定ではない。78＋5＝83 Wとはしない。ファン音がマイクへ回り込むため、冷却最大回転時の認識・振動・風切りも同時評価する。

## 5. 物理マイクOFFとプライバシー

基板ボタンは利便ミュートとして扱う。公式にはミュート状態を動かすGPOが公開され、FW変更履歴にもボタン処理があるため、「OSやファームウェアから絶対に解除できない物理遮断」は証明されていない。

製品には独立した保持式MIC OFF操作を要求する。ホストとは独立にマイク枝のVBUSを停止し、USB D+/D−、CC、他のI/Oやアナログ線からの逆給電も阻止・検証する。USB高速信号の適切な切離し回路、eFuse／負荷スイッチ、放電、状態検出、部品型番は **HOLD**。eFuse単体ではdata線を遮断しない。XIAO・外部5 V・I2S・アナログ出力を初期に接続しない。電気遮断前の現実的な試作OFF確認は、唯一のUSBを含む全接続を外し、無給電と無音声経路を確認すること。

電源再投入時はアプリ側をOFFに戻し、USBを見つけただけで録音を開始しない。物理遮断を戻しただけでも認識を再開せず、利用者の許可と画面状態を再確認する。PTTを毎回「基板の電源投入」に使うと再enumerationとDSP収束が入るため、PTTと長期物理OFFは別の状態とする。マイク系rail連動の状態灯と保持スイッチ位置表示を要求し、OSの緑アイコンだけを物理証拠にしない。

デフォルトは録音保存・音声アップロード・wakeword待受をOFF。PTT前録り0秒。将来、明示opt-inのwakewordだけ2秒RAM ringを許すなら16k mono S16で64,000 B。PTT最大15秒の発話は480,000 B。これらはPCM領域だけで、USB/DSP/ASRモデル内の追加領域は含まない。RAMでも一時取得していることを表示し、「一切録音しない」と誤表示しない。無断録音、会話の常時保存、デバッグ音声ログを禁止する。

アプリのbufferと中間認識結果は終了／取消／muteで破棄し、進行job・認可ticket・epochを無効化する。swap、hibernation、core dump、telemetryによる音声の永続化も防止する。DSP内部RAMをソフトの抽象テストで消去確認済みと主張しない。ASR最終結果は発話終端後2秒TTLを提案し、期限超過は破棄し再試行する。主冊子の発話終了後1.2秒配分は目標であって実測値ではない。カメラ許可、音声許可、外部機器操作許可を独立させる。

## 6. 完成配線・機能を解除する受入ゲート

以下は試験計画で、合格結果ではない。

- VA-T01: 購入せず候補特定まで。実機でSKU、PCB版、mic位置、上面音孔、プラグとケース干渉を照合。4ポートを塞がず、fanダクトの直風を避ける。
- VA-T02: FW hash／VERSION、USB全descriptor、2chのroute、capture/playback同時連続、再接続、suspend復帰を確認。意図しないraw mic exportを無効化。
- VA-T03: 全LED最大・起動・mute・ゲーム負荷の入力電流とUSB給電規定、逆給電、OFF時mic rail、再接続自動録音なしを実測。消費が5 W枠を超えれば電源／熱を改訂。
- VA-T04: fan停止・標準・最大、距離0.3/1/2 m、正面/左右45度、TV停止/ゲーム音60/70 dBA（受音点測定）でPTT認識と誤作動を評価。最初の近距離判定は0.3–1 mに限定し、遠距離を自動承認しない。音量値は試験条件案で、達成仕様ではない。
- VA-T05: mono参照一致からAECを検証。TV機種／mode、遅延、clock drift、音量変更、二人同時、近距離barge-inを分離記録。認識率・false accept・near-end音声欠落・応答p95を主ソフト試験と合わせて判定。barge-in/hands-freeは未認定。
- VA-T06: 物理OFF時、ソフトから解除できず全マイク経路が停止することを電気・USB・収音の三面で確認。状態灯、解除後再同意、buffer/job破棄、通信遮断、録音ファイル不生成を調べる。

`calculate.py` は標準ライブラリだけでPCM帯域、RAMサイズ、音響幾何、clock感度、5 W置換予算を再計算する。マイク・OS・ゲーム・ネットワークに接続しない。算術PASSは上記現物ゲートを解除しない。

## 7. 原典・成果物

原典URLと確認範囲は `sources.json`。メーカー別ランディングページに35×86 mm／最大16 kHzの記載もあるが、現在公開の機械図と48k2ch専用firmwareに一致しないので採用根拠にしない。実物照合前に加工を承認しない。

主冊子への組込み対象は本README、`design_inputs.json`、`calculated_results.json`、`calculate.py`、`sources.json`、`VA-E101_audio_path.svg`。`sources/` の原典PDF・確認PNGは調査キャッシュで、今回の設計の自作図や完成部品図とは区別する。
