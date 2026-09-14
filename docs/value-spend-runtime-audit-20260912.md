# Value/Spend Runtime 着手監査 — 2026-09-12

GitHub取得成功。default mainは`9f4930b45e2d38a5371f4a489be4d53b38f28ba7`。native/製品開発本体は`codex/rockstaros-launch-candidate-20260910`の`2562469c8f6c075822b425cb7c86202980de7036`で、mainより201 commits先・1 commit後方。設計branch `codex/os-game-design-review-20260909`は`27b34adc02a9e06a4816aa18a5e38cf38b330953`。

PR #4はmain向けOPEN/MERGEABLEで、同HEADのWeb verify、Android prototype、native source partitions、release signing fixture、transport fixture、phone source preparationはすべてSUCCESS。phone checkは名称どおりsource preparationでありOS bootではない。PR #8/#9はPR #4のhead branchをbaseにするstacked PRで、今回も同じ方式を採用する。

`systems/rock-star-os/src/blackberryrock/packages.py`、`hub.py`、`wallet.py`、`hub_server.py`と、`os/mcp_broker`、`os/runner`、`os/service_access`を確認。既存Walletはappend-only double-entry journal、idempotency、reserve/unknown/reconcileを持つ。game exchangeは同じposting tableを明示migrationで拡張しており、Value/Spendもこの方式と整合させる。Hubのlocal consoleとnative MCP gatewayは異なる実装段階なので、vertical sliceは共通command contractをlocal Hubへ接続し、native HTTPS gateway配線は未実装境界として残す。

第一号integrationの`MrFadiAi/Polymarket-bot`はmain `82647014e0c355a5684e09666d8a0a522234640d`、MIT。Smart Money live callback placeholder、PnL表示/台帳照合の不足をソースで確認。リスク修正PR #9 `d7581bae7d659b4a8118d2700dc085458c9b3783`はOPENで、mainの保証に含めない。

今回の作業branchは`codex/value-spend-runtime-polymarket-20260912`、baseは`2562469c8f6c075822b425cb7c86202980de7036`。mainへ直接変更しない。実装・host fixture・CI、provider sandbox、実機、LIVEを別々に記録する。
