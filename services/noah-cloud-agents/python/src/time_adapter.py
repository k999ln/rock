"""Pinned official Time factory, loaded only for the Time profile."""
from mcp_server_time.server import create_server

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
