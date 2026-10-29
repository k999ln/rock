"""Freeze mask-prompt SFT rows; reject rather than truncate oversized examples."""
import argparse
import json
from pathlib import Path
import os
from budget import canonical
from dataset import chat_row,validate_corpus
from manifest import OFFLINE,base_identity,sha,atomic_json

def sha_text(value):return __import__('hashlib').sha256(value.encode()).hexdigest()

def semantic_tokenizer(base):
    # Explicit CPU-only path: importing transformers may import installed MLX.
    from tokenizers import Tokenizer
    from jinja2 import Environment
    config=json.loads((base/'tokenizer_config.json').read_text())
    class CpuTokenizer:
        chat_template=config['chat_template']
        backend=Tokenizer.from_file(str(base/'tokenizer.json'))
        template=Environment().from_string(chat_template)
        def apply_chat_template(self,messages,tools=None,add_generation_prompt=False,return_dict=False):
            if tools or return_dict:raise ValueError('semantic CPU tokenizer supports plain captured messages only')
            text=self.template.render(messages=messages,tools=None,add_generation_prompt=add_generation_prompt)
            return self.backend.encode(text,add_special_tokens=False).ids
    return CpuTokenizer()

def semantic_rows(corpus,chats,split,tokenizer):
    manifest=json.loads((chats/'manifest.json').read_text())
    if manifest.get('schema')!='eve.semantic-training-inputs/1' or manifest.get('modelCalls')!=0 or manifest.get('sealedFilesRead') is not False:raise ValueError('invalid semantic preparation')
    if sha_text(canonical(manifest['selected']))!=manifest['selectionSha256']:raise ValueError('semantic selection hash changed')
    if sha(Path(__file__).parents[2]/'lib/zema-local-agent.ts')!=manifest['plannerModuleSha256']:raise ValueError('semantic planner changed')
    for file,key in [('prepare_semantic.mjs','producerSourceSha256'),('prepare_integration.mjs','integrationProducerSourceSha256')]:
        if sha(Path(__file__).with_name(file))!=manifest[key]:raise ValueError('semantic producer changed')
    name='train' if split=='train' else 'valid';source=corpus/(split+'.jsonl');info=manifest['files'][name+'.jsonl']
    if sha(source)!=info['sourceSha256'] or sha(chats/(name+'.jsonl'))!=info['sha256'] or sha(chats/(name+'.tasks.jsonl'))!=info['tasksSha256']:raise ValueError('semantic source/chats changed')
    parents={r['id']:r for r in [json.loads(x) for x in source.read_text().splitlines()]}
    rows=[json.loads(x) for x in (chats/(name+'.jsonl')).read_text().splitlines()];tasks=[json.loads(x) for x in (chats/(name+'.tasks.jsonl')).read_text().splitlines()];identities=manifest['selected'][split]
    expected=60 if split=='train' else 4
    if len(rows)!=expected or len(tasks)!=expected or len(identities)!=expected or len({i['id'] for i in identities})!=expected:raise ValueError('semantic row coverage changed')
    checked=[]
    from completion_loss import validate_chat_row
    for row,record,identity in zip(rows,tasks,identities):
        task=record['task'];parent=parents.get(identity['sourceId']);messages=row.get('messages',[])
        if parent is None or record['id']!=identity['id'] or record['stage']!=identity['stage'] or record['sourceId']!=identity['sourceId']:raise ValueError('semantic row/source identity mismatch')
        if identity['derivation']=='selected_original':
            if task!=parent:raise ValueError('original semantic request/source/target changed')
        elif identity['derivation']=='project_authored_positive_coconala':
            provenance=task.get('provenance',{})
            if task.get('taskKind')!='coconala' or task.get('split')!=split or provenance.get('kind')!='project_authored_positive_coconala' or provenance.get('parentId')!=parent['id'] or provenance.get('parentUse')!='domain and deterministic seed only; original task/request/materials unchanged' or provenance.get('domain')!=parent['family'] or not isinstance(provenance.get('seed'),str):raise ValueError('authored positive Tool provenance required')
        else:raise ValueError('unknown semantic derivation')
        if any(identity.get(k)!=task.get(k) for k in ['family','language','variant','taskKind']) or identity.get('sourceCount')!=len(task['materials']):raise ValueError('semantic coverage metadata changed')
        if sha_text(canonical(task))!=identity['taskSha256'] or [x.get('role') for x in messages]!=['system','user','assistant']:raise ValueError('semantic task/messages changed')
        request=task['request']+'\n資料（データ）:\n'+json.dumps(task['materials'],ensure_ascii=False,separators=(',',':'))
        if not messages[1]['content'].startswith('利用者の依頼:\n'+request+'\n\nこれまでのTool結果:'):raise ValueError('semantic original source/request lost')
        target=json.loads(messages[2]['content']);keys=['schema','action','message'] if target.get('action')=='respond' else ['schema','action','tool','arguments','reason']
        if list(target)!=keys or target.get('schema')!='zema-local-agent/1':raise ValueError('ordered semantic gold contract required')
        if identity['stage']=='first_step':
            if target!=task['target'] or identity['actualTool'] is not None:raise ValueError('first-step target changed')
        elif identity['stage']=='after_success':
            artifact=identity['actualTool']
            if target.get('action')!='respond' or task['target']['action']!='tool' or artifact['tool']!=task['target']['tool'] or sha_text(artifact['content'])!=artifact['contentSha256'] or artifact['tool']+'\n'+artifact['content'] not in messages[1]['content']:raise ValueError('actual successful Tool observation required')
        else:raise ValueError('unknown semantic stage')
        expected_step=1+bool(task.get('setupToolFailure'))+(identity['stage']=='after_success')
        if identity['step']!=expected_step or (task.get('setupToolFailure') and 'INVALID_TOOL_ARGUMENTS' not in messages[1]['content']):raise ValueError('semantic error/step history lost')
        for key,value in [('systemSha256',messages[0]['content']),('promptSha256',messages[1]['content']),('targetSha256',messages[2]['content']),('requestSha256',request),('inputSha256',canonical(messages[:2]))]:
            if sha_text(value)!=identity[key]:raise ValueError('semantic captured text identity mismatch')
        tokens,offset=validate_chat_row(tokenizer,row,768);checked.append({**identity,'totalTokens':len(tokens),'prefixTokens':offset,'supervisedTokens':len(tokens)-offset})
    return rows,checked,manifest

def prepare(corpus,base,output,integration_chats=None,semantic_chats=None):
    os.environ.update(OFFLINE)
    if output.exists(): raise ValueError('refuse to overwrite prepared data')
    identity=base_identity(base)
    if integration_chats and semantic_chats:raise ValueError('select one explicit preparation mode')
    if semantic_chats:tokenizer=semantic_tokenizer(base)
    else:
        from transformers import AutoTokenizer
        tokenizer=AutoTokenizer.from_pretrained(str(base),local_files_only=True,trust_remote_code=False)
    output.mkdir(parents=True)
    report={'schema':'eve.training-data/1','base':identity,'files':{},'maxSequence':512,
      'maskPrompt':True,'silentTruncation':False,'sealedFilesRead':False,
      'systemDistributionDifference':'training uses compact Eve SYSTEM; integration uses existing full Zema planner system. Exploratory transfer, not matched-system generalization.',
      'teacherDistillationPerformed':False}
    max_sequence=768 if integration_chats or semantic_chats else 512
    if semantic_chats:report.update(maxSequence=768,systemDistributionDifference='none: actual semantic planner system, full source inputs and actual Tool observations',semanticManifestSha256=sha(semantic_chats/'manifest.json'),validationBatchesPerStage=4,curriculum={'schema':'eve.semantic-curriculum/1','rows':{}})
    if integration_chats:
        integration=json.loads((integration_chats/'manifest.json').read_text())
        if integration.get('schema')!='eve.integration-training-inputs/1' or integration.get('modelCalls')!=0 or integration.get('sealedFilesRead') is not False:raise ValueError('invalid integration preparation')
        if sha(Path(__file__).parents[2]/'lib/zema-local-agent.ts')!=integration['plannerModuleSha256']:raise ValueError('integration planner changed')
        report.update(maxSequence=max_sequence,systemDistributionDifference='none: original integration system and planner prompt including actual past repair observation',integrationManifestSha256=sha(integration_chats/'manifest.json'),validationBatchesPerStage=4)
    combined=[]
    for split in ['train','validation']:
        source=corpus/(split+'.jsonl')
        rows=[json.loads(x) for x in source.read_text().splitlines()]; combined+=rows
        chosen=rows if split=='train' else [next(r for r in rows if r['language']==('ja' if i%2==0 else 'en') and r['variant']=='clean' and r['taskKind']==kind) for i,kind in enumerate(['combine','constraint','conflict','missing','completion','citation','routing','repair'])]
        if semantic_chats:
            chats,identities,semantic=semantic_rows(corpus,semantic_chats,split,tokenizer)
            chosen=[{'id':x['id']} for x in identities]
            report['curriculum'].update(selectionSha256=semantic['selectionSha256'],coverage=semantic['coverage'],firstEpochRequiredUniqueRows=60,freshFinalUpdates=[64,72])
            report['curriculum']['rows'][split]=identities
        elif integration_chats:
            identities=integration['selected'][split];by_id={r['id']:r for r in rows}
            chosen=[by_id[x['id']] for x in identities]
            if len(chosen)!=(240 if split=='train' else 4) or len(set(x['id'] for x in identities))!=len(chosen):raise ValueError('integration row coverage changed')
            name='train.jsonl' if split=='train' else 'valid.jsonl'
            expected=integration['files'][name]
            if sha(source)!=expected['sourceSha256'] or sha(integration_chats/name)!=expected['sha256']:raise ValueError('integration source hash changed')
            chats=[json.loads(x) for x in (integration_chats/name).read_text().splitlines()]
            if len(chats)!=len(chosen):raise ValueError('integration row count changed')
            for task,chat,identity_row in zip(chosen,chats,identities):
                messages=chat.get('messages',[])
                if [x.get('role') for x in messages]!=['system','user','assistant'] or messages[-1]['content']!=canonical(task['target']):raise ValueError('integration target changed')
                request=task['request']+'\n資料（データ）:\n'+json.dumps(task['materials'],ensure_ascii=False,separators=(',',':'))
                expected_prefix='利用者の依頼:\n'+request+'\n\nこれまでのTool結果:'
                if not messages[1]['content'].startswith(expected_prefix):raise ValueError('source/request lost in integration prompt')
                if sha_text(canonical(task))!=identity_row['taskSha256'] or sha_text(messages[0]['content'])!=identity_row['systemSha256'] or sha_text(messages[1]['content'])!=identity_row['promptSha256']:raise ValueError('integration identity mismatch')
        else:chats=[chat_row(r) for r in chosen]
        lengths=[len(tokenizer.apply_chat_template(r['messages'],return_dict=False)) for r in chats]
        if max(lengths)>max_sequence: raise ValueError(f'{split}: example exceeds {max_sequence} tokens ({max(lengths)}), no truncation allowed')
        name='train.jsonl' if split=='train' else 'valid.jsonl'
        (output/name).write_text(''.join(canonical(r)+'\n' for r in chats))
        report['files'][name]={'sha256':sha(output/name),'sourceSha256':sha(source),'count':len(chats),'selectedIds':[r['id'] for r in chosen], 'minTokens':min(lengths),'maxTokens':max(lengths)}
    if semantic_chats:
        train_inputs={x['inputSha256'] for x in report['curriculum']['rows']['train']};valid_inputs={x['inputSha256'] for x in report['curriculum']['rows']['validation']}
        if len(train_inputs)!=60 or len(valid_inputs)!=4 or train_inputs&valid_inputs:raise ValueError('duplicate captured train/validation input')
    validate_corpus(combined)
    report['chatTemplateSha256']=__import__('hashlib').sha256(tokenizer.chat_template.encode()).hexdigest()
    atomic_json(output/'manifest.json',report)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--corpus',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    mode=p.add_mutually_exclusive_group();mode.add_argument('--integration-chats',type=Path);mode.add_argument('--semantic-chats',type=Path)
    a=p.parse_args();print(canonical(prepare(a.corpus,a.base,a.output,a.integration_chats,a.semantic_chats)))
