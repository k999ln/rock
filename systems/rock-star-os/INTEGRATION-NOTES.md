# 取得元からの差分

`IMPORT-MANIFEST.json` は封印済み第9ソースの取得時hash、選別した511ファイル、補完1ファイル、変更した文書・テストのhashを記録する。後続開発で取得時の値を塗り替えず、Git差分として変更する。

- 本体コード、署名Tool fixture、font・noVNC・第三者noticeは基準版を維持。
- `os/operations/elf_guard.py` は同じ第9成果物のimage-sourceにあった検証部品を補完。`tests/test_operations_elf_guard.py` の参照を未追跡artifactsからこのファイルへ変更。
- 取得元のトップレベルREADME/AGENTS/Goal/CHECKPOINT/CIは持ち込まず、Rockの製品・作業管理を正本とする。
- 技術資料の過去の主張に取得時点の範囲を明記。除外した証拠やprivate調査台帳への92リンクを、Git内に存在するかのようなリンクから履歴参照の説明へ変更。具体的な開発ボリュームの記録を汎用の準備説明へ変更。
- 膨大な過去のscreenshots/logs、privateリポジトリの全tree、実行状態、OSディスク、実資格情報は同梱しない。元の封印済み成果物はこの統合によって変更しない。
- 起動応答改善21ファイルのWIPは `experiments/startup-health/changes.patch` に未適用で保存。`git apply --check` の成功だけでは動作の成功ではない。
- 統合後のx86_64 CIで実隔離を検証できるよう、`os/runner/sandbox_launcher.c` はx86_64時だけELF interpreterの `/lib64` をread-only bindする。ARM64の引数列、安全策、worker契約は変更しない。取得時hashは `IMPORT-MANIFEST.json` に保持し、この差分はGit履歴で追跡する。修正後のGitHub run `34318178890` で実隔離事前診断とnative全検証に成功した。
- ALIGN03の復元検証入口をbackup schema1/schema2へ対応。A/B/data全体の照合を保持し、local Walletとpurchaser remote-cacheのprofileを分離、必須表と追加表を全比較する。既存backup/restore本体を再利用。外部Wallet正本・runner等の復元が必要なら`INCOMPLETE`と`NOT_RUN`を記録し、端末cacheの成功で代替しない。新しいhost fixtureの成功は、最新OS imageのbuild/復元起動や外部正本復元の証拠ではない。

rootの `scripts/test-native.py` と `.github/workflows/native-os.yml` はこの配置用の検証入口。正常hostのUI observerは元のMakefileと同じ `test_evidence.py` が対象。古いATM observerの認証fixture不整合とroot専用Wallet/power試験は、rootの `docs/native-os-validation.md` に残件として記録する。全ての `test_*evidence.py` が成功したと扱わない。

検証は使い捨てLinux環境で行う。suite全体がtimeoutした場合は失敗を記録して停止する。直接のprocess groupは終了するが、試験が独立sessionにした子孫全ての終了は保証しない。その環境を自動再利用せず、所有を確認した後片付けまたは使い捨てrunnerの終了を行う。
