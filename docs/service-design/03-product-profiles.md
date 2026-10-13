# 各製品の役割と接続

再構成版 1.0。サービスの仕事・権限・成果契約を共有しながら、機器ごとの価値と成立条件を保つ。Sky/Zema/OSを使うためにMini・Pro・rocketstarの完成を待たず、Miniの基本動作にProを要求しない。

## SkyとZema

Skyの主な利用者は能力を使う本人と、能力を届ける作者。発見→条件比較→接続/購入→仕事または対応アプリへ進む。入力は本人の目的、catalog/manifest、接続能力、購入記録。出力は版付きの能力選択と接続状態で、本人承認・実行成功は出力しない。作者公開はPackage宣言と明示した公開コードを区別し、原稿やsecretを登録しない。

Zemaの主な利用者は仕事を依頼・修正・検収する本人。依頼と成功条件を受け、既存WorkJob・step・event・artifactを表示する。主な操作は次に必要な一つの行動、入力修正、確認、停止、成果取得。原稿・成果の保存とrevisionを共通契約へ委ね、別の仕事DBを作らない。OS内では管理役、Sky単体では管理への共通導線、host appではアプリ文脈の成果表示を目指す。

失敗・認証切れ・接続不明は保存済み仕事を照合し、実行や購入を自動で再送しない。更新は旧仕事のTool版と入力を保持する。受入は本人A/B、desktop/mobile、保存・再取得・停止・費用の一周。外部host app認証・成果連携は独立受入とする。[Sky設計](../sky-launch-design.md)、[全Tool正本](../sky-tools-complete-design.md)、[共通契約](02-system-contracts.md)へ接続する。

## Jenniffer

名前は利用者の今回の指定。最新mainの設計書・実装の検索で役割を示す正本を確認できていない。**利用者への役割確認を未決定のまま残す**。Jev、Zema、OSの改名として扱わない。

役割確定後は、利用者が出会う場面、何を入力し何を返すか、継続記憶の有無と削除、失敗時に誰が引き継ぐか、どの既存APIを使うかを一つの契約にする。対話役なら会話を提案・下書きまでにする案、独立ToolならSkyの作者/版/capabilityへ登録する案を比較する。いずれも既存Brokerの本人承認、WorkJob、receiptを共有し、包括的な実行権を作らない。

決定者はOWNER。合格条件は、Sky/Zemaとの利用場面・責任の違いが具体例一つで説明でき、保存・送信・費用・停止を既存契約へ対応付けられること。名称から新componentやLLM providerの導入を決めない。

## RockstarOS

共通runtimeの目的は、利用者が端末やProviderを変えても、自分の仕事・承認・成果・停止・復旧を失わないこと。入力は認証済み要求、component identity、有限capability、device capability、予算/承認。出力は実行状態、照合したreceipt、artifact、診断と復旧操作。

native OSは、署名済みimage・exact SKU・boot/保存/復旧が受け入れられた端末へ提供する。その他は既存OS上のclient/browserへ分岐する。Linux/QEMU、Android試験APK、Pixelの全OS imageは別profile。Local LLMは対応機種の能力で、ブラウザ利用の必須条件にしない。

保存はowner別の既存SQLite/D1と保護file、更新はcomponent identity・署名・互換性・保存schemaを検査する。失敗時は保存済み仕事の照合、互換versionへのrollback、受け入れたbackup経路を使う。未知schemaや全損を勝手に初期化して正常復旧としない。[native統合](../native-os-integration.md)、[native検証](../native-os-validation.md)、[Pixel Preview](../phone-preview-20260911.md)の各gateを維持する。

## avocadoMini

価値は、身体・手・日本語音声で遊び、作り、学び、暮らしへ広げる空間端末。現行R5は**使用時全高200mm以内の銀色円筒、1本自律、同型mini増設、外部給電、別Edge Hub不要**。テレビ・スマホ・Pro・外部PC・インターネットを基本操作と保存の必須条件にしない。[R5正本](../avocado-mini-r5/README.md)と[統合基本設計](../avocado-mini-r5/package/integrated_design.md)を引き継ぐ。

入力profileはsensor/pose/手/声、game interaction、本人切替。出力はscene/game状態、検査済みartifact、表示能力と安全状態。顔候補の識別を強い本人認証にせず、人別保存・切替・離席lockをOSへ結ぶ。sensor uncertainty・入力喪失・表示停止・熱・給電停止の時は安全な停止と保存へ進み、ゲームの操作をcloud支出へ変換しない。

裸眼で周囲の空間へ粒子が舞う表示は維持する研究目標だが、現行Display HALは`unavailable`。2D/AR等の研究profileで仕事や操作を検証しても、R5全空間表示の成立とは呼ばない。光学・精密3D入力・実部品収納・熱・回路・加工・製造と、実機の安全・性能は未受入。14件のR5算術検査を実機証拠へ転用しない。

通信optionの確定方針は**国内LTE、IoT data専用SIM、試作カード・量産chip、SGP.32対応SIM、遠隔profile切替を自作しない**。回線つき別model/optionと回線なしMiniを保持する。通信料は自社名義の機器service料に含める設計で、consumer eSIM販売の再開ではない。[Mini通信](../avocado-mini-cellular.md)と[data正本](../../data/avocado-mini-cellular.json)を使う。開発boardのbench試験はR5閉箱受入と分ける。

未決は光学方式、module/carrier、BOM・熱・電源・収納の統合。MAT系担当が候補比較と非金融prototypeを出し、OWNERが実機・調達条件を確定する。受入は同一実機の単独入力/停止/保存/再起動と、採用表示方式の測定、安全、通信option、製造工程を別々に記録する。

## avokadoPro

価値は、**NVIDIAを使うMac mini風の小型据置PCで、AIとPCゲームを両立させること**。Miniなしで使え、Miniへ計算・保存・game能力を追加する接続は任意。[Pro P0設計](../avokado-pro-pc-design.md)と[data正本](../../data/avokado-pro-pc.json)は既にmainにある。

入力は本人のPC操作、対応game、有限のTool/compute要求。出力はPCの成果・保存・game体験と、許可済みMini接続の結果。ホスト管理者権限をMini/Androidへ移さず、外部Toolをplatform鍵で署名しない。ネットワーク断ではPCの基本利用と保存を保持し、Miniとの不明な結果を照合する。

2026-10-05の販売目標**80万円/台**を維持し、税・構成・販売条件は未決。旧88万円は履歴。RTX5080 Laptop 16GB、128GB RAM、4TB SSD等はP0候補で、調達・搭載・性能確定ではない。OEM/ODM、量産販売OS、統合BOM、値入りICD、QVL、収納、電力・騒音・熱、AIとgame実測、原価とsupportは未受入。

MAT16/P2が統合候補・調達条件・閉箱受入matrixを出す。OWNERが見積と構成、販売OS等を決める。合格は同一構成で長時間AIと代表game、保存/再起動/復旧、Mini任意接続を測ること。Miniの受入をPro固有の完成へ加算しない。

## rocketstar

価値は衛星輸送、両段の帰還・回収、同機番の再使用を目指す独立工学program。現行[rocketstar R1.0原本と全付録](../rocketstar-design/README.md)は44ページ・35章・60要求・18interface。原本、生成元、manifest/hashを保ち、今回のサービス設計で工学値を書き換えない。

OSの接続範囲は地上の計画、担当、engineering artifactの版、必要承認、観測、整備記録、費用と受入証拠。専用Gatewayで通信/観測結果をjobへ結ぶ。機上制御と独立飛行安全系は一般のAgent/Broker Toolと統合しない。対話・model plan・署名・通信到達を飛行の許可/実行成功へ変換しない。

A-LINK、衛星、地上設備、回収はrocketstar内部system。利用者通信と機体管制は経路・資格・容量を分ける。既存A-LINK v0.4はPC HTTP/SQLiteの模擬受信・経路切替・重複排除・再起動prototypeで、実無線・衛星・modem切替や本線OS統合の証拠ではない。

500kg×2等の比較仮定と算術監査は設計入力。製造BOM・加工図・飛行設定・製造手順、実機/飛行/回収/再使用、許認可は未成立。担当工学部隊が要求→interface→検証計画→試験記録を同機番/版で追跡し、OWNERと専門担当が各gateを判断する。サービスの完成やSky公開を飛行受入へ換算しない。

## 共有するものと機器で決めるもの

共有するものは本人、有限権限、job/step、Asset/provenance、revision、operation ID、結果不明照合、費用、更新/復旧。機器で決めるものは入力、表示、実行資源、物理作用、安全、回線、thermal、boot/driver、製造と保守。

新しいprofileは目的→利用体験→責任→入力/出力→状態→保存→失敗→復旧→承認→同一候補の合格条件→未決定の決め方を埋める。interfaceの名前だけを追加せず、[全設計台帳](../../data/design-document-index.json)と対応する詳細へ接続する。
