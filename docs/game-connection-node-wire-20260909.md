# 合成ゲーム接続v1 — Node.jsによる独立wire検証

**PASS_SCOPED_WIRE。API/SDKの提供、実接続、永続同意、ゲーム交換の合格ではない。** 旧UUID accountの公開vectorと既存prefixed accountの公開vectorを、Python protocolをimport/実行せず、Node.js標準の`crypto`で照合した。署名生成や秘密鍵、ネットワーク、DB、認証sessionは使用していない。

歴史的な基準はcommit `a63756311f59ff32983533503556bdbead72a9e4`で追加されたpure接続契約。その時点のprotocol SHA-256は `1d464fe735ca545e5ad59d07394fdef0bb219654ae560bfcd7c24b45dfdb6d13`、[固定vector](../systems/rock-star-os/os/game_exchange/fixtures/connection-v1-vectors.json)は `c2382e94932bd42a284ac64dec30519c762eeddcc13b5ee76ae836b82a011871`。既存口座ID補正の[追加vector](../systems/rock-star-os/os/game_exchange/fixtures/connection-v1-prefixed-account-vectors.json)のhashは `120f3edc5d5b19b6442e7ba87f2bdee7cd31435534bd5f82af77ef67b6daa346`。原15objects/署名/bytesは履歴として変更せず、同構造の新15objectsを別に検証する。このNode作業は原本・fixture・runtimeを変更しない。

[実測JSON](evidence/game-exchange/node-wire-vectors-20260909.json) に実行日時・verifier自身のhash・全checkを保存した。macOS arm64、Node v26.0.0 / OpenSSL 3.6.3で303 checks、そのうち142件が拒否確認。これは同じ固定サンプルに対する細かい照合数であり、303種類の実ゲーム取引を意味しない。

- 各fixtureの15個、合計30個すべてのobjectについて、独立encoderの全UTF-8 bytesをliteral `canonical_hex`と一致確認。順序を逆にしたobjectでも同一bytesになる。
- proof 2件、ACTIVE/REVOKED receipt各1件、cursor 1件の全署名payload bytesをliteral hexと一致確認。末尾domain区切りは実NUL `00`。公開32-byte Ed25519鍵を標準SPKIへ包み、標準cryptoで各5署名を検証。
- 各fixtureのproof/binding/consentの3つのliteral digestと、object内の全23箇所の`*_sha256`を独立再計算。request、assertion、publication、共有receipt、cursor scopeのdomainも別々に固定した。
- cursor tokenの全bytesとbase64urlを照合。既存Walletの公開WebAuthn assertionも、元`authenticatorData || SHA256(clientDataJSON bytes)`に対するEd25519署名を各1件検証。challenge/origin/RP hash/flags/counterを固定サンプルと照合したが、challenge消費やcounterのDB commitは行っていない。
- signature改変、NUL欠落、文字としての`\\0`、異なるdomain/key、publication差替え、期限切れ、別audience、不明scope、非NFC display、範囲外整数/非JSON値/不正scalar/深さ/byte上限/base64urlを拒否。domainの負例は既存公開署名の検証payloadを変える方法で確認し、別domainで再署名するfixtureは生成しない。

単純なJavaScript objectの再構築後に`JSON.stringify`すると、数字に見えるkeyが再配列される。ここではASCII keyを辞書順に直接serializeし、`"10"`が`"2"`より前になることも検査した。署名除去は最上位`signature`だけで、入れ子の同名fieldは残す。

`account_id`は既存のopaque identifierとして扱い、UUIDへの変換・再採番をしない。`acct-7df1d67d8ab9bd3f6fb6d4cde6a4f873`をowner_contextからbinding/intent/consent/reservation/cursorまで完全一致で照合し、別accountへの置換と旧UUID contextとの混在は拒否した。これはDB account作成や移行を実行する試験ではない。

検証器は [verify_game_connection_vectors.mjs](../systems/rock-star-os/tests/verify_game_connection_vectors.mjs)。repository rootから次で実行でき、成功JSONをstdoutへ、失敗はstderrと非zero終了へ返す。

```sh
node systems/rock-star-os/tests/verify_game_connection_vectors.mjs
```

固定fixtureのfile hashを最初に照合するため、trusted fixture読取りに使う`JSON.parse`を汎用wire decoderとして扱わない。重複keyや`1.0`/`1e0`という数字の元表記を保持・拒否するNode向けdecoderは実装していない。proofのcontext検査も公開negative vectorsの実行に必要な範囲であり、Python全schema/鍵registryのparityを保証するSDKではない。既存[Node 22 CI](../.github/workflows/ci.yml)の`npm run verify`直後に同入口を1step追加した。Node 22 CI上の実行結果は、このMac証拠には含まれず、次の実CIで確認する。

両fixtureについてそれぞれ別の所有する短命Node processを起動し、新規一時copyへ空白1byteだけ加えると、pin違いを検出して終了1・成功stdout 0 bytesになることを実測した。[外部改変負例](evidence/game-exchange/node-wire-tamper-20260909.json)。原fixtureは変更せず、一時copyは回収した。

次に実接続を検証する際は、認証済みowner/author、保護された接続index、同一契約のwriter admission、永続challenge/counter/receipt、再送/失効/再起動を別途試験する。このpure wire成功だけでcapability、HTTP route、SDK、交換、実資金を有効にしない。
