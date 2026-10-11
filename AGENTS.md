# AGENTS.md — rock で作業するエージェント向けの共通ルール

このリポジトリは公開されている。一部のフォルダとファイルは git-crypt で暗号化されていて、鍵を持つ人と環境だけが読める。暗号化される場所は [`.gitattributes`](.gitattributes) の一覧が正本で、[docs/README.md](docs/README.md) の「暗号化している場所」に読みやすくまとめてある。

## 1. 最初に鍵の状態を確かめる

```sh
npm run private:status        # 暗号化対象のファイル数と、読める状態かどうか
```

- **鍵がある環境**（オーナーの端末、鍵を渡された開発AIの作業環境）では、先に `git-crypt unlock <鍵ファイル>` を実行する。鍵をbase64で環境変数 `ROCK_GIT_CRYPT_KEY` に入れている場合は `npm run private:unlock` でよい。読める状態になったら、続けて **[AGENTS.private.md](AGENTS.private.md) を読み、そのルールに従う**。製品の確定要望・進捗台帳・担当表・作業の進め方はそこにある。
- **鍵がない環境**では、公開されているコードと文書だけを扱う。暗号化されたファイルは編集・移動・削除しない。

## 2. 暗号化された内容を外に出さない

- 暗号化されたファイルの中身（Gitの過去の版を含む）を、公開ファイル・コミットメッセージ・PRの説明・Issue・CIのログ・生成物に写さない。要約や言い換えも同じ。
- 暗号化対象のフォルダに新しいファイルを置くと、自動で暗号化される。push の前に必ず `npm run private:check` を通す。これは、暗号化されるべきファイルが平文のままコミットされていないかを調べる。git-crypt を入れていない環境でそれらのファイルを追加すると平文のまま入るので、その環境では暗号化対象のフォルダに触らない。
- `lib/generated/` は `npm install` などのたびに `private/` から作られる生成物。コミットしない（`.gitignore` 済み）。
- 暗号化の対象を減らす変更（`.gitattributes` の行を消す・`-filter` を足す）は、オーナーの明示的な指示がある時だけ行う。

## 3. 共通ルール

- 鍵・トークン・パスワード・個人情報をGitに入れない。`.env` は `.env.example` だけを置く。
- `vendor/mr` の固定原本とハッシュは変更しない。
- 履歴を強制上書きしない（`git push --force` をしない）。
- 使わなくなった資料は削除する。削除したpathと復元元のcommitは [`data/archived-paths.json`](data/archived-paths.json) に記録してあり、台帳からの参照はこの一覧で検査する。
- 新しいコミットの作者メールには GitHub の noreply アドレスを使う。

## 4. 検査

| 環境 | コマンド | 内容 |
| --- | --- | --- |
| 鍵がない（公開CIを含む） | `npm run verify:public` | 公開ファイルだけで通る検査をすべて実行し、鍵が要る検査は名前を出して飛ばす |
| 鍵がある | `npm run verify` | すべての検査（完了前に必ず実行。docs/prompt-playbook.md など非公開の規約は AGENTS.private.md 参照） |
