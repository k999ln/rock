# 機能・作業ごとの作業部屋

思いついたら [アイデア置き場](IDEAS.md)へ。進めるときは下の分野を一つ選び、既存taskを一件選びます。

このフォルダは既存の担当表から生成する作業用の入口です。ソースは元の場所にあり、状態・主担当・手順は [進捗JSON](../data/project-status.json) と [Mission Control](../data/mission-control.json) が正本です。生成ページを直接編集せず `npm run work:update` で同期します。

作業を担当Botへ依頼するには [プロジェクト別Bot](../toolkits/amc-agent/README.md#プロジェクト別bot)へ。例: `npm run bot -- run sky --goal 'Skyの接続エラー表示を改善する'`。成果は専用branchのcommitとPRへ提出します。

## よく使う入口

| やりたいこと | 開く部屋 |
| --- | --- |
| 製品の構想、仕様、優先順位、Git整理 | [H1 製品・統合](H1/README.md) |
| 認証、本人確認、Spider、権限 | [O1 Security](O1/README.md) |
| 仕事の状態、保存、再開、復旧 | [O2 Work・Data](O2/README.md) |
| LLM、ローカルAI、Agentの評価 | [O3 AI・Agent](O3/README.md) |
| SkyのTool、MCP、SDK、クラウド接続 | [O4 Tool・MCP](O4/README.md) |
| Home、Zema、eSIMサービス、Wallet、決済 | [O5 Sky・Zema・Wallet](O5/README.md) |
| Pixel、Android、機種別対応 | [O6 Device Adapter](O6/README.md) |
| QEMU、配布、署名、Web公開 | [O7 Release・運用](O7/README.md) |

話題の入口とtaskの主担当は同じとは限りません。taskが決まったら `npm run work -- <task ID>` の担当表示を優先してください。

## 作業を始める

1. 分野を開き、未完了task・前提・実行保留を確認する。親は全体受入、子は個別作業。
2. `npm run work -- SYS13-01` のように、選んだtaskの入力・手順・成果・合格条件を読む。
3. そのtaskを一つのbranch／作業フォルダで進める。新しい思いつきはアイデア置き場へ退避する。
4. 次の一手・触ったpath・検証結果を残し、`npm run project:update` と `npm run mission:update` で同期する。

未保存変更のあるフォルダでbranchを切り替えないでください。別作業が必要なら最新mainを確認した専用worktreeを使い、branch名は `codex/<分野>-<短い作業名>` とします。GitHubへの保存、main統合、公開は別の状態です。

```sh
npm run work                 # 分野一覧
npm run work -- O4           # 一分野の作業一覧
npm run work -- SKY07-01     # 一件の具体的な手順
npm run work -- --find eSIM  # task／資料pathから探す
npm run work:check           # 全taskの所属と入口の同期確認
```

## 全分野

既存32分野を5群で表示します。件数は製品完成率ではなく、旧版・参考・公開説明のtaskを現行製品の受入へ加算しません。

### 統合司令部

| 部屋 | 目的 | 次に確認するtask |
| --- | --- | --- |
| [H1 製品・Interface統合](H1/README.md) | Mini、Pro、RockstarOS、rocketstarの優先順位、正本、Interface、合格条件を同期する。 | AMC01 |

### RockstarOS師団

| 部屋 | 目的 | 次に確認するtask |
| --- | --- | --- |
| [O1 権限・Security](O1/README.md) | 本人だけが許可した操作を実行し、全変更を監査・失効できるようにする。 | SYS13 |
| [O2 Work・Data](O2/README.md) | 仕事、状態、成果物、Receiptを競合なく保存し、再起動後も復元する。 | AI04 |
| [O3 AI・Agent](O3/README.md) | 交換可能なローカルAIが権限を持たずに計画し、Agentが許可済み手順だけを実行する。 | AI02 |
| [O4 Tool・MCP](O4/README.md) | Toolを審査、登録、接続、実行、停止、失効し、結果をReceiptで照合する。 | SKY07 |
| [O5 Sky・Zema・Wallet](O5/README.md) | Tool選択、依頼、進捗、承認、成果、費用、確認済み収益を一つの利用体験にする。 | SKY19 |
| [O6 Device Adapter](O6/README.md) | 共通Coreを作り直さず、各hardwareをDevice ProfileとAdapterで接続する。 | OS02 |
| [O7 Release・運用](O7/README.md) | 同一候補を再現配布し、更新失敗や端末喪失から安全に復旧する。 | LCH07 |

### avocadoMini師団

| 部屋 | 目的 | 次に確認するtask |
| --- | --- | --- |
| [M1 製品設計・ICD](M1/README.md) | R5の要求、構成、BOM、接続、未決定、受入条件を一つの正本へ固定する。 | MINI01 |
| [M2 筐体・機構](M2/README.md) | 200mm以内で安全に設置、組立、清掃、保守できる筐体を成立させる。 | MINI02 |
| [M3 Sensor・Tracking](M3/README.md) | 身体、手、物体の動きを時刻付き空間入力Eventへ変換する。 | MINI03 |
| [M4 空間表示・出力](M4/README.md) | 入力結果と体験状態を空間表示、音、または2D fallbackで理解可能に返す。 | MINI04 |
| [M5 組込み・Firmware](M5/README.md) | Mini単体でboot・入力・game・保存・停止・復旧を成立させる。 | MINI05 |
| [M6 電源・熱・通信](M6/README.md) | Miniを安全に連続運転し、複数MiniとProへ時刻付きで接続する。 | MINI06 |
| [M7 Calibration・安全・受入](M7/README.md) | 校正、privacy、入力停止、故障、復旧を実機で受け入れる。 | MINI07 |

### avokadoPro師団

| 部屋 | 目的 | 次に確認するtask |
| --- | --- | --- |
| [P1 Pro統合設計](P1/README.md) | Proの要求、構成、BOM、接続、受入条件を一つの正本へ固定する。 | PRO01 |
| [P2 Compute・基板](P2/README.md) | ゲーム、サービス、ローカルAIを所定性能と電力内で実行する。 | PRO02 |
| [P3 Game Runtime・SDK](P3/README.md) | Pro単体とMini連携のgameを作者が導入、実行、保存、削除できるようにする。 | PRO03 |
| [P4 Service・Storage](P4/README.md) | 利用者別のservice、session、assetを暗号化して保存・復元する。 | PRO04 |
| [P5 映像・Audio・I/O](P5/README.md) | Pro単体でdisplay、audio、controller、network、外部機器を接続する。 | PRO05 |
| [P6 Mini接続・時刻同期](P6/README.md) | 一台以上のMiniを発見・pairingし、Poseを正しい順序と遅延でProへ届ける。 | PRO06 |
| [P7 筐体・電源・Security・受入](P7/README.md) | Proを家庭内で安全に連続利用し、更新失敗から復旧できる製品へする。 | PRO07 |

### rocketstar師団

| 部屋 | 目的 | 次に確認するtask |
| --- | --- | --- |
| [R1 Mission・System](R1/README.md) | Mission、要求、質量、Interface、成功条件を一つのsystem基準へ固定する。 | RKT01 |
| [R2 構造・Tank](R2/README.md) | 荷重、圧力、振動、熱に耐える構造、Tank、取付部を成立させる。 | RKT02 |
| [R3 推進](R3/README.md) | 上昇と帰還に必要な推力を安全に発生、供給、停止、再始動する。 | RKT03 |
| [R4 空力・熱](R4/README.md) | 上昇、分離、再突入、帰還時の空力・熱環境へ耐える。 | RKT04 |
| [R5 GNC・Avionics・Flight SW](R5/README.md) | 姿勢、軌道、分離、帰還を一般OSから独立した安全系で制御する。 | RKT05 |
| [R6 Payload・分離](R6/README.md) | 衛星・貨物を保持し、状態を確認し、安全に分離する。 | RKT06 |
| [R7 電源・Data・A-LINK](R7/README.md) | 機体、Payload、地上間で電源、時刻、記録、通信を維持する。 | RKT07 |
| [R8 地上・Launch](R8/README.md) | 輸送、設置、燃料、発射準備、hold、abortを安全に運用する。 | RKT08 |
| [R9 帰還・回収・再使用](R9/README.md) | 同じ個体を帰還、回収、検査、整備し、再飛行可否を判定する。 | RKT09 |
| [R10 製造・品質・安全試験](R10/README.md) | 設計どおりの機体を再現し、部品からflightまで構成と不適合を追跡する。 | RKT10 |

## 更新と合格条件

`data/workspaces.json` は場所と確認コマンドだけを保持し、taskの担当を再定義しません。新規taskは進捗JSONとMission Controlの一意なtaskAssignmentsへ追加します。作業部屋はproject／mission同期から自動再生成され、`npm run verify` にも整合検査を含めます。

[責任分界](../docs/workstreams/00-responsibility-boundaries.md) · [作業分野別の受入・検証](../docs/workstreams/README.md) · [製品別ガイド](../PROJECTS.md)
