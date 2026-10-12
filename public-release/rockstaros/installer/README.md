# RockstarOS Public Preview Installer

This installer sets up the runnable Sky + Zema public preview on the local
computer. It does not install or replace the host operating system.

The native QEMU image is not included. Its current release candidate has not
completed the product-license, production-signing, signed-candidate acceptance,
and public-release gates.

## Requirements

- macOS or Linux;
- Node.js 20 or newer;
- a local copy of this repository.

## Install

```bash
./installer/install-public-preview.sh
~/.local/share/rockstaros-public-preview/bin/rockstaros-public-preview
```

Then open <http://127.0.0.1:4173>.

Use a separate destination when preferred:

```bash
./installer/install-public-preview.sh --prefix /absolute/new/directory
```

The installer refuses to replace a non-empty destination.

## Optional anonymous tool events

No data is sent by default. A distributor may make an HTTPS receiver available:

```bash
ROCKSTAROS_TELEMETRY_ENDPOINT=https://example.com/v1/public-tool-events \
  ~/.local/share/rockstaros-public-preview/bin/rockstaros-public-preview
```

The user must still enable event sharing in the preview. Requests, chat text,
results, files, credentials, and personal information are excluded from the
public event contract.
