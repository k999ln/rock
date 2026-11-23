"""Private model transport shared only by the model-driven Python Agents."""
import json
import httpx
from runtime_shared import Stopped, model_response

class BoundTransport(httpx.BaseTransport):
    def handle_request(self, request):
        if request.method != 'POST' or str(request.url) != 'https://noah-model.internal/v1/chat/completions':
            raise Stopped('Unsupported model endpoint')
        return httpx.Response(200, request=request, json=model_response(json.loads(request.content)))

