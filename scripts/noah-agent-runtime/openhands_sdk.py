"""Official OpenHands SDK profile for an isolated, single-task workspace."""
import os
from openhands.sdk import LLM, Agent, Conversation, Tool
from openhands.tools.terminal import TerminalTool
llm = LLM(model="openai/" + os.environ["NOAH_MODEL"], api_key="noah-local-only", base_url=os.environ["OPENAI_BASE_URL"], max_output_tokens=2048, num_retries=0)
agent = Agent(llm=llm, tools=[Tool(name=TerminalTool.name)], system_prompt="""You are OpenHands, executing the user's task in an isolated Noah workspace.
Use the terminal tool to perform the requested work in /workspace. Python 3 is installed.
For calculations, execute Python inline with python3 -c or create a real script before running it.
Do not use the network or access files outside /workspace. No accounts or credentials are available.
After writing a file, inspect its contents and fix any command errors before finishing.
Use the finish tool only after checking the result; report failures honestly. Reply in the user's language.
Keep the task focused and do not create unrelated files.""")
conversation = Conversation(agent=agent, workspace="/workspace", max_iteration_per_run=8)
conversation.send_message(open("/tmp/request.txt").read())
conversation.run()
