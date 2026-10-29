"""One owned MLX training child. No network, test-set reads, or automatic resume."""
import argparse
import json
import os
import math
import hashlib
import re
from pathlib import Path
import time
from types import SimpleNamespace
from budget import Budget
from manifest import OFFLINE,atomic_json,base_identity,sha,finite_metric
from profiles import profile,require_decision

def run(root,base,data,updates,profile_name='standard',run_id='eve-qlora-v1',candidate_name='candidate-v1',reuse_before=None):
    os.environ.update(OFFLINE)
    if not re.fullmatch(r'eve-qlora-v[12]',run_id) or not re.fullmatch(r'candidate-v[12]',candidate_name):raise ValueError('fixed development run identity required')
    policy=profile(profile_name);decision=require_decision(root,profile_name)
    if updates>policy.get('maxTrainingUpdates',128):raise ValueError('selected profile update limit')
    import mlx.core as mx
    import mlx_lm
    import numpy as np
    import importlib.metadata
    from mlx_lm import load
    from mlx_lm.lora import CONFIG_DEFAULTS,train_model
    from mlx_lm.tuner.datasets import ChatDataset,CacheDataset
    from mlx_lm.tuner.trainer import TrainingCallback,evaluate
    from transformers import __version__ as transformers_version
    import mlx

    budget=Budget(root);candidate=root/candidate_name
    if candidate.exists(): raise ValueError('candidate directory already exists')
    if (root/'candidate-manifest.json').exists():raise ValueError('candidate identity already frozen')
    budget.reserve_training(run_id,updates)
    started=time.monotonic()
    identity=base_identity(base)
    manifest=json.loads((data/'manifest.json').read_text())
    if manifest['base']!=identity: raise ValueError('prepared data/base identity mismatch')
    for name,expected in manifest['files'].items():
        if sha(data/name)!=expected['sha256']: raise ValueError('training data changed')
    mx.set_memory_limit(policy['mlxGuidelineBytes']);mx.set_cache_limit(policy['cacheLimitBytes'])
    model,tokenizer=load(str(base),tokenizer_config={'trust_remote_code':False},trust_remote_code=False)
    if hashlib.sha256(tokenizer.chat_template.encode()).hexdigest()!=manifest['chatTemplateSha256']: raise ValueError('prepared chat template changed')
    train_rows=[json.loads(s) for s in (data/'train.jsonl').read_text().splitlines()]
    valid_rows=[json.loads(s) for s in (data/'valid.jsonl').read_text().splitlines()]
    train_set=ChatDataset(train_rows,tokenizer,mask_prompt=True)
    valid_set=ChatDataset(valid_rows,tokenizer,mask_prompt=True)
    for ds in [train_set,valid_set]:
        if any(len(ds.process(ds[i])[0])>512 for i in range(len(ds))): raise ValueError('oversized example')
    args=SimpleNamespace(**CONFIG_DEFAULTS)
    for k,v in dict(model=str(base),data=str(data),train=True,num_layers=policy['numLayers'],batch_size=1,iters=updates,val_batches=0,
      learning_rate=1e-4,steps_per_report=1,steps_per_eval=updates+1,save_every=1,
      max_seq_length=512,grad_checkpoint=True,adapter_path=str(candidate),seed=42,mask_prompt=True,
      lora_parameters={'rank':policy['loraRank'],'dropout':0.0,'scale':policy['loraScale']},
      report_to=None,trust_remote_code=False).items(): setattr(args,k,v)
    history=[]; validations=[]
    def validation(stage):
        key=budget.reserve_validation(run_id,stage);completed=0
        def advance():
            nonlocal completed
            if mx.get_peak_memory()>policy['metalPeakLimitBytes']: raise MemoryError('Metal profile limit during validation')
            completed+=1;budget.validation_progress(key,completed)
        value=evaluate(model=model,dataset=CacheDataset(valid_set),batch_size=1,num_batches=8,max_seq_length=512,progress_callback=advance)
        finite_metric(value,stage+' validation loss');budget.validation_progress(key,completed,True)
        validations.append({'stage':stage,'batches':completed,'val_loss':float(value),'iteration':0 if stage=='before' else updates})
        atomic_json(root/('validation-'+run_id+'.json'),{'runId':run_id,'validation':validations})
    class Receipt(TrainingCallback):
        def on_train_loss_report(self,info):
            finite_metric(info['train_loss'],'training loss')
            if mx.get_peak_memory()>policy['metalPeakLimitBytes']: raise MemoryError('Metal profile limit during training')
            elapsed=time.monotonic()-started
            budget.training_progress(run_id,int(info['iteration']),elapsed)
            history.append(info)
            progress={'runId':run_id,'updates':info['iteration'],'elapsedSeconds':elapsed,'last':info}
            atomic_json(root/('training-progress-'+run_id+'.json'),progress);atomic_json(root/'training-progress.json',progress)
        def on_val_loss_report(self,info):
            raise ValueError('unexpected library validation; explicit16-batch budget only')
    np.random.seed(42);mx.random.seed(42)
    if reuse_before:
        prior=budget.db.execute('SELECT reserved_batches,completed_batches,state FROM validation WHERE run_id=? AND stage=?',(reuse_before,'before')).fetchone()
        previous=json.loads((root/'candidate-v1'/'adapter_config.json').read_text())
        if prior!=(8,8,'completed') or previous['model']!=str(base) or previous['data']!=str(data) or previous['resume_adapter_file'] is not None:raise ValueError('same-base completed validation execution required')
        validations.append({'stage':'before','batches':8,'val_loss':None,'status':'unavailable_scalar_lost_when_prior_worker_stopped','reusedExecutionFromRun':reuse_before,'iteration':0})
    else:validation('before')
    # MLX-LM evaluates on both first AND final iterations, regardless of eval
    # interval. Empty validation disables that implicit work; run8+8 explicitly.
    np.random.seed(42)
    train_model(args,model,train_set,[],Receipt())
    saved_config=json.loads((candidate/'adapter_config.json').read_text())
    if saved_config['num_layers']!=policy['numLayers'] or saved_config['lora_parameters']!=args.lora_parameters: raise ValueError('saved LoRA recipe/profile mismatch')
    adapter_arrays=mx.load(str(candidate/'adapters.safetensors'));nonzero_b=0;b_arrays=0
    for name,array in adapter_arrays.items():
        if not bool(mx.all(mx.isfinite(array)).item()): raise ValueError('nonfinite saved adapter: '+name)
        if name.endswith('.lora_b'):
            b_arrays+=1;nonzero_b+=bool(mx.any(array!=0).item())
    if not b_arrays or not nonzero_b:raise ValueError('no learned nonzero LoRA B parameter observed')
    model.eval()
    validation('after')
    if base_identity(base)!=identity:raise ValueError('base files changed during training')
    elapsed=time.monotonic()-started
    budget.training_progress(run_id,updates,elapsed,True)
    record={'schema':'eve.candidate/1','status':'trained_not_quality_accepted','candidateId':run_id,'adapterDirectory':candidate_name,
      'base':identity,'trainingDataManifestSha256':sha(data/'manifest.json'),
      'adapterSha256':sha(candidate/'adapters.safetensors'),'adapterConfigSha256':sha(candidate/'adapter_config.json'),
      'runtime':{'mlx':importlib.metadata.version('mlx'),'mlx_lm':importlib.metadata.version('mlx-lm'),'transformers':transformers_version},
      'recipe':{'updates':updates,'batchSize':1,'maxSequence':512,'numLayers':saved_config['num_layers'],'rank':saved_config['lora_parameters']['rank'],'scale':saved_config['lora_parameters']['scale'],'dropout':0,
        'learningRate':1e-4,'optimizer':'adam','seed':42,'maskPrompt':True,'gradientCheckpointing':True,'resume':False,'checkpointEveryUpdates':1},
      'elapsedSeconds':elapsed,'validation':validations,'trainingHistory':history,
      'metalPeakBytes':mx.get_peak_memory(),'processPeakRssBytes':__import__('resource').getrusage(__import__('resource').RUSAGE_SELF).ru_maxrss,
      'teacherDistillationPerformed':False,'sealedEvaluationExecuted':False,'pixelNativeInferenceAccepted':False,
      'finiteChecks':'each reported train/validation loss and final adapter values; no independent pre-update gradient-finiteness guarantee',
      'teacherForcedValidationTokenSlotsMaximum':8192,'trainingTokenSlotsMaximum':updates*512,
      'memoryProfile':policy,'resourceProfileDecisionSha256':sha(decision) if decision else None,
      'trainingSourceHashes':{name:sha(Path(__file__).with_name(name)) for name in ['train.py','train_worker.py','budget.py','dataset.py','manifest.py','profiles.py','prepare_training.py']},
      'learnedWeightEvidence':{'adapterParameters':sum(a.size for a in adapter_arrays.values()),'loraBArrays':b_arrays,'nonzeroLoraBArrays':int(nonzero_b),'baseFilesUnchangedVerified':True,'note':'MLX LoRA B initializes at zero; this fresh run has no resumed adapter. Nonzero B is weight-change evidence, not quality evidence.'},
      'resourceMonitoring':'supervisor samples from process creation every1s; Metal peak checked per validation batch and optimizer report; no instantaneous allocation isolation',
      'warning':'SFT on author-generated synthetic tasks. Training loss and adapter existence are not quality acceptance.'}
    atomic_json(root/'candidate-manifest.json',record)
    print(json.dumps({'candidate':str(candidate),'updates':updates,'elapsedSeconds':elapsed,'adapterSha256':record['adapterSha256']}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--data',type=Path,required=True);p.add_argument('--updates',type=int,default=128)
    p.add_argument('--profile',choices=['standard','small-memory-v1','bounded-warning-hypothesis-v1'],default='standard')
    p.add_argument('--run-id',choices=['eve-qlora-v1','eve-qlora-v2'],default='eve-qlora-v1');p.add_argument('--candidate-name',choices=['candidate-v1','candidate-v2'],default='candidate-v1');p.add_argument('--reuse-before',choices=['eve-qlora-v1'])
    a=p.parse_args();run(a.root,a.base,a.data,a.updates,a.profile,a.run_id,a.candidate_name,a.reuse_before)
