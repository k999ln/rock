# avocadoOS Operator Dock

端末利用者向けavocadoOSとは別に配備する、運営専用の端末管理面です。利用者向けWeb/PWA、OSホーム、端末内アプリへこの画面やAPIを含めません。

全requestは静的assetを含めてWorkerを先に通し、Cloudflare Accessの`Cf-Access-Jwt-Assertion`を署名、issuer、application audience、有効期限、単一operator subjectまで検証します。Accessのpolicyだけに依存せず、Worker内でもfail closedにします。

## 配備前に必要なowner設定

1. Operator Dock専用のhostnameとCloudflare Access applicationを作成する。
2. Access policyを運営本人だけに限定し、MFAを必須にする。
3. 専用D1を作成し、`wrangler.jsonc`のplaceholder IDを実IDへ置き換える。
4. `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`ROCK_OPERATOR_SUB`をruntime設定として登録する。
5. 運営本人のP-256 WebAuthn hardware credentialを作成し、base64urlのcredential ID／SPKI公開鍵、RP ID、正確なHTTPS originを`OPERATOR_WEBAUTHN_*`へ登録する。private keyは登録しない。
6. D1 migrationを専用D1へ適用し、同じ配備のreadbackを保存する。

Access設定がなければ画面assetを返さず、WebAuthn設定がなければ命令準備・発行をfail closedにします。命令は端末、事故ID、action、理由、発行・開始・失効時刻を長さ付きcanonical bytesへ固定し、利用者確認済みWebAuthn assertionを保存します。同じcredential counterの別命令への再利用は拒否します。現在はsourceとlocal testの段階で、運営Dockを公開・配備済みとは扱いません。
