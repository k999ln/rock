# Rockstar eSIM Bootstrap — Developer Preview

これは **eSIMの技術経路だけを模擬するhost-side開発fixture** です。製品の販売形態を限定するものではありません。現行製品は物理SIMまたはeSIMの購入にRockstarOSサービス利用権を含め、通信事業者・Rockstar直販・端末販売店・オンライン販売など複数チャネルから提供する設計です。fixtureは通信会社へ接続せず、回線や課金も発生しません。

## 実行

Node.js 22.13以上（今回の検証は26.0.0）、追加npm依存なし。

```sh
npm --prefix toolkits/esim-bootstrap run demo
npm --prefix toolkits/esim-bootstrap test
```

demoは一時ディレクトリにRockstarと模擬通信会社のSQLiteを別々に作り、終了時に削除します。`EsimBootstrap`と`FixtureEsimProvider`は指定したDBパスを使って再起動できます。署名鍵はdemo/test内だけで作る一時的なEd25519鍵です。OS/platform鍵、通信会社の鍵、production署名鍵ではありません。

<a name="noah-free-trial"></a>

## Macで運営Dockの指定とNoahの受取を試す

リポジトリのルートで `npm run noah:esim:trial` を起動する。模擬回線の発行・通信・受取は0円。食品の購入・発送は行わない。

1. 利用者は[招待画面](http://127.0.0.1:43871/noah/esim/trial/)から試験用の招待コードを入れ、0円で申し込み、模擬端末に回線を追加する。有効期限は招待から24時間。
2. 運営は[運営Dock](http://127.0.0.1:43873/)へ `operator` で入る。パスワードのファイルと有効な試験用受取人IDは起動端末に表示される。受取人ID、品目、数量、場所・日時を入力して「この人に配給を指定」を押す。
3. 利用者は通常回線で「更新があります」を確認し、[模擬専用回線](http://127.0.0.1:43872/noah/esim/trial/)で指定内容を開く。模擬の受取後に「受け取りました」を押す。運営がDockの記録を更新すると「受取済み」が見える。
4. 同じ申込・招待で入り直して履歴を確認する。記録はこのMacの `~/.local/share/noah/esim-trial/` に保存する。以前のAgent試験の記録は保持し、配給指定や現物受領に変換しない。

```sh
node --experimental-strip-types --test tests/esim-noah-free-trial.test.mjs tests/operator-dock-isolation.test.mjs
```

本番の運営Dockの入口は専用のCloudflare Accessで本人を確認する。Mac上の3つの入口は模擬環境で、実機へのeSIM発行・実回線経路・本番受取サービスとの接続は別途受入が必要。


### eSIMでクラウドのAgentを試す

専用回線の画面から「クラウドでAgentを使う」を開く。「自動」は利用可能な提供元の実行先を優先する。実行先と文章を指定して「バックグラウンドで実行」を押すと、タブを閉じて別の作業ができる。再び開くと、同じ依頼の成果・未達・未確認を読める。0円試験では1人1件を同時実行でき、接続先の一時停止や応答消失は同じ依頼IDで再照合する。稼働中の仕事の実行先は固定される。Macでの試験中はホストを起動しておく。

配備用の入口は `/api/noah/cloud-work`。eSIM導入済みで、有効な利用権に `noah` scope がある注文にリンクを表示する。Webの `NOAH_CLOUD_WORK` は非公開のクラウドWorkerへのサービスbinding。構成は `services/noah-test-runtime/wrangler.cloud-work.jsonc`。このリポジトリだけで実回線は発行されない。

- クラウド側の `LINE` は本人の実回線を照合する信頼済みの事業者接続。WebはeSIM利用権を確認してから、事業者による証明を内部で渡す。サービスbindingの `POST /authorize` では署名、リプレイ、期限、実回線、account、HTTP method・URL・bodySha256との一致を確認し、`{active,account,owner}` を返す。ownerは一意で安定した不透明なID。任意のブラウザヘッダーを回線証明として受理しない。
- 実行時の `POST /permit` は `{owner,agent,route}` を受け、現在有効な `active,enrollment,device,quote` を返す。無償試験はJPY建で利用者・運営双方の費用が0と確認できるものだけを受け付ける。実際の回線の発行・運用費と専用サーバーの費用は事業者の確認が必要。
- Agentは文章入力と結果照会に対応するadapterを登録する。設定値 `NOAH_AGENT_ROUTES` の例は以下。各binding名は版を固定し、同じ名前を別接続先に再利用しない。URLや秘密を利用者入力から採用しない。設定済みの経路だけを表示する。

```json
[{"id":"text-check","name":"文章を確認","routes":[{"id":"vendor","kind":"provider","label":"提供元の専用環境","binding":"AGENT_VENDOR_V1"},{"id":"alternate","kind":"registered","label":"別の登録接続先","binding":"AGENT_PARTNER_V1"},{"id":"noah","kind":"noah","label":"Noahクラウド","binding":"NOAH"}]}]
```

adapterは `GET /jobs/<id>` で状態を返し、未作成時だけ404を返す。`PUT /jobs/<id>` は同じ入力・IDで一度だけ受け付ける。処理中は202。成果は `{id,result,final,report:{done,incomplete,unverified}}`。途中成果は同じIDで照会を継続する。停止はNoahの再実行・照会を止める。すでに外部が受け付けた処理の中断は外部側の確認が必要。実機・本番回線・有料接続は模擬試験の対象外。

```sh
node --experimental-strip-types --test --test-concurrency=1 tests/esim-noah-free-trial.test.mjs tests/noah-cloud-work.test.mjs
npx --no-install wrangler deploy --dry-run --config services/noah-test-runtime/wrangler.cloud-work.jsonc
```
