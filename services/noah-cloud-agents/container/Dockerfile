FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS node
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/hermes && /opt/hermes/bin/pip install --no-cache-dir 'https://files.pythonhosted.org/packages/e5/30/c85be8290e9565dc3c7a9720e93f3e59e09b1b163487be4946c3aa848f80/hermes_agent-0.19.0-py3-none-any.whl#sha256=bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f' && /opt/hermes/bin/pip freeze > /opt/hermes/dependencies.txt
RUN python -m venv /opt/boss && /opt/boss/bin/pip install --no-cache-dir 'https://files.pythonhosted.org/packages/35/0c/e5fe7564535bc827e16f34ef73853eda43bf30d4fadd3c1d2ae2d1677d0f/boss_agent_cli-3.4.151-py3-none-any.whl#sha256=7d4b8834ab195964167c4dd8b07df82e4cc83c7f801124307ff8f386bbc4bef4' && /opt/boss/bin/pip freeze > /opt/boss/dependencies.txt
RUN python -m venv /opt/time && /opt/time/bin/pip install --no-cache-dir 'https://files.pythonhosted.org/packages/a6/a1/b9358dc4f5c041ec65bf3c3373e0004f567c35b0b03ad509a75dc3e06ea5/mcp_server_time-2026.11.18-py3-none-any.whl#sha256=acb3ba2e0faf812ce49989fbe74d363501cf7720c8d7a103debef9815e838a34' && /opt/time/bin/pip freeze > /opt/time/dependencies.txt
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
COPY mcp-node/package*.json /opt/mcp-node/
RUN cd /opt/mcp-node && npm ci --ignore-scripts --omit=dev && npm cache clean --force
RUN useradd --uid 10001 --create-home agent && mkdir /workspace && chown 10001:10001 /workspace
COPY server.py hermes_sdk.py boss_cli.py mcp_stdio.py /opt/noah/
ENV HOME=/home/agent PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DO_NOT_TRACK=1
USER 10001:10001
WORKDIR /workspace
EXPOSE 8080
ENTRYPOINT ["python", "/opt/noah/server.py"]
