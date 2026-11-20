# 仕様書 84 — 画面を取らない決まりと検査

task: [codex/tasks/84-noah-screenless-rule.md](../../codex/tasks/84-noah-screenless-rule.md)。先に要る物: 無し（最初にやる）。契約も許可も要らない。
型契約: [docs/contracts/noah-screenless-v1.ts](../contracts/noah-screenless-v1.ts)。試験: [noah-screenless.test.mjs](../design-validation/noah/noah-screenless.test.mjs)（5 群、全部通過）。

**ローンチまでに作る範囲は 10 章（起動引数の検査と、「閉じても進む」の回帰試験）。** 面の見分けと、検査用の Mac での観測は、出した後。

## 1. 完成の姿

- Agent が動いている間、本人が使っている端末の前面のアプリ・窓・クリップボード・音が変わらない。これを「行儀」でなく「作り」で保ち、**作りが緩んだ変更を、PR の検査が止める。**
- 取り込んだ Agent・載せた Agent の 1 つずつに、面（`none`・`terminal`・`browser`・`screen`・`own-device`）が付く。本人の端末そのものを操作する物は、つなげない。
- 依存に画面操作の部品があっても、画面なしで仕事ができる Agent は止めない。代わりにカードへ「ブラウザを使う機能は動きません。」と 1 行出す。

## 2. この仕様で決めた事

| 決めた事 | 理由（実測） |
| --- | --- |
| 面を 2 段に分ける。**使おうとする面**（依存から読む手がかり）と、**決めた面**（接続要件に書く値） | 依存だけで決めると、今動いている 13 件のうち Anicca（`playwright-core`）と QwenPaw（`mss`・`playwright`）が `browser`・`screen` になる。2 件とも、画面の無い隔離環境で成果を返している |
| 読むのは実行時の依存だけ。開発用・任意・別の OS だけの依存は読まない | manifest を読めた 33 件で、全部の依存を読むと `browser` 以上が 13 件、実行時だけなら 5 件。差の 8 件は試験用の `@playwright/test`、任意の extras、Windows だけの `pywin32` |
| 起動引数の検査は、文字列の検索でなく、**本物の関数が返す引数の配列**を調べる | `containerArgs`・`terminalContainerArgs` は export 済み。今の main で違反 0 を確かめた |
| VM の起動引数は、引数を返す関数に切り出す | 今は `ensureEngine` の中に直に書いてあり、検査が import できない |

## 3. 今あるコードと、変える所

| ファイル | 今 | 変える事 |
| --- | --- | --- |
| `lib/noah-surface-class.ts` | 無い | 新規。型契約から `NOAH_SURFACE_SIGNS`・`noahRuntimeDependencies`・`classifyNoahSurface`・`decideNoahSurface`・`noahPlacesForSurface` を移す |
| `lib/noah-screenless-audit.mjs` | 無い | 新規。型契約から `auditNoahContainerArgs`・`auditNoahVmArgs` を移す。**`.mjs` にする**（`scripts/*.mjs` は型を剥がさずに動くので、`.ts` を import できない。`lib/noah-execution-contract.mjs` と同じ置き方）。型は JSDoc で書く |
| `scripts/noah-isolated-runtime.mjs` | `ensureEngine` の中で `runCommand('colima', ['start', 'noah-exec', …])` | 引数の配列を `export function engineArgs()` に切り出し、`ensureEngine` はそれを呼ぶ。**引数の中身は 1 文字も変えない** |
| `scripts/check-noah-screenless.mjs` | 無い | 新規。下の「検査」を行い、違反があれば一覧を出して終了コード 1 |
| `package.json` | `verify` の鎖 | `"noah:screenless:check": "node scripts/check-noah-screenless.mjs"` を足し、`verify` の鎖の `repository:check` の後ろへ入れる |
| `tests/noah-surface-class.test.mjs`、`tests/noah-screenless.test.mjs` | 無い | 検証キットの `noah-screenless.test.mjs` を分けて移す。fixture は無い（依存の一覧は試験の中に書いてある） |
| `components/noah-launch.tsx` | 操作の後に `<output>{notice}</output>` を出す。全画面の進行表示は無い | 変えない。5 章の決まりを満たしているかを確かめるだけ |
| `scripts/noah-screenless-observe.mjs` | 無い | 新規。検査用の Mac でだけ動かす観測（6 章） |

変えない物: `noah-isolation/1` の値（`TERMINAL_SURFACE`）、`containerArgs` と `terminalContainerArgs` の引数、Broker の実行前確認、`RECIPES`。

## 4. 規則

### 4.1 使おうとする面（`classifyNoahSurface`）

入力は、口と、実行時の依存の名前・import・コマンド。**説明文は入力にしない。** 名前は下の表と完全に一致した時だけ当てる（`my-playwright-helper-docs` は当てない）。強い方を採る: `own-device` ＞ `screen` ＞ `browser` ＞ `terminal`。

| 面 | 当てる名前（正本は `NOAH_SURFACE_SIGNS`） |
| --- | --- |
| `own-device` | `osascript` `applescript` `py-applescript` `pyobjc`（`pyobjc-…` を含む） `quartz` `appkit` `atomacos` `appium`（`appium-…` を含む） `appium-python-client` `uiautomator` `uiautomator2` `adb` `adbutils` `pure-python-adb` `pywinauto` `uiautomation` `pywin32` `win32gui` `win32api` `autoit` `pyautoit` `keyboard` `accessibility` |
| `screen` | `pyautogui` `pynput` `xdotool` `wmctrl` `mss` `pyscreeze` `pymsgbox` `robotjs` `@nut-tree/nut-js` `@nut-tree-fork/nut-js` `nut-js` `screenshot-desktop` `vncdotool` `pyvirtualdisplay` `xvfbwrapper` `tkinter` `computer-use` `scrot` `imagegrab` |
| `browser` | `playwright` `playwright-core` `@playwright/test` `puppeteer` `puppeteer-core` `selenium` `selenium-webdriver` `webdriverio` `browser-use` `chromium` `chromedriver` `undetected-chromedriver` `@browserbasehq/stagehand` `stagehand` `pyppeteer` `splinter` `helium` `nodriver` `zendriver` `crawl4ai` |
| `terminal` | 上のどれにも当たらず、口が `mcp-package`・`acp`・`source` |
| `none` | 口が `mcp-remote`・`space-mcp`・`a2a`（本人の端末では何も動かない。依存は見ない） |

### 4.2 実行時の依存（`noahRuntimeDependencies`）

| manifest | 読む所 | 読まない所 |
| --- | --- | --- |
| `package.json` | `dependencies` | `devDependencies`、`optionalDependencies`、`peerDependencies` |
| `requirements.txt` | 各行（`#` より後ろと、`-` で始まる行を除く） | `; sys_platform …`・`platform_system`・`os_name`・`extra ==` の条件が付いた行 |
| `pyproject.toml` | `[project]` の `dependencies = [ … ]` | `[project.optional-dependencies]`、`[dependency-groups]`、条件付きの項目 |

読めない manifest は「依存なし」として扱う（面は `terminal` になり、4.3 の確かめで決まる）。

### 4.3 決めた面（`decideNoahSurface`）

| 条件 | 決めた面 | カードの 1 行 |
| --- | --- | --- |
| 口が `mcp-remote`・`space-mcp`・`a2a` | `none` | 「画面を使いません」 |
| 審査済みの実行の定義がある（`RECIPES` の 13 件、`noah-terminal/1` の登録）。使おうとする面が `terminal` | `terminal` | 「画面を使いません」 |
| 同じ。使おうとする面が `browser` | `terminal` | 「ブラウザを使う機能は動きません。」 |
| 同じ。使おうとする面が `screen`・`own-device` | `terminal` | 「画面を操作する機能は動きません。」 |
| 画面の無い隔離環境での見本の 1 往復（L2）が通った | `terminal` | 上と同じ |
| どちらも無い。使おうとする面が `browser`・`screen` | そのまま | 「専用の端末の中のブラウザ（画面）を使います」。置き場所は task 91 の後 |
| どちらも無い。使おうとする面が `own-device` | `own-device` | 一覧に出さない。接続計画は `blocked` |

面ごとの置き場所（`noahPlacesForSurface`）: `none` → `provider`。`terminal` → `home`・`cloud`・`pocket`。`browser` → `home`・`cloud`。`screen` → `home`。`own-device` → 無し。

### 4.4 検査（`scripts/check-noah-screenless.mjs`）

対象は 4 つ。違反の文は `auditNoahContainerArgs`・`auditNoahVmArgs` が返す。

| 対象 | 取り方 | 合格 |
| --- | --- | --- |
| 固定 adapter の隔離環境 | `RECIPES` の各値で `containerArgs('noah-run-x', 'image', recipe)` | 違反 0 |
| 載せたコードの隔離環境（実行） | `terminalContainerArgs('n', 'image', 'noah-terminal-00000000-0000-0000-0000-000000000000', { root: '' }, 'main.py', 'python')` と、`'main.mjs', 'node'` | 違反 0 |
| 載せたコードの隔離環境（配置） | 同じ関数の最後の引数を `true`。`auditNoahContainerArgs(args, { stage: true })` | 違反 0（配置だけは root を許す。network・mount・特権の条件は同じ） |
| VM | `engineArgs()` | 違反 0 |

container の合格条件（1 つでも欠ければ違反）:

| 必ず有る | 有ってはいけない |
| --- | --- |
| `--network none` | `--privileged`、`--device`、`--cap-add`、`--pid`、`--ipc`、`--uts`、`--userns`、`--volumes-from`、`--gpus`、`-p`・`--publish`・`-P`、`--add-host` |
| `--read-only` | `-v`・`--volume`（host の mount） |
| `--cap-drop ALL` | `--mount` のうち、`type=volume,`・`type=tmpfs,` で始まらない物、`src=/…` を持つ物 |
| `--security-opt no-new-privileges` | 値を持つ `DISPLAY`・`WAYLAND_DISPLAY`・`XAUTHORITY`・`DBUS_SESSION_BUS_ADDRESS`・`PULSE_SERVER`・`XDG_RUNTIME_DIR`・`SSH_AUTH_SOCK`（空で上書きしているのは可） |
| `--user`（root 以外） | `/var/run/docker.sock`、`/tmp/.X11-unix`、`/run/user` を含む引数 |
| `--memory`、`--cpus`、`--pids-limit` | |

VM の合格条件: `--mount none` が有る。`--ssh-agent`・`--network-address`・`--network-host-addresses` が無いか、`=false`。

## 5. 画面の決まり（確かめるだけ。新しい画面は作らない）

| 決まり | 今の `components/noah-launch.tsx` | 確かめ方 |
| --- | --- | --- |
| 依頼の後、画面は元のまま使える | `act()` は `pending` の間だけボタンを止め、終わると `refresh()` | 幅 390 の実ブラウザで、頼んだ直後に別の Agent を選べる |
| 進行は一覧の中の 1 行 | 「処理中」を履歴の行に出す | 全画面を覆う要素と、閉じるまで操作できない dialog が無い |
| 画面を閉じても進む | 仕事は `noah_runner_commands` にあり、端末が取りに来る | 6 章の試験 |
| 本人が要る時は割り込まない | 今は該当なし（87 の「あなたの番」で足す） | — |

## 6. 処理の順

1. `engineArgs()` を切り出す（動きを変えない。既存の `tests/noah-agent-execution.test.mjs` などが通ること）。
2. `lib/noah-screenless-audit.mjs` と `lib/noah-surface-class.ts` を、型契約から移す。
3. `scripts/check-noah-screenless.mjs` を書き、`package.json` へ足す。今の main で通ることを確かめる。
4. 試験を `tests/` へ移す。「緩めた変更」15 通りが落ちることを確かめる。
5. 「閉じても進む」の回帰試験を足す（`tests/noah-launch-close.test.mjs`）: `createNoahLaunchService` に試験用の D1 を渡し、`enqueue`（run）の後、`overview` を 1 回も呼ばずに、端末側の `poll` → `start` → `finish` だけで Work に成果が入ること。
6. `scripts/noah-screenless-observe.mjs`（検査用の Mac でだけ動かす）: 仕事 1 件の間、100 ミリ秒ごとに下を記録し、最初の値からの変化の数を出す。記録するのは変化の数と時刻だけ。窓の題名、画面の中身、クリップボードの中身は記録しない。

| 観測 | 取り方（候補。**Mac での確認が要る。この文書を書いた環境は Linux で、動かして確かめていない**） | 合格 |
| --- | --- | --- |
| 前面のアプリ | `lsappinfo info -only bundleid "$(lsappinfo front)"` | 変化 0（本人が自分で切り替えた分を除くため、検査中は触らない） |
| 窓の数 | `osascript -l JavaScript -e 'ObjC.import("CoreGraphics"); ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0)).length'` | 増加 0 |
| クリップボードの版 | `osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSPasteboard.generalPasteboard.changeCount'` | 変化 0 |
| runner の権限 | runner の process の中から `$.AXIsProcessTrusted()` と `$.CGPreflightScreenCaptureAccess()` | どちらも偽 |

## 7. 試験

| 試験 | 中身 | 今の状態 |
| --- | --- | --- |
| 今の main の起動引数が検査を通る | `RECIPES` 13 件、載せたコードの実行と配置、VM | 検証キットで通過 |
| 緩めた変更が落ちる | 画面を渡す、host のフォルダの mount、bind mount、host の network、network の指定を消す、特権、装置、権限を足す、root、読み取り専用を外す、docker の socket、X11 の socket、port、重さの上限を外す、音 の 15 通り | 通過 |
| 面の見分け | 実際の依存の一覧 4 件（QwenPaw → `screen`、Anicca → `browser`、artemis → `own-device`、Aider → `terminal`）、import、コマンド、似た名前を当てない | 通過 |
| 実行時の依存だけを読む | 開発用・任意・別の OS だけの依存が入らない | 通過 |
| 面を決める | 4.3 の表の全行。`RECIPES` 13 件が全部 `terminal` | 通過 |
| 閉じても進む | 6 章の 5 | 足す |
| 端末での観測 | 6 章の 6。13 件の実行中 | 検査用の Mac で行う |

## 8. 決めていない事

- `browser`・`screen` の Agent へ渡す「専用の端末の中の画面」は task 91。それまでは、4.3 の下から 2 行目の Agent は「準備が必要」に見える。
- 観測の 4 項目の取り方は候補。Mac での確認の結果で、取り方を直してよい（合格の条件は変えない）。
- mii での観測（Agent に空間の表示・カメラ・マイクを直接渡さない事の検査）は task 95。

## 9. 完了の定義

- `node scripts/check-noah-screenless.mjs` が今の main で終了コード 0。`terminalContainerArgs` に `'--env', 'DISPLAY=:0'` を足した作業用の変更で、終了コード 1 と違反の文が出る。
- `node --experimental-strip-types --test tests/noah-surface-class.test.mjs tests/noah-screenless.test.mjs tests/noah-launch-close.test.mjs` が通る。
- `npm run typecheck`、`npm run lint:product`、`npm run verify`。
- PR 本文に、検査用の Mac での観測の結果（4 項目の変化の数）か、まだ行っていない事を書く。

## 10. ローンチの範囲（[ローンチの最小限](mvp-launch.md) の L1）

| 章 | ローンチまで | 後 |
| --- | --- | --- |
| 3 変える所 | `scripts/noah-isolated-runtime.mjs` の `engineArgs()`、`lib/noah-screenless-audit.mjs`、`scripts/check-noah-screenless.mjs`、`package.json`、`tests/noah-screenless.test.mjs`、`tests/noah-launch-close.test.mjs` | `lib/noah-surface-class.ts`、`tests/noah-surface-class.test.mjs`（面の見分けは、端末で動かす配布を入れる 89 と一緒に）。`scripts/noah-screenless-observe.mjs`（検査用の Mac が要る） |
| 4.1〜4.3 面の見分け | 無し。ローンチで並ぶのは、口が「相手のサーバー」の物だけで、面は必ず `none`（本人の端末では何も動かない。96 の規則 6 が、保存の前に確かめる） | 89 と一緒に |
| 4.4 検査 | 全部 | — |
| 5 画面の決まり | 新しい画面（`/noah/ready`）にも同じ決まりを当てる。確かめは [90](spec-90-phone-only-loop.md) の 4 章 | — |
| 6 処理の順 | 1・3・4（検査の分）・5 | 2 のうち面の見分け、6 |

ローンチに入れる理由: 今の Mac の道（13 件と、載せたコード）は、起動引数が緩めば画面や host のフォルダに届く。今は違反 0 だが、それを守る検査が `npm run verify` に無い。相手のサーバーの道は、作りとして本人の端末に何も置かないので、足す検査は無い。

完了の定義（L1）: 9 章のうち、`tests/noah-surface-class.test.mjs` と観測を除いた物。`node scripts/check-noah-screenless.mjs` が今の main で終了コード 0。`terminalContainerArgs` に `'--env', 'DISPLAY=:0'` を足した作業用の変更で、終了コード 1。
