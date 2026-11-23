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
    profile = None

    def require_profile(self, profile):
        if profile != self.profile:
            raise ValueError('Profile does not belong to this Worker')

    async def tools(self):
        self.require_profile('time')
        async with RUN_LOCK:
            from adapters import adapter
            TIME = adapter('time').TIME
            return json.dumps([t.model_dump(mode='json', by_alias=True) for t in await TIME.list_tools()])

    async def call(self, name, encoded):
        self.require_profile('time')
        if name not in {'get_current_time', 'convert_time', 'get_time_ago'} or len(encoded.encode()) > 16384:
            raise ValueError('Invalid Time operation')
        async with RUN_LOCK:
            from adapters import adapter
            TIME = adapter('time').TIME
            result = await TIME.call_tool(name, json.loads(encoded))
            return result.model_dump_json(by_alias=True)

    async def probe(self, profile):
        self.require_profile(profile)
        if profile not in {'time', 'boss', 'hermes'}:
            raise ValueError('Unsupported profile')
        # Import is synchronous and cached. Do not queue a connection probe
        # behind a running job that is waiting for its model capability.
        from adapters import adapter
        module = adapter(profile)
        if profile == 'time':
            # Exercise schema generation and the timezone database at connection
            # time, so importing successfully is not the only readiness signal.
            await module.TIME.list_tools()
            result = await module.TIME.call_tool('get_current_time', {'timezone': 'UTC'})
            if result.is_error:
                raise ValueError('Official Time readiness failed')
        return True

    async def execute(self, encoded, capability):
        if len(encoded.encode()) > 16384:
            raise ValueError('Request too large')
        body = json.loads(encoded)
        profile, prompt = body.get('profile'), body.get('prompt')
        self.require_profile(profile)
        if profile not in {'boss', 'hermes'} or not isinstance(prompt, str) or not prompt.strip() or len(prompt.encode()) > 12000:
            raise ValueError('Invalid request')
        async with RUN_LOCK:
            from adapters import CAPABILITY, Stopped, hermes, boss, live
            from runtime_shared import ExecutionError, MODEL_META
            if await self.ctx.storage.get('started'):
                raise ValueError('Execution already admitted; not replayed')
            await self.ctx.storage.put('started', True)
            await self.ctx.storage.setAlarm(__import__('time').time() * 1000 + 86400000)
            home = Path(tempfile.mkdtemp(prefix='noah-job-'))
            token = CAPABILITY.set(capability)
            meta_token = MODEL_META.set([])
            try:
                live()
                result = (hermes if profile == 'hermes' else boss)(prompt, home)
                live()
                value = json.dumps(result, ensure_ascii=False)
                if len(value.encode()) > 100000:
                    raise ValueError('Result too large')
                return value
            except Stopped:
                return json.dumps({'error': {'code': 'execution_stopped'}})
            except ExecutionError as exc:
                return json.dumps({'error': {'code': exc.code, 'models': MODEL_META.get()}})
            except Exception:
                # Upstream tracebacks can contain private input and are longer
                # than the saved Work error. Never transmit them to the UI.
                return json.dumps({'error': {'code': 'official_execution_failed'}})
            finally:
                CAPABILITY.reset(token)
                MODEL_META.reset(meta_token)
                shutil.rmtree(home)

    async def alarm(self):
        await self.ctx.storage.deleteAll()
