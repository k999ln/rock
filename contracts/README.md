# Rock Tool API — P1 実装契約

この版は**Android P1の自社固定2操作だけを接続する試作**。第三者用の公開SDK/ストアではない。Linux nativeの署名recipe/MCP契約とSDKは `systems/rock-star-os/` にあり、このAIDLとwire互換ではない。[契約の適用範囲](../docs/native-os-integration.md#2-コードと契約の配置)を参照する。

## 実際のワイヤー契約

- 正本は `android/tool-sdk/src/main/aidl/dev/rock/sdk/ITool.aidl` と `IToolCallback.aidl`。AIDLのtransaction番号を固定。変更時は互換版を追加する。
- `getApiVersion()` は1。`start(token, operation, input, callback)` は非同期受付、`cancel(token)` は協調停止。
- `token` はBrokerが発行したattemptごとのUUID。callbackのtoken・実呼出UIDを照合し、DBの現行token・boot ID・期限とも照合する。
- 入出力はUTF-8換算で各32 KiB以下。P1はBinderに小さな文字列を渡す。v0.1設計のFD/URIによる大きな成果物の受け渡しは未実装。
- 入力JSONは `markdown:string`, `afterChars:integer`, `summary:string`, `price:integer`, `paidContents:string`, `noteUrl:string` の6項目だけ。未知項目・型の自動変換を拒否。
- `citations@1` は同じ6項目のJSONを返し、markdown以外の設定が変わっていないことをBrokerでも検証。
- `free-article@1` は最終Markdownを返す。最終成果物を読んで確認メモを入力するまでWorkはcompletedにならない。
- outcomeはpassed/needs_review/failed。空/巨大な出力、未知outcomeは拒否。sampleはpassedでも次工程へ進めない。
- 2操作は `dev.rock.tools.article` の別APKに入る。この版では1操作1APKではなく、1パッケージ1UID。SDKと契約の一般化は次段階。

## 信頼境界と制限

BrokerとToolは固定package、versionCode=1、同じ署名者だけ許可する。ToolのServiceはBrokerのsignature permissionを要求し、各メソッドでもBrokerの実UID/署名を確認する。第三者の別鍵を登録する経路はない。

両APKにINTERNET・広範なstorage・Accessibility・shared UIDは付けない。ただし、manifest検査や署名だけで任意の悪意あるコードの隔離が証明されたわけではない。cgroupメモリ制限、強制kill、専用SELinux domain、汎用capability brokerは未実装。P1の通信待ち上限/結果拒否と、OSがCPUを強制停止できることは区別する。**実データ・実資格情報を使わず、第三者コードを実行しない。**

Gradleのdebug鍵とAOSPの公開testkeyは検証専用。作者認証や商用の安全性には使えない。OSのplatform鍵をToolへ渡さない。リリース鍵・鍵登録・失効・署名catalogは未実装。

## 移植の根拠

`ArticleTools.java` は既存 `lib/mr-tools.ts` の出典整理/無料版作成をJavaへ移植したもの。元の固定参照は `k999ln/Mr.` commit `26a39d2c31ea5246cb78dbe42d86e333922db60c`、Copyright (c) Anicca contributors、[MIT](../vendor/mr/LICENSE)。原本やそのhashは変更しない。

`article-fixtures.json` は合成データのみ。Javaと既存TypeScriptを比較し、日本語、CRLF、重複出典、コード保持、絵文字、異常入力と2工程の接続を検査する。この集合の一致を確認するもので、全入力の形式的同値証明ではない。既存Pythonとの比較は従来のMr.テストを継続する。

## Material Invention sandbox契約

`material-invention.json` はRockstarOS Coreで二物質・複数比率・工程条件から候補graphを作る入力JSON Schema v1、`material-invention-fixture.json` は危険物を含まない合成fixtureである。実装は `lib/material-invention.ts` にあり、未知field、重複ID、単位不一致、SDS不足、危険性不明、禁止物質、許可外設備、温度・圧力上限超過をfail closedで扱う。

この契約の出力は常に`SANDBOX_ONLY`で、`physicalExecutionAllowed`は常にfalse。候補IDは物質lot、比率、工程版を含むcanonical inputのSHA-256へ固定する。simulation、文献、supplier情報は実験証明へ昇格せず、署名検証済みと記録された実験receiptとraw data hashだけを別状態として扱う。装置制御、化学simulation、外部ラボ接続、安全性・性能・特許性・量産性の認定はこの契約に含まれない。
