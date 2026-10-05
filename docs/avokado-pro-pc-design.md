# avokadoPro — NVIDIA搭載の小型PC

2026-10-05 / 構成・組立設計 P0 / **実機未組立、調達前、販売前**。

利用者の確定方向は「NVIDIAを中身にしたMac miniのような据え置きPC」「AIもPCゲームも重視」。価格回答「80」は直前の万円単位の選択肢から**目標販売価格80万円/台**として扱う。税込/税別・送料・保証・販売地域は未確定で、発注予算や販売確約ではない。旧88万円のPro参考価格は今回の設計目標に継承しない。公開中のページはこの設計保存だけでは更新されない。

**ProはMiniなしで使う独立PC。MiniもProを必須としない。** Miniは任意の空間入力・体験拡張として接続する。Miniの1本自律・外部給電・R5設計とMAT15の実機gateを保持し、Proの熱/ゲーム/AI/供給は新しいMAT16で管理する。

## 商品の中心

「机の上に置く、AIとゲームのためのコンパクトPC」。ディスプレイ、キーボード、マウスを接続し、ローカルAI、ゲーム、制作を選ぶ。自作LLMの試作、モデル推論、画像・動画制作を候補にするが、LLMの本格事前学習や任意ゲームの性能を未測定で保証しない。

Mac miniは省スペース・低い箱形の外観参考。Apple製品の筐体、ロゴ、macOS互換を採用する意味ではない。Pro側でNVIDIA GPUを使い、CPUはPCゲーム互換と供給を考慮してx86のIntel系を候補にする。

## P0の構成候補

- **CPU / motherboard:** Intel Core Ultra 9 290HX Plus級、GPUを実装済みのOEM/ODM基板。参照実機はASUS ROG NUC 16、参照SKU `1NUC16JNK9X285A2`。国内供給・購入価格・裸基板供給は未確認。
- **GPU:** NVIDIA GeForce RTX 5080 **Laptop GPU、16GB GDDR7**。デスクトップ版RTX 5080とは別製品。GPU/CPUは基板一式として調達し、デスクトップGPUカードや単体BGA chipを購入して載せられる前提にしない。
- **RAM:** 合計128GB、64GB×2。参照SKUはDDR5-5600 SO-DIMMまたはDDR5-6400 CSO-DIMMの対応を公表。実際のモジュール型番はQVL/BIOS版・供給元の確認後に固定し、SO-DIMMとCSO-DIMMを混在させない。システムRAMと16GBのGPU VRAMは別で、144GBのGPUメモリーとは表示しない。
- **SSD:** 合計4TBを2TB NVMe M.2 2280×2で構成。OS/apps用とmodel/assets用に分ける。参照SKUの各slotの公開対応は1〜2TBなので、4TB×1の互換を推測しない。SSD型番と冷却pad/heat sinkは供給元適合を確認する。
- **I/O:** USB-C/Thunderbolt、USB-A、HDMI/DisplayPort、2.5GbE、Wi-Fi/Bluetoothを参照構成から確保。販売版のport数/位置は基板図面受領後に確定。Mini接続は既存の本人接続・権限・校正・停止契約を経由する。
- **電源:** P0参照機は外付け380W（20V / 19A）adapter。OEM指定品と地域適合の電源コードを使う。USB-C給電や汎用品への代替を前提にしない。380Wはadapter定格で、常時消費電力ではない。
- **冷却:** P0はOEM標準のfan、vapor chamber、duct、firmware制御をそのまま使用。CPU/GPU/VRAM/SSDの同時負荷で温度・消費電力・clock・noise・入力遅延を測る。

参照機の標準添付RAM/SSDは32GB/2TBで、上記128GB/4TBはPro向け構成案。製品仕様と改装案を分ける。[ASUS参照SKU公式仕様](https://rog.asus.com/me-en/desktops/mini-pc/rog-nuc-16/spec/)、[NVIDIA Laptop GPU仕様](https://www.nvidia.com/en-us/geforce/laptops/50-series/)。

## 筐体の作り方

まず既存OEM筐体のままP0を動かして、電気・driver・性能・冷却の基準値を取る。参照機の公表寸法は282.5×189.5×56.5mm。これを**220×220×95mm、約4.60Lの低い銀色筐体**へそのまま入れられるとはしない。この寸法は販売版の工業デザイン目標で、ODM基板の再配置/供給と熱設計の成立が条件。

販売版はround cornerのアルミ外装、前面USB-C/USB-Aと控えめなstatus LED、後面映像/LAN/電源、側面または底面吸気・後方排気、取り外せる底面service panelを候補とする。外付け電源を採用し、排気口をMiniや壁で塞がない配置を案内する。角R、板厚、fastener、接地、アンテナ窓、duct、board固定穴、fan寸法は実部品CAD後に決める。

[外観検討図](assets/avokado-pro-pc-concept.svg)はこの配置意図を示す概念図で、基板収納・冷却・加工の合格図面ではない。目標寸法で成立しなければ、実部品が入る幅へ拡張するかODM配置を変更し、目標だけを理由に通風を削らない。市販ROG NUCをそのままavokado製造品と称して再販売しない。独自筐体で販売する前にOEM/ODM供給、ブランド、保証、更新責任を契約で確定する。

## OS・AI・ゲーム

PCゲーム互換のP0基準はメーカー対応Windows環境、CUDA系AIの試験は対応driver/runtimeを固定して実施する。WindowsはPro販売OSとして未確定で、OEM licenseとRockstarOS clientの提供方法を別に決める。RockstarOS native/Linuxも独立候補としてdriver、起動、更新/復旧と代表ゲームを検証する。Windowsで動いたゲームをLinux合格に換算せず、すべてのSteam/anti-cheatゲーム対応を宣言しない。

avokado専用モデルは自作重みの小型host試作段階。ProのNVIDIA上で動作受入済みではない。モデル・tokenizer・quantization・context・batch・VRAM peak・速度を記録して対応modelを決める。ゲームと大きなAIを同時に起動した場合はVRAM/電力を競合するため、ゲーム優先、AI優先、両方停止を選べる設計にする。未知の組合せを自動起動しない。

AIの出力は非信頼の提案。Brokerの権限、本人承認、Toolの成功、仕事完了へ昇格しない。cloud併用は外部送信・見積・費用上限・本人承認を経由し、ローカル不足時に無断で送信しない。AI作業の停止でもゲームsaveとjob履歴は別に保全する。

## 試作BOMと組立手順

調達単位は「CPU/GPU/VRAM/基板/冷却/firmwareのOEM一式」1組、「適合64GB RAM」2枚、「適合2TB SSD」2枚、「OEM電源」1個、「地域対応電源コード」1本。試験用monitor/keyboard/mouseは別。販売版の筐体・I/O board・アンテナ・内部配線はODM後に追加。型番未確定のRAM/SSD、基板寸法やpinoutを架空の確定BOMにしない。

1. exact SKU、stock、見積、RAM/SSD QVL、firmware、保証/改装条件を照合し、OWNERが購入を判断する。
2. 到着時に構成・破損・電源を照合し、OEM標準構成でboot/driver/recoveryとbaseline性能を記録する。
3. OEMの整備手順に従い、完全電源断・ESD対策の上で適合RAM/SSDを交換/増設。CPU/GPU BGAの載せ替えは行わない。
4. memory診断、SSD/SMART、cold boot、sleep/wake、再起動、保存復元を試験し、基板/BIOS/driver/OS/model版を固定する。
5. 独立したAIとゲーム、両方の負荷、停止と復旧をOEM筐体で受け入れる。
6. OEM/ODMから販売版基板CAD、power/thermal budget、firmware保守、MOQ/納期の提示を受け、収納CAD・排気・antenna設計を作る。
7. 販売版筐体で同じ試験を再実行。該当地域の適合・保証・返品・更新/復旧を含む出荷条件を確認してから販売仕様を固定する。

実施記録は現時点ですべて未着手。発注、改装、製造、実機操作をこの設計保存から実行済みにしない。

## 受入と80万円の成立条件

P0完了は同じ個体・版で、メモリー/SSD診断、AIのmodel別速度/VRAM、代表ゲームの解像度/画質/平均fps/1% low、1時間継続負荷の温度/clock/騒音/電力、停止・再起動・save/仕事復旧を記録すること。初回ゲーム目標は1440p/60fpsとするが、対象タイトル、画質、ray tracing、DLSS、frame generationの有無を試験前に固定し、結果が出るまで対応宣言しない。受入機と違う筐体やGPUへ結果を転用しない。

80万円は販売目標で、原価や利益ではない。供給見積＋RAM/SSD＋筐体/NRE/治具＋組立検査＋OS/license＋物流＋保証/修理＋販売費＋地域税制を積み上げる。単価、最低発注数量、歩留まり、初期台数、税込/税別、送料、保証期間が未確定なので、粗利や採算が成立したとはしない。採算が合わなければ仕様、初期台数、価格をOWNERへ具体的に提示して決める。

## 担当と次の一手

ROCK: 本設計、RockstarOS接続境界、試験記録形式。EXTERNAL: NVIDIA/OEM/ODMの基板、driver、firmware、供給/保守。JOINT: 収納、熱、ゲーム、AIと出荷機の受入。OWNER: 販売条件、見積後の購入、製造契約、販売開始。

次は**参照SKUの国内調達見積と128GBメモリーQVL、OEM/ODM基板供給可否**を確認し、P0候補1台と試験タイトルを決める。メール送信や発注は未実施。資料保存・GitHub branch・main統合・公開ページ・物理製造は個別に記録する。
