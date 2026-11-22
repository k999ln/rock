"""Fixed official stdio profiles; no command, package, URL or environment from a request."""
import json
import os
import pathlib
import queue
import subprocess
import sys
import threading
import urllib.request

COMMANDS = {
    'time': ['/opt/time/bin/python', '-m', 'mcp_server_time', '--local-timezone=UTC'],
    'thinking': ['/usr/bin/node', '/opt/mcp-node/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js'],
}


class MCP:
    def __init__(self, profile):
        self.process = subprocess.Popen(COMMANDS[profile], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, env=dict(os.environ, DISABLE_THOUGHT_LOGGING='true'))
        self.responses = queue.Queue(maxsize=32)
        self.next_id = 0

        def read():
            try:
                while True:
                    line = self.process.stdout.readline(131073)
                    if not line:
                        break
                    if len(line) > 131072:
                        raise ValueError('MCP output limit')
                    value = json.loads(line)
                    # A child cannot ask the host to run commands or grant credentials.
                    if isinstance(value, dict) and 'method' in value:
                        if 'id' in value:
                            raise ValueError('MCP server request unsupported')
                        continue
                    self.responses.put(value, timeout=2)
            except Exception:
                self.responses.put(None, timeout=2)
        threading.Thread(target=read, daemon=True).start()

    def send(self, value):
        data = json.dumps(value).encode() + b'\n'
        if len(data) > 131072:
            raise ValueError('MCP input limit')
        self.process.stdin.write(data)
        self.process.stdin.flush()

    def rpc(self, method, params):
        self.next_id += 1
        self.send({'jsonrpc': '2.0', 'id': self.next_id, 'method': method, 'params': params})
        result = self.responses.get(timeout=25)
        if not isinstance(result, dict) or result.get('id') != self.next_id or 'error' in result:
            raise ValueError('MCP response invalid')
        return result['result']

    def tools(self):
        self.rpc('initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'Noah', 'version': '1'}})
        self.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        tools = self.rpc('tools/list', {}).get('tools')
        if not isinstance(tools, list) or not 0 < len(tools) <= 32:
            raise ValueError('MCP tools invalid')
        return tools

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


def main():
    client = MCP(os.environ['NOAH_CLOUD_PROFILE'])
    try:
        tools = client.tools()
        if '--probe' in sys.argv:
            return
        prompt = pathlib.Path('/tmp/request.txt').read_text()
        messages = [{'role': 'system', 'content': 'Use the provided official tools when needed. Give the user the useful result in their language. Never claim an operation succeeded unless its tool returned successfully.'},
                    {'role': 'user', 'content': prompt}]
        functions = [{'type': 'function', 'function': {'name': t['name'], 'description': t.get('description', ''), 'parameters': t['inputSchema']}} for t in tools]
        names = {t['name'] for t in tools}
        for _ in range(8):
            body = json.dumps({'model': 'noah-cloud', 'messages': messages, 'tools': functions, 'stream': False}).encode()
            request = urllib.request.Request('http://127.0.0.1:8080/v1/chat/completions', body, {'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=105) as response:
                data = response.read(131073)
            if len(data) > 131072:
                raise ValueError('Model response limit')
            message = json.loads(data)['choices'][0]['message']
            messages.append(message)
            calls = message.get('tool_calls', [])
            if not calls:
                text = message.get('content')
                if not isinstance(text, str) or not text.strip():
                    raise ValueError('No final response')
                pathlib.Path('/tmp/final-response.txt').write_text(text[:32000])
                return
            if len(calls) > 8:
                raise ValueError('Tool call limit')
            for call in calls:
                name = call['function']['name']
                if name not in names:
                    raise ValueError('Unknown tool')
                args = json.loads(call['function']['arguments'])
                if not isinstance(args, dict):
                    raise ValueError('Invalid arguments')
                result = client.rpc('tools/call', {'name': name, 'arguments': args})
                messages.append({'role': 'tool', 'tool_call_id': call['id'], 'content': json.dumps(result)})
        raise ValueError('Model call limit')
    finally:
        client.close()


if __name__ == '__main__':
    main()
