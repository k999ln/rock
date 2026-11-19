# Noah — ローカルAgent接続の実処理テスト

- 本人が言う一言: 「テスト用の処理を作成して、ワンクリック接続処理が可能になるまでトライして周辺を開発して」
- Goal: Noah詳細の接続1クリックから、このMac上の固定テストruntimeを準備・起動・疎通確認し、入力処理の結果を受け取る。予算0円、入力テキストだけを使用。
- Noaがつなぐもの: 保存済み定義のhashに紐付く許可済みadapter。元のWeb URL/ZIPを実行プログラムとして解釈し直さない。
- AMCの工程: accountの所有確認→adapter照合→別process起動→nonce付き往復→利用可能→手動のテスト処理→結果記録。
- Jevの合格条件: 正常時接続操作1回、未応答の利用可能表示0件、同時接続でprocess1個、同じ実行ID/入力の処理1回、入力変更再送409、他ownerの読取/操作0件、外部Origin操作0件、停止後実行0件、失敗後の再接続成功。
- 出力先: `/noah/agents/[id]`の接続・入力・結果パネル。テスト結果を業務Job/課金Receiptとは表示しない。
- Wallet: 外部通信・モデル呼出し・課金なし。実業務adapterは既存Broker/Work/Walletのゲートを接続して別受入する。
- hardware profile依存: loopbackのNode開発ホストのみ。スマホ→Macのペアリング、常設cloud実行は未対象。
- 失敗時: 準備失敗/切断を表示し、入力を保持して再接続。実行応答不明は同じ実行IDで結果確認。未知の実行を自動再送しない。
- 記録: accountの定義が正本。端末cacheはownerScopeのhash/登録ID別、直近20回のテスト入力hash・結果・時刻。秘密値とprocess再利用情報を保存しない。

## APIとadapter

2026-11-15追加: [運用開始/停止と画面を閉じた定期実行](noah-background-operation.md)を追加。以下の手動接続契約に、operation APIとjournal v2を後方互換で加える。

- 開発専用`/__noah/connections/[id]`のGETは対応可否と実測状態。POST `/connect`・`/disconnect`は`{}`、POST `/run`は`{requestId:UUID,text:string}`（最大4000文字）。
- 全操作でloopback Host/socketと既存`/api/noah/agents/[id]`の所有権を検査。POSTは同一Origin/ownerScope必須。改変定義・未保存・削除済み・不正bodyを実行しない。
- adapter registryは`id / manifestSha256 / start / probe / run / stop`。今回の`text-check/1`はNode子processとIPCで通信し、ブラウザからcommand/path/environmentを受け取らない。
- 状態は`disconnected / connecting / ready / failed`。GETも疎通を再確認。接続待ち/実行待ちは各instanceで直列化。準備・疎通に期限を付ける。
- ホスト再起動後は必ず未接続。前回結果は保持するが、保存されたreadyやPIDを信用して再接続しない。記録時にrunningだった結果はunknownにし自動実行しない。
- 結果本文は直近20回、古い実行ID/hashは再実行防止のため1000回まで保持。保存期間外IDの再送410、1000回以降の新規処理429。状態・履歴は端末cacheで業務台帳ではない。
- 未対応Agentは`{supported:false}`。対応を増やすには明示的なadapter実装/版固定/入出力と権限の検証が必要。

## 受入

2026-11-15: 指定の登録テストAgentで実ブラウザの接続1クリック、5行→3行の実処理、異常終了の検知/再接続、停止、再読込を確認。関連24試験、型/lint/build/設計検証成功。[詳細と残課題](../../codex/tasks/58-noah-one-click-connection.md)。固定preview accountでのローカル受入であり、公開hostの複数実accountや外部Agentの業務接続の実証ではない。
