"""Official CowAgent loop/file tools; Noah supplies only a fixed model transport."""
import json
import logging
import os
from pathlib import Path
import sys
import urllib.request
from urllib.parse import urlsplit

SOURCE_PIN = 'bcc36de52ca17b45d1132f388a04b7a456bd3f95'
MODEL = 'qwen2.5-tools:1.5b-v1'


def validate_route(base, model):
    url = urlsplit(base)
    if (url.scheme != 'http' or url.hostname != '127.0.0.1' or not url.port
            or url.path != '/v1' or url.query or url.fragment or url.username
            or url.password or model != MODEL):
        raise ValueError('Only the managed local Tool model is available')


def text_blocks(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list) and all(isinstance(b, dict) and b.get('type') == 'text'
                                     and isinstance(b.get('text'), str) for b in value):
        return '\n'.join(b['text'] for b in value)
    raise ValueError('Unsupported model content')


def request_payload(request, model):
    """Translate Cow's native message blocks, preserving Tool call identities."""
    messages = []
    system = getattr(request, 'system', None)
    if system:
        messages.append({'role': 'system', 'content': text_blocks(system)})
    for message in request.messages:
        role = message.get('role')
        if role not in ('user', 'assistant', 'system'):
            raise ValueError('Unsupported message role')
        content = message.get('content', '')
        if isinstance(content, str):
            messages.append({'role': role, 'content': content})
            continue
        if not isinstance(content, list):
            raise ValueError('Unsupported message content')
        text, calls, results = [], [], []
        for block in content:
            kind = block.get('type')
            if kind == 'text':
                text.append(text_blocks([block]))
            elif kind == 'tool_use' and role == 'assistant':
                if not isinstance(block.get('id'), str) or not isinstance(block.get('name'), str) or not isinstance(block.get('input'), dict):
                    raise ValueError('Invalid Tool call')
                calls.append({'id': block['id'], 'type': 'function', 'function': {
                    'name': block['name'], 'arguments': json.dumps(block['input'])}})
            elif kind == 'tool_result' and role == 'user':
                if not isinstance(block.get('tool_use_id'), str):
                    raise ValueError('Missing Tool identity')
                results.append({'role': 'tool', 'tool_call_id': block['tool_use_id'],
                                'content': text_blocks(block.get('content', ''))})
            else:
                raise ValueError('Unsupported message block')
        if text or calls or not results:
            messages.append({'role': role, 'content': '\n'.join(text),
                             **({'tool_calls': calls} if calls else {})})
        messages.extend(results)
    tools = [{'type': 'function', 'function': {'name': t['name'],
              'description': t['description'], 'parameters': t['input_schema']}}
             for t in (request.tools or [])]
    if any(t['function']['name'] not in ('read', 'write') for t in tools):
        raise ValueError('Unsupported Tool')
    return {'model': model, 'messages': messages, 'tools': tools,
            'max_tokens': 2048, 'temperature': 0, 'stream': False}


class ReplyState:
    def __init__(self):
        self.final_turn = False
        self.finished = False
        self.failed = False
        self.response = None
        self.pending_tools = {}
        self.seen_tools = set()

    def accept(self, event):
        kind, data = event.get('type'), event.get('data', {})
        if kind in ('error', 'agent_cancelled'):
            self.failed = True
        elif kind == 'tool_execution_start':
            identity, name = data.get('tool_call_id'), data.get('tool_name')
            if (not isinstance(identity, str) or not identity
                    or identity in self.seen_tools or name not in ('read', 'write')):
                self.failed = True
            else:
                self.seen_tools.add(identity)
                self.pending_tools[identity] = name
        elif kind == 'tool_execution_end':
            identity = data.get('tool_call_id')
            if (not isinstance(identity, str) or identity not in self.pending_tools
                    or self.pending_tools.pop(identity) != data.get('tool_name')
                    or data.get('status') != 'success' or data.get('permission_denied')):
                self.failed = True
        elif kind == 'turn_end':
            self.final_turn = (data.get('has_tool_calls') is False
                               and data.get('stop_reason') == 'stop'
                               and not data.get('steered'))
        elif kind == 'agent_end':
            if self.finished or data.get('cancelled'):
                self.failed = True
            self.finished = True
            self.response = data.get('final_response')

    def verify(self, response):
        if (self.failed or self.pending_tools or not self.finished or not self.final_turn
                or not isinstance(response, str) or not response.strip()
                or response != self.response):
            raise ValueError('CowAgent did not complete this request')


def create_agent(base, model):
    validate_route(base, model)
    os.environ['COW_DATA_DIR'] = '/tmp/noah-cow'
    Path('/tmp/noah-cow').mkdir(exist_ok=True)
    sys.path.insert(0, '/opt/upstream/CowAgent-' + SOURCE_PIN)
    from common.log import logger
    # Keep upstream diagnostics in COW_DATA_DIR/run.log, not in the user's
    # result text. Exceptions and incomplete native turns still fail the job.
    for handler in list(logger.handlers):
        if not isinstance(handler, logging.FileHandler):
            logger.removeHandler(handler)
            handler.close()
    logger.setLevel('WARNING')
    from agent.protocol import Agent, LLMModel
    from agent.tools.read.read import Read
    from agent.tools.write.write import Write
    from config import conf
    conf()['cow_lang'] = 'en'
    conf()['agent_permission_mode'] = 'workspace-write'

    class LocalModel(LLMModel):
        def call_stream(self, request):
            payload = request_payload(request, self.model)
            req = urllib.request.Request(base + '/chat/completions',
                data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
            # No environment proxies or redirects can select another endpoint.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    raise ValueError('Model redirects are unavailable')
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            with opener.open(req, timeout=180) as response:
                raw = response.read(262145)
            if len(raw) > 262144:
                raise ValueError('Model response too large')
            result = json.loads(raw)
            choice = result['choices'][0]
            if choice.get('finish_reason') not in ('stop', 'tool_calls'):
                raise ValueError('Model response was interrupted')
            delta = dict(choice['message'])
            if delta.get('tool_calls'):
                delta['tool_calls'] = [dict(c, index=i) for i, c in enumerate(delta['tool_calls'])]
            yield {'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]}
            yield {'choices': [{'index': 0, 'delta': {}, 'finish_reason': choice['finish_reason']}],
                   'usage': result.get('usage', {})}

    agent = Agent(system_prompt='Complete the requested file task in /workspace using read and write. '
                  'Verify saved content with read before your final answer. No external services are available.',
                  model=LocalModel(model=model), tools=[Read({'cwd': '/workspace', 'restrict_to_workspace': True}),
                  Write({'cwd': '/workspace', 'restrict_to_workspace': True})],
                  output_mode='logger', max_steps=6, max_context_tokens=8192,
                  context_reserve_tokens=2048, workspace_dir='/workspace',
                  enable_skills=False, skip_context_files=True)
    agent.permission_mode = 'workspace-write'
    return agent


def main(probe=False):
    agent = create_agent(os.environ.get('OPENAI_BASE_URL', 'http://127.0.0.1:1/v1'),
                         os.environ.get('NOAH_MODEL', MODEL))
    if probe:
        if {tool.name for tool in agent.tools} != {'read', 'write'}:
            raise ValueError('Unexpected Tool configuration')
        return
    state = ReplyState()
    response = agent.run_stream(Path('/tmp/request.txt').read_text(), on_event=state.accept)
    state.verify(response)
    print(response)


if __name__ == '__main__':
    main(probe=sys.argv[1:] == ['--probe'])
