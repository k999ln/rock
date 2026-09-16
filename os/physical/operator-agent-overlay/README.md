# Production Operator Agent overlay input

The physical build must stage a reviewed `vendor/avocado-operator-agent/product.mk`
that installs a product resource overlay for `dev.rock.operator.agent`. The overlay
sets only public trust and policy values:

- exact HTTPS Operator Dock origin;
- WebAuthn credential ID, P-256 SPKI public key, RP ID and exact origin;
- exact external connector package allowlist;
- a unique server-issued base64url device-attestation challenge for this device/build;
- hardware device identity required (`true` for production);
- factory reset release gate (`false` until the physical cancellation drill passes).

Do not put the WebAuthn private key, Access token, operator identity, device private
key, Wallet material, recovery phrase, OTA key or AVB key in the overlay or Git.
The hardware credential private key remains in the operator authenticator. The
device request private key is created inside Android StrongBox on first use.

The build intentionally stops when the vendor product file is absent. A blank or
placeholder overlay is not a production configuration. The exact overlay APK and
public values must be hashed in the private release manifest before the full build.
