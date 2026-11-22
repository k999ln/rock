"""Official boss CLI: analyze a supplied job description, without a recruiter account."""
import json
import os
import pathlib
import subprocess

base = ['/opt/boss/bin/boss', '--json', '--data-dir', '/tmp/boss-state']
subprocess.run(base + ['ai', 'config', '--provider', 'custom', '--model', os.environ['NOAH_MODEL'], '--base-url', os.environ['OPENAI_BASE_URL'], '--api-key', 'guest', '--max-tokens', '2048'], check=True, stdout=subprocess.DEVNULL)
result = subprocess.run(base + ['ai', 'interview-prep', '@/tmp/request.txt', '--count', '5'], check=True, capture_output=True, text=True, timeout=180)
body = json.loads(result.stdout)
if body.get('ok') is not True:
    raise RuntimeError('BOSS analysis did not complete')
data = body.get('data')
if not isinstance(data, dict) or not isinstance(data.get('job_summary'), str) or not isinstance(data.get('questions'), list) or len(data['questions']) != 5 or not isinstance(data.get('preparation_tips'), list):
    raise RuntimeError('BOSS returned an incomplete interview preparation')
if any(not isinstance(q, dict) or not isinstance(q.get('question'), str) or not q['question'].strip() for q in data['questions']):
    raise RuntimeError('BOSS returned an invalid question')
pathlib.Path('/workspace/interview-preparation.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
lines = [data['job_summary'].strip()]
for index, question in enumerate(data['questions'], 1):
    lines.extend(['', str(index) + '. ' + question['question'].strip()])
    if isinstance(question.get('framework'), str):
        lines.append(question['framework'].strip())
tips = [tip.strip() for tip in data['preparation_tips'] if isinstance(tip, str) and tip.strip()]
if tips:
    lines.extend(['', '準備のポイント', *['・' + tip for tip in tips]])
pathlib.Path('/tmp/final-response.txt').write_text('\n'.join(lines))
