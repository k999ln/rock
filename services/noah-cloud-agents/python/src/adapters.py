"""Transport/environment adapters; the pinned upstream command and agent loop run intact."""
import base64
from contextvars import ContextVar
import hashlib
import json
import logging
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
from pyodide.ffi import run_sync
import httpx
from openai import OpenAI
from mcp_server_time.server import create_server
import boss_agent_cli.commands.ai_cmd as boss_commands
import boss_agent_cli.ai.service as boss_service

# No Python sockets or native TLS are used: the only model transport is a
# request-scoped RPC capability. Cloudflare's service binding owns transport.
os.environ['HERMES_SKIP_SSL_GUARD'] = '1'
import hermes_logging
hermes_logging.setup_logging = lambda **kwargs: None
logging.disable(logging.CRITICAL)

# Package discovery is fixed, not user-installed plugins or host tools.
import tools.registry
import tools.todo_tool
import tools.memory_tool
tools.registry.discover_builtin_tools = lambda tools_dir=None: ['todo_tool', 'memory_tool']
import hermes_cli.plugins
hermes_cli.plugins.discover_plugins = lambda *args, **kwargs: []
from hermes_constants import set_hermes_home_override, reset_hermes_home_override
from run_agent import AIAgent

MODEL = '@cf/openai/gpt-oss-20b'
CAPABILITY = ContextVar('noah_model_capability')
OUTPUT = ContextVar('noah_boss_output')
TIME = create_server('UTC')
# The SDK sends synchronous functions to native threads, which workerd does
# not provide. Retain the official schema/validation/result conversion and
# execute these small pure time functions inline through an async wrapper.
def inline_time_function(fn):
    async def invoke(**kwargs):
        return fn(**kwargs)
    return invoke
for name in ['get_current_time', 'convert_time', 'get_time_ago']:
    tool = TIME._tool_manager.get_tool(name)
    tool.fn = inline_time_function(tool.fn)
    tool.is_async = True

class Stopped(BaseException):
    """Bypass upstream model retries after the coordinator closes admission."""

def live():
    try:
        run_sync(CAPABILITY.get().live())
    except Exception as exc:
        raise Stopped('Execution stopped or expired') from exc

def model_response(payload):
    live()
    try:
        body = json.loads(run_sync(CAPABILITY.get().complete(json.dumps(payload))))
    except Exception as exc:
        raise Stopped('Model admission closed') from exc
    live()
    body.setdefault('id', 'noah')
    body.setdefault('object', 'chat.completion')
    body.setdefault('created', 0)
    body.setdefault('model', MODEL)
    for index, choice in enumerate(body.get('choices', [])):
        choice.setdefault('index', index)
        choice.get('message', {}).setdefault('role', 'assistant')
    return body

class BoundTransport(httpx.BaseTransport):
    def handle_request(self, request):
        if request.method != 'POST' or str(request.url) != 'https://noah-model.internal/v1/chat/completions':
            raise Stopped('Unsupported model endpoint')
        return httpx.Response(200, request=request, json=model_response(json.loads(request.content)))

class BossHttp:
    def __getattr__(self, name):
        return getattr(httpx, name)

    def post(self, url, *, json, **kwargs):
        with httpx.Client(transport=BoundTransport()) as client:
            return client.post(url, json=json)

boss_service.httpx = BossHttp()

def boss_output(ctx, command, data, **kwargs):
    OUTPUT.set(data)

boss_commands.handle_output = boss_output

def boss_error(ctx, command, **kwargs):
    # Do not print prompts, local paths, or upstream errors into shared logs.
    raise ValueError('Official boss command did not return a valid preparation')

boss_commands.handle_error_output = boss_error

def file(name, value):
    data = value if isinstance(value, bytes) else value.encode('utf-8')
    if len(data) > 32768:
        raise ValueError('Result file exceeds limit')
    return {'name': name, 'base64': base64.b64encode(data).decode(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def operation(name, arguments, result, ok=True):
    return {'name': name, 'ok': ok, 'inputSha256': hashlib.sha256(arguments.encode()).hexdigest(), 'resultSha256': hashlib.sha256(result.encode()).hexdigest()}

class BoundAgent(AIAgent):
    def _create_openai_client(self, client_kwargs, *, reason, shared):
        values = dict(client_kwargs)
        values['http_client'] = httpx.Client(transport=BoundTransport())
        values['max_retries'] = 0
        return OpenAI(**values)

    def _execute_tool_calls(self, assistant_message, messages, effective_task_id, api_call_count=0):
        if len(assistant_message.tool_calls or []) > 4:
            raise Stopped('Tool batch limit')
        for call in assistant_message.tool_calls or []:
            if call.function.name not in {'todo', 'memory'}:
                raise Stopped('Unsupported Hermes tool')
        live()
        # These bounded local tools do not yield to network I/O. Retain the
        # official normalized response and sequential dispatch intact.
        self._execute_tool_calls_sequential(assistant_message, messages, effective_task_id, api_call_count)
        live()

def hermes(prompt, home):
    (home / 'config.yaml').write_text('model:\n  context_length: 65536\ncompression:\n  enabled: false\nmemory:\n  memory_enabled: true\n  user_profile_enabled: true\n', encoding='utf-8')
    token = set_hermes_home_override(home)
    agent = None
    try:
        agent = BoundAgent(base_url='https://noah-model.internal/v1', api_key='rpc', provider='custom', api_mode='chat_completions', model=MODEL,
            enabled_toolsets=['todo', 'memory'], max_iterations=4, max_tokens=1024, tool_delay=0,
            quiet_mode=True, skip_context_files=True, skip_memory=False, load_soul_identity=False,
            save_trajectories=False, checkpoints_enabled=False, platform='cron', thinking_callback=lambda *args: None,
            ephemeral_system_prompt='Use the official todo or memory tool for the request, then summarize actual results in the user language. You can plan and organize notes only. No shell, external websites, or general file operations are available. Memory is for this job only. Finish within 4 model calls.')
        agent._print_fn = lambda *args, **kwargs: None
        result = agent.run_conversation(prompt)
        if result.get('failed') or result.get('error') or result.get('interrupted') or not result.get('completed'):
            raise ValueError('Hermes did not complete')
        calls = {}
        operations = []
        for message in result.get('messages', []):
            for call in message.get('tool_calls', []):
                calls[call['id']] = call['function']
            if message.get('role') == 'tool':
                call = calls.get(message.get('tool_call_id'))
                if not call or call['name'] not in {'todo', 'memory'}:
                    raise ValueError('Unverified Hermes operation')
                content = message.get('content', '')
                try:
                    parsed = json.loads(content)
                    ok = isinstance(parsed, dict) and not parsed.get('error') and parsed.get('success') is not False
                except ValueError:
                    ok = False
                operations.append(operation(call['name'], call['arguments'], content, ok))
        if not any(op['ok'] for op in operations) or len(operations) > 12:
            raise ValueError('No successful official Hermes tool')
        files = [file('plan.json', json.dumps(agent._todo_store.read(), ensure_ascii=False, indent=2))]
        for name in ['MEMORY.md', 'USER.md']:
            path = home / 'memories' / name
            if path.exists():
                # Fixed filenames in a new private directory; no user path input.
                with path.open('rb') as stream:
                    files.append(file(name, stream.read(32769)))
        return {'text': result['final_response'], 'files': files, 'operations': operations}
    finally:
        if agent is not None and getattr(agent, 'client', None):
            agent.client.close()
        reset_hermes_home_override(token)

def boss(prompt, home):
    # Precreate the per-job salt; the upstream hard-link publication primitive
    # is unavailable on Emscripten. No real provider credential is stored.
    auth = home / 'auth'
    auth.mkdir(mode=0o700)
    salt = auth / 'salt'
    salt.write_bytes(os.urandom(16))
    salt.chmod(0o600)
    output_token = OUTPUT.set(None)
    try:
        context = {'data_dir': home, 'json': True}
        boss_commands.ai_group.main(['config', '--provider', 'custom', '--model', MODEL, '--api-key', 'rpc', '--base-url', 'https://noah-model.internal/v1', '--max-tokens', '1024'], obj=context, standalone_mode=False)
        OUTPUT.set(None)
        # Input is always a file written by the adapter; an initial @ supplied
        # by a user must never become a path in the CLI's @file syntax.
        request = home / 'request.txt'
        request.write_text(prompt, encoding='utf-8')
        boss_commands.ai_group.main(['interview-prep', '@' + str(request), '--count', '5'], obj=context, standalone_mode=False)
        result = OUTPUT.get()
        if not isinstance(result, dict) or not isinstance(result.get('job_summary'), str) or not isinstance(result.get('questions'), list) or len(result['questions']) != 5 or not isinstance(result.get('preparation_tips'), list):
            raise ValueError('Incomplete boss preparation')
        if any(not isinstance(q, dict) or not isinstance(q.get('question'), str) or not q['question'].strip() for q in result['questions']):
            raise ValueError('Invalid boss question')
        serialized = json.dumps(result, ensure_ascii=False, indent=2)
        lines = [result['job_summary']]
        for index, question in enumerate(result['questions'], 1):
            lines.extend(['', f'{index}. {question["question"]}'])
            if isinstance(question.get('framework'), str): lines.append(question['framework'])
        lines.extend(['', '準備のポイント', *[str(t) for t in result['preparation_tips']]])
        return {'text': '\n'.join(lines), 'files': [file('interview-preparation.json', serialized)], 'operations': [operation('ai-interview-prep', prompt, serialized)]}
    finally:
        OUTPUT.reset(output_token)
