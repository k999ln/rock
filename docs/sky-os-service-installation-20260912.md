# Sky OSサービス導入 — 2026-09-12

Skyの商品を「掲載されているだけ」ではなく、利用者が商品画面から一度押すと安全に使える状態へするOS側の導入経路を追加した。最初の対象はサブスク顧問（Rockstar Ledger 0.2.0）である。

## 利用者の流れ

1. 「PC・MCP接続」で同梱の最新版接続アプリを起動し、このPCを接続する。
2. 「サブスク顧問」を開き、「OSに導入して起動」を押す。
3. OSが検証、展開、MCP能力確認、起動を行い、Skyが台帳へ再接続する。
4. 全網羅、過去契約、月額、要対応、次回更新をチャットで確認する。

古い接続アプリには導入ツールがないため、Skyは「接続アプリを最新版にする」と表示する。接続そのものがない場合は設定画面へ案内する。手動ZIP導入は復旧用として折りたたんで残す。

## OSが保証する境界

- サービスはOS同梱の固定カタログに存在するものだけ。
- UIとカタログの配布ZIP SHA-256が一致しない場合は拒否。
- ZIPは16 MiB、展開後32 MiB、256ファイルまで。絶対パス、`..`、symlinkを拒否。
- プラグイン定義も固定SHA-256で照合し、MCPとdashboardの入口を固定。
- MCP `tools/list`で台帳の必須4能力を確認後に起動。
- dashboardはloopbackだけ、台帳は交換可能なpackageと別のdevice-private領域へ保存。
- stop/uninstallでも個人データとreceiptを保持。
- Native Platform IPCはOS UI UIDだけに許可。PC版はOrigin制限とセッショントークンを使う。
- 任意URL、任意shell、任意package、任意保存先、支払い、解約、税務申告は扱わない。

## 実装位置

- OS管理層: `systems/rock-star-os/src/blackberryrock/sky_services.py`
- OS固定カタログ: `systems/rock-star-os/os/sky-services/catalog.json`
- Native UI IPC: `systems/rock-star-os/os/platform/service.py`
- PC接続MCP: `toolkits/mr/mcp_server.py`
- Sky商品画面: `components/subscription-ledger-runner.tsx`

Native rootfsへの組込みコードとホスト試験は含む。QEMU/実機での起動、専用サービスUIDとnamespace/seccomp、公開HTTPS版からの相互運用は今回の合格範囲に含めない。
