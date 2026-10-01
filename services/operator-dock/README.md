# RockstarOS Operator Dock

端末利用者向けRockstarOSとは別に配備する、運営専用の端末管理面です。利用者向けWeb/PWA、OSホーム、端末内アプリへこの画面やAPIを含めません。

全requestは静的assetを含めてWorkerを先に通し、Cloudflare Accessの`Cf-Access-Jwt-Assertion`を署名、issuer、application audience、有効期限、単一operator subjectまで検証します。Accessのpolicyだけに依存せず、Worker内でもfail closedにします。

## 配備前に必要なowner設定

1. Operator Dock専用のhostnameとCloudflare Access applicationを作成する。
2. Access policyを運営本人だけに限定し、MFAを必須にする。
3. 専用D1を作成し、`wrangler.jsonc`のplaceholder IDを実IDへ置き換える。
4. `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`ROCK_OPERATOR_SUB`をruntime設定として登録する。
5. 運営本人のP-256 WebAuthn hardware credentialを作成し、base64urlのcredential ID／SPKI公開鍵、RP ID、正確なHTTPS originを`OPERATOR_WEBAUTHN_*`へ登録する。private keyは登録しない。
6. D1 migration `0001`と`0002`を専用D1へ適用し、同じ配備のreadbackを保存する。
7. production AgentのStrongBox公開鍵とattestationを検証してから、端末UUID、SPKI、fingerprintを`operator_managed_devices`へ登録する。Agentが自己申告しただけの鍵を`verified`にしない。

Access設定がなければ画面assetを返さず、WebAuthn設定がなければ命令準備・発行をfail closedにします。命令は端末、事故ID、action、理由、発行・開始・失効時刻を長さ付きcanonical bytesへ固定し、利用者確認済みWebAuthn assertionを保存します。credential counterは単調増加を必須にし、同値だけでなく未使用の古いcounterも拒否します。

Agent専用`/api/device/v1/poll|ack|result`はCloudflare Access cookieではなく、登録済み端末P-256鍵によるrequest署名を検証します。method、exact path、device ID、±120秒timestamp、24-byte nonce、body digestを署名対象にし、nonce再送、query、redirect前提、8 KiB超requestを拒否します。初期化予約は取消猶予中から端末へ配って警告を出しますが、`notBefore`まではackできません。ackとresultは同一内容だけ冪等に再送できます。sanitized診断は固定field・型と2 KiBに制限します。

現在はsource、Node test、Worker dry-run、Android emulator 6/6、試験署名Pixel 10受入5/5まで完了しています。production公開trust入力の検査・RRO生成も実装済みですが、実値はまだstageしていません。production credential、D1、hostname、StrongBox attestation登録、Device Ownerでの許可操作受入が揃うまでAgent状態は`ready`になりません。静的attestation challengeは最初の単一端末preview限定で、複数端末配布にはruntimeの一回限りchallenge enrollmentが別途必要です。
