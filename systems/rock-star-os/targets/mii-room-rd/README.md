# mii-room-rd — 全室空間SIの研究用hardware profile

2026-11-08。設計候補のみ。稼働image、実driver、家庭導入、光学成立、製造適合を表さない。
正本は[28章](../../../../docs/mii/design/28-room-scale-si-rd.md)。仕事・権限・料金は既存共通OSに従い、このprofileでは再定義しない。

| 項目 | 研究入力・上限・未受入 |
| --- | --- |
| 構成 | 可搬Core、室内演算worker、展開式光学Node。4基を探索開始点とし、台数・開口位置／面積は未確定 |
| 空間入力 | Basler a2A1920-160umPRO級global-shutter観測、既存広域camera、校正と時計。瞳精度・手追跡は未受入 |
| 研究用出力 | HOLOEYE GAEA-2.1-VIS-158のHDMI入力。RGB／両眼の光路・最終部品は未確定 |
| 位相payload | 4K相当8bit/60Hzで3.981Gbps/channel、独立6channelなら23.888Gbps/head。wire速度ではない |
| 同期 | local FPGA/controller、capture時刻、光学frame時刻、校正epoch。M8 trigger電気条件を検証してから接続 |
| 演算 | RTX5090 32GBを研究比較基準。CGH処理能力・熱・レイテンシ未測定。専用化／局所処理が必要か判断 |
| 電力 | 製品研究目標:Core30＋Hub350＋Node150×4＋補機100＝1080W、予算1200W。未測定。GPU575W公称をHub350Wに収容済みとしない |
| 伝送 | 認証LAN、局所USB3/HDMI/DP、必要な10/25GbE。Wi-Fi/LTE/NTNを光学同期路にしない |
| 可搬通信 | 既存mii P3/F3の未受入条件を継承。光学部を取り外した状態の全通信を別受入 |
| 機構 | 自立式側方／低位置／上方開口の配置を研究。穴あけ・建築配線なし、広い出射面と支持構造を隠さない |
| 停止 | 光出力・走査・熱・筐体・watchdogと独立遮断。物理停止を通信ACKのみで証明しない |
| 表示層 | 裸眼、像位置に板・霧なしの波面再生を研究。全室、全周、上下、光安全は未達 |

再現: `python3 docs/mii/design/room-rd/calculate.py`（repo root）。これは配置の反例と費用算術で、実機検証ではない。
