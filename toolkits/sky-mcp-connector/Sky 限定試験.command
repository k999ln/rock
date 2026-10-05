#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
exec node sky-mcp-connector/server.mjs --registry sky-mcp-connector/registry.pilot.json --pilot
