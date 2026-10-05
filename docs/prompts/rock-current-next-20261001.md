# RockstarOS SIM/eSIMサービス主導 開発継続プロンプト

製品ベースは [`docs/product-baseline.md`](../product-baseline.md) と [`data/product-baseline.json`](../../data/product-baseline.json)。2026-10-01の明示要件を旧方針より優先する。

履歴付きaudit基準: main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design `de5b102d3525daccf604efd5685bdf8c14ad5d50`。これらは現在のcheckout/branch/CIを示すものではない。現行Git状態を別途確認し、履歴基準へ巻き戻さない。

## 製品の正

- 物理SIMまたはeSIMの購入にRockstarOS、Sky、Zema、統合Agentへのアクセスを含める。通信事業者、Rockstar、端末販売店、オンライン等複数チャネルを扱える構造にする。
- SIMはサービス・通信への入口であり、RockstarOS binaryをSIMへ格納する要件ではない。
- 提供価値は、(1) クラウドLLM/Agentへ短い手順でアクセス、(2) 使用量と料金を明確に表示、(3) 一度の本人認証からSky/Zemaを最小設定で使うこと。
- cloud workは事前承認・予算・期限が固定されれば端末切断中も継続し、復帰時に同一jobの進捗・成果を同期する。過承認なしの予算超過は拒否する。
- 正確な端末へ署名済みOS、OEM/boot/recovery権限、復旧手順が受入済みの場合のみnative OSを案内する。それ以外は既存OSのapp/shellまたはbrowser client。SIM/eUICC対応をOS互換性とみなさない。

## 続ける作業

1. 既存実装・dirty worktreeを再調査し、既存cloud workflow、owner auth/recovery、attestation/capability snapshot、Wallet予約、Provider署名usage receiptを維持する。既存差分を上書きしない。
2. `SIM01`はchannel-neutral signed purchase claim (`0039`)、`/connect`導線、主要4scopeのfeature-gated enforcement、署名refund/revocation endpoint (`0040`)までlocal実装済み。継続作業は全paid Sky Tool/Broker/background/recovery routeへscope gateを広げ、issuerの鍵rotation・実際の販売元webhook契約を定義する。ローカルevent処理は検証済みだが、実販売元接続やproduction issuer鍵の受入ではない。
3. 共通HomeからSky、Zema、Agent、job inbox、進捗・成果・usageへ直行し、同じRockstar identityを保つ。実行前に価格版・単位料金・見積上限を表示し、本人がbudget capを承認した場合のみ有料実行する。実行中は予約額/署名receipt確定額/残り上限を区別し、完了後にusage meter・数量・単価・金額・receiptを明細化する。
4. provider quote/priceが不明またはbudget enforcementが接続できない場合、有料dispatchを止める。carrier plans、AI/API/compute、package作者支払い、Sky fee、返金/税を混同しない。
5. 端末別matrixを使い、native OS、supported client、browser-only、非対応を分岐する。Pixel GL066を既存の代表実機gateとして維持し、iOS/other Android/PCの実機受入に見せ替えない。
6. architecture、onboarding、backlog/progress、help/product copy、recovery/runbookを同期する。新しい要求があれば `project.md`、`data/project-status.json`、README snapshotを更新する。

## 実装・検証の境界

- local unit/host/Worker/D1/Provider fixtureは、その境界の検証だけを示す。production billing、請求回収、実キャリア開通、物理SIM fulfillment、eSIM導入、端末のOS書込み、offline hardware acceptanceの証拠には数えない。
- eSIM供給元・通信事業者・OEM/端末・cloud Providerの契約、費用、資格情報なしに可能な実装を先に進める。購入、課金、公開、実profile発行、端末消去/flashは実行しない。
- 各段階で、実装済み/ローカル検証済み/契約sandbox/実機/production未受入を明示する。
- `npm run verify`、`npm run project:check`、`git diff --check`を完了前に実行する。test-only failureと既存failureを分け、fixtureをproduction successに昇格しない。
