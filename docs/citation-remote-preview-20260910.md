# 引用整理の開発用遠隔実行

同じ公開入力を、端末内と選んだ開発用runnerで処理し、結果と元の送信要求をHubから再確認する。元の引用整理1.0.0は保持し、作者が明示的に提供する1.1.0の開発fixtureへ切り替える。処理本体・入力/出力制限・価格表示・作者・権利表示を変えず、仕事ごとの入力hashに対する送信同意を追加する。

`systems/rock-star-os/os/runner/build_fixture.py` の `remote_citation_fixture()` は既存recipeを読み、公開RFC試験鍵で署名する。製品ライセンスや本番作者署名を創作しない。共有の公開開発registryへ配布する試験であり、未知の第三者コードをplatform鍵で承認する仕組みではない。

入力は既存の150byte公開サンプル（SHA256 `bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e`）。出力は151byte（SHA256 `e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7`）。MR CLIの155byte契約とは別で、同名だけで同じ実装とは扱わない。物理USB・一般cloud・実費請求は未確認。

## 再現する順番

1. 専用の空registry/runnerで、署名済み1.1.0を登録する。端末から一覧を更新し、用途・作者・版・権限・実行先を確認して明示インストール/許可する。
2. サンプルを入力し、別の場所の実行先を選ぶ。「まだ送信していません」で内容を確認し、この仕事の送信に同意する。
3. 実プロセスの結果を確認する。runnerを止めた次の仕事は照合待ちとして残す。元の要求を消して作り直さない。
4. OSを通常終了・再起動する。停止中のrunnerに対する元の要求を履歴から開き、同じrunner状態を再開して一度だけ完了させる。
5. 再度通常終了・再起動し、runner停止中でも保存済み結果を確認する。合成Walletや過去の端末内成果は不変で照合する。

Linux実TLSとframed Unixの隔離processは次で検証する（本物のUSBとは別）。

```sh
PYTHONPATH=src:os python3 -B -m runner.linux_acceptance --project "$PWD" --work-dir /var/tmp/rock-citation-UNUSED --port 9744 --fixture citations
```

実OS画面は `os/desktop/observe-pc-link-os.py --fixture citations --source ... --commit ... --config ... --sandbox-config ... --output ...`。専用の新しいremote履歴と停止したschema7端末を使用し、以前の試験データを消さない。registryはSIGTERM既定終了、runnerは独自handlerでexit0、OSは電源画面による正常終了を別々に記録する。原観測失敗や中間imageの合格を最終imageへ移し替えない。

この文書の作成時点では署名/元fixture不変の対象試験1件PASS。実Linux/実OSの結果は、凍結候補の報告書から判定する。
