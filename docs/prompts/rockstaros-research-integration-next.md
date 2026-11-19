# RockstarOS：調査反映後の継続開発

本人の2026-10-21指示を継続する。X型の変更対象はtimelineだけ。全体要件はRQ01〜RQ49と追加38件の[照合台帳](../../data/rockstaros-research-reconciliation.json)、[照合と設計判断](../rockstaros-research-integration.md)を使う。添付研究は840/900分の草稿で、15時間完了・新規発明・性能優位と呼ばない。

## 1. 現在地を同期する

正本5ファイル、責任分界、担当workstream、Git/PR/同一SHA CIと対象sourceを読む。最新確認ではmain `f98482605803a03522f50b92eeacebd45c2f3b0f`、local/remote branch `951d82d5a491a284aed4e0d4d280171d835d4b43`、main側644 ahead/3 behindのdivergenceがある。main同一SHAの6check成功と、branchのsource-preparationだけの成功を区別する。共有dirty sourceを保全し、自動のmerge/reset/上書きはしない。mainのworkflowにはfreeCloudのunconfirmed/waiting等があり、このcheckout未反映の機能を一から作り直さない。まず引継ぎ入口・優先順位を同期し、対象差分を狭めて再利用/変更/未受入を決める。

歴史的監査の起点はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design `de5b102d3525daccf604efd5685bdf8c14ad5d50`。現在のSHA・実機合格へ転用しない。

## 2. 今回の局所実装を保持する

Sky timelineのX型skin、投稿/thread/返信、like/repost/bookmarkの本人別保存、リンク共有、現在鍵の照合、既存Model/Agent/OS構成Addを保持。migration0073、local DB backupと70〜72のjournal照合を証拠へ残した。`docs/evidence/timeline-research-integration.json`を読み、local/fixture/API/browser、実X feed、Pixel、本番を分ける。表示だけを戻して実保存をなくさない。X本人feed取得は未接続で、viewer成功やSky独自投稿を取込み成功としない。

## 3. 次のCore実装

- **A16 / RQ04,08,42,48**：既存workflow/Broker/予約/receipt/失効を再利用する。問題は外部最終sinkのD（一回性）/Q（終端照会）/M（最大費）/F（旧worker遮断）が同一仕事で揃っていないこと。先に合成sinkでACK消失・後着commit・異provider二重作用・同時2端末・価格/宛先/承認版変更を実装する。UNKNOWNをno-effectとせず、別ID再送や予約解放を止める。本人請求上限と運営最終原価を別検査。適用不能なproviderをstrictと表示しない。
- **A13 / SI02,SI03,DATA01**：本人job版、実payload、成果byte/版、宛先、確定/推定費、未確認、次の判断を型付きで束ねる。LLM文章から原本の事実を創作しない。画面・音声のcoverageと本人理解を別に検証し、私的出力不足ならneeds-reviewへ止める。
- **A9 / LM01,GR03,SI04**：既存model適合・選択とhost adapterを再利用。実測の残仕事、移行/再prefill/queue、熱/電池/原価を計測してから配置する。prewarm前の秘密data移転を承認し、epoch切替と最終sink fencingを確認する。未承認Cloud退避やKVの他tenant流用をしない。

各差分は原因→修正順→否定fixture→合格証拠→残る条件を台帳へ追記。新算法の単独優位は強い既存対照との同条件比較後だけ判断する。

## 4. 外部・実機を要する残件

eSIM真正issuer/profile・端末起動hook・管理Linux、月16 USD含有数量/超過単価/地域/税と月次Provider照合、作者登録→販売→返金後払出、production鍵・実二端末・全損復旧、Pixel全image/署名/OTA/復旧、Mini単独radio/電池/開通、Pro実GPU/game共同負荷を個別に受け入れる。本人未確定条件や外部依存を勝手に補完せず、その前にROCKだけでできるfixture/実装/診断を具体化する。Pixel利用開始moduleは本人指示どおりOS受入後に組み込む。一般公開・実課金・実資金・OS flashを台帳保存から許可されたと推定しない。

## 5. 検証と引継ぎ

変更箇所の試験、schema/database/baseline/design/type/lint、UI依頼なら実UIを操作し、最後に `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。ログはGit外、要約・source hash・具体的な未受入条件を証拠へ保存する。project/status/README/design indexと全体/Tool詳細を同期する。文書保存、branch commit、main統合、配備を別記録。テスト件数を完成率にしない。
