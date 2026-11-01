# 30 account の続き — 別端末で同じ Job・会話を続ける

正本: docs/structure/02-rockstaros.md §3。

## やること
1. `docs/rockstaros/continuity-contract.md`: account に紐づくもの（identity・entitlement・Work/Job/Receipt・Eve 文脈・Memory・Wallet・権限）と、端末に紐づくもの（mii のキャリブレーション、local cache）を表で固定。「cloud が正本、端末は cache」。
2. API: `GET /api/account/continuity` — 進行中 Job、未読の Eve 会話、保留中の承認、を 1 回で返す（既存 lib/eve-pending-recovery.ts, lib/work-store.ts を束ねる）。
3. 端末登録: `POST /api/devices/attach` に `profile: phone|mii|pro|pixel-native` と束縛キー（EID/ICCID, attestation, TPM）を受ける形に揃える（既存 lib/rockstar-device-link.ts を拡張）。
4. tests/account-continuity.test.mjs: 端末 A で Job を開始 → 端末 B で continuity を取得 → 同じ Job を再開 → Receipt が 1 つだけ出る。
5. オフライン: mii Hub がオフライン中に完了した Job の Receipt を復帰時に同期する規約（重複防止キー）を contract に書く。

## 合格条件
- テスト通過。contract に未決があれば末尾に列挙。
