> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# Rock star os Tool SDK — development recipe runtime v1

This SDK creates signed, finite **text recipes** for the current Rock star os
ARM64 Linux prototype. A new Tool or Workflow can be installed and updated
without rebuilding Core when it uses one of the nine supported operations.
Arbitrary Python, JavaScript, native applications and general cloud connectors
are outside this runtime.

The execution environment matters:

| Environment | Current scope and reference |
|---|---|
| Rock star os ARM64 guest | Native Hub, package download/approval, real local recipe processes inside Linux namespaces and seccomp, persistent results and receipts. See the [OS build](../os/README.md), [sandbox launcher](../os/platform/sandbox-exec.c), and actual guest proof（元snapshot内の参照。履歴資料は今回のGit対象外）. |
| Limited TLS development registry | An authenticated author uploads a verified package; the OS downloads a signed index and package from its configured origin. See [registry operations and trust limits](../os/registry/README.md). |
| Explicit remote execution | Schemas 3 and 4 bind the permitted target and exact per-job consent. The native OS can use the owned TLS runner fixture. See the [runner contract](../os/runner/README.md) and [native UI contract](../os/ui/REMOTE-UI-CONTRACT.md). |
| Original Python/browser host prototype | Text executes on the computer running `rock-hub`. This host worker alone has no OS sandbox or per-process memory limit. Its old `device_local` results are host evidence, separately from the later ARM64 guest proof. |

The tested OS is a QEMU ARM64 development board. These results do not establish
BlackBerry compatibility, a production public Store, production author identity,
physical USB transport, or public cloud deployment. Development signatures and
TLS credentials below use published test fixtures. See [release gates](RELEASE-GATES.md).

## Create and check a package

Use Python 3.11+ and OpenSSL supporting Ed25519. Run these existing commands from
the repository root. Choose a new working directory so an existing source or
build output is not replaced:

```sh
mkdir -p work/sdk-my-tool
PYTHONPATH=src python3 -m blackberryrock.sdk new work/sdk-my-tool/my-tool.json --id org.example.my-tool --name 'My tool'
# Edit manifest name, description, version, provenance and recipe in my-tool.json.
PYTHONPATH=src python3 -m blackberryrock.sdk build-dev work/sdk-my-tool/my-tool.json work/sdk-my-tool/my-tool.rock.json
PYTHONPATH=src python3 -m blackberryrock.sdk check work/sdk-my-tool/my-tool.rock.json
```

`new` creates unsigned source with schema 4, local execution, and explicit
minimums matching the SDK's current OS and recipe runtime profile. `build-dev`
validates it, recomputes the recipe SHA-256, and signs the envelope using the
**PUBLIC RFC 8032 section 7.1 test fixture**. It creates no fresh signing key.
`check` verifies the signature, manifest fields, finite recipe and package hash.
Add `--compatible` to also require the current OS/runtime minimums. Neither
check executes the recipe or proves that its output suits a user's task.
The installed `rock-sdk` entry point exposes the same commands.

Everyone knows the fixture key. It identifies the development publisher in this
test setup, not an independently authenticated author. Production enrollment,
protected author keys, rotation and public release approval are not supplied by
these commands. Source repository, exact 40-character commit SHA and license
must be truthful; generated `local-development` / `LicenseRef-Development-Only`
values do not grant a distribution license.

## Publish to a development registry

For the original host Hub's filesystem catalog, use:

```sh
PYTHONPATH=src python3 -m blackberryrock.sdk publish-local work/sdk-my-tool/my-tool.rock.json work/sdk-my-tool/local-registry
PYTHONPATH=src python3 -m blackberryrock.hub_server --registry work/sdk-my-tool/local-registry
```

`publish-local` exclusively creates one immutable id/version file. It does not
upload anything. This host directory is not automatically the OS's remote
catalog, and the browser host server does not replace the OS native Hub.

For an OS connected to the limited development TLS registry, start the existing
registry service in the **Linux host of that OS guest**, in an unused private
state directory. Use a separate terminal for publication:

```sh
PYTHONPATH=src:os python3 -m registry.server --state /var/tmp/rock-registry-sdk-demo-v1 --authors os/registry/fixtures/approved-authors.json --cert os/registry/fixtures/development-ca.pem --fixture-key os/registry/fixtures/PUBLIC-FIXTURE-KEY.pem
```

```sh
PYTHONPATH=src:os python3 -m registry.publish work/sdk-my-tool/my-tool.rock.json --origin https://127.0.0.1:9443 --ca os/registry/fixtures/development-ca.pem --token-file os/registry/fixtures/PUBLIC-AUTHOR-TOKEN.txt --key my-tool-1.0.0
```

On the existing Linux build VM the repository is `/mnt/rock-source`; run from
there. The registry owns loopback port 9443. An already running desktop
supervisor or verification harness may own that port: use its configured
registry or wait for that session to finish, rather than starting a competing
server. The OS development network uses QEMU's `10.0.2.2:9443` host alias and the
provisioned CA. A `network: none` device cannot refresh/download remote packages;
its already installed local Tools can still run.

The author token is read from a file. The publish response must identify the
submitted id, version and hash. Reuse the **same key and exact package** after an
uncertain upload response; a different package under that key is rejected.
Existing versions cannot be overwritten. `registry.seed_development` is an
optional existing CLI that publishes the four bundled development packages;
it is not needed to publish your own package. Full server/client constraints,
revocation and cache behavior are in the [registry reference](../os/registry/README.md).

These commands are instructions for the private fixture environment. No public
registry deployment or publication is performed by preparing this guide.

## Download, approve, run and update on the OS

1. Open the native **Hub**, choose **カタログ更新**, and wait for the signed
   catalog refresh to finish. Search for the Tool and open its details.
2. Download/install the chosen version. Review its permissions, then approve
   the exact package before using it. Catalog refresh or installation alone
   does not grant execution permission.
3. Enter text and run on **この端末** when the signed manifest permits local
   execution. Inspect the completed result and retained history. An acceptance
   receipt by itself is not a completed job.
4. For an update, edit the source version to a higher numeric semantic version,
   rebuild/check, and publish with a new version-specific key. Refresh the OS
   catalog, choose the new version, download and approve it. The recipe runtime
   and Core remain unchanged for a package-only update.
5. To roll back, choose a previously cached signed version and its restore
   action, then approve that package. Uninstall retains job results and receipts.

Keep the original request key when the UI offers retry after an unknown result.
A different body under that key is rejected. A deliberate **new execution** is a
new request; it must not be used to guess whether an earlier job completed.
Known publisher/version revocations block install, approval and execution.
An offline device cannot learn an unreceived new revocation.

These flows have actual guest evidence: native download and local execution（元snapshot内の参照。履歴資料は今回のGit対象外）
and three independent Tools, package update and rollback（元snapshot内の参照。履歴資料は今回のGit対象外）.
The former's name “remote” describes its package source; execution in that test
was local to the OS. It must not be confused with the remote runner below.

## Complete operation reference

A recipe is a JSON array of 1–16 steps. Each step accepts and returns text and has
exactly the fields shown. Lines use LF (`\n`); sorting uses Unicode codepoint
order, not locale collation.

| Operation JSON | Meaning |
|---|---|
| `{"op":"trim_lines"}` | Strip surrounding whitespace on each line and outer whitespace of the whole text. |
| `{"op":"collapse_blank_lines"}` | Collapse consecutive empty or whitespace-only lines to one. |
| `{"op":"sort_lines"}` | Sort lines in ascending Unicode order. |
| `{"op":"unique_lines"}` | Keep the first occurrence of each exact line. |
| `{"op":"prefix_lines","value":"- [ ] "}` | Prefix each line with the literal value. |
| `{"op":"replace_literal","old":"，","new":"、"}` | Replace literal occurrences; no regular expression. |
| `{"op":"proposal_draft","format":"standard"}` | Turn a validated proposal-input JSON text into draft JSON text. Format is `standard` or `concise`; no external submission or earnings. |
| `{"op":"organize_citations"}` | Collect supported explicit Markdown citation markers while preserving ordinary links and code. It does not fetch or verify source pages. |
| `{"op":"utf8_sha256"}` | Return byte count and SHA-256 of the supplied text encoded as UTF-8, without reading a named file. |

The last three operations' complete input shapes, parsing limits and examples
are in [the Tool reference](../os/tools/README.md). `value`, `old` and `new` are
strings of at most 128 Unicode characters; `old` is nonempty. Unknown operations
or fields are rejected. URLs and paths inside supplied text remain text, not
capabilities. Shell execution, network requests and dynamic loading are not
recipe operations.

All packages retain these limits: input 65,536 UTF-8 bytes, output after every
step 131,072 UTF-8 bytes, worker wall timeout 3 seconds, package 128 KiB. The
original host Hub limits active jobs to four. In the ARM64 OS, the fixed launcher
also enforces CPU 2 seconds, address space 256 MiB, file/descriptor/process
limits, no-new-privileges, dropped capabilities, isolated namespaces and a
seccomp policy. Runtime files are read-only; Wallet data and platform sockets
are outside the Tool's visible data. These are finite-recipe isolation controls,
not a claim that arbitrary third-party native code is supported or kernel
vulnerabilities are impossible.

For an alphabetized, deduplicated checklist:

```json
[
  {"op":"trim_lines"},
  {"op":"unique_lines"},
  {"op":"sort_lines"},
  {"op":"prefix_lines","value":"- [ ] "}
]
```

Set `manifest.kind` to `Workflow` for a composed recipe; it uses the same bounded
interpreter. There is no dependency resolver or general workflow connector
engine. The actual OS comparison（元snapshot内の参照。履歴資料は今回のGit対象外） measures three
separate Tools versus one combined Workflow inside this OS only.

## Manifest versions and remote execution

All three supported package schemas accept kind `Tool` or `Workflow`, runtime
`rock-recipe/1`, the fixed resources above and free USD per-run pricing. These
package schemas are distinct from the original receiver's schema-v1 messages.

- **Schema 2**, produced by explicit `sdk new --schema-version 2`: targets exactly `["device_local"]`,
  permissions exactly `["text.input","text.output"]`, and empty data destinations.
- **Schema 3**: a unique selection from `device_local`, `cloud`, `pc_usb`, with
  at least one remote target. Add `execution.remote` to the exact permission
  list, set data destinations to the remote targets in their signed order, and
  add `remote: {"consent":"per_job_input_sha256","retention":"job_receipts","protocol":"rock-runner/1"}`.
  Use the [complete signed schema-3 fixture](../os/runner/fixtures/remote-text.rock.json)
  and [runner contract](../os/runner/README.md); there is no `sdk new --remote` flag.
  The same `build-dev` and `check` commands validate the edited source.
- **Schema 4**, the default for `sdk new`: adds signed minimum OS/runtime
  requirements. It permits either schema 2's local-only contract or schema 3's
  complete remote contract. For remote execution, keep schema 4 and its
  `compatibility` object, then set the targets, permissions, data destinations
  and `remote` object exactly as described above. A local-only manifest must
  omit `remote`; remote targets must include it.

A schema-3 or schema-4 package does not itself authorize transmission. The native UI prepares
an unsent preview, shows the selected target, endpoint and exact input scope,
and requires a separate explicit per-job approval. Cancelling the preview sends
no job. Changing the input, package or destination requires fresh consent.
An unknown response keeps the original key and payload; status retrieval does
not silently resubmit, select another mode or assert completion.

The actual native remote-runner evidence（元snapshot内の参照。履歴資料は今回のGit対象外）
includes an unsent discard, explicit new approval, one real isolated Linux
execution through pinned TLS, and recovery from a lost acceptance reply without
duplicate execution. `cloud` here names the owned TLS development fixture, not
a deployed public cloud. `pc_usb` remains a product target with an authenticated
Unix-stream development transport; physical USB is **NOT_RUN**. Endpoints and
credentials are operator provisioning, never arbitrary recipe fields.

## Minimum OS and runtime versions

Release **0.3.0** introduces schema 4. Its required signed field is:

```json
"compatibility": {
  "os": "rock-star-os",
  "min_os_version": "0.3.0",
  "min_runtime_version": "1.0.0"
}
```

The current profile has OS version `0.3.0`, runtime `rock-recipe/1` and runtime
version `1.0.0`. Its single source for admission and display is the immutable
`CURRENT_PROFILE` in [packages.py](../src/blackberryrock/packages.py), with the
OS version imported from the package release version. The Tool's own
`manifest.version` is a separate version: increasing it does not change its OS
or runtime requirements.

Minimums use numeric `major.minor.patch` strings of at most 64 characters.
Comparison uses integer components: `1.10.0` is newer than `1.9.0`.
Leading zeroes, prerelease/build suffixes, ranges, omitted fields, non-string
versions, unknown fields and unknown OS/runtime names are rejected. The known
runtime remains `rock-recipe/1`; a future minimum such as `1.1.0` expresses a
requirement on that runtime, and does not authorize another interpreter or
unknown recipe operations. There is no maximum-version constraint or dependency
resolver in this schema.

To author a Tool that requires a future OS, choose a fresh directory and run:

```sh
mkdir -p work/sdk-future-tool
PYTHONPATH=src python3 -m blackberryrock.sdk new work/sdk-future-tool/source.json --id org.example.future-tool --min-os-version 999.0.0 --min-runtime-version 1.0.0
PYTHONPATH=src python3 -m blackberryrock.sdk build-dev work/sdk-future-tool/source.json work/sdk-future-tool/tool.rock.json
PYTHONPATH=src python3 -m blackberryrock.sdk check work/sdk-future-tool/tool.rock.json
# Expected rejection on release 0.3.0; the signed package remains unchanged:
PYTHONPATH=src python3 -m blackberryrock.sdk check work/sdk-future-tool/tool.rock.json --compatible
```

The Python equivalent is `starter(min_os_version="999.0.0")`, followed by
`sign_development(source)`. New sources default to schema 4; use
`starter(schema_version=2)` only when deliberately creating a legacy local
source. To construct a legacy schema-3 source, start with that explicit schema-2
source, then apply the complete schema-3 remote contract above. Compatibility
options cannot be attached to legacy schemas or silently discarded.

Structure/trust and admission are separate checks. `validate_manifest` and
`verify_package` accept a well-formed, correctly signed future-minimum package.
The release-0.3.0 registry can therefore retain it alongside compatible Tools
without rejecting the entire signed index. `compatibility_status(manifest)`
reports `compatible`, `reasons`, `declared`, `required` and `current`; known
reasons are `os_too_old` and `runtime_too_old`. `require_compatible(manifest)`
raises `PackageCompatibilityError` for an unmet minimum and is the admission
guard for installation, approval, rollback and execution. These compatibility
helpers inspect manifests; they do not replace package signature verification.
The optional `profile` argument is for explicit conformance tests; production
admission uses `CURRENT_PROFILE`.

Existing schema-2 and schema-3 signed packages stay valid on release 0.3.0 without
modifying their bytes or adding fields. Their compatibility status has
`declared: false`: they declare no OS minimum and use the legacy recipe-runtime
baseline `1.0.0`. This is support for old packages in the new release. It does
**not** mean a release-0.2.0 OS can parse schema 4. Versioned or filtered signed
catalog delivery to clients that do not understand a new schema remains a
separate rollout task; do not put schema 4 into a catalog serving those clients
and claim that its old parser will preserve the catalog.

The [schema-4 authoring reference](../schemas/recipe-manifest-v4.schema.json)
is separate from the original receiver's schema-1 manifest. The executable
package validator additionally enforces exact integer types, recipe constraints,
size bounds and signatures. The [focused compatibility tests](../tests/test_sdk_compatibility.py)
cover current/future minimums, numeric ordering, signed-field tampering, local
and remote contracts, malformed values and unchanged legacy signatures.
They are host SDK evidence; actual OS failure-case evidence is established
separately by the Store/Hub verification harness.
