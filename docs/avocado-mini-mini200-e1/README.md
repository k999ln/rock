# avocadoMini Mini200 E1 — 20cmゲーム機と日本語音声の設計

2026-09-21 / 主担当 `Material Invention / avocadoMini` / `ROCK` / `MAT08`（資料と参照モデル）・`MAT09`（今後のE1統合）。利用者の指示を設計として保存した版で、製造承認、実機、ASR、OS搭載の完成ではありません。

## 読む順番

1. [詳細設計](design.md)：26ページ版PDFと同じ本文・図7枚。本文中の「本書」「頁」は作成時の冊子を指します。
2. [外形図](drawings/mechanical/ME200-E1-01.svg)と[内部配置](drawings/mechanical/ME200-E1-02.svg)：198×178×198mmの区画案。加工承認図ではありません。
3. [音声ハード設計](engineering/voice/README.md)と[身体・音声の許可設計](engineering/interaction/README.md)：PTT、日本語10コマンド、AEC制限、独立MIC OFF、取消。
4. [候補BOM](engineering/candidate_bom.json)、[機構の計算条件](engineering/mechanical/inputs.json)、[未記入の実機試験票](engineering/physical_test_record_blank.json)。
5. [再実行方法](engineering/README_replay.md)。

前面3丸窓のD0外観を作業参照にしています。利用者の「あのデザイン」との一致は未確認です。使用時20cm、ゲームから創作・研究・生活へ拡張する方向と音声機能の要求を保存しますが、CPU・カメラ・マイクの候補型番、外観の細部、1〜2m等の目標を利用者の承認済み量産仕様にはしません。

旧P0.2の4本＋外部Hub、伸縮、41万円のキット価格と、E1の本体1台案を混ぜません。旧資料と公開サイトは履歴として保持し、今回サイトを配備し直していません。Pixel 10とQEMUのOS開発・release gateも変更しません。

## 既存RockstarOSとの接続境界

確認基準は `main` の `83649c7256fbd5dafa664a0d2d7bfbf9651a8bfa`。以下は2026-09-21の対象パスの静的確認と既存fixtureであり、全branch・全実機の包括監査ではありません。

| 現在の根拠 | E1へ接続するときに残ること |
| --- | --- |
| [`lib/material-invention.ts`](../../lib/material-invention.ts)は二物質・割合・工程・安全条件から候補graphを作るsandbox | ゲームの衝突エンジン、実化学計算、実カメラの人体認識ではない。ゲーム結果と研究証拠を区別するadapterが必要 |
| [`contracts/avocado-mini-spatial-interaction.json`](../../contracts/avocado-mini-spatial-interaction.json)はnorth/east/south/westの四方向を必須化 | E1前面ステレオを四方向に偽装しない。別versionのゲーム／発射入力profileと明示adapter、移行・拒否fixtureを新設して受入する |
| [`lib/catalog.ts`](../../lib/catalog.ts)の`faster-whisper`はcandidate。候補runnerは導入準備の文章を扱う | 文字起こしの実処理ではない。E1のwhisper.cpp候補・マイクDSP・VAD・ASR・intent gateは別の新規統合 |
| [`public/_headers`](../../public/_headers)はWebのcamera/microphoneを禁止 | 本資料保存でWeb許可を緩めない。端末内の音声serviceとWeb originの許可は別設計 |
| `MAT04`/`MAT07`は既存の設計証拠、`MAT05`/`MAT06`は四方向runtime／実機の未受入 | E1の参照モデルがPASSしても旧taskの実装・実機完了へ振り替えない。E1統合は`MAT09`で区別する |

このフォルダーのPythonは直列・メモリ内の設計モデルです。製品runtimeから呼んでおらず、起源署名、本人認証、永続replay防止、実保存、物理マイク遮断を実装したものではありません。本文18章のservice名は提案で、既存OSへ同名実装があるという意味ではありません。

## 保存と検証

[今回の検証記録](verification.json)では、参照モデル140項目の再現と関連20テストを区別して記録しています。全体`npm run verify`はローカルNode試験の完了待ちで中断し、全体合格とは扱いません。

repository rootで実行します。

```sh
python3 docs/avocado-mini-mini200-e1/engineering/verify_all.py
npm run project:check
npm run baseline:check
npm run design:check
node --experimental-strip-types --test tests/material-invention.test.mjs tests/product-baseline.test.mjs tests/patent-assistant.test.mjs tests/mini200-e1-docs.test.mjs
```

Python 3.10以上、追加ライブラリ不要。4モデルの9＋14＋18＋99＝140項目を一時領域で再実行して保存値と比較します。重複前提を含む確認項目数であり、独立した140種の実機試験ではありません。架空粒子1000組はcore9項目中の1項目に含みます。実音声・実機・化学実験・外部操作は0です。認識精度や遅延目標を証明しません。

本体内の認識は日本語、多言語base/smallモデルを比較、初期PTT、原音の保存・外部送信は既定OFFとします。声だけの身体起源発射、決済、家電操作を許可しません。起動語・TV音の中のhands-free・barge-inは別受入。ハードのMIC OFFとカメラ同意は独立させます。

## 次の実装と担当

- `ROCK`: E1専用入力profile、信頼adapter、OSサービス、非金融ゲーム、ローカルASR、保存・取消・復旧。まずfixtureとPC上の縦断試作で確認する。
- `EXTERNAL`: 実主基板、光学・音響部品、driver、firmware、モデル利用条件、製造資料。
- `JOINT`: 20cm内の配置、閉箱冷却、ファン音、TV音AEC、日本語5400発話の計画、人体入力と描画の同時実測。
- `OWNER`: 外観の一致、試作対象と費用、外部共有・生活機器・資金用途の個別承認。資料保存から購入や公開を推測しない。

次は外観確認、主基板と全相手コネクタの選定、実部品CAD、マイク逆給電を防ぐ遮断回路、E1入力契約、実ゲームと実ASRの同時試験を進めます。実測合格前に加工・配線を発注しません。GTA VI、全身360度、現実の物質変化は保証しません。

Gitには自作のMarkdown・SVG・計算入力・参照コード・要約結果のみを保存します。元の利用者提供P0.2 PDF/DOCX、メーカーPDF、重複する冊子PDF/DOCX・PNG・ZIPは含めません。音声の一次資料URLは[原典一覧](engineering/voice/sources.json)へ残しています。
