FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/hermes && /opt/hermes/bin/pip install --no-cache-dir 'https://files.pythonhosted.org/packages/e5/30/c85be8290e9565dc3c7a9720e93f3e59e09b1b163487be4946c3aa848f80/hermes_agent-0.19.0-py3-none-any.whl#sha256=bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f' && /opt/hermes/bin/pip freeze > /opt/hermes/dependencies.txt
RUN python -m venv /opt/boss && /opt/boss/bin/pip install --no-cache-dir 'https://files.pythonhosted.org/packages/35/0c/e5fe7564535bc827e16f34ef73853eda43bf30d4fadd3c1d2ae2d1677d0f/boss_agent_cli-3.4.151-py3-none-any.whl#sha256=7d4b8834ab195964167c4dd8b07df82e4cc83c7f801124307ff8f386bbc4bef4' && /opt/boss/bin/pip freeze > /opt/boss/dependencies.txt
RUN useradd --uid 10001 --create-home agent && mkdir /workspace && chown 10001:10001 /workspace
COPY server.py hermes_sdk.py boss_cli.py /opt/noah/
ENV HOME=/home/agent PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DO_NOT_TRACK=1
USER 10001:10001
WORKDIR /workspace
EXPOSE 8080
ENTRYPOINT ["python", "/opt/noah/server.py"]
