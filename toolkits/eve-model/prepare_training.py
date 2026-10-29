"""Freeze mask-prompt SFT rows; reject rather than truncate oversized examples."""
import argparse
import json
from pathlib import Path
import os
from budget import canonical
from dataset import chat_row,validate_corpus
from manifest import OFFLINE,base_identity,sha,atomic_json

def sha_text(value):return __import__('hashlib').sha256(value.encode()).hexdigest()

def prepare(corpus,base,output,integration_chats=None):
    os.environ.update(OFFLINE)
    from transformers import AutoTokenizer
    if output.exists(): raise ValueError('refuse to overwrite prepared data')
    identity=base_identity(base)
    tokenizer=AutoTokenizer.from_pretrained(str(base),local_files_only=True,trust_remote_code=False)
    output.mkdir(parents=True)
    report={'schema':'eve.training-data/1','base':identity,'files':{},'maxSequence':512,
      'maskPrompt':True,'silentTruncation':False,'sealedFilesRead':False,
      'systemDistributionDifference':'training uses compact Eve SYSTEM; integration uses existing full Zema planner system. Exploratory transfer, not matched-system generalization.',
      'teacherDistillationPerformed':False}
    max_sequence=768 if integration_chats else 512
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
        if integration_chats:
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
    validate_corpus(combined)
    report['chatTemplateSha256']=__import__('hashlib').sha256(tokenizer.chat_template.encode()).hexdigest()
    atomic_json(output/'manifest.json',report)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--corpus',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--integration-chats',type=Path)
    a=p.parse_args();print(canonical(prepare(a.corpus,a.base,a.output,a.integration_chats)))
