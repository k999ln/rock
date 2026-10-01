# 起動応答の改善案（未検証）

`changes.patch` は第9の封印済みソースに対する21ファイルの作業差分。**通常のnativeソースには適用していない。compile・新テスト・OS build/bootは未実行。** 取得時hashと各変更hashはmanifestを参照する。

画面描画後にnativeイベントループが応答していることをfresh nonceで確認し、A/B更新を正常扱いする前に判定する案と、起動時のsnapshot再読込間隔を調整する案を含む。root側がPID/UID/executable/socketを照合し、タイムアウト時にfail closedする。画面へのメモリ書込み・イベントループ応答は、物理パネルや利用者入力の実動作の証明ではない。

採用前に、分離した作業コピーで次を行う。

1. 第9sourceのbase hashを照合し、`git apply --check changes.patch` で適用先を確認する。新規shell wrapperの実行属性もmanifestへ合わせる。
2. 未作成の `tests/test_ui_startup_health.py` を実装し、nonce/PID/UID/exe不一致、停止loop、余分・切詰め・ancillary packet、timeout、FD漏れを実Linux socketで検証する。
3. C health、UI自動再読込・遅延・入力中の保持をcompile/試験し、既存全回帰を通す。
4. 新しいOSをbuildし、UI準備前/無応答/異常終了時にmark-goodしないこととA/B復旧を実QEMUで確認する。headless試験の明示指定をGUIの成功に数えない。
5. 正常起動時に追加操作が不要か、操作数と待ち時間を同条件で測る。合格した変更だけ本線へ適用する。

元のpending画像と後の手動更新画像だけでは、途中の自動更新が失敗したとは断定できない。このpatchが必要/有効とする判断も上記試験の対象。
