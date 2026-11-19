"""Run an ephemeral official OpenFang daemon and its file-only agent API."""
import json
import os
import pathlib
import subprocess
import time
import urllib.request

home = pathlib.Path('/tmp/openfang')
home.mkdir(exist_ok=True)
os.environ['OPENFANG_HOME'] = str(home)
(home / 'config.toml').write_text(f'''home_dir = "/tmp/openfang"
data_dir = "/tmp/openfang/data"
api_listen = "127.0.0.1:4200"
network_enabled = false
log_level = "error"
[default_model]
provider = "openai"
model = "{os.environ['NOAH_MODEL']}"
base_url = "{os.environ['OPENAI_BASE_URL']}"
api_key_env = "OPENAI_API_KEY"
''')
manifest = f'''name = "noah-work"
version = "1.0.0"
description = "Ephemeral file work inside the Noah sandbox"
module = "builtin:chat"
workspace = "/workspace"
[model]
provider = "openai"
model = "{os.environ['NOAH_MODEL']}"
base_url = "{os.environ['OPENAI_BASE_URL']}"
api_key_env = "OPENAI_API_KEY"
max_tokens = 2048
system_prompt = "Use file_write to save requested files in /workspace. Do not just describe actions."
[capabilities]
tools = ["file_read", "file_write", "file_list"]
network = []
memory_read = []
memory_write = []
[autonomous]
max_iterations = 6
'''

def api(path, body=None):
    request = urllib.request.Request('http://127.0.0.1:4200/api/' + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)

daemon = subprocess.Popen(['openfang', 'start'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        if daemon.poll() is not None:
            raise RuntimeError('OpenFang daemon exited during startup')
        try:
            api('health')
            break
        except (OSError, ValueError):
            time.sleep(0.25)
    agent = api('agents', {'manifest_toml': manifest})
    response = api(f"agents/{agent['agent_id']}/message", {'message': pathlib.Path('/tmp/request.txt').read_text()})
    if response.get('error'):
        raise RuntimeError('OpenFang agent failed')
    # The daemon's provider-price estimate is not a payment or our local cost.
    print(response.get('response', response.get('reply', '')))
finally:
    daemon.terminate()
    try:
        daemon.wait(timeout=3)
    except subprocess.TimeoutExpired:
        daemon.kill()
        daemon.wait()
