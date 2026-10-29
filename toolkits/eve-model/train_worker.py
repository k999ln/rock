"""One owned MLX training child. No network, sealed reads or automatic resume."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
from types import SimpleNamespace
from budget import Budget
from completion_loss import LOSS_ID,assistant_only_loss,checked_batches,validate_chat_row
from manifest import OFFLINE,atomic_json,base_identity,sha,finite_metric
from profiles import PROFILES,profile,require_decision

RUN_IDS=['eve-qlora-v1','eve-qlora-v2','eve-recovery-probe','eve-recovery-final','eve-semantic-probe','eve-semantic-final']
CANDIDATE_NAMES=['candidate-v1','candidate-v2','probe-v1']

def validate_recipe(updates,profile_name,run_id,candidate_name,reuse_before):
    if run_id not in RUN_IDS or candidate_name not in CANDIDATE_NAMES:raise ValueError('fixed development run identity required')
    probe=run_id in ['eve-recovery-probe','eve-semantic-probe']
    if candidate_name=='probe-v1' and not probe:raise ValueError('probe directory is reserved')
    if probe and (updates!=8 or candidate_name!='probe-v1' or profile_name!='matched-768-v1' or reuse_before):raise ValueError('fixed probe recipe required')
    if run_id=='eve-recovery-final' and (candidate_name!='candidate-v1' or profile_name!='matched-768-v1' or reuse_before!='eve-recovery-probe' or updates not in [16,48,72]):raise ValueError('fixed fresh-base recovery final recipe required')
    if run_id=='eve-semantic-final' and (candidate_name!='candidate-v1' or profile_name!='matched-768-v1' or reuse_before!='eve-semantic-probe' or updates not in [64,72]):raise ValueError('fixed fresh-base semantic final recipe required')
    return probe

def semantic_update_decision(root,data):
    probe=json.loads((root/'candidate-manifest-eve-semantic-probe.json').read_text())
    supervisor=json.loads((root/'training-supervisor-eve-semantic-probe.json').read_text())
    if probe.get('candidateId')!='eve-semantic-probe' or probe.get('status')!='resource_probe_not_quality_candidate' or probe.get('recipe',{}).get('updates')!=8 or supervisor.get('runId')!='eve-semantic-probe' or type(supervisor.get('exitCode')) is not int or supervisor.get('exitCode')!=0 or supervisor.get('stopReason') is not None:raise ValueError('completed semantic probe required')
    if probe.get('trainingDataManifestSha256')!=sha(data/'manifest.json') or probe.get('memoryProfile')!=profile('matched-768-v1') or probe.get('recipe',{}).get('completionLossId')!=LOSS_ID:raise ValueError('semantic probe data/profile/loss binding mismatch')
    for name in ['train.py','train_worker.py','completion_loss.py','budget.py','dataset.py','manifest.py','profiles.py','prepare_training.py','prepare_semantic.mjs','prepare_integration.mjs']:
        if probe.get('trainingSourceHashes',{}).get(name)!=sha(Path(__file__).with_name(name)):raise ValueError('semantic probe source changed')
    history=probe.get('trainingHistory',[])
    if len(history)!=8 or [x.get('iteration') for x in history]!=list(range(1,9)):raise ValueError('eight completed probe reports required')
    if any(type(x.get('elapsedSeconds')) not in [int,float] for x in history):raise ValueError('numeric probe elapsed required')
    elapsed=[finite_metric(x.get('elapsedSeconds'),'probe elapsed') for x in history]
    intervals=[b-a for a,b in zip(elapsed,elapsed[1:])]
    if elapsed[0]<0 or any(x<=0 for x in intervals):raise ValueError('strictly increasing probe times required')
    maximum=max(intervals);predictions={n:elapsed[0]+n*maximum+15 for n in [72,64]}
    selected=next((n for n in [72,64] if predictions[n]<=90),None)
    if selected is None:raise ValueError('neither64nor72 final updates fit preregistered time bound')
    return {'schema':'eve.semantic-update-decision/1','probeId':'eve-semantic-probe','trainingDataManifestSha256':sha(data/'manifest.json'),'firstReportElapsed':elapsed[0],'maximumAdjacentInterval':maximum,'predictedSeconds':predictions,'selectedUpdates':selected,'rule':'firstReportElapsed + N*maxAdjacentInterval +15 <=90; largest of72,64; no quality selection; otherwise stop'}

def coverage_receipt(identities,completed):
    by_id={x['id']:x for x in identities}
    if len(by_id)!=60 or any(x not in by_id for x in completed):raise ValueError('semantic coverage identities changed')
    first=completed[:60]
    counts={key:{} for key in ['taskKind','language','variant','stage']}
    for name in dict.fromkeys(completed):
        for key in counts:
            value=by_id[name][key];counts[key][value]=counts[key].get(value,0)+1
    return {'schema':'eve.completed-training-coverage/1','completedUpdates':len(completed),'availableUniqueRows':60,'uniqueCompletedRows':len(set(completed)),'firstEpochAllRowsSeen':len(first)==60 and len(set(first))==60,'completedRowIds':list(completed),'uniqueCounts':counts,'qualification':'Only optimizer-reported completed batches; probe coverage is separate, not final training.'}

def observed_semantic_batches(known,observed,*args,**kwargs):
    for batch,lengths in checked_batches(*args,**kwargs):
        values=batch.tolist();bounds=lengths.tolist()
        if len(values)!=1:raise ValueError('semantic batch1 required')
        offset,length=map(int,bounds[0]);key=(tuple(values[0][:length]),offset)
        if key not in known:raise ValueError('actual semantic batch does not match prepared row')
        observed.append(known[key]);yield batch,lengths

def reuse_validation(root,budget,run_id,binding):
    doc=json.loads((root/('validation-'+run_id+'.json')).read_text())
    if doc.get('binding')!=binding:raise ValueError('before-validation source/base/data/loss/profile binding mismatch')
    rows=[v for v in doc.get('validation',[]) if v.get('stage')=='before']
    expected=(binding['batches'],binding['batches'],binding['maxSequence'],'completed')
    actual=budget.db.execute('SELECT reserved_batches,completed_batches,max_sequence,state FROM validation WHERE run_id=? AND stage=?',(run_id,'before')).fetchone()
    if actual!=expected or len(rows)!=1 or rows[0].get('batches')!=binding['batches'] or rows[0].get('iteration')!=0:raise ValueError('same-base completed before-validation required')
    if type(rows[0].get('val_loss')) not in [int,float]:raise ValueError('completed numeric validation loss required')
    finite_metric(rows[0]['val_loss'],'reused before-validation loss')
    return {**rows[0],'reusedExecutionFromRun':run_id,'iteration':0}

def train_with_explicit_loss(args,model,train_set,callback,iterate_batches_override=None):
    """Use public lower-level0.32.2 APIs rather than mutating library globals."""
    import mlx.core as mx
    import mlx.optimizers as optim
    from mlx_lm.tuner.datasets import CacheDataset
    from mlx_lm.tuner.trainer import TrainingArgs,train
    from mlx_lm.tuner.utils import linear_to_lora_layers
    from mlx_lm.utils import save_config
    if args.fine_tune_type!='lora' or args.optimizer!='adam' or args.resume_adapter_file is not None or args.lr_schedule is not None or args.grad_accumulation_steps!=1:
        raise ValueError('unsupported fixed training recipe')
    if not 1<=args.num_layers<=len(model.layers):raise ValueError('invalid trainable layer count')
    mx.random.seed(args.seed);model.freeze()
    linear_to_lora_layers(model,args.num_layers,args.lora_parameters,use_dora=False)
    candidate=Path(args.adapter_path);candidate.mkdir(exist_ok=False)
    save_config(vars(args),candidate/'adapter_config.json')
    training_args=TrainingArgs(batch_size=1,iters=args.iters,val_batches=0,
      steps_per_report=1,steps_per_eval=args.iters+1,steps_per_save=1,
      adapter_file=candidate/'adapters.safetensors',max_seq_length=args.max_seq_length,
      grad_checkpoint=True,grad_accumulation_steps=1)
    optimizer=optim.Adam(learning_rate=args.learning_rate,**args.optimizer_config.get('adam',{}))
    train(model=model,args=training_args,optimizer=optimizer,train_dataset=CacheDataset(train_set),
      val_dataset=CacheDataset([]),training_callback=callback,loss=assistant_only_loss,iterate_batches=iterate_batches_override or checked_batches)

def run(root,base,data,updates,profile_name='standard',run_id='eve-qlora-v1',candidate_name='candidate-v1',reuse_before=None):
    os.environ.update(OFFLINE)
    probe=validate_recipe(updates,profile_name,run_id,candidate_name,reuse_before)
    semantic=run_id.startswith('eve-semantic-')
    update_decision=semantic_update_decision(root,data) if run_id=='eve-semantic-final' else None
    if update_decision and updates!=update_decision['selectedUpdates']:raise ValueError('final updates differ from preregistered resource decision')
    policy=profile(profile_name);decision=require_decision(root,profile_name)
    if type(updates) is not int or not 1<=updates<=policy.get('maxTrainingUpdates',128):raise ValueError('selected profile update limit')
    import importlib.metadata
    if importlib.metadata.version('mlx-lm')!='0.32.2':raise ValueError('reviewed MLX-LM0.32.2 trainer API required')
    import mlx.core as mx
    import numpy as np
    from mlx_lm import load
    from mlx_lm.lora import CONFIG_DEFAULTS
    from mlx_lm.tuner.datasets import ChatDataset,CacheDataset
    from mlx_lm.tuner.trainer import TrainingCallback,evaluate
    from transformers import __version__ as transformers_version
    budget=Budget(root);candidate=root/candidate_name
    if candidate.exists() or (root/('candidate-manifest-'+run_id+'.json')).exists():raise ValueError('candidate/run output already exists')
    if (root/'candidate-manifest.json').exists():raise ValueError('candidate identity already frozen')
    max_sequence=policy['maxSequence'];batches=policy.get('validationBatchesPerStage',8)
    budget.reserve_training(run_id,updates,max_sequence=max_sequence)
    started=time.monotonic();identity=base_identity(base)
    manifest=json.loads((data/'manifest.json').read_text())
    if manifest['base']!=identity or manifest.get('maxSequence')!=max_sequence:raise ValueError('prepared data/base/sequence identity mismatch')
    for name,expected in manifest['files'].items():
        if sha(data/name)!=expected['sha256']:raise ValueError('training data changed')
    mx.set_memory_limit(policy['mlxGuidelineBytes']);mx.set_cache_limit(policy['cacheLimitBytes'])
    model,tokenizer=load(str(base),tokenizer_config={'trust_remote_code':False},trust_remote_code=False)
    if hashlib.sha256(tokenizer.chat_template.encode()).hexdigest()!=manifest['chatTemplateSha256']:raise ValueError('prepared chat template changed')
    train_rows=[json.loads(s) for s in (data/'train.jsonl').read_text().splitlines()]
    valid_rows=[json.loads(s) for s in (data/'valid.jsonl').read_text().splitlines()]
    if not train_rows or len(valid_rows)<batches:raise ValueError('insufficient training/validation rows')
    identities=manifest.get('curriculum',{}).get('rows',{}).get('train',[]) if semantic else []
    if semantic and (len(train_rows)!=60 or len(valid_rows)!=4 or len(identities)!=60 or len({x.get('id') for x in identities})!=60 or len(manifest.get('curriculum',{}).get('rows',{}).get('validation',[]))!=4 or manifest.get('curriculum',{}).get('firstEpochRequiredUniqueRows')!=60):raise ValueError('fixed60/4 semantic curriculum required')
    train_set=ChatDataset(train_rows,tokenizer,mask_prompt=True);valid_set=ChatDataset(valid_rows,tokenizer,mask_prompt=True)
    known={};observed=[]
    if semantic:
        for i,identity_row in enumerate(identities):
            tokens,offset=validate_chat_row(tokenizer,train_set[i],max_sequence)
            if (identity_row.get('totalTokens'),identity_row.get('prefixTokens'),identity_row.get('supervisedTokens'))!=(len(tokens),offset,len(tokens)-offset):raise ValueError('CPU/runtime semantic tokenization mismatch')
            key=(tuple(tokens),offset)
            if key in known:raise ValueError('ambiguous semantic training row')
            known[key]=identity_row['id']
        for i,identity_row in enumerate(manifest['curriculum']['rows']['validation']):
            tokens,offset=validate_chat_row(tokenizer,valid_set[i],max_sequence)
            if (identity_row.get('totalTokens'),identity_row.get('prefixTokens'))!=(len(tokens),offset):raise ValueError('CPU/runtime semantic validation tokenization mismatch')
    for dataset in [train_set,valid_set]:
        for i in range(len(dataset)):
            expected=validate_chat_row(tokenizer,dataset[i],max_sequence)
            if dataset.process(dataset[i])!=expected:raise ValueError('dataset completion offset mismatch')
    args=SimpleNamespace(**CONFIG_DEFAULTS)
    for k,v in dict(model=str(base),data=str(data),train=True,num_layers=policy['numLayers'],batch_size=1,iters=updates,val_batches=0,
      learning_rate=1e-4,steps_per_report=1,steps_per_eval=updates+1,save_every=1,
      max_seq_length=max_sequence,grad_checkpoint=True,adapter_path=str(candidate),seed=42,mask_prompt=True,
      lora_parameters={'rank':policy['loraRank'],'dropout':0.0,'scale':policy['loraScale']},
      report_to=None,trust_remote_code=False,completion_loss_id=LOSS_ID).items():setattr(args,k,v)
    history=[];validations=[]
    validation_binding={'base':identity,'trainingDataManifestSha256':sha(data/'manifest.json'),
      'chatTemplateSha256':manifest['chatTemplateSha256'],'lossId':LOSS_ID,'lossSourceSha256':sha(Path(__file__).with_name('completion_loss.py')),
      'workerSourceSha256':sha(Path(__file__)),'runtime':{'mlx':importlib.metadata.version('mlx'),'mlx_lm':importlib.metadata.version('mlx-lm'),'transformers':transformers_version},'memoryProfile':policy,'batches':batches,'maxSequence':max_sequence,'freshBase':True}
    def persist_validation():atomic_json(root/('validation-'+run_id+'.json'),{'schema':'eve.bound-validation/2','runId':run_id,'binding':validation_binding,'validation':validations})
    def validation(stage):
        key=budget.reserve_validation(run_id,stage,batches=batches,max_sequence=max_sequence);completed=0
        def advance():
            nonlocal completed
            if mx.get_peak_memory()>policy['metalPeakLimitBytes']:raise MemoryError('Metal profile limit during validation')
            completed+=1;budget.validation_progress(key,completed)
        value=evaluate(model=model,dataset=CacheDataset(valid_set),batch_size=1,num_batches=batches,max_seq_length=max_sequence,
          progress_callback=advance,loss=assistant_only_loss,iterate_batches=checked_batches)
        finite_metric(value,stage+' validation loss')
        validations.append({'stage':stage,'batches':completed,'val_loss':float(value),'iteration':0 if stage=='before' else updates})
        persist_validation();budget.validation_progress(key,completed,True)
    class Receipt(TrainingCallback):
        def on_train_loss_report(self,info):
            finite_metric(info['train_loss'],'training loss')
            if mx.get_peak_memory()>policy['metalPeakLimitBytes']:raise MemoryError('Metal profile limit during training')
            if semantic:
                if len(observed)!=int(info['iteration']):raise ValueError('semantic completed-batch accounting mismatch')
                atomic_json(root/('training-coverage-'+run_id+'.json'),{**coverage_receipt(identities,observed),'trainingDataManifestSha256':sha(data/'manifest.json')})
            elapsed=time.monotonic()-started;budget.training_progress(run_id,int(info['iteration']),elapsed);info={**info,'elapsedSeconds':elapsed};history.append(info)
            progress={'runId':run_id,'updates':info['iteration'],'elapsedSeconds':elapsed,'last':info}
            atomic_json(root/('training-progress-'+run_id+'.json'),progress);atomic_json(root/'training-progress.json',progress)
        def on_val_loss_report(self,info):raise ValueError('unexpected implicit library validation')
    np.random.seed(42);mx.random.seed(42)
    if reuse_before:
        validations.append(reuse_validation(root,budget,reuse_before,validation_binding));persist_validation()
    else:validation('before')
    iterator=(lambda *a,**kw:observed_semantic_batches(known,observed,*a,**kw)) if semantic else None
    np.random.seed(42);train_with_explicit_loss(args,model,train_set,Receipt(),iterator)
    coverage=coverage_receipt(identities,observed) if semantic else None
    if semantic and not probe and not coverage['firstEpochAllRowsSeen']:raise ValueError('completed final training did not cover all60curriculum rows')
    saved_config=json.loads((candidate/'adapter_config.json').read_text())
    if saved_config['num_layers']!=policy['numLayers'] or saved_config['lora_parameters']!=args.lora_parameters or saved_config.get('completion_loss_id')!=LOSS_ID:raise ValueError('saved recipe/loss/profile mismatch')
    arrays=mx.load(str(candidate/'adapters.safetensors'));nonzero_b=0;b_arrays=0
    for name,array in arrays.items():
        if not bool(mx.all(mx.isfinite(array)).item()):raise ValueError('nonfinite saved adapter: '+name)
        if name.endswith('.lora_b'):b_arrays+=1;nonzero_b+=bool(mx.any(array!=0).item())
    if not b_arrays or not nonzero_b:raise ValueError('no learned nonzero LoRA B parameter observed')
    model.eval()
    if not probe:validation('after')
    if base_identity(base)!=identity:raise ValueError('base files changed during training')
    elapsed=time.monotonic()-started;budget.training_progress(run_id,updates,elapsed,True)
    source_names=['train.py','train_worker.py','completion_loss.py','budget.py','dataset.py','manifest.py','profiles.py','prepare_training.py']
    if semantic:source_names+=['prepare_semantic.mjs','prepare_integration.mjs']
    record={'schema':'eve.candidate/1','status':'resource_probe_not_quality_candidate' if probe else 'trained_not_quality_accepted',
      'candidateId':run_id,'adapterDirectory':candidate_name,'base':identity,'trainingDataManifestSha256':sha(data/'manifest.json'),
      'adapterSha256':sha(candidate/'adapters.safetensors'),'adapterConfigSha256':sha(candidate/'adapter_config.json'),
      'runtime':{'mlx':importlib.metadata.version('mlx'),'mlx_lm':importlib.metadata.version('mlx-lm'),'transformers':transformers_version},
      'recipe':{'updates':updates,'batchSize':1,'maxSequence':max_sequence,'numLayers':saved_config['num_layers'],'rank':saved_config['lora_parameters']['rank'],'scale':saved_config['lora_parameters']['scale'],'dropout':0,'learningRate':1e-4,'optimizer':'adam','seed':42,'maskPrompt':True,'gradientCheckpointing':True,'resume':False,'checkpointEveryUpdates':1,'completionLossId':LOSS_ID,'supervisedRange':'offset <= target_index < real_length; every batch validated before compiled optimizer'},
      'elapsedSeconds':elapsed,'validation':validations,'trainingHistory':history,'metalPeakBytes':mx.get_peak_memory(),
      'processPeakRssBytes':__import__('resource').getrusage(__import__('resource').RUSAGE_SELF).ru_maxrss,
      'teacherDistillationPerformed':False,'sealedEvaluationExecuted':False,'pixelNativeInferenceAccepted':False,
      'finiteChecks':'reported train/validation loss and final adapter values; no independent gradient-finiteness guarantee',
      'teacherForcedValidationTokenSlotsMaximum':8192,'trainingTokenSlotsMaximum':updates*max_sequence,
      'memoryProfile':policy,'resourceProfileDecisionSha256':sha(decision) if decision else None,
      'trainingSourceHashes':{n:sha(Path(__file__).with_name(n)) for n in source_names},
      'learnedWeightEvidence':{'adapterParameters':sum(a.size for a in arrays.values()),'loraBArrays':b_arrays,'nonzeroLoraBArrays':int(nonzero_b),'baseFilesUnchangedVerified':True,'note':'Fresh run, no resumed adapter. Nonzero B proves weight change, not quality.'},
      'resourceMonitoring':'sampled supervisor plus per-batch/report Metal checks; not hard OS isolation',
      'warning':'Authored synthetic SFT. Saved weights/loss are not quality acceptance.',
      **({'trainingCoverage':coverage,'curriculumSelectionSha256':manifest['curriculum']['selectionSha256'],'semanticUpdateDecision':update_decision} if semantic else {})}
    atomic_json(root/('candidate-manifest-'+run_id+'.json'),record)
    if not probe:atomic_json(root/'candidate-manifest.json',record)
    print(json.dumps({'candidate':str(candidate),'updates':updates,'elapsedSeconds':elapsed,'adapterSha256':record['adapterSha256'],'published':not probe}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--data',type=Path,required=True);p.add_argument('--updates',type=int,default=128)
    p.add_argument('--profile',choices=list(PROFILES),default='standard');p.add_argument('--run-id',choices=RUN_IDS,default='eve-qlora-v1');p.add_argument('--candidate-name',choices=CANDIDATE_NAMES,default='candidate-v1');p.add_argument('--reuse-before',choices=['eve-qlora-v1','eve-recovery-probe','eve-semantic-probe'])
    a=p.parse_args();run(a.root,a.base,a.data,a.updates,a.profile,a.run_id,a.candidate_name,a.reuse_before)
