# Native ATM owner page

This is a native Cairo/evdev page of Rock star os, using the existing authenticated Unix platform socket. It is a simulator only; no bank or real ATM is connected. Test balances come from Wallet. Registration and device eligibility are required for a new reservation. Existing reservations remain accessible for cancellation after eligibility expires.

Wallet's header opens **ATM**. An amount from USD 10 through 500, in steps of 10, is reserved against the fixed development destination `SIM-ATM-001` only after a separate amount confirmation. Cancellation uses the owner's resolution operation; it cannot assert a cash payout. If a code has already been consumed, the backend retains an unknown remainder for reconciliation.

Current authenticated issuance first obtains `wallet.atm.quote` with the chosen
`amount_minor`, `atm_id`, and distinct quote/issue request keys. The native PIN
page shows the quote amount, Rock fee (0), total hold and expected test cash;
`auth.get` produces the public software test assertion. Only then does
`wallet.atm.issue` send the original issue key, `quote_id` and credential.
`wallet.atm.cancel` (`withdrawal_id`, `key`), `wallet.atm.status`
(`withdrawal_id`), and `wallet.atm.history` (`limit:50`) retain `v:1` and `op`.
Owner/device/actor identities or actor tokens are never accepted from the UI.
Socket peer UID and all frame limits remain unchanged. Unavailable mutation
replies retain the complete original request and key; state reads cannot resolve
an unknown mutation by themselves.

The issuance receipt is immutable history, never current status. The UI separately obtains the selected reservation's status before enabling code display. The raw code stays only in UI memory and is hidden initially, on navigation, on errors, at expiry, and when a cancellation is submitted. A saved status is discarded on communication failure. Reconnecting with a snapshot alone cannot re-enable the code. Unresolved or queued mutations also disable display. An explicit reveal requires matching issuance/status reservation ID and code hash, current `code_usable`, no consumption, and an unexpired deadline. After restarting the UI, history has no raw code to reveal. The UI does not log or export the raw code; the backend's private immutable receipt remains its responsibility.

At 720×960 with no error banner and scroll zero, the current authenticated
sequence uses Wallet ATM `(531,26)`, quote `(360,640)`, quote PIN `(360,536)`,
and signing `(520,833)`. After normal page polling has obtained current status,
status is `(360,725)` and cancel `(360,651)`. Cancel is direct. Raw-code reveal
occupies y551–603 and is never clicked by either evidence sequence. A pending
status read has a different interim button and is not an issuance-state proof.
Error banners move body controls down 42 pixels. `wallet_replay.py` fixes the
reviewed steps; `test_wallet_replay.py` checks them against actual C hitboxes,
authenticated Wallet fixtures and normal status reads, including old-point
rejection. Both live verifiers keep fourteen capture contracts and independent
durable-stage waits. See the [host regression instructions](README.md#native-wallet-registration-and-monthly-simulator-flow).

`test_atm.inc` checks amounts, missing eligibility, confirmation dismissal, request field limits, lost-reply identity reuse, hidden codes, stale status invalidation, cancellation after eligibility expiry, and the exact hitboxes. `evidence/atm-unit-preview/` contains clearly labeled unit fixtures, not boot evidence. Actual boot verification is provided separately by `guest-ui-atm-evidence.py` and `verify-atm-ui.py`; business mutations originate only from native input.

# Read refresh and user input

The native loop has one IPC worker. A read in progress now leaves mutation controls available and captures at most one complete user request, including its original random key and input. After that read completes, the loop sends the saved request before scheduling another periodic refresh. Further mutations are disabled while this one is queued or in flight. A failed read or a local worker refusal retains an explicitly unsent request for the user's same-key retry. Queued inputs are not reconstructed from later edits. This addresses the demonstrated source path that previously discarded a click during periodic reads; the separate fast-pointer timing observation is not attributed to that cause without an actual new-image replay.
