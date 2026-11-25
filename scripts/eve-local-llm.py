#!/usr/bin/env python3
"""手元の Qwen を、Eve の部品の確かめ用に HTTP で立てる（task 130。本人の決定「LLM は本人の許可までは手元の Qwen」）。

開発の手元だけで使う。外へは通信しない。127.0.0.1 だけで待つ。
使い方: python3 scripts/eve-local-llm.py /path/to/qwen2.5-3b-instruct-q4_k_m.gguf [port]
  POST /chat  {"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."}],"maxTokens":600,"temperature":0}
  → {"text":"...","model":"<ファイル名>","modelSha256":"<先頭 16 文字>"}
決まった結果にするため、温度は 0、seed は固定。
"""
import hashlib
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from llama_cpp import Llama

path = sys.argv[1]
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8787
digest = hashlib.sha256()
with open(path, 'rb') as f:
    for block in iter(lambda: f.read(1 << 20), b''):
        digest.update(block)
model_sha = digest.hexdigest()
llm = Llama(model_path=path, n_ctx=4096, n_threads=os.cpu_count() or 2, seed=7, verbose=False)
lock = Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        if self.path != '/chat':
            self.send_error(404)
            return
        size = int(self.headers.get('content-length', '0'))
        if size <= 0 or size > 200_000:
            self.send_error(413)
            return
        body = json.loads(self.rfile.read(size))
        messages = body.get('messages')
        if not isinstance(messages, list) or not messages:
            self.send_error(400)
            return
        with lock:
            out = llm.create_chat_completion(
                messages=messages,
                max_tokens=min(int(body.get('maxTokens', 600)), 2000),
                temperature=float(body.get('temperature', 0)),
                seed=7,
            )
        text = out['choices'][0]['message']['content'] or ''
        data = json.dumps({'text': text, 'model': os.path.basename(path), 'modelSha256': model_sha[:16]}, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header('content-type', 'application/json; charset=utf-8')
        self.send_header('content-length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
