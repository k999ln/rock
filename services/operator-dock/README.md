# avocadoOS Operator Dock

端末利用者向けavocadoOSとは別に配備する、運営専用の端末管理面です。利用者向けWeb/PWA、OSホーム、端末内アプリへこの画面やAPIを含めません。

全requestは静的assetを含めてWorkerを先に通し、Cloudflare Accessの`Cf-Access-Jwt-Assertion`を署名、issuer、application audience、有効期限、単一operator subjectまで検証します。Accessのpolicyだけに依存せず、Worker内でもfail closedにします。

## 配備前に必要なowner設定

1. Operator Dock専用のhostnameとCloudflare Access applicationを作成する。
2. Access policyを運営本人だけに限定し、MFAを必須にする。
3. 専用D1を作成し、`wrangler.jsonc`のplaceholder IDを実IDへ置き換える。
4. `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`ROCK_OPERATOR_SUB`を秘密ではないruntime設定として登録する。
5. `0001_operator_device_control.sql`を専用D1へ適用し、同じ配備のreadbackを保存する。

これらが未設定なら画面assetを返さず、APIも認証失敗にします。現在はsourceとlocal testの段階で、運営Dockを公開・配備済みとは扱いません。
