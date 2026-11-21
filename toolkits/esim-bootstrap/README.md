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
