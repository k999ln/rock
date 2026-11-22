FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
ARG AGENT
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep && rm -rf /var/lib/apt/lists/*
RUN case "$AGENT" in \
  aider) pip install --no-cache-dir 'aider-chat==0.86.2' ;; \
  gptme) pip install --no-cache-dir 'gptme==0.36.0' ;; \
  openhands) pip install --no-cache-dir 'openhands-sdk==1.62.0' 'openhands-tools==1.62.0' ;; \
  nanobot) pip install --no-cache-dir 'nanobot-ai==0.4.1' ;; \
  hermes) pip install --no-cache-dir 'https://files.pythonhosted.org/packages/e5/30/c85be8290e9565dc3c7a9720e93f3e59e09b1b163487be4946c3aa848f80/hermes_agent-0.19.0-py3-none-any.whl#sha256=bd0bac012aee38a60894781f4597dc29ee7bedb3448540249921f10d3bef327f' ;; \
  data-analysis) pip install --no-cache-dir 'numpy==1.26.2' 'pandas==2.1.4' 'matplotlib==3.9.4' 'duckdb==1.3.2' 'ipython==8.32.0' 'openai==2.24.0' 'pyyaml==6.0.3' 'python-dotenv==1.2.2' 'python-docx==1.1.2' && python -c "import hashlib,urllib.request,tarfile,io; b=urllib.request.urlopen('https://codeload.github.com/li-xiu-qi/data_analysis_agent/tar.gz/d0991fca3bb3d5431237053830b12b962268f6ad', timeout=120).read(); assert hashlib.sha256(b).hexdigest() == '9e6243af3af0bcb187590ad7517560109fee21bcfab3d6a9b927db5154b6ce0c'; tarfile.open(fileobj=io.BytesIO(b)).extractall('/opt/upstream', filter='data')" ;; \
  openfang) python -c "import hashlib,urllib.request,tarfile,io; b=urllib.request.urlopen('https://github.com/RightNow-AI/openfang/releases/download/v0.6.9/openfang-aarch64-unknown-linux-gnu.tar.gz', timeout=120).read(); assert hashlib.sha256(b).hexdigest() == '8eab852ba78983c3cf334b81270a14c117c8cb14cc8241343fd1b4576db64ae0'; t=tarfile.open(fileobj=io.BytesIO(b)); m=next(m for m in t.getmembers() if m.name.split('/')[-1]=='openfang' and m.isfile()); open('/usr/local/bin/openfang','wb').write(t.extractfile(m).read())" && chmod 755 /usr/local/bin/openfang ;; \
  goose) python -c "import hashlib,urllib.request,tarfile,io; b=urllib.request.urlopen('https://github.com/aaif-goose/goose/releases/download/v1.59.1/goose-aarch64-unknown-linux-musl.tar.gz', timeout=120).read(); assert hashlib.sha256(b).hexdigest() == 'e8c8c67697e911cba4c7d72b29447591b54a72584d8223c8123ef749e4a157a1'; t=tarfile.open(fileobj=io.BytesIO(b)); m=next(m for m in t.getmembers() if m.name.split('/')[-1]=='goose' and m.isfile()); open('/usr/local/bin/goose','wb').write(t.extractfile(m).read())" && chmod 755 /usr/local/bin/goose ;; \
  *) exit 1 ;; esac
RUN if [ "$AGENT" = openhands ]; then apt-get update && apt-get install -y --no-install-recommends tmux && rm -rf /var/lib/apt/lists/*; fi
ENV TIKTOKEN_CACHE_DIR=/opt/noah-token-cache
RUN case "$AGENT" in aider|gptme|openhands|nanobot) python -c "import tiktoken; tiktoken.get_encoding('cl100k_base'); tiktoken.get_encoding('o200k_base')" ;; esac
RUN pip freeze > /opt/dependencies.txt && useradd --uid 10001 --create-home agent
COPY runner.py nanobot_sdk.py openhands_sdk.py hermes_sdk.py data_analysis_sdk.py openfang_cli.py /opt/noah/
ENV HOME=/home/agent PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DO_NOT_TRACK=1 LITELLM_LOCAL_MODEL_COST_MAP=True
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["python", "/opt/noah/runner.py"]
