"""Run the pinned, official Hermes Agent with only ephemeral file/terminal tools."""
import os
import pathlib

os.environ.update(HERMES_HOME="/tmp/hermes", TERMINAL_ENV="local", TERMINAL_CWD="/workspace", TERMINAL_TIMEOUT="30", HERMES_INTERACTIVE="0")
home = pathlib.Path('/tmp/hermes')
home.mkdir(exist_ok=True)
(home / 'config.yaml').write_text('model:\n  context_length: 8192\ncompression:\n  enabled: false\n')

from run_agent import AIAgent

agent = AIAgent(
    base_url=os.environ['OPENAI_BASE_URL'], api_key='noah-local-only',
    provider='custom', api_mode='chat_completions', model=os.environ['NOAH_MODEL'],
    enabled_toolsets=['terminal', 'file'], max_iterations=6, max_tokens=2048,
    quiet_mode=True, skip_context_files=True, skip_memory=True,
    load_soul_identity=False, save_trajectories=False, checkpoints_enabled=False,
)
result = agent.run_conversation(pathlib.Path('/tmp/request.txt').read_text())
print(result.get('final_response', ''))
if result.get('error'):
    raise RuntimeError('Hermes did not complete the request')
