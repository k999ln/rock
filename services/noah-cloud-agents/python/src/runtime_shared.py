"""Small request-scoped helpers; importing these does not load any Agent."""
import base64
from contextvars import ContextVar
import hashlib
import json
from pyodide.ffi import run_sync

MODEL = '@cf/openai/gpt-oss-20b'
CAPABILITY = ContextVar('noah_model_capability')
OUTPUT = ContextVar('noah_boss_output')
MODEL_STATUS = ContextVar('noah_model_status', default=None)

class ExecutionError(Exception):
    """Only a fixed error code crosses the private RPC boundary."""
    def __init__(self, code):
        self.code = code
        super().__init__(code)

class Stopped(BaseException):
    """Bypass upstream model retries after the coordinator closes admission."""

def live():
    try:
        run_sync(CAPABILITY.get().live())
    except Exception as exc:
        raise Stopped('Execution stopped or expired') from exc

def model_response(payload):
    live()
    try:
        body = json.loads(run_sync(CAPABILITY.get().complete(json.dumps(payload))))
    except Exception as exc:
        raise Stopped('Model admission closed') from exc
    live()
    choice = body.get('choices', [None])[0] if isinstance(body, dict) and body.get('choices') else None
    if not isinstance(choice, dict):
        MODEL_STATUS.set('model_response_shape')
    elif choice.get('finish_reason') == 'length':
        MODEL_STATUS.set('model_output_limit')
    elif not isinstance(choice.get('message'), dict) or not (choice['message'].get('content') or choice['message'].get('tool_calls')):
        MODEL_STATUS.set('model_empty_content')
    else:
        MODEL_STATUS.set(None)
    if not isinstance(body, dict):
        raise ExecutionError('model_response_shape')
    body.setdefault('id', 'noah')
    body.setdefault('object', 'chat.completion')
    body.setdefault('created', 0)
    body.setdefault('model', MODEL)
    for index, choice in enumerate(body.get('choices', [])):
        choice.setdefault('index', index)
        choice.get('message', {}).setdefault('role', 'assistant')
    return body

def file(name, value):
    data = value if isinstance(value, bytes) else value.encode('utf-8')
    if len(data) > 32768:
        raise ValueError('Result file exceeds limit')
    return {'name': name, 'base64': base64.b64encode(data).decode(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def operation(name, arguments, result, ok=True):
    return {'name': name, 'ok': ok, 'inputSha256': hashlib.sha256(arguments.encode()).hexdigest(), 'resultSha256': hashlib.sha256(result.encode()).hexdigest()}

