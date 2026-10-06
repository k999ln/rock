# avokado Mission Control

版: 3.0 / 2026-09-27

AMCは3製品と共有OSを5師団32部隊へ分け、責任、成果、作業、証拠を管理する。部隊・担当・実行計画の正本は[data/mission-control.json](../data/mission-control.json)、task状態の正本は[data/project-status.json](../data/project-status.json)。

## 今回の精査と対象

IDの頭文字だけで担当を推測する方式を廃止し、全taskに一つの主担当を明記した。共通Game SDKをPro固有の完了、旧Mini profileをR5の完了、資料の保存をrocketstarの実装完了として数えない。

32部隊の「次の1タスク」にある入力・担当・成果物・全体合格条件を保ったまま、各6件、合計192件の子作業へ分解した。各子には個別の成果物section、手順、確認可能な合格条件、親の前提と必要な兄弟依存、計画上の負荷区分、実行境界を付ける。すべて未着手・未検証で登録し、既存183 taskの状態と証拠は変更していない。担当者と期限は未割当・未設定を明示し、根拠なく確定しない。

現在は376登録レコードで、内訳は全体受入を管理する親32件、子192件、独立152件。実行単位の集計は親を除く344件とし、親子を二重加算しない。既存183件＋子192件に加え、H1の独立task AMC02を「AMC Goal Orchestratorのローカル計画compiler・CLI・進捗UI」の進行中として登録した。AMC02は計画exportと進捗追跡の実装であり、live AI runner、サーバー契約、遠隔の自動実行を含まない。H1の既存nextTaskはAMC01のまま保持する。

対象はローカル基点SHA <code>4e74e2f5f250b87c792ced6c03c5298c882cbd70</code>と作業中変更。確認したremote mainは<code>5f3a3694474180415d08cd814b6aad864694d10f</code>で1 commit先だが、差分は公開画像とWEB19の証拠追加で、task状態・製品要求の変更はない。remote差分は未merge。この精査は静的照合であり、既存の外部Provider・実機・本番試験の再実行ではない。

## 製品と責任境界

- avocadoMini R5は単体で入力、game、保存、停止が成立する要求。外部PC、Hub、Pro、インターネットを基本動作の必須条件にしない。
- avokadoProは単独のgame・service・compute・storage・audio製品。Mini接続は任意。専用統合設計・BOM・実機は未完成。
- RockstarOSは共通契約・保存・権限・AI・Tool・配布を担当する。PC/Web、QEMU、Pixelは開発・検証環境であり、販売製品を増やすものではない。
- rocketstarの一般OS連携は地上計画・承認・記録・成果管理に限定する。飛行制御は独立安全系であり、LLMやSky Toolへ直接の飛行actuation権限を与えない。

## 段階とタスク状態は別

| 段階 | 名前 | 判定対象 |
| ---: | --- | --- |
| 0 | 要件整理 | 機能定義や公開説明がある。専用設計の不足が残る |
| 1 | 基本設計あり | 対象範囲の基本設計を保存済み。方式・数値・実証は未決を含む |
| 2 | 試作済み | 限定実装、fixture、bench等の証拠がある |
| 3 | 一部統合 | 明記した範囲で隣接systemとの連携記録がある |
| 4 | 実機受入 | 同一候補・対象実機・条件・合格報告がある |
| 5 | 本番受入 | 同一候補で配布・運用・復旧等の必須受入を満たす |

登録しただけでは段階を上げない。各部隊のstageAssessment.scopeが評価対象、gapsが残課題、referencesが判定根拠。「一部統合」は製品全体の完成ではない。task件数や段階の平均から製品完成率を計算しない。

plannedは未着手、in_progressは進行中、blockedは明示停止、doneは当該taskの完了記録。未完了のdependsOnがある場合は、元のstatusを保ったまま前提待ちを表示する。部隊間dependsOnSquadsは調整・接続関係であり、部隊全体の完成待ちではない。

## 32部隊の次のタスク

この一覧は正本JSONから生成する。nextTaskは全体受入を管理する親taskで、その下の6子作業を独立に追跡する。詳細手順と合格条件はtaskPlans、主担当はtaskAssignmentsを参照する。

<!-- AMC-SQUADS:START -->
| ID | 部隊 | 証拠のある段階（対象限定） | 次task | 子作業 | 具体的な成果 |
| --- | --- | --- | --- | --- | --- |
| H1 | 製品・Interface統合 | 3 一部統合 | AMC01 | 6 | 現行3製品とOSの責任表・未決事項台帳をレビューする |
| O1 | 権限・Security | 3 一部統合 | SYS13 | 6 | 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 |
| O2 | Work・Data | 3 一部統合 | AI04 | 6 | 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 |
| O3 | AI・Agent | 3 一部統合 | AI02 | 6 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 |
| O4 | Tool・MCP | 3 一部統合 | SKY07 | 6 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する |
| O5 | Sky・Zema・Wallet | 3 一部統合 | SKY19 | 6 | SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） |
| O6 | Device Adapter | 2 試作済み | OS02 | 6 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 |
| O7 | Release・運用 | 3 一部統合 | LCH07 | 6 | 同一最終候補の再現配布・導入・復旧リハーサル |
| M1 | 製品設計・ICD | 1 基本設計あり | MINI01 | 6 | R5要求・OPEN01〜08と部隊別試験の追跡表を作る |
| M2 | 筐体・機構 | 1 基本設計あり | MINI02 | 6 | R5の200mm収納と部品干渉を確認する機構評価計画を作る |
| M3 | Sensor・Tracking | 1 基本設計あり | MINI03 | 6 | R5単体3D入力の方式比較と測定計画を作る |
| M4 | 空間表示・出力 | 1 基本設計あり | MINI04 | 6 | R5裸眼表示の成立条件・方式比較・試験開始条件を整理する |
| M5 | 組込み・Firmware | 1 基本設計あり | MINI05 | 6 | Mini単独boot・入力・game・保存・停止の最小実装仕様を作る |
| M6 | 電源・熱・通信 | 1 基本設計あり | MINI06 | 6 | R5電源・熱・1/2/4台通信の評価条件を定義する |
| M7 | Calibration・安全・受入 | 1 基本設計あり | MINI07 | 6 | R5校正・停止・privacy・復旧の危険分析と受入表を作る |
| P1 | Pro統合設計 | 0 要件整理 | PRO01 | 6 | Pro v0.1の製品要求と単独利用・任意Mini連携の境界を定義する |
| P2 | Compute・基板 | 0 要件整理 | PRO02 | 6 | Proの代表負荷・性能予算と演算基板候補の比較条件を定義する |
| P3 | Game Runtime・SDK | 0 要件整理 | PRO03 | 6 | Pro非金融ゲームのsample・保存再開・入力SDKの差分仕様を作る |
| P4 | Service・Storage | 0 要件整理 | PRO04 | 6 | Proの利用者別保存・容量・backup・復旧契約を定義する |
| P5 | 映像・Audio・I/O | 0 要件整理 | PRO05 | 6 | Proの映像・音声・controller・端子の最小I/O表を作る |
| P6 | Mini接続・時刻同期 | 0 要件整理 | PRO06 | 6 | 任意Mini–Pro接続の認証・時刻・Pose契約v0を作る |
| P7 | 筐体・電源・Security・受入 | 0 要件整理 | PRO07 | 6 | Pro筐体・熱・電源・更新復旧の制約と評価計画を作る |
| R1 | Mission・System | 1 基本設計あり | RKT01 | 6 | rocketstar R1.0のMission入力・未決台帳と要求追跡を整理する |
| R2 | 構造・Tank | 1 基本設計あり | RKT02 | 6 | 構造・tank・取付Interfaceの解析入力と検証計画を整理する |
| R3 | 推進 | 1 基本設計あり | RKT03 | 6 | 推進系の要求・機体Interface・検証段階を整理する |
| R4 | 空力・熱 | 1 基本設計あり | RKT04 | 6 | 空力・熱・構造の結合条件と検証入力を整理する |
| R5 | GNC・Avionics・Flight SW | 1 基本設計あり | RKT05 | 6 | Flight SWの独立性・状態・SIL試験要件を整理する |
| R6 | Payload・分離 | 1 基本設計あり | RKT06 | 6 | Payload・扉・分離のInterfaceと異常確認計画を整理する |
| R7 | 電源・Data・A-LINK | 1 基本設計あり | RKT07 | 6 | R1.0の電源・data・時刻とA-LINK旧試作の差分表を作る |
| R8 | 地上・Launch | 1 基本設計あり | RKT08 | 6 | 地上設備・運用役割とgo/no-go・abortの机上確認計画を作る |
| R9 | 帰還・回収・再使用 | 1 基本設計あり | RKT09 | 6 | 帰還・回収・整備・同一機番再使用の証拠台帳を設計する |
| R10 | 製造・品質・安全試験 | 1 基本設計あり | RKT10 | 6 | 製造・品質・安全の構成管理と段階別証拠matrixを作る |
<!-- AMC-SQUADS:END -->

## 着手順序

1. H1のAMC01で製品・Interface・未決事項の責任を整理する。
2. MiniはMINI01、ProはPRO01、rocketstarはRKT01で要求と作業の追跡を作る。この3つは互いの完了待ちではない。
3. 各製品の後続6・6・9 taskは、その製品の先頭taskを前提とする。OSは部隊別の既存taskを継続する。
4. 数値・対象機材・担当の合意がない箇所は未決のまま記録し、条件が揃うまで実機・費用発生・公開操作を実行しない。

AMC01とMINI01〜07・PRO01〜07・RKT01〜10の25親taskは「要求・仕様・評価計画を作る」段階まで。特にhardwareの144子作業はすべて文書・仕様の成果物であり、fixtureの記載も試験入力と期待結果の設計を意味する。作成後の実装、試作、実機、製造、飛行は別taskと証拠が必要。既存OS 7親taskの42子作業は元の実装・受入範囲を維持し、ローカル試験、実機、外部Provider、OWNER判断などの実行境界を明示する。分解によって元taskの全体完了条件や承認条件を縮めない。

## 親子タスクと同時実行の読み方

- project taskとtaskPlanの両方へ同じparentTaskIdを記録する。子IDは親IDに-01〜-06を付け、主担当と分類は親から継承する。
- 子のdependsOnには親の既存前提と必要な兄弟子だけを指定する。親そのものを依存先にすると親子が相互待ちになるため指定しない。
- 子の成果物は親のdeliverable.path内の独立したsectionで分ける。同じ文書へ複数人が書く場合はsection単位で編集範囲を分け、統合時に全体整合を確認する。
- 子が6件完了しても親は自動完了しない。親自身の合格条件、全成果物、依存、証拠を別途確認する。現行製品の成熟段階も自動で上げない。
- 192子作業の負荷区分は文書166、コード・小規模試験17、build 2、実機3、外部4。これは予定作業の分類であり、192プロセスを同時起動する指示でも負荷の実測結果でもない。
- PC・サーバーが保持する登録件数と、同時に処理できる実行数は分ける。CPU・RAM・空き容量・API制限・外部承認・依存・文書の編集競合に応じて上限を決め、未測定環境を実証済み容量として表示しない。

## 集計と合格のルール

- taskAssignmentsは全taskにちょうど一つ。分類は現行製品・共通基盤・旧版・統合管理・公開説明。
- 子taskにも一意の主担当を記録するが、集計対象は親を除くleafを使う。親の状態を子の合格へ、子の合格を親全体の合格へ自動転用しない。
- squad.taskIdsは主担当taskのみ。relatedTasksは参考リンクであり、主担当の実績へ加算しない。
- 旧版・公開説明は現行担当件数から分離する。共通基盤の完了を製品固有の受入へ転用しない。
- acceptanceCriteriaは未検証・合格・不合格。合格には証拠pathが必要。詳細計画のあるtaskをdoneへ進めるには、全条件の合格、成果物、task証拠、前提taskの完了が必要。
- 既存の詳細計画未整備taskは過去statusを保持する。今回の検査で全過去試験の内容を保証したとは扱わない。
- stage 4・5は候補SHA、対象環境、受入報告を必須にする。fileの存在だけでは内容の正しさを証明できないため、人による対象・結果の確認を省略しない。
- Miniの2D fallbackはOS/入力検証用。裸眼空間表示の合格にはしない。
- WLT06・BIL02・SKY19のToC料金請求・回収・払出しは別途実行保留。既存statusが進行中でも、料金方針の決定・契約・受入前に実行しない。設計整理やsandbox試験は別扱い。
- executionHoldsの指定taskを分解しても子へ同じ保留scopeを適用する。SKY19の子の設計・合成試験を、料金請求・回収・払出し再開の承認にしない。
- 未達条件を隠して期限や性能値を埋めない。実担当者はassignee=nullなら未割当。

## 更新と検証

指示から対象部隊と子作業を束ね、Goal用の一括指示文・進捗台帳を作る入口は[AMC Goal Orchestrator](amc-goal-orchestrator.md)。既存計画の候補展開とローカル検収記録の第一版であり、任意指示のAI分解、外部送信、サーバー常駐は未接続。

1. data/project-status.jsonにtask・status・前提・実績証拠を記録する。
2. data/mission-control.jsonに一意の担当、分類、部隊の次task、詳細計画を記録する。
3. 作業後に合格条件ごとの判定・証拠を更新する。部隊段階は対象範囲と残課題を同時に見直す。
4. <code>npm run mission:update</code>、<code>npm run project:update</code>、<code>npm run database:status</code>で案内と集計を同期する。
5. <code>npm run mission:check</code>と<code>node --test tests/mission-control.test.mjs</code>、最後に<code>npm run verify</code>を通す。

会話の進捗表示は手動更新のsnapshot。正本更新時は<code>npm run mission:update -- --visualization &lt;既存表示HTMLの絶対path&gt;</code>で同じデータから再生成する。ネットワークやGitHubとの自動同期ではなく、表示時点を明示する。テンプレートは[scripts/templates/mission-control.html](../scripts/templates/mission-control.html)。

検査は担当の欠落・重複、参照混入、task/部隊の依存循環、親子の担当・分類・責任区分の不一致、親前提の解除、親を前提にした子、成果物sectionの重複、親範囲外の子成果物、入力の欠落、証拠なしの合格、未完了の子を持つ親の完了、実機証拠なしの段階昇格、生成一覧のずれを拒否する。
