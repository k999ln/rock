"""Official QwenPaw Agent with its own loop and guarded file tools.

No web app, desktop, channels, shell, skills or host credentials are started.
The enclosing VM is the security boundary; path checks narrow the file tools.
"""
import asyncio
import functools
import inspect
import logging
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


def validate_route(base, model):
    url = urlsplit(base)
    if (url.scheme != 'http' or url.hostname != '127.0.0.1'
            or not url.port or url.path != '/v1' or url.query or url.fragment
            or url.username or url.password or model not in ('qwen3:4b', 'qwen2.5:1.5b', 'qwen2.5-tools:1.5b-v1')):
        raise ValueError('Only the fixed local model bridge is available')


def workspace_path(value, workspace=Path('/workspace')):
    if not isinstance(value, str) or not value or len(value) > 180:
        raise ValueError('Invalid file path')
    root = workspace.resolve()
    target = (root / value).resolve()
    if not target.is_relative_to(root) or target == root:
        raise ValueError('File is outside the task workspace')
    if any(part.startswith('.') for part in target.relative_to(root).parts):
        raise ValueError('Hidden files are outside this profile')
    return str(target)


def bounded_file_tool(fn):
    signature = inspect.signature(fn)

    @functools.wraps(fn)
    async def wrapped(*args, **kwargs):
        bound = signature.bind(*args, **kwargs)
        bound.arguments['file_path'] = workspace_path(bound.arguments.get('file_path'))
        for key in ('content', 'old_text', 'new_text'):
            if key in bound.arguments and len(str(bound.arguments[key]).encode('utf8')) > 32768:
                raise ValueError('File edit exceeds the profile limit')
        return await fn(*bound.args, **bound.kwargs)

    return wrapped


class ReplyState:
    """Do not promote interrupted, exhausted, missing or mismatched ends."""
    def __init__(self):
        self.identity = None
        self.finished = False

    def accept(self, event):
        kind = event.get('type')
        if kind == 'REPLY_START':
            if self.identity is not None or not event.get('session_id') or not event.get('reply_id'):
                raise ValueError('Unexpected QwenPaw reply start')
            self.identity = (event['session_id'], event['reply_id'])
        elif kind == 'REPLY_END':
            if (self.identity is None or self.finished
                    or self.identity != (event.get('session_id'), event.get('reply_id'))
                    or event.get('finished_reason') != 'completed' or event.get('error')):
                raise ValueError('QwenPaw did not complete this reply')
            self.finished = True
        elif kind in ('REQUIRE_USER_CONFIRM', 'REQUIRE_EXTERNAL_EXECUTION', 'EXCEED_MAX_ITERS'):
            raise ValueError('QwenPaw requires an unsupported interaction')

    def verify(self):
        if not self.finished:
            raise ValueError('QwenPaw returned without a completed reply')


def create_agent(base, model):
    validate_route(base, model)
    # This profile never registers browser tools. Keep their import-time beta
    # announcement out of the task result, while retaining warnings/errors.
    logging.getLogger('qwenpaw.agents.tools').setLevel(logging.WARNING)
    from agentscope.agent import ReActConfig
    from agentscope.tool import Toolkit
    from qwenpaw.agents.react_agent import QwenPawAgent
    from qwenpaw.agents.tools.file_io import read_file, write_file, edit_file
    from qwenpaw.config.config import AgentProfileConfig
    from qwenpaw.config.context import set_current_workspace_dir, set_current_project_dir
    from qwenpaw.providers.openai_provider import OpenAIProvider
    from qwenpaw.runtime.tool_guard import GuardedFunctionTool
    from qwenpaw.security.tool_guard.engine import get_guard_engine

    workspace = Path('/workspace')
    set_current_workspace_dir(workspace)
    set_current_project_dir(workspace)
    if not get_guard_engine().enabled:
        raise ValueError('QwenPaw tool guard is unavailable')
    context = {'session_id': 'noah-task', 'user_id': 'noah-task', 'approval_level': 'auto'}
    tools = [GuardedFunctionTool(bounded_file_tool(fn), agent_id='noah-task', request_context=context)
             for fn in (read_file, write_file, edit_file)]
    provider = OpenAIProvider(id='noah-local', name='Noah local bridge',
                             base_url=base, api_key='noah-local-only',
                             generate_kwargs={'temperature': 0, 'max_tokens': 2048})
    return QwenPawAgent(
        name='QwenPaw', model=provider.get_chat_model_instance(model),
        system_prompt=('You are QwenPaw working in an isolated Noah task workspace. '
                       'Use the provided official file tools to complete the request in /workspace. '
                       'Read the result to verify it before finishing. No network, shell or desktop is available. '
                       'Do not create unrelated files. Report errors honestly. Reply in the user language.'),
        toolkit=Toolkit(tools=tools), react_config=ReActConfig(max_iters=8, stop_on_reject=True),
        middlewares=[], agent_config=AgentProfileConfig(id='noah-task', name='QwenPaw', workspace_dir=str(workspace)),
        workspace_dir=workspace, request_context=context, effective_skills=[])


async def main(probe=False):
    agent = create_agent(os.environ.get('OPENAI_BASE_URL', 'http://127.0.0.1:1/v1'),
                         os.environ.get('NOAH_MODEL', 'qwen2.5:1.5b'))
    try:
        from agentscope.message import Msg, TextBlock
        request = Msg(name='user', content=[TextBlock(type='text', text='probe' if probe else Path('/tmp/request.txt').read_text())], role='user')
        if probe:
            return
        state = ReplyState()
        result = None
        async for event in agent.reply_stream(request, yield_final_msg=True):
            if isinstance(event, Msg):
                result = event.get_text_content()
            else:
                state.accept(event.model_dump(mode='json'))
        state.verify()
        if not isinstance(result, str) or not result.strip():
            raise ValueError('QwenPaw produced no final response')
        print(result)
    finally:
        await agent.close()


if __name__ == '__main__':
    asyncio.run(main(probe=sys.argv[1:] == ['--probe']))
