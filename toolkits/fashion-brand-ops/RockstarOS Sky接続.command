#!/bin/zsh
set -eu

cd -- "${0:A:h}"

if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js 22.13以上をインストールしてから、もう一度開いてください。"
  read -r "?Enterキーで閉じます。"
  exit 1
fi
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' >/dev/null 2>&1; then
  print -u2 "Node.js 22.13以上へ更新してから、もう一度開いてください。"
  read -r "?Enterキーで閉じます。"
  exit 1
fi

secret_file=".rockstar-approval-secret"
if [[ ! -f "$secret_file" ]]; then
  umask 077
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > "$secret_file"
fi
chmod 600 "$secret_file"

export ROCKSTAR_APPROVAL_SECRET="$(<"$secret_file")"

node_options=()
if [[ -f ".env" ]]; then
  node_options+=("--env-file=.env")
fi

print "RockstarOS Sky接続アプリを起動しました。Skyの「ワンクリックで接続」を押してください。"
print "この画面を閉じると接続は終了します。"
exec node "${node_options[@]}" src/http.mjs
