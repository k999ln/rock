# Mini Linux packet gate

MAT15 / MINI-08、ROCK担当。単体のMini内で衛星WANからWi-Fiへ中継するため、既存Controllerの事前予約をLinux nftablesの実転送制御につなぐ。板・膜なし、少ない表示部、上下を含む全範囲、まぶしくしない条件を維持する。携行時もMini自身の回線・AP・電池を使う設計で、外付けスマホ/PC/ドック依存を追加しない。

## 今回の範囲

`linux_gate.py` は専用network namespace内のIPv4/IPv6・送受信を同じbyte quotaで制限する実装。Ubuntu 24.04 / kernel 6.8.0-134 / nftables 1.0.9 / Python 3.12.3の隔離VMで、veth間の実ICMP/TCP/UDPパケット20件を試験した。コンパイラ4件も成功。APの無線通信、衛星回線、Provider請求、携行電池の実測ではない。

既存Controllerと同じ承認済み総量・端末別量・費用予約を使う。通信費は架空の承認済みall-in上限で、実料金を採用していない。受信後dropだけでは網側の課金を防げないため、Provider hard cap/飛越量/overheadの上界が未確定なら料金保証済みにしない。WalletやAgent usageを変更しない。

## 入力・状態・責任

管理側が事前作成した `mini-tether-*` namespace、初期化済みController、認証済みclientIdに結び付くLAN/WAN interface・unicast MAC・IPv4/IPv6を受ける。全Controller変更は `LinuxGate` の `owner_command` / `observe` / `attachment` / `open` / `close` / `shutdown` を通す。root用任意shellやネットワーク公開APIはない。入力は固定schemaで検証し、IPv6 scope/改行等を拒否する。MAC/IPだけで端末本人性を保証せず、Broker/AP認証・隔離は次段階。

ROCKが固定API、事前予約、kernel制御、失敗時の停止、台帳維持を担当。EXTERNALがAP/BSP/衛星modem/回線計量を提供。JOINTで同一閉箱・契約の疎通/課金/電源を検証。OWNERが期間、端末、容量、費用を承認する。本実装から契約・購入・実課金を実施しない。

## 制御と永続化

- input/output/forwardは既定drop。管理面・LAN間・未知端末の転送を許可しない。試験は固定ARP/IPv6隣接表を使用し、DHCP/DNS/RAを開けない。
- grant単位でtx/rxとIPv4/IPv6に共有するnamed quotaを置き、許可規則の後段にcounterを置く。既存TCP接続も同じ規則を通り、established bypassやflowtableを使わない。
- kernel set timeoutと絶対時刻を併用し、daemon終了後もbyte/期限を維持する。信頼できる時計・root環境が前提。
- Controllerでcommitした予約と、fsync済みattempt journalを先に作り、その後にnft atomic batchを適用。同じgrantの再installは禁止。適用結果不明でも予約を返さない。
- namespace FDを固定し、名前の削除/再作成で別namespaceへ操作が移らない。実体dev/inodeを鍵に共有flockと永続owner claimを保持し、別DB/別名でも二重writerを拒否する。nft子processにもlock FDを継承し、親SIGKILL後の遅延installと復旧を競合させない。
- 同一processのopen/停止もmutexで直列化。shutdown済みobjectは再使用不可。起動時は既存規則を閉じ、ControllerをOFFへrecoverし、新観測と本人再開を要求する。旧予約は残す。
- 未所有の同名table、異なるchain hook/policy、追加input/output規則、foreign table/flowtableがあれば拒否する。trusted rootの直接変更に対する安全保証ではない。

`close` は許可ruleを除去してcounterを読むが、netlink応答を全inflight packet/Providerの最終確定とはみなさない。返値は `snapshotFinal=false` / `reservationRetained=true`。Controllerの `settle_closed` を自動で呼ばず、byteも費用も予約のまま保持する。`nft`失敗時の完全停止を宣言せず、既存kernel quota/期限に制限を残す。

## 復旧・運用上の未完了

SQLiteやjournalの削除・巻戻しで枠を再利用しない。namespace破棄後も `/run/mini-tether-gates/` のowner claimは自動削除しない。inode再利用時は安全側で拒否するため、管理者が旧process/child終了、旧namespace消滅、台帳/未確定予約を照合してからclaimを移行する管理実装が必要。テストの後処理だけは、自分の一時fixtureを完全に閉じた後にそのfixture所有のJSONを除き、lock inodeは保持する。製品の自動解除には流用しない。

APの端末認証/鍵・DHCP/DNS/IPv6 RA・NAT/経路・管理trafficの会計、hostapd driver隔離、BSP offload、modem/provider adapter、請求最終照合、period rollover、電池/温度/筐体の受入は未実装/未受入。これらが完了するまで一般公開・実課金・実衛星通信可能とは表示しない。

## 再現

通常host（root不要、ネットワーク操作なし）:

```sh
python3 -B -m unittest discover -s systems/rock-star-os/targets/avocado-mini/tethering -p test_linux_gate.py
```

使い捨てLinux VM専用（root、ip/nft/nsenter/ping/sysctl必須。実行先を確認する）:

```sh
sudo python3 -B systems/rock-star-os/targets/avocado-mini/tethering/linux_packet_test.py
```

後者は一時namespace/vethだけを作り、既存interfaceやradioを設定しない。前提不足はskip合格にせず失敗する。20件はdual-stack共有quota、端末/管理面分離、packet単位超過阻止、複数端末/料金上限、close/revoke/離脱/携行再観測、再起動、daemon終了、親kill/子process、並行writer、名前置換/alias、既存TCP停止、UDP burstを検証する。

証拠: `docs/evidence/development-execution/mini-08-linux-tethering.json`、独立静的/host検収は `mini-08-linux-tethering-review.json`。packet試験は実装担当実行で、独立担当のVM再実行ではない。全repo verify・Git保存・main統合・CIは別記録とする。

設計根拠: [nftables公式manual](https://netfilter.org/projects/nftables/manpage.html)、[hostapd公式](https://www.w1.fi/hostapd/)（2026-10-25確認）。仕様の存在を実機合格としない。
