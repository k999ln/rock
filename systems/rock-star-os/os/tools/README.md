# 3 independent development Tools

実際のユーザー入力を処理する 3 Tool と、提案 Tool の独立更新版を同梱する。既存 `rock-recipe/1` SDK、署名検証、承認、ジョブ履歴、更新・rollback を使用する。権限はすべて `text.input` / `text.output`、料金は 0 USD。Tool 自身は network、任意ファイル、shell、Python コード、Wallet にアクセスしない。

| Tool ID | 名前・入力 | 出力 | 配布版 |
| --- | --- | --- | --- |
| `org.rockstar.proposal-draft` | 提案下書き。募集条件の JSON をテキスト欄に入力 | 入力に基づく提案文、確認項目、不足事項。常に draft、送信・売上なし | 1.0.0 standard / 1.1.0 concise |
| `org.rockstar.citation-organizer` | 引用整理。Markdown 文書を入力 | 明示的な出典 marker を出典一覧へ整理した文書。コードと通常リンクを保持 | 1.0.0 |
| `org.rockstar.utf8-sha256` | 入力テキストの SHA-256。テキストをそのまま入力 | UTF-8 bytes のサイズと SHA-256。ファイルを検査したとは表示しない | 1.0.0 |

## 現在の OS 実証と過去の引渡し記録

2026-09-08 13:28 UTC、最終 ARM64 OS guest で 3 Tool の **45 checks PASS**。
install / approval / 実 sandbox 実行、同一 key 再試行、proposal 更新・rollback、
Core / runtime hash 不変、Wallet 不変を確認した。
guest proof（元snapshot内の参照。履歴資料は今回のGit対象外） と
同一 OS の Platform 56 checks（元snapshot内の参照。履歴資料は今回のGit対象外）
を参照。下の 07:29 host 検証と「引渡し時 guest 未実施」はその時点の履歴であり、
現在の OS 実証とは区別する。作成→check→限定 TLS 投稿→端末内 download / update の
現行手順は [Tool SDK 正本](../../docs/TOOL-SDK.md)。BlackBerry 実機は未検証のまま。

## 入出力と境界

### 提案下書き

入力例は [fixtures/proposal.json](fixtures/proposal.json)。必須キーは `title`、`requirements`、`deliverables`、任意キーは `deadline`、`price`。未知キー、重複キー、非 JSON 定数、型違い、空の必須値を拒否する。

`title` は 160 文字、`deadline` は 200 文字、`price` は 100 文字まで。requirements / deliverables は文字列または 1–40 個の文字列配列で、各要素は 8,000 文字まで。入力全体の UTF-8 64 KiB 上限が先に適用される。C0 制御文字は TAB / LF / CR を除いて拒否する。

結果は JSON 形式の text。`schema_version: 1`、`kind: proposal_draft`、`state: draft`、`format`、`proposal`、`checklist`、`warnings`、`external_submission: false`、`revenue_verified: false` を返す。入力に shell、URL、path に似た文字列があっても単なる文字として扱う。希望金額はユーザーが入力した条件であり、入金や確定売上ではない。

### 引用整理

対応する marker は `（出典: [名前](https://example.test/source)）`。1 行内に HTTP(S) Markdown link を置き、複数の link は空白・`,`・`;`・`、` で区切れる。URL を初出順にまとめる。既存の最初の `## 出典` 節があれば、次の H1/H2 の前に未掲載 URL だけ追加する。既存の文章・リンク・帰属表示は保持する。

backtick / tilde fence、字下げしたコード行、同じ長さの backtick で囲まれた inline code を保守的に保護する。コード部分を空白・改行ごと保持し、CRLF だけの入力には追加部分も CRLF を使う。fence / code span が閉じていないときは文書全体を変更しない。未対応・不正な marker、link 以外の説明を含む marker は原文を残す。完全な CommonMark parser や出典先の真偽確認ではない。通常リンクの除去、引用内容の削除、文書全体の句読点置換は行わない。

### 入力テキストの SHA-256

改行・空白・NUL・Unicode 結合文字も含む入力を、そのまま UTF-8 にした bytes を hash する。Unicode 正規化、trim、改行変換は行わない。空文字も有効。結果は JSON 形式の text で `encoding: UTF-8`、`scope: user_supplied_text_only`、`byte_length`、`sha256`、`file_verified: false` を返す。

`/etc/passwd` を入力しても、その path を読むことはなく、11 bytes の文字列を hash する。現在の UI にファイル grant / 選択機能がないため、ファイル全体の検査、変更中ファイルの照合、納品確認、受領証明は対象外。入力 `abc` の結果は `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`。

### 共通

入力は UTF-8 64 KiB、各 step 後の出力は UTF-8 128 KiB、recipe は最大 16 step、実 worker の deadline は 3 秒。worker 自身も recipe と入力 envelope を再検証する。追加 op は `proposal_draft`（format は standard / concise のみ）、`organize_citations`、`utf8_sha256`。それ以外の実行機構や引数による任意コード・path・URL 実行は追加していない。

## SDK と配布ファイル

[packages/](packages/) は編集可能な unsigned source recipe、[dist/](dist/) は development 署名済み `.rock.json` と [BUILD-MANIFEST.json](dist/BUILD-MANIFEST.json)。同じ 4 package を `examples/registry/` に配置している。Tool ごとに別ファイルとしてコピー・受渡しできる。全依存は既存 Python 標準ライブラリと SDK の OpenSSL 検証で、新たな package-manager 依存はない。

repository root から再現 build と照合を行う。

```sh
PYTHONPATH=src python3 -B os/tools/build_development.py --registry examples/registry
PYTHONPATH=src python3 -B os/tools/build_development.py --check --registry examples/registry
```

個別の Tool を既存 SDK で build / verify / private local catalog に追加する手順:

```sh
PYTHONPATH=src python3 -B -m blackberryrock.sdk build-dev os/tools/packages/org.rockstar.utf8-sha256--1.0.0.recipe.json os/tools/dist/org.rockstar.utf8-sha256--1.0.0.rock.json
PYTHONPATH=src python3 -B -m blackberryrock.sdk check os/tools/dist/org.rockstar.utf8-sha256--1.0.0.rock.json
PYTHONPATH=src python3 -B -m blackberryrock.sdk publish-local os/tools/dist/org.rockstar.utf8-sha256--1.0.0.rock.json os/tools/private-registry
```

`publish-local` は同じ id/version の上書きを拒否する。開発者は SDK の `new` で新しい ID を作成し、有限 op の組合せと metadata を定めて build できる。既存版の挙動を変えるときは version を上げ、新しい package hash に対して承認する。認識済み op の範囲なら、新 Tool ID や recipe の更新のたびに OS core を編集する必要はない。

署名は既存の **公開 RFC 8032 section 7.1 テスト fixture**を使用する。新規署名鍵は生成していない。この公開鍵は production publisher の信頼を成立させず、署名済みという表示だけで第三者作成物を安全と判定できない。今回の配布物は development 用で、外部への公開処理は実行していない。

## 出所

[PROVENANCE.json](PROVENANCE.json) に、参照した Mr commit `935a63d2daf33ba4af3733545c3a692c6aafd850`、3 ファイルの blob SHA、MIT 宣言、各機能の変更点を記録した。[NOTICE-Mr.txt](NOTICE-Mr.txt) に参照元の帰属表示を保持した。

今回の recipe / runtime はその挙動を参考にした local-development の独立実装である。Mr の固定 commit に今回の実装が含まれるとは主張せず、manifest.source も `local-development` / `LicenseRef-Development-Only` を使う。第三者に配布条件を設定する前に、このローカル実装側の license を確定する必要がある。未確認の rock 実装、Buyer License の実装、submodule は取り込んでいない。再実装担当者が本文を読んでいるため clean-room とは呼ばない。

## 確認結果と guest 接続

**2026-09-08 07:29:12 UTC、host の全体 unittest 69/69 PASS（新規 Tool 15 件を含む）。** evidence/host-suite.log（元snapshot内の参照。履歴資料は今回のGit対象外） と evidence/host-verification.json（元snapshot内の参照。履歴資料は今回のGit対象外） に保存した。署名改竄・信頼なし・失効、入力上限、コード保全、実 worker subprocess、3 Tool の install/approve/run/retry、1.0.0 → 1.1.0 更新、rollback、uninstall 後の receipt 保持を確認した。

提案 Tool の更新前後で recipe worker の SHA-256 は同一で、package hash と実出力が変わり、rollback で元の出力に戻った。これは追加した 3 op を含む runtime を固定した状態での **package-only update の host 証拠**。新しい op を一切追加せずに任意機能を実行できる、という意味ではない。

```sh
PYTHONPATH=src python3 -B os/tools/verify_host.py
```

この wrapper は `python -m unittest discover -s tests -v` と同じ全体 suite を実行して証拠を保存する。既存の一部テストは loopback server を使う。

guest 向けは [guest_acceptance.py](guest_acceptance.py)。主担当が target にコピーし、**実 ARM64 guest の root**で実行する。固定の `/usr/lib/rock-platform/service.py` の `call(PLATFORM_SOCKET, payload, PLATFORM_UID)` を使い、3 Tool の実 API install/approve/run、実 job の結果、再試行、proposal 1.1 update / rollback、OS core / runtime hash 不変、Wallet 不変を確認する。host への fallback はない。

- 成功 marker: `ROCK_TOOLS_GUEST_PASS`
- 失敗 marker: `ROCK_TOOLS_GUEST_FAIL`
- guest の report: `/data/tools-guest-acceptance.json`
- 検証後: 3 Tool の 1.0.0 を enabled にして残す。

既存 `os/platform/install-target.sh` が worker、package verifier、全 `examples/registry/*.rock.json` を組み込むため、この担当は Buildroot / C core / Hub / Wallet を編集していない。**07:29 の初回引渡し時点では guest script は構文確認までで、guest 実行はまだ行っていなかった。後続の実証は冒頭に記録した。** guest 成功、BlackBerry 実機、物理 USB、実 KYC・月次課金・ATM 現金化を host の成功から推測しない。
