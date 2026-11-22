# 101 黒殿の 1 ノードを Linux 版 runner の host にし、計算の置き場所の引き金を測る

本人の一言: 「早く設計して」（2026-11-21）。設計は [docs/compute-placement.md](../../docs/compute-placement.md)、eSIM は [03 の 0 章](../../docs/structure/03-esim.md)。

## やること

1. **従量の計測。**（実費の計算と引き金の判定は `lib/cloud-cost.ts` に実装済み・試験済み。残りは、使った量の記録を集める所と、運営の画面への表示。雲の置き場所（task 75）ができてから、Containers の秒を記録する） `lib/noah-usage.ts` の集計に、Containers の秒・Workers AI のトークンを、月ごとの実費（定価で換算）として出す読み取り専用の関数を足す。運営の画面に「今月の従量」と「引き金（月 $190）まで」を出す。値は環境変数 `NOAH_CLOUD_TRIGGER_USD`（既定 190）。
2. **Linux 版 runner。** task 95 と同じく、Mac 固有の処理を 1 か所に寄せ、Linux の host で `noah doctor / pair / start / stop / status / receipts` が同じ受入を通す（画面なし、外向き全閉、`egress` だけ許可）。
3. **GPU の実測（C3）。** 30B 級 MoE を 1 枚で動かし、入力 3,000・出力 1,000 トークンの仕事の毎秒トークン数・同時 8 件の待ち時間を測り、この task と compute-placement.md 5 章に書き足す。
4. **戻す試験。** 黒殿の runner を止めた時、同じ要求 ID の仕事が結果不明になり、再配送されず、新しい仕事が Cloudflare の従量へ回ることを試験で確かめる。

## 合格条件（Jev が判定できる値）

- Linux の host で、runner の一周（接続・実行・成果受領・停止）が 1 回以上通る。画面を取らない検査（task 84）の違反 0。
- 外向きの通信が `egress` の宣言外へ 0 件。隔離環境の中の鍵 0 件。
- runner 停止時、同じ要求 ID の実行 1 回以下、結果不明の自動再実行 0 件。
- 従量の月の実費が、定価の表（compute-placement.md 3 章）と ±1% 以内で一致する。
- GPU の実測値が記録されている（値の大小は合否にしない）。

## やらないこと（本人の明示許可が要る）

- 黒殿への本番配備、本番 D1 への migration、Cloudflare の契約、月の上限額の変更。
- 黒殿の他の用途の設定・データに触ること。
- C1（黒殿を avokado に回すか）・C2（電源）の判断。

## 先に要る

C1・C2 の本人の回答。無い間は、1・4 を手元と Linux の仮想機で進め、2・3 は検証機が来たら行う。

## 項目 1・4 の実装と検証（2026-11-22）

- `/noah/usage` の「Noah全体」で、運営権限のある利用者にだけ Containers と Workers AI の月別の定価換算額を表示する。記録は [task 105 PR #368](https://github.com/k999ln/rock/pull/368) の使用量台帳から読み取る。月は UTC。単価未確定分があり、引き金までの距離を確定できない場合は「未確定」と表示する。今月の距離と、終了済み 2 か月の超過の判定を区別する。実メーターからの入力は task 75 の計算環境と計測元の接続後。
- runner 停止の練習では、既存の lease を使って同じ ID が結果不明になったこと、遅れて届いた完了が拒まれたこと、再接続で再配送されないことを確認する。新しい ID だけをローカル workerd 上の合成 Cloudflare 実行先へ送り、同じ ID の再照会で実行と従量の記録が増えないことを確かめる。本番の Cloudflare 実行先への接続は task 75 の後。
- 項目 2 は起動前確認で停止。手元の専用 Colima エンジンに接続できず、`noah doctor` は Colima 未検出。現行の runner 起動は Colima/VZ、登録は `darwin-arm64` が前提で、Linux host での一周・画面なし・外向き制限・鍵なしは未検証。
- 項目 3 の GPU 実測と黒殿への配備は今回の範囲外。
