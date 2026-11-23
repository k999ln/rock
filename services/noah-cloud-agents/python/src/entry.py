"""Private service-binding entry; every execution belongs to one coordinator job."""
import asyncio
import json
from pathlib import Path
import shutil
import tempfile
from workers import DurableObject, WorkerEntrypoint, Response

# Python VFS and Click's display/context internals are isolate-wide. Do not
# interleave two official commands while a synchronous RPC transport yields.
RUN_LOCK = asyncio.Lock()

class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return Response('Not found', status=404)

class NoahPythonJob(DurableObject):
    async def tools(self):
        async with RUN_LOCK:
            from adapters import TIME
            return json.dumps([t.model_dump(mode='json', by_alias=True) for t in await TIME.list_tools()])

    async def call(self, name, encoded):
        if name not in {'get_current_time', 'convert_time', 'get_time_ago'} or len(encoded.encode()) > 16384:
            raise ValueError('Invalid Time operation')
        async with RUN_LOCK:
            from adapters import TIME
            result = await TIME.call_tool(name, json.loads(encoded))
            return result.model_dump_json(by_alias=True)

    async def probe(self, profile):
        if profile not in {'time', 'boss', 'hermes'}:
            raise ValueError('Unsupported profile')
        # Import is synchronous and cached. Do not queue a connection probe
        # behind a running job that is waiting for its model capability.
        import adapters
        return True

    async def execute(self, encoded, capability):
        if len(encoded.encode()) > 16384:
            raise ValueError('Request too large')
        body = json.loads(encoded)
        profile, prompt = body.get('profile'), body.get('prompt')
        if profile not in {'boss', 'hermes'} or not isinstance(prompt, str) or not prompt.strip() or len(prompt.encode()) > 12000:
            raise ValueError('Invalid request')
        async with RUN_LOCK:
            from adapters import CAPABILITY, Stopped, hermes, boss, live
            if await self.ctx.storage.get('started'):
                raise ValueError('Execution already admitted; not replayed')
            await self.ctx.storage.put('started', True)
            await self.ctx.storage.setAlarm(__import__('time').time() * 1000 + 86400000)
            home = Path(tempfile.mkdtemp(prefix='noah-job-'))
            token = CAPABILITY.set(capability)
            try:
                live()
                result = (hermes if profile == 'hermes' else boss)(prompt, home)
                live()
                value = json.dumps(result, ensure_ascii=False)
                if len(value.encode()) > 100000:
                    raise ValueError('Result too large')
                return value
            except Stopped:
                raise ValueError('Execution stopped or expired') from None
            finally:
                CAPABILITY.reset(token)
                shutil.rmtree(home)

    async def alarm(self):
        await self.ctx.storage.deleteAll()
