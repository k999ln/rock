"""Official nanobot SDK with only the tools this local profile can execute.

Default CLI templates, channels, skills and goal tools exceed a small local
model's context window. Keep nanobot's own agent loop, provider and
exec tool; do not substitute a generic chat client or pre-generate task output.
"""
import asyncio
import os
from pathlib import Path

from nanobot import Nanobot
from nanobot.agent.loop import AgentLoop
from nanobot.agent.skills import SkillsLoader
from nanobot.agent.tools.registry import ToolRegistry
from nanobot.config.schema import Config
from nanobot.goal.assembly import install_goal


async def main():
    workspace = Path('/workspace')
    disabled = [s['name'] for s in SkillsLoader(workspace).list_skills(filter_unavailable=False)]
    config = Config.model_validate({
        'agents': {'defaults': {
            'workspace': str(workspace), 'model': os.environ['NOAH_MODEL'], 'provider': 'custom',
            'maxTokens': 2048, 'maxToolIterations': 8, 'maxConcurrentSubagents': 1,
            'contextWindowTokens': 8192, 'disabledSkills': disabled,
        }},
        'providers': {'custom': {
            'apiKey': 'noah-local-only', 'apiBase': os.environ['OPENAI_BASE_URL'],
            'api': {'supportedApis': ['chat_completions'], 'preferredApi': 'chat_completions'},
        }},
        'tools': {'restrictToWorkspace': True},
    })
    tools = ToolRegistry()
    loop = AgentLoop.from_config(config, tool_registry=tools, builtin_assembly=install_goal)
    for name in list(tools.tool_names):
        if name not in {'exec'}:
            tools.unregister(name)
    bot = Nanobot(loop, config=config)
    try:
        result = await bot.run(Path('/tmp/request.txt').read_text(), ephemeral=True)
        print(result)
    finally:
        await bot.aclose()


asyncio.run(main())
