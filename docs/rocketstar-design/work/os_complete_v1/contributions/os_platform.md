# 基盤OS・サービス・保存と復旧

本章の「選定」は、今回の統合設計で採用する方式を意味する。既存コードの到達点、追加する実装、実機で確認する条件を分ける。2026-09-24に元リポジトリを読取確認した。HEADは `5d5f3dc4f73ac3389c8dbc00f9ca6e8beba526e0`、branchは `codex/readme-navigation`、作業木はclean。前回監査と同一SHAで、追跡ファイルの差分は0。元OSの変更・試験・GitHub最新状態の照合は行っていない。[OS-L01]

## OS-P01 基盤OSと配備プロファイル

**地上の参照OSは、既存RockstarOSのLinux／Buildroot系統を継承する。** カーネルはプロセス、メモリー、デバイス、ファイルシステムを管理する。RockstarOSはその上で、利用者の仕事、Tool、権限、接続、結果、更新・復旧を管理する。独自カーネルの新規開発を前提にしない。Buildrootはツールチェーン、選択したパッケージ、カーネル、rootfsを組み合わせる仕組みであり、Buildrootという名前だけで機種互換や安全性は成立しない。[OS-W01: Buildroot公式マニュアル](https://buildroot.org/downloads/manual/manual.html)

| 配備先 | 基盤と今回の選定 | 実装・受入の境界 |
| --- | --- | --- |
| 地上の仮想参照機 | 既存ARM64 QEMU virt、Linux／Buildroot、initと専用UIDのサービス、読取専用rootfs | 既存開発資産を継承。今回のcolonyサービスを含む新imageは未作成 |
| avokado E3のEdge Hub | Linux系の機種別Device Profileを追加する設計 | E3候補のx86_64計算機へARM64 imageを流用しない。BSP・driver・GPU・音声・給電・熱・復旧を別に受入 |
| Pixel操作端末 | 既存AndroidのBroker／Shell／Tool分離を継承 | 試験署名APKの記録と、完成OS image・flash・OTAを分ける。元計画のPixel優先順位は変更しない |
| rocketstar／A-LINK搭載機 | 各機の専用飛行計算機・OS/RTOSへ契約アダプターで接続 | OS/RTOS、計算機、冗長数、GNCは未確定。地上Linuxを機上採用品としない |

Kernel、Buildroot、コンパイラー、libc、driver、設定、imageの版とハッシュをDevice Profileに固定する。歴史的QEMU試験のLinux 6.18.50は当時の候補識別に使い、今回の本番採用版に自動昇格させない。実機候補確定後に更新・脆弱性・機種適合を確認し、同じ構成で再buildと受入を行う。[OS-L02]

## OS-P02 サービスと権限の配置

本版は、**操作画面、実行権限、設備への通信、AIを別プロセスにする**方式を選定する。全体サービス台帳の13項目は論理的責任の数であり、PID数と一致させる要求ではない。下表はその責任を地上参照機へ配置する候補で、具体的なprocess割当はresource budgetと隔離試験で確定する。地上Linuxでは専用UIDと私有ディレクトリーを与え、APIで情報を交換する。UIやAIから設備ファイル、署名鍵、指令DBへ直接アクセスさせない。次表のcolony用サービス名と保存先は新規実装の設計値であり、現在稼働するサービスの一覧ではない。

| プロセス／役割 | 自分が持つ状態 | 許可する経路・停止時の挙動 |
| --- | --- | --- |
| 既存Platform | component、導入版、Tool資格、本人との対応 | Shellの要求を検査してcolonyへ渡す。認証不能時は新規操作を拒否 |
| `colony-supervisord` | 作業、提案、承認、指令、送信claim、受領結果 | `dev.rock.colony.supervisor`の実装先。唯一の指令台帳writer。停止後は未送信の再承認と送信済みの照合を先行 |
| `device-adapterd` | 対象機器profile、接続世代、受信連番、転送履歴 | allowlistに載る機器・操作だけへ変換。機器認証と機器側の拒否を返し、独自の新規指令を作らない |
| `telemetryd` | 型・単位・時刻品質付き観測、警報履歴 | 観測を購読・保存。古い値にはstaleを付ける。監督画面への通知が失敗しても機器の局所警報を止めない |
| `link-gatewayd` | 外部送信待ち、宛先、期限、結果照合待ち | 拠点外通信だけを扱う。回線復帰は承認の復活条件にしない |
| Shell／Local AI | 表示状態、利用者入力、限定された計画用情報 | Platform APIへ提案する。承認発行、DB操作、任意shell、設備通信は許可しない |

ローカル制御器はこの表の監督サービスと別の故障領域に置く。監督側が止まったときに、認定済みの局所制御まで停止する構成にはしない。別プロセス化は同じホストのOS停止・電源喪失から保護しないため、重要設備の独立性は配線・電源・計算機を含む別試験で確認する。

地上実装では、AIと一般Toolに名前空間分離、最小権限、`no_new_privs`、seccompを組み合わせる。seccompはシステムコールを制限する機構であり、それ単体を完全なsandboxと呼ばない。[OS-W02: Linux seccomp](https://docs.kernel.org/userspace-api/seccomp_filter.html) 今回はcgroup v2によるCPU・メモリー・プロセス数の資源枠も設計に追加する。既存の全サービスに適用済みとはしない。特に`memory.max`到達はプロセス停止を招き得るため、AI／一般Toolの枠と運用記録サービスの枠を分け、実測した常駐量・ピーク・障害時余裕から値を決める。[OS-W03: Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

## OS-P03 IPC・本人資格・指令の入口

既存Linux PlatformはUnix socketの相手UIDを`SO_PEERCRED`で取得し、許可UID、プロトコル版、操作名、入力容量を検査する実装を持つ。JSON内の自己申告UIDを本人資格にしない。Androidは実インストールAPKのpackage、UID、署名digest、版をBrokerが照合する。これらはプラットフォームごとの資格取得方法であり、同じ文字列だけで相互認証が成立するわけではない。[OS-L03／OS-L04]

新しい地上IPC入口を `/run/rock-colony/supervisor.sock` とし、Platformの専用UIDだけから監督操作を受ける設計にする。socketの親ディレクトリーと所有者・modeを起動時に照合する。要求はプロトコル版、操作型、requestId、workId、対象、内容digest、期待revisionを含む閉じたschemaとする。入力の大きさ、同時要求数、応答期限はprofileに定義し、未設定ならread-onlyで起動する。数値は性能測定後に確定し、既存Platformの接続上限を設備能力へ転用しない。

`ownerRef`は認証済みPlatformセッションから導く。表示名や要求本文の`actor`を信頼しない。操作者資格は、site、設備範囲、操作型、有効期限、資格世代へ結び付ける。承認は指令全体のdigest、手順版、期限、対象構成に拘束し、対象や内容が変われば再発行する。設備側はさらにgeneration、authority epoch、lease、期待revision、現在状態を確認する。信頼済み画面で承認したことと、設備が受理したことを別の記録にする。

署名は三系統に分ける。OS／Tool作者は配布物の版を署名し、操作者は承認した意図を表明し、機器はその機器が返した結果を認証する。OSの配布鍵を第三者Tool作者や設備指令に共用しない。本番鍵の保管装置、登録・失効・回復は未選定。現SIMの公開HMAC鍵や`actor='operator'`は本人認証ではなく、同一プロセスからの迂回を防がない。[OS-L04／OS-L05]

## OS-P04 仕事・保存・結果不明の契約

既存WebのWorkは `active / review / completed / cancelled` を持ち、工程順、revision、同一command IDの内容不変を確認する。`sample=true`や失敗結果は工程を進めない。colony指令は別状態機械として保持し、既存article／coconalaのTool名を書き換えて接続しない。SIM専用templateと実設備用templateを別版で追加する。送信後に結果不明になった指令は、Workをactiveの照合待ちとし、失敗や取消へ丸めて消さない。[OS-L06]

保存の正本を次のように分ける。これらは今回の追加設計であり、既存Wallet／Web D1／Android EngineのDBを統合・移管する指示ではない。

| 保存領域 | 正本と更新者 | 永続化の境界 |
| --- | --- | --- |
| `/data/colony/supervisor` | supervisordの指令DB、作業対応、承認、監査 | 承認とqueue、送信claim、結果とeventをそれぞれ同一DBのtransactionで保存 |
| `/data/colony/telemetry` | telemetrydの観測・警報DB | 採取時刻と受信時刻、単位、品質、機器世代・連番を保持。観測を承認に変換しない |
| `/data/colony/adapters/<profile>` | adapterの接続・転送記録 | 設備が受理したかは設備receiptが根拠。送信処理終了だけで成功にしない |
| `/data/colony/evidence` | 内容hash付き成果物と受領索引 | 書込完了後に索引へ登録し、不完全fileを成果として公開しない |
| 機器内の記録 | その機器の設定・実行・結果 | Coreのbackupを戻しても、機器の現在状態を上書きする根拠にしない |

新規の局所DBはSQLite、単一writer、WALとFULL同期を基準にする。既存native内の異なるjournal設定は改変しない。WALをネットワーク共有DBとして使わず、別ホストへは版付きメッセージとreceiptを送る。SQLite公式文書でもWALは同一ホストを前提とし、複数DB全体の一括atomicityは与えない。FULL同期を選んでも、実機媒体の耐電源断や故障耐性は試験が必要である。[OS-W04: SQLite WAL](https://www.sqlite.org/wal.html)

外部作用の送信前にclaimを永続化する。claim後に落ちた場合、機器まで届いたか不明なので`unknown`を保持し、照会だけで回復する。受理済みの同一ID・同一内容には過去receiptを返し、同じIDの内容変更は拒否する。過去APPLIEDは当時の処理結果であり、現在の設定は新世代の観測で確認する。この方式は既存MCP Brokerの単一writer、接続epoch、immutable consent、送信後再送禁止に対応するが、新colony adapterとの実コード共用・統合は未実施。[OS-L05]

保存容量の予算はDB、WAL、索引、成果物、更新候補、復旧作業領域を含める。新規仕事を受ける前に必要容量を予約し、空き不足では新規実行を止める。未照合receiptや重要警報を任意削除して継続しない。保持期間、圧縮、checkpoint間隔、予約量は機器profileと記録量試験から決める。

## OS-P05 起動・停止・更新・回復

起動は、①boot構成・image検査、②dataの所有者・schema・容量確認、③Platformと本人資格、④telemetry／adapterのread-only接続、⑤機器世代と未照合指令の回復、⑥監督権の取得、⑦新規操作の許可、の順にする。AI・外部回線は④までの成立条件にしない。保持すべきDBが消えた状態を「初回起動」と見なして自動初期化しない。世代・権限が確かめられない場合は状態閲覧と診断に限定する。

正常停止は新規仕事の受付を閉じ、未送信の指令を止め、送信済みを照合または不明として保存してからDBを閉じる。応答期限を過ぎた指令を停止直前に駆け込み送信しない。強制停止後は未送信承認を再利用せず、古いleaseが無効であることを機器側で確認する。監督機の停止要求を、生命維持の電源遮断要求へ伝播しない。

既存QEMUはstage0によるrootfs候補選択、署名検査、読取専用起動、起動healthとmark-good、失敗rollbackを持つ。ただし公開試験鍵であり、kernel／initramfsのハードウェア信頼鎖、実行中dm-verity、ハードウェアrollback counter、kernel更新を完成した実装ではない。[OS-L02] 本版はinactive rootfsの更新とdata互換検査を継承し、kernel・firmware変更を別のDevice Profile改訂として扱う。更新前には必要な旧版reader、更新中断時の扱い、戻せないschema移行の復旧を確認する。boot成功だけで機器操作を再開しない。

backupは秘密鍵を平文に含めず、設定、仕事、receipt、成果物索引、schema版、取得対象の識別を一組にする。稼働中DBの本体fileだけをコピーしない。writer停止・整合確認後に取得する方式を初期地上基準とし、無停止backupは後続設計に分ける。復元先は設備操作を無効にして起動し、旧承認を停止、古いtokenとleaseを失効させ、現物の世代・設定・未照合結果を読んでから再認定する。旧機と復元機を同時に操作可能なwriterにしない。

## OS-P06 既存実装へ組み込む単位と受入

統合の第一単位は、SIM専用のWork→Platform→colony-supervisord→模擬adapter→receipt→Work reviewまでの一周とする。既存owner、revision、sample、取消の意味を保つadapter fixtureを先に通す。次に専用UID／socket／ファイル境界、AIからの直接呼出し拒否、機器相手の詐称、版不一致、切断・再起動・容量不足を同じimageで確認する。根拠のない自動failoverは追加しない。

主担当はNative／QEMU／ReleaseのROCK。既存OS01、V01、N01/N02、RLS01等の受入とcolony追加受入を区別する。元repoへ実装を統合する際はPlatform契約、専用Work template、`data/design-document-index.json`、全体OS設計、該当workstream、進捗を同一変更で同期する。今回作った文書を、これらのファイルへの実装反映や新OS image完成とは数えない。[OS-L07]

合格の単位は「同じsource＋同じimage＋同じprofile＋同じ実行環境」。host試験、QEMU起動、Pixel APK、Edge Hub実機、機器接続、飛行の各結果を独立に記録する。本章では新しいOS試験を実施していない。本番鍵、実機の独立電源、冗長切替、実時間応答、耐環境性、有人運用の受入は未完了のままである。
