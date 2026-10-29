"""Bounded JSONL planner transport. The model has no execution capability."""
from __future__ import annotations
import argparse
import contextlib
import gc
import json
import os
from pathlib import Path
import resource
import re
import sys
import time
from budget import Budget,BudgetError,canonical
from manifest import OFFLINE,base_identity,sha,admission,atomic_json
from profiles import profile,require_decision,worker_failure
from watchdog import start_watchdog
from model_output import allowed_output

def run(root,base):
    os.environ.update(OFFLINE)
    candidate=json.loads((root/'candidate-manifest.json').read_text())
    policy=profile(candidate['memoryProfile']['id'])
    if candidate['memoryProfile']!=policy: raise ValueError('candidate resource profile mismatch')
    require_decision(root,policy['id'])
    check=admission(root,policy['id']);atomic_json(root/'inference-admission.json',check)
    if not check['admitted']: raise ValueError('resource admission failed before model import')
    monitor=start_watchdog(root,policy['id'])
    import mlx.core as mx
    from mlx_lm import load,stream_generate
    from mlx_lm.sample_utils import make_sampler
    budget=Budget(root); identity=base_identity(base)
    if candidate['base']!=identity: raise ValueError('candidate/base mismatch')
    if not re.fullmatch(r'candidate-v[12]',candidate.get('adapterDirectory','')):raise ValueError('invalid fixed candidate directory')
    adapter=root/candidate['adapterDirectory']
    if sha(adapter/'adapters.safetensors')!=candidate['adapterSha256'] or sha(adapter/'adapter_config.json')!=candidate['adapterConfigSha256']:
        raise ValueError('candidate adapter changed')
    binding={'baseSha256':identity['files']['model.safetensors'],'adapterSha256':candidate['adapterSha256'],
      'tokenizerSha256':identity['files']['tokenizer.json'],'candidateManifestSha256':sha(root/'candidate-manifest.json')}
    model=tokenizer=None; loaded=None
    mx.set_memory_limit(policy['mlxGuidelineBytes']);mx.set_cache_limit(policy['cacheLimitBytes'])
    print(canonical({'ready':True,'binding':binding}),flush=True)
    for line in sys.stdin:
        request=None;reserved=False
        try:
            if len(line.encode())>100000: raise ValueError('transport input too large')
            request=json.loads(line)
            if set(request)!={'id','category','arm','system','prompt','maxTokens'} or request['arm'] not in ['A','C']:
                raise ValueError('invalid planner request')
            if any(not isinstance(request[k],str) or not request[k] or len(request[k])>24000 for k in ['system','prompt']): raise ValueError('invalid prompt')
            payload={**request,'binding':binding}
            cached=budget.reserve_call(request['id'],payload,request['category'],request['maxTokens'])
            if cached is not None:
                print(canonical({'id':request['id'],'result':cached,'replayed':True}),flush=True);continue
            reserved=True; started=time.monotonic()
            if loaded!=request['arm']:
                model=tokenizer=None;gc.collect();mx.clear_cache()
                if base_identity(base)!=identity: raise ValueError('base files changed after worker startup')
                if sha(adapter/'adapters.safetensors')!=candidate['adapterSha256'] or sha(adapter/'adapter_config.json')!=candidate['adapterConfigSha256']: raise ValueError('candidate changed after worker startup')
                with contextlib.redirect_stdout(sys.stderr):
                    model,tokenizer=load(str(base),adapter_path=str(adapter) if request['arm']=='C' else None,
                      tokenizer_config={'trust_remote_code':False},trust_remote_code=False)
                loaded=request['arm']
            tokens=tokenizer.apply_chat_template([{'role':'system','content':request['system']},{'role':'user','content':request['prompt']}],add_generation_prompt=True,return_dict=False)
            if len(tokens)+request['maxTokens']>4096: raise ValueError('context limit; no truncation')
            pieces=[]; last=None
            for part in stream_generate(model,tokenizer,tokens,max_tokens=request['maxTokens'],sampler=make_sampler(temp=0)):
                budget.check_time()
                if time.monotonic()-started>=120: raise TimeoutError('planner timeout')
                if resource.getrusage(resource.RUSAGE_SELF).ru_maxrss>policy['rssLimitBytes']: raise MemoryError('process RSS profile limit')
                if mx.get_peak_memory()>policy['metalPeakLimitBytes']: raise MemoryError('Metal peak profile limit')
                pieces.append(part.text);last=part
            if last is None: raise RuntimeError('no generation accounting')
            permitted,excluded_reasoning=allowed_output(''.join(pieces))
            result={'raw':permitted,'excludedReasoning':excluded_reasoning,'generationTokens':last.generation_tokens,'promptTokens':last.prompt_tokens,
              'finishReason':last.finish_reason,'elapsedSeconds':time.monotonic()-started,'metalPeakBytes':int(last.peak_memory*1e9),
              'processPeakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'binding':binding,
              'arm':request['arm'],'inferencePlacement':'Mac MLX; Pixel client over USB localhost bridge'}
            budget.finish_call(request['id'],result,last.generation_tokens)
            print(canonical({'id':request['id'],'result':result,'replayed':False}),flush=True)
        except BaseException as error:
            result=worker_failure(error)
            if reserved:
                try: budget.finish_call(request['id'],result,None,'failed')
                except Exception: pass
            print(canonical({'id':request.get('id') if isinstance(request,dict) else None,'error':result}),flush=True)
            return

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--base',type=Path,required=True)
    a=p.parse_args();run(a.root,a.base)
