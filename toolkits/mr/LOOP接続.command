#!/bin/zsh
cd -- "${0:A:h}" || exit 1
python3 mcp_server.py --http
