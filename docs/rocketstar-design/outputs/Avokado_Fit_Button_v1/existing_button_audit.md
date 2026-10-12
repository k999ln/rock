# avokado フィットボタン変更・既存仕様の読取確認

確認日：2026-09-24。対象は添付の銀色洋ナシ形を使った、筐体と面がそろう電源ボタンの外観変更。元リポジトリ、E3配布文書、現行配布文書には変更を加えていない。

## 対象と位置

- E3で電源ボタンの電気的入力が記載されている対象は **別体 Edge Hub**。Motion Tower 4本に個別電源ボタンを置く仕様は確認できない。
- HubのT20-M04は主基板・マイク基板・配線・空気経路の包絡図であり、電源ボタンを置く面、座標、穴、突き出し量を指定していない。既存の突起形状や取付位置が工学図面で確定済み、とは扱わない。
- 今回の意匠画像で既存のボタン位置を引き継ぐ場合、その画像上の位置を意匠の基準とし、E3がその座標を承認したことにはしない。タワー面へ描く場合も、Hub用電源入力の実装が塔に存在すると読み替えない。
- 現在workspaceの文書・JSON・SVGから「電源ボタン」「PWRBTN」「power button」「フィットボタン」の既存定義は見つからなかった。ロケット／衛星／OSの文書はE3の4本＋Hub構成を参照している。

## 既存の動作

- E3ハードウェア本文250行、260行：候補主基板4X4-AI350の **PANEL1 pin 5 GND と pin 6 PWRBTN#** を短時間接続する、無電圧・常開の押しボタンを候補とする。これは資料にある接続候補の読取結果であり、今回の変更で回路を発行するものではない。
- 短押しの秒数、長押しの秒数、押下荷重、ストローク、連打処理、運転中の電源操作はE3本文で確定されていない。一般的なPCの値を既存avokado仕様として補わない。
- E3 OS本文109行：Hub起動後にTVへ版と自己診断を表示。カメラ・マイクの論理入力はOFFから始める。起動時間の実測値はない。

## 保持する境界

- 今回変えるのは洋ナシ形の輪郭、銀色の表面、無操作時に周囲の筐体と面がそろう見え方。面一の外観を静電タッチ方式への変更と同一視せず、既存の瞬時押しボタン候補と両立させる。
- 電源ボタンを押しても、撮影・録音の同意、PTT、物理MIC OFF、カメラシャッターの役割を兼用しない。起動直後の入力OFFを維持する。
- 外観の変更によって寸法、公差、ストローク、荷重、防水等級、材質・表面処理、寿命が検証済みになったとは表示しない。それらは今回の拡大意匠図と別の実装値として扱う。
- avokadoの電源操作は端末の操作であり、rocketstarの発射・推進・飛行制御のスイッチへ変更しない。
- 新しい承認依頼は不要。今回は利用者が指定した外観変更を具体化できる。

## 読取出典

1. `/Users/kaiya/Documents/Codex/2026-09-20/mo/outputs/avocadoMini_Tower20_E3_package/hardware_design.md`：250–270行（電源入力）、279–289行（音声と物理プライバシー操作）。
2. `/Users/kaiya/Documents/Codex/2026-09-20/mo/outputs/avocadoMini_Tower20_E3_package/os_design.md`：109行（Hub起動）。
3. `/Users/kaiya/Documents/Codex/2026-09-20/mo/outputs/avocadoMini_Tower20_E3_package/drawings/T20-M04.png`：Hub配置図を目視確認。
4. `/Users/kaiya/Documents/Codex/2026-09-21/codex-threads-01a0bc41-ceb2-72a0-8417/outputs/rocketstar_C3_package/payload_interfaces.md`：37行（機能はHubへ集約）、65行（端末と飛行制御の役割）。
5. `/Users/kaiya/Documents/Codex/2026-09-21/codex-threads-01a0bc41-ceb2-72a0-8417/outputs/RockstarOS_Complete_Design_v1_0/RockstarOS_Complete_Design_v1_0.md`：239–248行、431行（4塔＋Hubと機器制御の境界）。
