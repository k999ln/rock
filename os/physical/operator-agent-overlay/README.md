# Production Operator Agent overlay input

The physical build uses `scripts/stage-operator-agent-overlay.py` to create a
reviewed `vendor/avocado-operator-agent/product.mk` and static product RRO for
`dev.rock.operator.agent`. The input JSON must remain outside the Rock repository.
The overlay sets only public trust and policy values:

- exact HTTPS Operator Dock origin;
- WebAuthn credential ID, P-256 SPKI public key, RP ID and exact origin;
- exact external connector package allowlist;
- a unique server-issued base64url device-attestation challenge for this device/build;
- hardware device identity required (`true` for production);
- factory reset release gate (`false` until the physical cancellation drill passes).

For the first Pixel 10 preview, the input scope is exactly
`pixel-10-frankel-gl066-single-device-preview`. The 32-byte challenge must be
fresh for that one device/build and must not be reused in a multi-device image.
A later multi-device release requires a runtime, one-time server challenge and
is not represented as implemented by this staging path.

Do not put the WebAuthn private key, Access token, operator identity, device private
key, Wallet material, recovery phrase, OTA key or AVB key in the overlay or Git.
The hardware credential private key remains in the operator authenticator. The
device request private key is created inside Android StrongBox on first use.

The build intentionally stops when the vendor product file is absent. A blank or
placeholder overlay is not a production configuration. The stager rejects HTTP,
URL paths, mismatched RP/origin, non-P-256 SPKI, malformed base64url, product
packages in the connector quarantine list, disabled StrongBox, enabled factory
reset, symlinks, extra files and post-stage modification. The exact overlay APK
and public values must be hashed in the private release manifest before the full
build.

Example inspection and staging commands (with a real external input path):

```sh
python3 scripts/stage-operator-agent-overlay.py inspect /secure-input/operator-public.json
python3 scripts/stage-operator-agent-overlay.py stage /absolute/aosp/tree /secure-input/operator-public.json
python3 scripts/stage-operator-agent-overlay.py verify /absolute/aosp/tree
```

Successful staging does not mean the production WebAuthn credential exists, the
StrongBox certificate chain has been verified, the Agent is Device Owner, or the
Dock is deployed. Those remain separate acceptance gates.
