# AGENTS.md — Codex の作業規則（2026-11-02 改訂、100 行以内）

旧版（15KB）は `archive/root-snapshot-20261029/AGENTS.md`。削除せず置き換えた。細則が要るときだけ読む。

## 1. 最初に読むもの（これ以外は task に書かれた範囲だけ）

1. `codex/tasks/NN-*.md` — 渡された task 1 枚。
2. `docs/structure/09-repo-layout.md` — 役割 → フォルダの表。task の対象行だけ使う。
3. 対象の設計正本 `docs/structure/0X-*.md`（表に書いてある）。確定要望の一覧は `docs/product-baseline.md`（structure と矛盾したら structure が勝つ）。
4. 「現段階からプロンプト作成」を頼まれたときだけ `docs/prompt-playbook.md`。

全体 grep をしない。ルートの `.ignore` が archive/, docs/evidence/, workspaces/ 等を rg/fd から外している。歴史を調べる必要がある task だけ `--no-ignore`。

## 2. 名前

- 正本は `docs/structure/06-naming.md`。外: avokado / mii / Eve / Sky / RockstarOS / Pro。内: Eve, Noa（旧Smith）, AMC（旧Jennifer を吸収）, Jev, Spider, Sky, Work/Job/Receipt（旧Zema）, Broker, Wallet, Game。
- ユーザーに見せる名前は Eve だけ。他は内部名。AI の表記は si。
- 旧名が本文にあったら task 03/04 の手順で直す。API path・D1 table・enum・環境変数は変えない。

## 3. 設計の変え方

- 決定は `docs/structure/07-decisions-from-minutes.md` に日付付きで 1 行足してから、該当 `docs/structure/0X` を直す。新しい日付が古い決定を上書きする。
- 数字（月額 ¥800 / $8.88、¥410,000、BOM 目標）は候補。Codex は変えない。変えるのは本人。
- 新サービスは `docs/services/<name>.md` を `04 §3` の書式で先に書く。合格条件（Jev が判定できる数値・真偽）が書けないサービスは作らない。
- 新ハードは `systems/rock-star-os/targets/<profile>/README.md`。profile には入出力・電源・通信・演算上限・表示層だけ。仕事の意味・権限・課金は書かない。
- docs/ 直下へ文書を足したら `docs/README.md` に 1 行。設計 JSON（data/design-document-index.json, data/repository-map.json, data/product-baseline.json）が参照するパスを動かしたら同じ PR で更新。

## 4. 検証

- PR 前: `npm run verify`（task 02 後は typecheck + lint:product + test。それまでは現行の長いチェーン）。
- data/ や設計 JSON を触ったら `npm run verify:design`（task 02 後）。Sky/課金なら `npm run sky:check` / `npm run billing:check`。
- テストを消して通さない。失敗したテストは直すか、理由を PR 本文に書いて本人に判断を渡す。

## 5. 記録

- 完了したら `CHANGELOG.md` の**先頭**に `## YYYY-MM-DD` の下へ 1 行（何を・どこを・PR #）。末尾追記や README への受領票は書かない。
- `codex/tasks/00-index.md` の該当行に ✅ と PR #。
- 次の担当が再開できるよう、未完了・検証コマンド・結果を PR 本文に残す。証拠のない「完了」「収益」「公開」は書かない。

## 6. やってはいけないこと（本人の明示許可が要る）

- 実資金の移動、本番 Stripe 鍵、本番 D1 への migration 適用、外部サービスとの契約・申込・問い合わせ送信。
- 端末の購入・初期化・bootloader 解除・flash、OS 署名鍵の生成・保管、Play / App Store への公開。
- `docs/evidence/`・`archive/` の中身の編集・削除。git 履歴の書き換え、main への直接 push。
- 「解約しにくい」「データ無制限」を UI・広告文に書くこと（03-esim.md §7）。
- Private Pixel、Pro、robo data bank、MATOU、Princeton 関連は今回の整理の対象外。触らない。

## 7. 境界（変えない前提）

- RockstarOS は一つ。ハード差は hardware profile（02-rockstaros.md）。account が正本、端末は cache。
- eSIM は RockstarOS の鍵付き回線。GB を売らない。OS 本体を eSIM に入れない（03-esim.md）。
- mii は Spatial Core（4 Tower + Hub）＋ 差し替え可能な表示層。Tower に OS を 4 コピー入れない（01-mii.md）。
- Eve → Noa → AMC → Jev の内部構造は潰さない。Jev は権限を持たない。Spider は読むだけ。Broker と Wallet のゲートを飛ばさない。
- 端末内 LLM の出力、remote 完了、CI 成功は、本人の承認・Tool 成功・実機合格に昇格しない。QEMU / 単体 APK / PWA の合格を実機 OS の合格と呼ばない。

## 8. マージ時

- 追記型文書（CHANGELOG, docs/structure/07, 各設計書の日付節）は両側を保全。README.md と data/*.json は新しい側を土台に古い側の差分だけ足す。片側で丸ごと解決しない。
