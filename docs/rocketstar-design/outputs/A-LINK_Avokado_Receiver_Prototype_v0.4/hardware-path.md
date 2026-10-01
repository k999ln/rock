# avokado：実機で受信を確認する通信経路

確認日：2026-09-22。公開されたメーカー・事業者の一次情報に基づく実証構成案。機器購入、通信契約、外部送信、無線受信試験は実施していない。以下で「対応」と書く機能はメーカー仕様であり、この avokado での試験結果ではない。

## 採用する実証経路

最新の端末資料は Tower20 E3（2026-09-22）：使用時 200 mm の塔 4 本と別筐体の Edge Hub。Hub の外形案は 240×200×70 mm であり、旧 Mini200 一体箱は置き換えられている。衛星接続はこの **Hub に追加する**。4 本の塔へ衛星モデムをそれぞれ載せる案にはしない。

最初の衛星受信実証は **RockBLOCK 9704＋Iridium IMT＋Cloudloop** を使う。Hub のアプリと衛星モデムの間は USB シリアルで接続する。通知・短文・小さな設定データを運び、地上回線の HTTP 接続とは別のメッセージ通信として扱う。自作衛星 2 機やロケットの完成を待たずに、端末の受信・保存・再開を試験できる構成にする。

ただし、**衛星部は Hub とも別筐体にする**。メーカーの 9704 設置条件は、同じ筐体に他の送信機を共置しないことを含む。アンテナにも高さと空の見通しの条件がある。Wi-Fi・携帯無線を持つ Hub に、そのまま内蔵できたとは扱わない。室内の Hub と、空が見える場所の衛星ポッドを有線で接続する構成を実証の基準にする。[設置条件](https://docs.groundcontrol.com/iot/rockblock-9704/installation)

## 比較

| 経路 | 機器・サービス | アプリへの入口 | この試作で確認すること | 残る条件 |
|---|---|---|---|---|
| Wi-Fi | 使用を許可されたアクセスポイントと対応 Wi-Fi 機器 | HTTPS で未受信メッセージを取得 | 受信、切断後の再開、認証、重複抑止 | AP に接続できてもインターネット到達は別。ログイン画面のある Wi-Fi は接続済み扱いしない |
| 携帯 | 契約済みデータ SIM と地域対応 USB モデム／ルーター。初回は既存の携帯回線を使う外付け構成でよい | ネットワークインターフェース経由の HTTPS | Wi-Fi が途切れたときの経路変更、再接続 | APN、SIM 契約、対応周波数、認証、OS の対応を実機で確認する |
| **衛星実証の基準** | **RockBLOCK 9704＋認められたアンテナ／ケーブル＋Iridium IMT 契約＋Cloudloop** | **USB シリアルと公式 Python SDK** | **クラウドから下りメッセージを送り、衛星経由で受信・永続保存・ACK・再配信を確認** | **別筐体、屋外の空の見通し、運用地域、契約、常時受信処理が必要** |
| 小型統合の比較案 | nRF9151 **SMA DK**＋対応ファームウェア＋NTN 有効 SIM（例：Monogoto／Skylo）＋付属または対応アンテナ | USB 仮想シリアル。メーカー例は UDP ソケットを使用 | 携帯と NTN のモード切替、小データの往復 | 対応地域、SIM の NTN 権限、ファームウェアとハードウェア版を揃える。製品筐体内の性能は別途確認 |

Linux の携帯接続では、ModemManager がモデムの網接続を管理し、NetworkManager 等が IP アドレス・経路を構成する。モデムが表示されたことだけでアプリ到達可能とは判定しない。[ModemManager の役割](https://modemmanager.org/docs/modemmanager/ip-connectivity-setup-in-lte-modems/)

## RockBLOCK 9704 の構成を具体化する

メーカー仕様の外形は SMA 版が 48×52×16 mm、パッチ版が 72×72×16.5 mm。Hub に収まりそうな外形でも、アンテナ、配線、共存条件、発熱の設計が成立したことにはならない。IMT は 100 kB までのメッセージに対応するため、今回の 4 KiB 以下のアプリメッセージはサービス容量内の候補になる。スループットや着信時間を保証する数値にはしない。[製品仕様](https://www.groundcontrol.com/product/rockblock-9704/)

実証用の構成は以下とする。

- 本体：Linux の USB ホスト機能を持つ試験用コンピューター。avokado の量産基板が未完成でも、同じ受信アプリを先に動かせる。
- 衛星部：9704-SMA とメーカー指定の対応アンテナ。別筐体に配置する。初回はメーカー条件に適合する短い配線で確認する。
- 電源：USB 給電は 500 mA を供給できるポートを使う。USB の列挙は起動後となり、電源を入れて即座にポートが出現する前提にしない。これは端末全体の最大消費電力を確定する値ではない。[ハードウェア資料](https://docs.groundcontrol.com/iot/rockblock-9704/hardware)
- アンテナ：空が見え、上向きに設置。メーカー条件では地面またはグラウンド面となる金属から 1 m 以上。SMA 版の指定アンテナと配線損失条件に従う。屋外ポッドを長い無線同軸だけで遠くに出す設計は採らず、距離が必要ならポッド側で受信し有線データを運ぶ構成を別途設計する。[アンテナ条件](https://docs.groundcontrol.com/iot/rockblock-9704/antenna)
- 契約：機器登録、Iridium IMT の通信プラン、Cloudloop の Thing と Topic を準備する。起動時のプロビジョニングに時間がかかる場合を状態表示に含める。[初期設定](https://docs.groundcontrol.com/iot/rockblock-9704/intro)

アンテナ条件を満たす設備を置けない場所では、この経路を使用可能とは判定しない。屋外ポッドも通信圏外であれば、受信待ちと保存を続ける。

## アプリ接続の境界と受信再開

端末側の公開 SDK は `rockblock9704.RockBlock9704`。同期送受信の入口もあるが、本試作の追加アダプターは非同期メソッドと `poll()` を使い、送信待ちで受信処理が止まらないようにする。**9704 本体には受信メッセージのキャッシュがないため、ホストが受信を処理し続ける必要がある**。[公式 Python 受信例](https://docs.groundcontrol.com/iot/rockblock-9704/examples/python-basic)

メーカーの現在のライブラリー資料では非同期モードの `poll()` は最大 50 ms 間隔で呼ぶ。同期 API を途中に混ぜず、専用の所有ループで処理する。受信キューは既定で 1 件なので、永続保存処理との境界を用意し、処理待ちのデータを上書きしない。[公式ライブラリーの非同期処理](https://github.com/rock7/RockBLOCK-9704)

次の動作は今回アプリ側で定める設計であり、衛星サービスに任せて済ませない。

1. サーバーは配信前に宛先・メッセージ ID・内容・有効期限を永続保存する。
2. 地上回線では HTTPS で取得する。衛星経路では Cloudloop へ同じメッセージを渡し、9704 の受信処理が取得する。
3. 端末は宛先・認証・有効期限・形式を確認する。同じ ID で異なる内容は拒否する。
4. 端末は SQLite 等に保存を確定してから ACK を返す。画面表示や他の処理も同じ ID で二重に実行しない。
5. 地上／衛星のいずれの経路で ACK が戻っても、サーバーの未配信記録を解決する。ACK が失われた場合は再配信し、端末は同じ記録を増やさず ACK を返す。
6. 端末電源断や受信アプリ停止の間に衛星下りが失われても、アプリ ACK のないメッセージをサーバーから再配信する。保存期間と費用上限を越えたら無制限再送しない。

Cloudloop の下り入口は `Data/DoSendImtMessage`。宛先 Thing、Base64 の payload、契約にある Topic を使う。`Data/GetMtDeliveryStatus` は輸送の到達状態の確認に使えるが、avokado のアプリ保存完了とは別に記録する。[IMT 下り API](https://knowledge.cloudloop.com/docs/api/send-message)

Cloudloop API は token を要求する。token はサーバー側だけに保管し、端末配布物や URL のログに出さない。公開 API 文書の参照確認までを実施し、実際の認証・送信・課金はしていない。[認証 API](https://knowledge.cloudloop.com/docs/api/authentication)

## nRF9151／Skylo を比較案に残す理由

nRF9151 SMA DK は NTN の評価用としてメーカーが案内しており、SMA 接続、LTE／NTN と GNSS のアンテナ、SIM、USB シリアルの利用が可能。一般の nRF9151 DK と SMA DK、シリコン版、NTN ファームウェアの違いを無視して選ばない。[Nordic の評価手順](https://www.nordicsemi.com/Products/Development-hardware/nRF9151-SMA-DK/Evaluate-NTN)

Monogoto の公開手順は、SMA DK、NTN 対応ファームウェア、SIM、位置情報、APN、ネットワーク登録を揃え、UDP データを送る構成。携帯と NTN のモード切替の手順もある。**同じ IP 接続を途切れず維持することをこの手順だけから保証しない**。[Monogoto の評価例](https://docs.monogoto.io/ntn-satellite-networks/ntn-certified-devices/ntn-certified-modules/nordic-nrf9151-satellite-ntn-network)

この事業者の NTN 評価は UDP を前提にしているため、HTTPS 用アダプターをそのまま割り当てない。必要なら認証付き小型データと ACK・再送を UDP 用に実装する。UDP 自体に配信保証はない。[NTN の UDP 通信](https://docs.monogoto.io/ntn-satellite-networks/udp-communication-for-ntn-applications)

対応地域は契約単位で確認する。Skylo の公開資料には米国、カナダ、欧州、豪州、ニュージーランド、日本等が挙がるが、世界全域でその SIM とその端末が使えるという意味ではない。初回試験地の国・地点で、対象ネットワーク、モジュール、SIM による下り受信が提供されるか確認する。[Skylo の接続概要](https://www.skylo.tech/knowledge-base/enabling-global-connectivity-skylo-ntn-connectivity)、[NTN SIM 権限](https://docs.monogoto.io/ntn-satellite-networks/how-you-can-check-if-your-sim-is-ntn-enabled)

Iridium についても全球の衛星見通しと各国でのサービス利用可能性は別。実証地で利用できる事業者契約と適合する機器を使う。特定国での利用可否は本調査では確定していない。[Iridium 2025 年次報告の事業・規制条件](https://www.iridium.com/sites/default/files/2026-04/Iridium_Communications_Inc_2025_Annual_Report.pdf)

## 実機確認の合否を決める

下記は提案する試験であり、未実施。ローカルのソフトウェア試験と実際の RF 受信結果は別の欄に残す。

| 試験 | 確認する証拠 | 合格条件 |
|---|---|---|
| 衛星だけで短文を受信 | Wi-Fi・携帯のアプリ経路停止、Cloudloop の下り ID、9704 受信時刻、端末保存行、返送したアプリ ACK | 指定宛先に内容一致で保存。無線で受信した証拠が残る |
| Wi-Fi 切断から携帯へ | 独立した携帯 WAN、経路と到達先の記録、受信ログ | 未受信のデータを回復後に受信し、二重処理しない |
| 地上回線から衛星へ | 地上到達不可、衛星登録と受信ログ、配信キュー | 衛星で扱える小データだけ配信。動画や大きな更新を流さない |
| 電源断をまたぐ | サーバー未 ACK 記録、端末再起動前後の保存内容 | 再起動後に未受信分を回復。保存済みは重複しない |
| ACK の消失 | 意図した ACK の破棄、サーバー再配信、端末 ID の件数 | 同じ内容を再受信しても処理は一度、ACK は再送 |
| 遮蔽／圏外 | 受信不可と回復を区別した表示 | 受信できていない間に「接続済み」「配信完了」と表示しない |
| 契約上限 | 送信要求数と費用制御記録 | 設定した制限を守り、勝手に追加契約しない |

衛星自体の新規開発、2 機で常時サービス、両段再使用ロケットの成立は、この既存網の端末実証では検証されない。端末から先に解消する依存関係と、宇宙機の研究開発を分けて進める。
