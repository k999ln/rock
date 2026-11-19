"""Invoke the source-pinned DataAnalysisAgent, without changing its agent loop."""
import os
import json
import pathlib
import sys

sys.path.insert(0, '/opt/upstream/data_analysis_agent-d0991fca3bb3d5431237053830b12b962268f6ad')
from data_analysis_agent import DataAnalysisAgent
from config.llm_config import LLMConfig

class NoahDataAnalysisAgent(DataAnalysisAgent):
    def _build_final_report_prompt(self, all_figures):
        # Upstream's report template contains an unrelated financial example.
        # Keep the official analysis/execution loop and feed the report stage
        # only this Work's actual observations, instead of that example.
        observed = [{'code': s.get('code'), 'result': s.get('result')} for s in self.analysis_results if s.get('code')]
        return ('Only summarize the actual successful execution results below. Do not invent figures or other data. '
                'Return YAML with action: analysis_complete and a short final_report string in the user request language.\n'
                + json.dumps({'request': self.conversation_history[0]['content'], 'observed': observed}, ensure_ascii=False, default=str))

config = LLMConfig(base_url=os.environ['OPENAI_BASE_URL'], api_key='noah-local-only', model=os.environ['NOAH_MODEL'], max_tokens=2048)
agent = NoahDataAnalysisAgent(config, output_dir='/workspace/reports', max_rounds=2)
result = agent.analyze(user_input=pathlib.Path('/tmp/request.txt').read_text(), files=[])
print(result['final_report'])
steps = [{'code': step.get('code'), 'result': step.get('result')} for step in result.get('analysis_results', []) if step.get('code')]
evidence = json.dumps({'steps': steps}, ensure_ascii=False, default=str)
if len(evidence.encode()) <= 32768:
    pathlib.Path('/workspace/analysis-evidence.json').write_text(evidence)
if not any(step['result'].get('success') for step in steps):
    raise RuntimeError('Data Analysis Agent did not execute a successful analysis step')
