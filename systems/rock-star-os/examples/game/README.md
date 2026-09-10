# Public synthetic Game SDK example

Use a fresh owned Linux environment. This is an internal development fixture:
public credentials, software test authenticator, PIN `0000`, test funds and a
fixed rate. It transfers no real money and connects no commercial game.
The player example imports only client/protocol/authenticator modules. Its
configuration contains no author credential, Wallet signing key or Game ledger.
The separate author example can request a quote and read its outcome; it cannot
approve, credit Wallet or sign a Game grant.

From `systems/rock-star-os`, after installing Python3, OpenSSL and the repository's
native runtime dependencies, create the authority directory mode0700, copy
`os/game_exchange/fixtures/sandbox-20260910.json` to
`/var/tmp/rockstaros-preview-authority/sandbox.json` mode0600, then run:

```sh
python3 os/game_exchange/sandbox.py prepare --config /var/tmp/rockstaros-preview-authority/sandbox.json
python3 os/game_exchange/sandbox.py start --config /var/tmp/rockstaros-preview-authority/sandbox.json
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player wallet --accept-public-simulation
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player connect --game a --accept-public-simulation
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player quote --game a --exchange-id my-first-purchase
```

Review the quote: principal100 cents, test Game fee3, total103,10 purchased units,
`COIN_A`, player `alice`, expiry and immutable quote identity. Only after review:

```sh
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player approve --game a --exchange-id my-first-purchase --accept-public-simulation
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player status --game a --exchange-id my-first-purchase
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player history
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player diagnose
```

The two configuration inputs are the pinned public JSON and a new private client
state path. The fixed native example also reads the committed CA certificate.
Game, exchange ID and explicit consent are individual operation inputs.
`wallet` explicitly registers, enrolls the local software authenticator, accepts
Wallet terms and credits10000 test cents once. It does not accept monthly
billing consent. Repeat with Game `b` and the same exchange ID to exercise the
independent namespace. Preserve the whole client directory across restarts.
A new directory does not replace an already enrolled authenticator.

The author can use the returned connection UUID:

```sh
python3 examples/game/author.py --config examples/game/author-public.json --state /var/tmp/my-game-author-a quote --game a --connection-id CONNECTION_UUID --exchange-id my-first-purchase --key author-first
python3 examples/game/author.py --config examples/game/author-public.json --state /var/tmp/my-game-author-a status --game a --connection-id CONNECTION_UUID --exchange-id my-first-purchase
```

Each role has its own private journal. `diagnose` reports verified owner TLS or
`OWNER_TLS_UNAVAILABLE` and the exact retained pending operations/keys. An
unreachable authority or unknown reply never releases a hold. Restore the
configured service, then explicitly recover the original request:

```sh
python3 examples/game/owner.py --config examples/game/owner-public.json --state /var/tmp/my-game-player retry --game a --operation game.exchange.quote --key my-first-purchase
```

Do not change an old key's payload, delete its journal, create a replacement
purchase or treat a local receipt as current authority state. An expired new
approval requires a new reviewed intent; completed original requests remain
exactly recoverable subject to current owner/author access. Connection recovery
on another enrolled device uses `ReferenceOwnerClient.recover_connection`, with
that device's own transport and authenticator. It preserves the original
connection consent and demands a new device-specific purchase approval.

For an automated **internal** fresh-Linux onboarding measurement, keep a new
sandbox empty and stopped and run:

```sh
python3 examples/game/acceptance.py --sandbox-config /var/tmp/rockstaros-preview-authority/sandbox.json --work /var/tmp/game-sdk-onboarding-01
```

This measures registration through first terminal purchase, stops only the
owned authority to produce a real TLS failure, diagnoses its pending quote,
restarts it and retries exactly that quote before a second approved purchase.
It records command output, source hashes, setting count, actual nonblank example
code lines, machine elapsed first exchange/diagnosis/recovery and stopped
snapshot hashes. It leaves the authority stopped. Existing TLS tests separately
cover an actual committed response loss and process SIGKILL; the offline sample
failure does not claim the request reached the server. These are internal
machine measurements, not external author feedback or human task timings.
