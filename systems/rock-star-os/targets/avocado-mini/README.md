# avocadoMini 起動・監視MCU・試験回路の開発入口

主担当はMaterial Invention／avocadoMini（ROCK）。本人の「基板はなし、そこの設計から」を受けた**Developer Previewの卓上開発**。製品名はavocadoMini、OSはRockstarOS 1.0、内部識別子は`dev.rock`。既存月額、同一契約の複数端末、AIの見積・承認・予約・usageは既存systemを使う。

## 目的と利用体験

Miniで同じ本人のEveへ入り、依頼・進捗・承認・停止・成果を扱う。監視MCUの状態はOSの観測入力へ渡す。MCUの通信やLLMの回答から本人確認、Tool成功、光学/駆動の許可を作らない。実機がない現在、実装を試せるCM5/CM5IO＋Pico 2を**卓上の参照構成**とする。これは最終Miniの部品採用・筐体寸法・電力・ゲーム性能を確定しない。

- `firmware/`: Pico 2 / RP2350 Cortex-M33用C firmware。20byte USB CDC、CRC、boot nonce/連番/設置epoch、heartbeat、ローカル再arm、停止、lease失効、watchdog。GP7はLED/低電圧ロジック専用。
- `linux/`: 実TTY driver、systemd起動設定、owner graphical sessionのEve起動、rootfs overlay生成。driverはHEARTBEAT/STOPだけを送る。ARMはdriver/APIへ公開していない。
- `hardware/cad/`: 実編集可能なKiCad回路図・2層PCB・ローカルsymbol/footprint library。USB給電のPico 2用76×62mm接点/LEDキャリア。衛星・電池・生体認識・光学を含むMini mainboardではない。
- [共通client runtime](../../../../packages/rockstaros-runtime/README.md): 既存API/本人/履歴/workflow/料金契約。native OSやvendor driverを同梱した意味ではない。
- [通信契約](../../../../contracts/avocado-mini-supervisor.json)、[試験ハーネス](hardware/cad/bench-interface.json)、[BOM候補](hardware/bench-bom.csv)。

## 責任・入出力・状態

ROCKはsource、境界、回路/PCB、hostとcross-buildの証拠。EXTERNALはCM5/Pico/BSPの供給仕様、回線契約、光学/生体部品。JOINTは組立・実起動・実GPIO/停止・熱/RF/光学の測定。OWNERは予算/採用・本人ログイン・実取引の承認。

入力はGPIO接点、CRC付きUSB状態、既存Eveのowner操作。出力は**試験LED**、期限付き観測JSON、既存Eve画面。センサーの代用接点を実温度・装着判定の受入にしない。boot nonce/USB serialは識別用で、署名済みhardware identityではない。

MCUは初期FAULT/出力OFF。5条件が正常かつheartbeatが新しい時にlocal buttonの立上りを受け、別のARM frame/leaseがある時だけLED出力可能。解除・stop・期限超過でOFF、local armを失効。dock変化でepoch更新とheartbeat/arm失効。epoch/sequence枯渇は再起動が必要。期限はsoftware設定値で、実時間の安全性測定は未完了。

## 保存・失敗・復旧・承認

- MCUはowner情報/認証token/課金を保存しない。再起動でnonceが変わる。flash書換えとproduction署名は未実施。
- driverの`health.json`は`/run/rockstaros-mini-supervisor`（0700）の一時観測。host boot monotonicの観測/失効時刻を含み、消費側は200ms期限を必ず再判定する。古いファイル・USBなし・CRC不正・再送は権限にならない。driver終了時はSTOPとファイル削除。
- Pico SDK 2.3.1のRP2350用USB VID/PIDは`2e8a:0009`（RP2040用`000a`と区別）。driverはこの値と実USB serialを照合する。SDKの開発用識別子を量産製品へ流用する許諾は未確認。実USB serialをroot所有の設定に指定するまでserviceは起動対象にならない。例の設定を実設定として使わない。serviceのenable、OS install、書込はこの生成処理では行わない。
- Eveは通常userのChromium profile（0700）で既存`https://avoado.si/os/eve`を開く。passkey/owner認証は既存browser/serverが担当。driverに資格情報を渡さない。通信・未ログイン・回線切断で既存画面の失敗を扱い、実行/請求を自動再送しない。現在の入口は**既存OS client**であり、Mini native imageの受入ではない。
- overlayは既存OSを上書きせず新しい出力directoryだけに作る。起動不能時はoverlayを取り除き、参照OSの復旧手順へ戻す。正式なA/B更新・署名boot/復旧・全損復元は未実装。

## 部品・回路の計算と制約

Pico 2の外側40pin、左右17.78mm、縦2.54mm pitchをキャリアへ展開。USBからmoduleを給電し、carrierに5V/電池入力を設けない。3V3だけを接点に出す。RP2350 A4 steppingを採用候補とし、納品chip markingを確認する。旧A2の[E9公式erratum](https://pip-assets.raspberrypi.com/categories/1214-rp2350/documents/RP-008373-DS-2-rp2350-datasheet.pdf?disposition=inline)も考慮し、外部pull-downは**4.7kΩ ±1%**（最大4.747kΩ、推奨8.2kΩ以下）にする。内部pull-downだけで断線時のLowを保証しない。[A4での改修説明](https://www.raspberrypi.com/news/rp2350-a4-rp2354-and-a-new-hacking-challenge/)も参照。

計算用上限3.6V、抵抗最小4.653kΩなら接点1本0.774mA、6本で4.643mA、抵抗損失は最大2.786mW/本。LEDは1kΩ ±1%、仮の最低VF=1.6Vで最大2.021mA。合計6.664mAは**carrier接点/LEDだけ**の仮上限で、CM5/Pico/USB/無線/光学を含む製品電力ではない。VF、許容電流、3V3 railの実仕様と温度を採用品で再確認する。6pin flag入力には部品・harnessのbounce/EMC/断線試験が必要。

J1のSTOPは**機械的に連動するDPST-NCの2接点**。1–2がSTOP_OK入力、9–10がLEDの戻り電流を直接遮断する。MCU停止時でも後者を物理的に開く。別々の無連動jumperを製品の停止ボタンとして受入しない。短い卓上wire/3V3接点専用で、laser/motor/外部電圧/安全認証を接続しない。BOMのheader/socket/LED/switch型番、land pattern、USB plugとmoduleの干渉、組立向きは未確定。

## 再現コマンド

rootから。SDK/compiler/CMakeは外部の一時領域に置き、Gitへbinary/cacheを入れない。build scriptはSDK 2.3.1のcommit/submodule、Arm GNU14.3.1、picotool commit、build中のsource不変を照合する。公式SDKの初回configureはpicotool sourceを取得する。

```sh
python3 systems/rock-star-os/targets/avocado-mini/build_firmware.py \
  --sdk /path/to/pico-sdk \
  --toolchain /path/to/arm-gnu-toolchain-14.3.rel1-darwin-arm64-arm-none-eabi \
  --cmake /path/to/cmake --output /new/build-directory
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tests -p 'test_*.py'
cc -std=c11 -Wall -Wextra -Werror systems/rock-star-os/targets/avocado-mini/firmware/supervisor.c systems/rock-star-os/targets/avocado-mini/tests/supervisor_test.c -o /tmp/mini-supervisor-test
/tmp/mini-supervisor-test
python3 systems/rock-star-os/targets/avocado-mini/linux/stage.py --output /new/rootfs-overlay
python3 systems/rock-star-os/targets/avocado-mini/hardware/generate_bench.py --output /new/cad-directory
```

[KiCad公式CLI](https://docs.kicad.org/10.0/en/cli/cli.html)でERC、zone fill後のDRC、schematic parity、Gerber/Excellonを同一候補から生成する。検査時は別のcopyへfill/saveし、元sourceと検査済みboardのhashを両方記録する。実行した検査とsource/生成物のhashは[証拠](../../../../docs/evidence/avocado-mini-native-development.json)へ残す。警告を消すためにcheckを無効にしない。

CADの再検査/出力は `python3 systems/rock-star-os/targets/avocado-mini/hardware/check_cad.py --kicad-cli /path/to/kicad-cli --output /new/cad-export`。KiCad 10.0.7を指定し、ERC/DRC/未配線/回路図整合が全て0件の場合にGerber、Excellon、位置表、netlist、SVGとmanifestを生成する。元sourceは書き換えない。

## 合格条件・未決定の決め方

現在の成果はsource、host/PTY、cross-compiled firmware、overlay、卓上CAD。**工場の量産releaseではない**。次の順で証拠を作る。

1. exact BOM/footprint/機構を確定し、試作業者がDFM/DFAとハーネスを独立reviewする。実基板を採用し、受領chip/USB identityをbindする。
2. 同一UF2の実起動、実接点/CRC/USB抜去/MCU hang/物理stop/電源断/再起動を測定する。未受入outputはOFFを維持する。
3. CM5参照OSの同一image＋overlayでboot、owner Eve実ログイン/仕事/保存/再起動/停止を受入する。実請求を試す場合は既存見積/承認gateと別証拠。
4. native BSP、署名/更新/復旧、量産SoM/MCU・生体・深度/gesture・光学、米国でIP共有可能な衛星modem/antenna/契約、Wi-Fi AP、電池/BMS/充電/熱/RFを実機で統合する。
5. 200mm envelope・携行・裸眼表示・建築精度・ゲーム等の既存Mini gateへ合格し、最終BOM/回路/PCB/検査jig/製造指示/認証/同一閉箱測定を揃えてから工場releaseする。卓上基板の成功を移し替えない。
