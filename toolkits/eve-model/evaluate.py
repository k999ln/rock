"""Summarize real development runs; lexical checks are not semantic judgments."""
import argparse
from collections import Counter
from datetime import datetime
import math
import json
from pathlib import Path
import re
import sqlite3
from budget import Budget,canonical
from manifest import atomic_json,sha

def contains(text,term):
    if term.isdecimal(): return bool(re.search(r'(?<!\d)'+re.escape(term)+r'(?!\d)',text))
    return term.casefold() in text.casefold()

def lexical(task,record):
    text=(record.get('result') or {}).get('text','')
    checks={c['id']:(all(contains(text,t) for t in c['contains']) if 'contains' in c else any(contains(text,t) for t in c['anyOf'])) for c in task['oracle']['checks']}
    source_markers={s:('['+s+']') in text for s in task['oracle']['sourceIds']}
    calls=[t for t in record.get('trace',[]) if not t.get('scriptedFault')]
    strict=[bool(t.get('strictJson') and t.get('parsed')) for t in calls]
    expected=task['oracle']['expectedTool']
    tools=[t.get('parsed') for t in calls if t.get('parsed',{} ) and t['parsed'].get('action')=='tool']
    artifacts=(record.get('result') or {}).get('artifacts',[])
    exact_args=any(t['tool']==expected and t['arguments']==task['target'].get('arguments') for t in tools) if expected else None
    actual_tool=any(a.get('tool')==expected and not ('"error"' in a.get('content','')) for a in artifacts) if expected else None
    return {'lexicalChecks':checks,'sourceMarkersPresent':source_markers,'strictSchemaDecisions':strict,
      'generationAttemptsVisible':len(calls),'expectedToolObserved':actual_tool,'exactGoldArgumentsObserved':exact_args,
      'contentCorrect':None,'evidenceSupported':None,'taskComplete':None,'falseSuccess':None,
      'semanticJudgeStatus':'unavailable until independent adjudication',
      'note':'Substring/number checks and source markers are diagnostics. They do not prove claim correctness or source support.'}

def cs_label(j):
    if any(j.get(k) is None for k in ['contentCorrect','evidenceSupported','taskComplete']): return 'unavailable'
    if j['contentCorrect'] and j['evidenceSupported']: return 'correct_supported' if j['taskComplete'] else 'supported_partial'
    if j['contentCorrect']: return 'correct_unsupported'
    return 'incorrect_supported' if j['evidenceSupported'] else 'incorrect_unsupported'

def validate_judgments(value,expected):
    if not isinstance(value,dict) or set(value)!={'schema','scope','reviewer','judgments'} or value['schema']!='eve.semantic-adjudication/1' or value['scope']!='development_only': raise ValueError('invalid adjudication document')
    if not isinstance(value['reviewer'],str) or not value['reviewer'] or not isinstance(value['judgments'],list): raise ValueError('missing reviewer/judgments')
    judgments={}
    for row in value['judgments']:
        if not isinstance(row,dict) or set(row)!={'runId','contentCorrect','evidenceSupported','taskComplete','falseSuccess','reason'}: raise ValueError('invalid judgment fields')
        key=row['runId']
        if key not in expected or key in judgments: raise ValueError('unknown/duplicate judgment identity')
        if any(row[k] is not None and type(row[k]) is not bool for k in ['contentCorrect','evidenceSupported','taskComplete','falseSuccess']): raise ValueError('judgment must be boolean or unavailable')
        if not isinstance(row['reason'],str) or not row['reason'].strip() or len(row['reason'])>2000: raise ValueError('judgment reason missing/oversized')
        judgments[key]=row
    if set(judgments)!=set(expected): raise ValueError('missing judgments; denominator may not shrink')
    return judgments

def wall_seconds(record):
    try:return max(0,(datetime.fromisoformat(record['finishedAt'].replace('Z','+00:00'))-datetime.fromisoformat(record['createdAt'].replace('Z','+00:00'))).total_seconds())
    except (KeyError,ValueError):return None

def schema_counts(decisions,attempts):
    if attempts < len(decisions): raise ValueError('visible decisions exceed reserved generation attempts')
    return {'passed':sum(decisions),'failedVisible':len(decisions)-sum(decisions),
      'unavailable':attempts-len(decisions),'allAttemptDenominator':attempts,'visibleDecisions':len(decisions)}

def summarize(root,adjudication=None):
    corpus=root/'observed-v3'/'development.jsonl'
    tasks={x['id']:x for x in map(json.loads,corpus.read_text().splitlines())}
    db=sqlite3.connect(f'file:{root/"client-jobs.sqlite"}?mode=ro',uri=True)
    runs=[json.loads(row[0]) for row in db.execute("SELECT record FROM runs WHERE json_extract(record,'$.category')='comparison' ORDER BY rowid")]
    db.close()
    expected=[(arm,case) for arm in ['A','C'] for case in tasks]
    grouped={key:[] for key in expected}
    for r in runs:
        key=(r['arm'],r['caseId'])
        if key not in grouped: raise ValueError('unknown comparison arm/case')
        grouped[key].append(r)
    selected=[rs[0] for rs in grouped.values() if len(rs)==1]
    semantic=validate_judgments(json.loads(adjudication.read_text()),{r['id'] for r in selected}) if adjudication else {}
    results=[]
    for arm,case in expected:
        entries=grouped[(arm,case)]
        if len(entries)!=1:
            results.append({'arm':arm,'caseId':case,'state':'not_started' if not entries else 'duplicate_unavailable','attemptRecords':len(entries)});continue
        r=entries[0];diagnostics=lexical(tasks[case],r)
        if r['id'] in semantic:
            j=semantic[r['id']];diagnostics.update({k:j[k] for k in ['contentCorrect','evidenceSupported','taskComplete','falseSuccess']});diagnostics['semanticJudgeStatus']='independently_adjudicated';diagnostics['reason']=j['reason']
        diagnostics['contentSupportClass']=cs_label(diagnostics)
        calls=[t['output'] for t in r.get('trace',[]) if 'output' in t]
        results.append({'arm':arm,'caseId':case,'runId':r['id'],'language':tasks[case]['language'],'taskKind':tasks[case]['taskKind'],
          'state':r['state'],'error':r.get('error'),'answer':(r.get('result') or {}).get('text'),
          'backendUntilJournalFinishSeconds':wall_seconds(r),
          'modelGenerationSecondsKnown':sum(c['elapsedSeconds'] for c in calls) if calls else None,
          'generationTokensKnown':sum(c['generationTokens'] for c in calls) if calls else None,**diagnostics})
    budget_db=sqlite3.connect(f'file:{root/"runtime.sqlite"}?mode=ro',uri=True)
    attempts=list(budget_db.execute("SELECT id,state FROM calls WHERE category='comparison'"));budget_db.close()
    owners={r['id']:r['arm'] for r in runs}
    counts=Counter();unattributed=[]
    for call_id,state in attempts:
        run_id=call_id.rsplit(':',1)[0]
        if run_id in owners: counts[owners[run_id]]+=1
        else: unattributed.append({'callId':call_id,'state':state})
    summaries={}
    for arm in ['A','C']:
        rows=[r for r in results if r['arm']==arm]
        decisions=[d for r in rows for d in r.get('strictSchemaDecisions',[])]
        durations=sorted(r['backendUntilJournalFinishSeconds'] for r in rows if r.get('backendUntilJournalFinishSeconds') is not None)
        summaries[arm]={'plannedTasks':20,'backendUntilJournalFinishP95Seconds':durations[math.ceil(.95*len(durations))-1] if durations else None,'backendDurationSampleCount':len(durations),'states':dict(Counter(r['state'] for r in rows)),
          'strictSchema':schema_counts(decisions,counts[arm]),
          'semantic':{key:{'true':sum(r.get(key) is True for r in rows),'false':sum(r.get(key) is False for r in rows),'unavailable':sum(r.get(key) is None for r in rows),'plannedDenominator':20} for key in ['contentCorrect','evidenceSupported','taskComplete','falseSuccess']},
          'byLanguage':{lang:{'planned':10,'completed':sum(r['state']=='completed' and r.get('language')==lang for r in rows)} for lang in ['ja','en']}}
    record={'schema':'eve.development-comparison/1','scope':'exploratory_development_only','plannedTasks':40,
      'corpusSha256':sha(corpus),'candidateManifestSha256':sha(root/'candidate-manifest.json'),
      'adjudicationSha256':sha(adjudication) if adjudication else None,'arms':summaries,'results':results,
      'unattributedGenerationAttempts':unattributed,'budget':Budget(root).snapshot(),'sealedEvaluationExecuted':False,'qualityAccepted':False,
      'retentionEvaluated':False,'retentionDelta':None,'pixelNativeInferenceAccepted':False,
      'limitations':['20 development tasks/arm,10/language; template-related synthetic tasks; not generalization or product acceptance',
        'All failed/unknown/not-started/duplicate and unavailable judgments retained in planned denominators',
        'Backend duration ends at journal finish and excludes final worker cleanup/Pixel UI refresh; it is not full phone interaction latency',
        'No sealed test or retention generation authorized in this initial experiment',
        'training compact system differs from integration full Zema planner system; both arms share integration context',
        'repair first-step error is a scripted matched fault through the real executor; remaining decisions are model-generated']}
    return record

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--adjudication',type=Path);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();result=summarize(a.root,a.adjudication);atomic_json(a.output,result);print(canonical({'arms':result['arms'],'output':str(a.output)}))
