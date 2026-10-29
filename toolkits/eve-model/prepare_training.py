"""Freeze mask-prompt SFT rows; reject rather than truncate oversized examples."""
import argparse
import json
from pathlib import Path
import os
from budget import canonical
from dataset import chat_row,validate_corpus
from manifest import OFFLINE,base_identity,sha,atomic_json

def prepare(corpus,base,output):
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
    combined=[]
    for split in ['train','validation']:
        source=corpus/(split+'.jsonl')
        rows=[json.loads(x) for x in source.read_text().splitlines()]; combined+=rows
        chosen=rows if split=='train' else [next(r for r in rows if r['language']==('ja' if i%2==0 else 'en') and r['variant']=='clean' and r['taskKind']==kind) for i,kind in enumerate(['combine','constraint','conflict','missing','completion','citation','routing','repair'])]
        chats=[chat_row(r) for r in chosen]
        lengths=[len(tokenizer.apply_chat_template(r['messages'],return_dict=False)) for r in chats]
        if max(lengths)>512: raise ValueError(f'{split}: example exceeds 512 tokens ({max(lengths)}), no truncation allowed')
        name='train.jsonl' if split=='train' else 'valid.jsonl'
        (output/name).write_text(''.join(canonical(r)+'\n' for r in chats))
        report['files'][name]={'sha256':sha(output/name),'sourceSha256':sha(source),'count':len(chats),'selectedIds':[r['id'] for r in chosen], 'minTokens':min(lengths),'maxTokens':max(lengths)}
    validate_corpus(combined)
    report['chatTemplateSha256']=__import__('hashlib').sha256(tokenizer.chat_template.encode()).hexdigest()
    atomic_json(output/'manifest.json',report)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--corpus',type=Path,required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();print(canonical(prepare(a.corpus,a.base,a.output)))
