"""Pinned official Hermes agent and bounded tools, loaded only for Hermes."""
import json
import logging
import os
import httpx
from openai import OpenAI
from model_transport import BoundTransport
from runtime_shared import MODEL, MODEL_STATUS, ExecutionError, Stopped, live, file, operation

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
    status_token = MODEL_STATUS.set(None)
    agent = None
    stage = 'hermes_initialization_failed'
    try:
        agent = BoundAgent(base_url='https://noah-model.internal/v1', api_key='rpc', provider='custom', api_mode='chat_completions', model=MODEL,
            enabled_toolsets=['todo', 'memory'], max_iterations=4, max_tokens=1024, tool_delay=0,
            quiet_mode=True, skip_context_files=True, skip_memory=False, load_soul_identity=False,
            save_trajectories=False, checkpoints_enabled=False, platform='cron', thinking_callback=lambda *args: None,
            ephemeral_system_prompt='Use the official todo or memory tool for the request, then briefly summarize actual results in the user language. You can plan and organize notes only. No shell, external websites, or general file operations are available. Memory is for this job only. Keep tool arguments and the final summary concise. Finish within 4 model calls.')
        agent._print_fn = lambda *args, **kwargs: None
        stage = 'hermes_conversation_failed'
        result = agent.run_conversation(prompt)
        if result.get('failed') or result.get('error') or result.get('interrupted') or not result.get('completed'):
            raise ExecutionError(MODEL_STATUS.get() or 'hermes_incomplete')
        stage = 'hermes_result_invalid'
        calls = {}
        operations = []
        for message in result.get('messages', []):
            for call in message.get('tool_calls', []):
                calls[call['id']] = call['function']
            if message.get('role') == 'tool':
                call = calls.get(message.get('tool_call_id'))
                if not call or call['name'] not in {'todo', 'memory'}:
                    raise ExecutionError('hermes_unverified_tool')
                content = message.get('content', '')
                try:
                    parsed = json.loads(content)
                    ok = isinstance(parsed, dict) and not parsed.get('error') and parsed.get('success') is not False
                except ValueError:
                    ok = False
                operations.append(operation(call['name'], call['arguments'], content, ok))
        if MODEL_STATUS.get():
            raise ExecutionError(MODEL_STATUS.get())
        if not operations:
            raise ExecutionError('hermes_tool_not_called')
        if not any(op['ok'] for op in operations) or len(operations) > 12:
            raise ExecutionError('hermes_tool_failed')
        if not isinstance(result.get('final_response'), str) or not result['final_response'].strip():
            raise ExecutionError('model_empty_content')
        files = [file('plan.json', json.dumps(agent._todo_store.read(), ensure_ascii=False, indent=2))]
        for name in ['MEMORY.md', 'USER.md']:
            path = home / 'memories' / name
            if path.exists():
                # Fixed filenames in a new private directory; no user path input.
                with path.open('rb') as stream:
                    files.append(file(name, stream.read(32769)))
        return {'text': result['final_response'], 'files': files, 'operations': operations}
    except ExecutionError:
        raise
    except Exception:
        raise ExecutionError(MODEL_STATUS.get() or stage) from None
    finally:
        if agent is not None and getattr(agent, 'client', None):
            agent.client.close()
        reset_hermes_home_override(token)
        MODEL_STATUS.reset(status_token)

