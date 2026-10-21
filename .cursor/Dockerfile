FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
