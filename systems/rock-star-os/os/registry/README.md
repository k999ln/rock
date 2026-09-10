# Limited development registry

SDK から認証付き TLS 投稿を受け、端末側が署名一覧と package を直接取得する実装。registry module の実装範囲はこのディレクトリで、後続の OS 統合は Platform / UI の別実装が担う。host の実 loopback TLS **28/28 tests PASS**、2026-09-08 08:05:55 UTC。証拠（元snapshot内の参照。履歴資料は今回のGit対象外）とログ（元snapshot内の参照。履歴資料は今回のGit対象外）を保存した。この記録は初回 host 引渡し時の範囲であり、後続の guest 実証は以下に分けて示す。

## 現在の OS 統合の実証

後続の 09:00 native OS 検証（元snapshot内の参照。履歴資料は今回のGit対象外） は、
SDK 投稿済み package を ARM64 guest の Hub から署名一覧更新→検索→download→承認→
実 local sandbox 処理まで通している。この証拠の remote は **配布元**を指し、
remote runner での実行とは別である。さらに
13:27 native runner 検証（元snapshot内の参照。履歴資料は今回のGit対象外） は registry から
schema 3 package を取得し、別の明示同意後に実 TLS runner へ 1 job を送った証拠。
公開 Store や本番認証、BlackBerry 対応を証明するものではない。
現行の作成・確認・投稿・端末操作は [SDK 正本](../../docs/TOOL-SDK.md) を参照。
下の host-verification の guest_executed:false は元の host run の属性として保持する。

## 起動・SDK 投稿

repository root から次を実行する。Debian VM では `PYTHONPATH=/mnt/rock-source/src:/mnt/rock-source/os` とし、引数の source path に `/mnt/rock-source/` を付ける。既定 bind は **127.0.0.1:9443**、loopback 以外は拒否する。

```sh
PYTHONPATH=src:os python3 -B -m registry.server --state /var/tmp/rock-registry-development-v1 --authors os/registry/fixtures/approved-authors.json --cert os/registry/fixtures/development-ca.pem --fixture-key os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem
PYTHONPATH=src:os python3 -B -m registry.seed_development
```

seed は既存の署名済み 3 Tool（proposal 1.1 更新版を含む 4 package）を **実 publish API** へ投稿する。package hash に由来する同じ冪等性キーを使うため、再実行で二重登録しない。個別投稿:

```sh
PYTHONPATH=src:os python3 -B -m registry.publish examples/registry/org.rockstar.utf8-sha256--1.0.0.rock.json --origin https://127.0.0.1:9443 --ca os/registry/fixtures/development-ca.pem --token-file os/registry/fixtures/PUBLIC-AUTHOR-TOKEN.txt --key hash-tool-1.0.0
```

API は `POST /v1/publish`（body `{package: signed_package}`）と `POST /v1/revoke`（body `{subject: string}`）。両方とも `Authorization: Bearer ...` と `Idempotency-Key` が必要。author が許可された publisher のみ操作できる。既存 id/version は不変。同じ author/key/canonical JSON body は再起動・切断後も同じ receipt、同じ key の異なる body は 409。

失効 subject は承認 publisher 自身、またはその publisher が署名した既存 `tool-id@version`。別 publisher の失効や未登録 version の先取りは禁止。失効記録は削除できず package の内容は変えない。`python -m registry.revoke SUBJECT --origin ... --ca ... --token-file ... --key ...` が認証付き CLI。

失効の commit 後は、固定 hash を直接指定した package GET も **404** を返す。取得の受付と version/publisher の失効照合は同じ store mutex 内で行うため、失効の commit を待っていた GET にも bytes を返さない。署名一覧に含まれる immutable package metadata、保存済み bytes、過去の publish/revoke receipt は履歴として保持する。同じ publish key の再送が元の receipt を返しても、失効した package の再配布は許可しない。失効前にすでに取得受付を終えた通信や保存済みのコピーを撤回する仕組みではなく、端末側は検証済み revocations による cache・導入・実行の拒否も継続する。

この配布停止の焦点試験は `PYTHONPATH=src:os python3 -B -m unittest discover -s os/registry/tests -p test_revoked_get.py -v`。既存公開 fixture を使う実 loopback TLS で、version/publisher 別の停止、非対象の継続、別 author の拒否、再起動後の失効・receipt 保持、取得済み cache の拒否、失効 commit と GET の競合を検査する。OS/VM の起動を代用する試験ではない。

2026-09-08 15:51:51 UTC に、変更後の host Mac 実 loopback TLS suite **33/33 PASS・skip 0** を確認した（既存 28 件＋上記 5 件、4.478 秒）。`python3 -B -m unittest discover -s os/registry/tests -v` の実行結果であり、冒頭の初回 28 件の証拠は変更していない。検証対象 SHA-256: `server.py` = `a0988a299680af2e3f20e7aa6bb3a5771a00224cc728863d4a4a7c6d71de7ed8`、`tests/test_revoked_get.py` = `5c142fdd1c90dd1614163d4a7edd537ee767a3f29c750ef4af1d2c77968bc1cd`。この追加試験では Linux VM・ARM64 guest を起動していない。

## Target interface

target に `__init__.py`、`common.py`、`transport.py`、`client.py` を `/usr/lib/rock-platform/registry/` へコピーし、**CA 証明書だけ**を root 管理の固定 path に置く。TLS fixture key と author token を target client に渡す必要はない。既存の Python ssl / sqlite / OpenSSL を使用する。

```python
from registry.client import RegistryClient
client = RegistryClient(
    origin="https://10.0.2.2:9443",
    ca_file="/usr/share/rock-registry/development-ca.pem",
    cache_dir="/data/platform/registry-cache",
)
```

cache directory は実際に使用する Platform UID が所有する 0700 領域にする。

| 呼び出し | 戻り値・意味 |
| --- | --- |
| `refresh(*, commit_guard=None)` | `{revision, catalog, offline: false, issued_at, expires_at, revocations}`。TLS・署名・時刻・単調 revision・既知 package/失効の不変性を検査して保存。任意の context factory は取得・署名検査の後、client mutex/file lock の外側で commit を囲む |
| `catalog()` | 検証済み cache の metadata 配列。失効対象を除く。オフライン・期限切れでも一覧の参照は可能 |
| `download(id, version)` | size/hash/publisher/manifest/署名・期限・失効を確認した完全な package dict。Hub.install に渡せる |
| `revocations()` | 署名検証済みの `list[str]`。期限切れでも既知失効を保持。cache がなければ `[]` |
| `verified_state()` | cache なしなら `None`、あれば `{revision, issued_at, expires_at, revocations, fresh}` |

metadata のキーは `{manifest, hash, size, filename, source}`、`source` は `registry`。一覧は導入済み状態を表さない。導入済み状態と実行履歴は既存 Hub の責務。

OS は `RegistryControl.commit_guard` を refresh に渡す。ネット取得・署名検査の間は Hub lock を保持せず、その後 `Hub lock → client mutex → file lock` の順で保存する。guard の finally は client の両 lock の解放後、Hub lock の解放前に、実際に保存された署名 cache の失効を `Hub.revoke(subject)` へ同期する。rename 成功後に directory fsync が失敗した場合や、例外によって refresh が失敗を返した場合にも同期が必要である。

起動時と **各 mutation の admission 時** にも同じ Hub lock の内側で `sync_revocations()` を呼ぶ。`RegistryControl.admission_guard()` は同期とその後の mutation を同じ lock で囲むための helper。同期失敗は `RegistrySafetyError(ValueError)` と `admission_blocked` 状態になり、新規 mutation を通さない。診断 flag の確認だけでこの同期を省略しない。既存 `install{id,version,key}` では `client.download(id,version)` の成功結果だけを Hub.install に渡す。期限切れは新規取得・導入を cache hit でも拒否するが、すでに導入済み Tool のオフライン実行は Hub に残る。失効を学習した場合は Hub の失効処理を優先する。

署名・期限・未来 issued_at・rollback・失効などの拒否は `registry.common.RegistryError`（`ValueError`）。接続・途中切断は `TransportError`（`RegistryError`）、cache の I/O 障害は `OSError`。refresh 失敗時に cache を削除しない。ただし rename 後のエラーでは新しい検証済み cache が見えている場合があり、「失敗したから旧 cache のまま」と推定してはいけない。

`os/platform/registry_control.py` は queue の SQLite/OSError を worker 外周で捕捉し、既定 0.1 秒から最大 5 秒の backoff で同じ `running` row を再処理する。ネット・署名エラーは操作の `error` として確定し、新しい操作キーで利用者が再試行できる。queue 自体の障害は `worker_error`/`worker_failures`/`retry_at_unix` で可視化し、恒久的な busy にしない。死んだ worker は `start()`、新しい enqueue、snapshot で再作成される。queue row と Hub request receipt の重複は作らない。

## 保証範囲と制限

- signed `GET /index.json` は `schema_version:1`、固定 registry ID、revision、UTC epoch 秒の issued_at/expires_at、immutable packages、append-only revocations、Ed25519 signature を持つ。package 署名と異なる domain prefix で署名する。
- validity は既定 3,600 秒、server の `--validity-seconds` は 30–86,400 秒。期限の最後の 1/4 に入った GET は revision を増やして再署名する。同じ revision の内容変更は client が拒否する。
- client の未来時刻許容は既定 30 秒、`clock_skew_seconds` は 0–300 秒。期限切れの猶予はない。初回でも期限切れ一覧を拒否し、後続は永続 high-watermark より古い revision と、既知失効を消す index を拒否する。`minimum_revision` を初期 provisioning の追加条件にできる。
- **hardware antirollback、secure clock は未実装**。保護された cache と正常な OS 時刻に依存する。有効期間内の最初の index の古さや、ネットワーク遮断中の未取得の新規失効を完全には検出できない。失効済みとなる前の未受信情報を知ったとは扱わない。
- package GET は `/packages/<固定 SHA-256>.rock.json` のみ。固定 HTTPS origin と明示 CA を使い、環境 proxy と全 redirect を使わない。接続・読取に上限、既定 2 回の完全再送。部分データは cache に書かず、検証後の temp/fsync/rename/directory fsync で保存する。
- server は SQLite WAL `synchronous=FULL` で package bytes・index・revision・失効・receipt を一取引として commit。最大 100 package、8 MiB package bytes、4,096 receipts、512 revocations、512 KiB index。package 自体は既存 verifier の 128 KiB 上限。TLS worker は最大 8。
- 一覧の更新が package 取得中に失効を追加した場合も、保存直前の再確認で拒否する。catalog の更新成功だけで Tool を enable しない。

## 公開 development fixture

TLS key、index/package signing key は既存の公開 RFC 8032 section 7.1 fixture。author token も公開の合成テスト値。**本番の本人性・秘密性・publisher trust を成立させない**。新たな秘密鍵は生成していない。

CA SHA-256: `a8709619319348ebdd48ce89e2e9553351c1554d7c8311d77a7b3e78a3020aac`。SAN は localhost / 127.0.0.1 / 10.0.2.2。証明書は 2026-09-08 07:46:33 UTC から有効。guest clock がこれより前なら TLS を無効化せず時刻を正常化する。実行中に fixture 証明書を再生成しない。

```sh
PYTHONPATH=src:os python3 -B -m registry.verify_host
```

28 テストは実 TLS、SDK CLI、同時再送、認証・所有範囲、package 改竄、期限・時計ずれ、失効、途中送受信、署名/保存中断、容量上限、atomic cache、rollback、既存 Tool のオフライン実行を含む。証拠の `guest_executed` は false であり、VM や端末起動を代用しない。

参照した一次資料: [Python SSLContext](https://docs.python.org/3/library/ssl.html)、[http.client](https://docs.python.org/3/library/http.client.html)、[OpenSSL req](https://docs.openssl.org/3.0/man1/openssl-req/)。
