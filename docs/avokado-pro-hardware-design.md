# avokado Pro — 小型RockstarOSサーバーの設計入力

- 文書ID: `AP-HW-001` / 版: P0.1 / 2026-09-20
- 状態: 製品構想と試作の要求。実機、製造図、RockstarOS製品版、GTA6動作認証、販売価格の確定を意味しない。
- 製品名は利用者指定の **avokado Pro**。4本のMotion Towerの奥にある小型Edge Hubを、高性能な独立製品へ発展させる。
- 希望参考価格: **¥880,000**。税・送料の扱い、原価、保守、販売条件は未確定。現在のavocadoMini予約販売には含めない。

## 1. 製品の役割

avokado Proは、机上の小型筐体でRockstarOS、ローカルLLM、空間センサーフュージョン、メディア・ゲーム用の高性能描画を担う。単体のデスクトップサーバーとして使え、avocadoMiniの4本のMotion Towerとも接続できる。ユーザーが指した写真の奥の低いボックスを外観の起点にする。筐体はグラファイト色の金属、低い横長形状、側面吸排気、青い状態光を基本とし、表示画面や不要な装飾を付けない。

Apple Mac miniのような置きやすさを目標にするが、独立GPUと冷却を収めるため同じ寸法は要求しない。コンセプト筐体の初期上限は **幅340 × 奥行260 × 高さ135 mm（約12 L）**。GPUの実寸、エアフロー、騒音試験を通すまで寸法は固定しない。参考としてMac miniの現行筐体は12.7 × 12.7 × 5.0 cmである。[Apple公式仕様](https://www.apple.com/jp/mac-mini/specs/)

## 2. P0候補構成と判定基準

| 領域 | P0候補・目標 | 確認が必要なこと |
| --- | --- | --- |
| CPU | x86-64、12〜16コア級、仮想化支援とIOMMU | RockstarOS native boot、CPU負荷時の冷却 |
| GPU | 16 GB VRAM級の交換可能な独立GPU。初期検討はRTX 5080級 | 寸法、Linuxドライバー、LLMと描画の同時負荷、供給と価格 |
| RAM | 96 GB DDR5を候補、拡張・交換可能 | modelのCPU offload、ECC要否、安定性 |
| SSD | OS・復旧用2 TB + game／model／利用者data用4 TB、NVMe、交換可能 | 暗号化、更新時の空き領域、バックアップと復元 |
| Network | 10 GbE ×1、2.5 GbE ×1、Wi-Fiは交換可能module | 4 towerのstream、時刻同期、LAN分離 |
| I/O | HDMIまたはDisplayPort、USB-C／USB-A、audio、外部Edge Hub接続 | 実機画面、AR機器、入力装置の受入 |
| Power | 850 W級以上の認証済み電源候補。TowerへのPoE給電は外部の認証済みEdge Hub／給電器へ分離 | 100 V環境、ピーク、漏電、EMC、温度と騒音 |
| Security | TPM 2.0、UEFI Secure Boot、署名更新、復旧partition | 鍵、再起動、失敗rollback、所有者のdata復元 |

RTX 5080の公式基準値は16 GB VRAM、最大360 W、Founders Editionの長さ304 mmで、推奨system電源850 W。小型ケース内で使えることを意味しないため、筐体と熱はP0試作で受け入れる。[NVIDIA公式仕様](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/)

16 GB VRAMは大規模modelを無制限に常駐させる容量ではない。最初は量子化した7B〜14B級modelを候補とし、modelごとの品質、応答速度、context長、許諾条件を測る。ゲーム起動時はLLMのGPU占有を解放または縮小し、ゲームと安全制御に必要な資源を優先する。Sensorの安全停止はLLMやGPUの状態に依存させない。

## 3. RockstarOSの実装境界

現在のRockstarOSはDeveloper Previewで、avokado Pro用のx86-64実機imageはない。P0ではUEFI起動、GPU／network／storage driver、2D desktop、model runtime、隔離されたgame runtime、署名更新と復旧を順に実装する。Android版とMac仮想版の受入を、そのままavokado Pro実機の受入へ換算しない。

4本のTowerは認証済み外部Edge Hubへ有線接続し、avokado Proはsensor streamと制御結果を受ける。Towerの駆動停止、privacy indicator、camera電源遮断は独立した制御系に置く。1本のTowerまたはnetworkが欠けたら、空間操作をview-onlyへ落とす。ゲームを起動しても物理安全制御を停止しない。

## 4. GTA6を遊べる製品にするための条件

利用者はRockstarとの話がついており、GTA6との連携を進められると述べている。これは設計上の入力として保持する。**SSDの空き容量だけではGTA6の実行対応を保証できない。** Rockstarから許諾された配布物／対象platform、RockstarOS向け実行方式、GPU driver、入力・音声・認証、更新と保存dataの契約が必要である。現時点のRockstar公式販売対象はPlayStation 5とXbox Series X|Sである。[Rockstar公式サポート](https://support.rockstargames.com/articles/4QfG4FmZCf5W1gS8jy4UVT/grand-theft-auto-vi-platform-editions-and-versions)

P0受入は、Rockstar側が許諾したbuildまたは正式な実行方式を入手した後に行う。起動、認証、controller、音声、save／resume、更新、1時間の連続play、frame time、温度、電力を記録する。描画目標はまず1440p／60fps候補とし、正式buildで計測してから公表する。Consoleの非公式emulationやDRM回避を製品要件にしない。製品サイトでの「GTA6プレイ可能」表記は、この受入と公表範囲の確認後に限る。

## 5. 検証と価格gate

1. **機構・熱:** GPU実寸、電源、配線、吸排気、ほこり、service accessをCADで固定し、合成負荷と実model負荷で熱と騒音を測る。
2. **RockstarOS:** 実機起動、署名更新、異常電源断、復旧、暗号化dataのバックアップ／復元を通す。
3. **LLM:** 候補modelを固定し、初回起動、tokens/s、品質、長時間温度、game切替時のVRAM解放を計測する。
4. **avocadoMini:** 4 tower stream、時刻同期、1本欠落時のview-only、安全停止を実機で受け入れる。
5. **GTA6:** Rockstarの許諾範囲と対象buildを固定し、上記の起動・操作・描画・連続play試験を実施する。
6. **商用化:** BOM、組立、認証、保証、物流、税、利益を積算し、希望参考価格¥880,000で成立するか判断する。

現時点で完成しているのは設計と構想CGだけ。ハードウェア試作、RockstarOS移植、GTA6実行、販売受付は後続の独立gateとする。
