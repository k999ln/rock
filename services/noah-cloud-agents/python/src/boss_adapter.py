"""Pinned official boss command, loaded without Hermes or the Time SDK."""
import json
import os
import httpx
import boss_agent_cli.commands.ai_cmd as boss_commands
import boss_agent_cli.ai.service as boss_service
from model_transport import BoundTransport
from runtime_shared import MODEL, OUTPUT, file, operation

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
