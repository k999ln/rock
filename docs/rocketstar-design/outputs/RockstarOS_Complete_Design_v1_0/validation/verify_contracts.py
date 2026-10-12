from pathlib import Path
import sys,json,copy,sqlite3,hashlib,importlib.metadata
R=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(R/'qa-deps'))
from jsonschema import Draft202012Validator
D=R/'contracts';cases=[]
def record(name,passed):
 cases.append({'id':name,'passed':bool(passed)})
 assert passed,name
for p in sorted(D.glob('*.schema.json')):
 name=p.name.split('.')[0];schema=json.loads(p.read_text());Draft202012Validator.check_schema(schema)
 v=Draft202012Validator(schema);ex=json.loads((D/'examples'/f'{name}.json').read_text())
 record(name+'.valid_fixture',v.is_valid(ex))
 bad=copy.deepcopy(ex);bad['unexpected']='x';record(name+'.reject_unknown',not v.is_valid(bad))
 bad=copy.deepcopy(ex);del bad['executionMode'];record(name+'.reject_missing_mode',not v.is_valid(bad))
 bad=copy.deepcopy(ex);bad['executionMode']='pretend';record(name+'.reject_unknown_mode',not v.is_valid(bad))
 if name=='command':
  for label,kw in [('bool',True),('negative',-1),('too_large',101)]:
   bad=copy.deepcopy(ex);bad['payload']['desiredFlexibleKw']=kw;record(name+'.reject_'+label,not v.is_valid(bad))
  bad=copy.deepcopy(ex);bad['payload']={'operationRef':'engine.valve.open'};record(name+'.reject_arbitrary_operation',not v.is_valid(bad))
 if name=='result':
  bad=copy.deepcopy(ex);bad['evidenceRefs']=[];record(name+'.success_needs_evidence_ref',not v.is_valid(bad))
  bad=copy.deepcopy(ex);bad['appliedScope']='PHYSICAL_ACTION';record(name+'.physical_success_needs_matched_effect',not v.is_valid(bad))
 if name=='observation':
  bad=copy.deepcopy(ex);bad['quality']='MISSING';record(name+'.missing_value_must_be_null',not v.is_valid(bad))
 if name=='alarm':
  bad=copy.deepcopy(ex);bad['state']='CLEARED';record(name+'.clear_requires_condition_absent',not v.is_valid(bad))
 if name=='cargo-manifest':
  bad=copy.deepcopy(ex);bad['state']='ACCEPTED';record(name+'.accepted_requires_measurements_and_evidence',not v.is_valid(bad))
# Previous C0.1 schemas: close the formerly unrun structural validation, not runtime integration.
legacy=R/'reference_c0_1/contracts'
for p in sorted(legacy.glob('*.schema.json')):
 schema=json.loads(p.read_text());Draft202012Validator.check_schema(schema)
 name=p.name.split('.')[0];ex=json.loads((legacy/'examples'/f'{name}.json').read_text())
 record('C0.1.'+name+'.structural_fixture',Draft202012Validator(schema).is_valid(ex))
# Design DDL parses, FK and critical uniqueness constraints work in isolated memory.
db=sqlite3.connect(':memory:');db.executescript((D/'operations_store.sql').read_text())
record('ddl.tables_created',len(db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall())==5)
row=('cmd-1','work-1','cmd-1','0'*64,'asset-1','boot-1',1,0,1000,'SIMULATION','{}','PREPARED',0)
db.execute('INSERT INTO command_intent VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',row)
try:
 db.execute('INSERT INTO command_intent VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',('cmd-2',*row[1:]))
 record('ddl.unique_idempotency_key',False)
except sqlite3.IntegrityError:record('ddl.unique_idempotency_key',True)
try:
 db.execute('INSERT INTO dispatch_claim VALUES (?,?,?,?)',('missing','0'*64,0,None))
 record('ddl.claim_needs_command',False)
except sqlite3.IntegrityError:record('ddl.claim_needs_command',True)
db.close()
# Reproduce the explicit storage sizing example, not a throughput benchmark.
raw_day=8*16*1*256*86400
raw7=raw_day*7
usage=raw7*2+8*2**30
budget={'profile':'GROUND-REF-v1 synthetic workload','devices':8,'channelsPerDevice':16,'sampleHz':1,'assumedBytesPerSample':256,'rawRetentionDays':7,'rawBytesPerDay':raw_day,'rawBytesSevenDays':raw7,'assumedStorageOverheadFactor':2,'otherBudgetGiB':8,'volumeGiB':100,'usableFraction':0.8,'estimatedUsageGiB':usage/2**30,'usableGiB':80,'headroomGiB':80-usage/2**30,'isBenchmark':False,'isHardwareSizingApproval':False}
(R/'evidence/reproduced_capacity_example.json').write_text(json.dumps(budget,ensure_ascii=False,indent=2)+'\n')
report={'date':'2026-09-24','validator':'jsonschema '+importlib.metadata.version('jsonschema'),'dialect':'Draft 2020-12','scope':'Structural schema examples, selected rejection conditions, design DDL constraints. No OS, cryptographic authentication or hardware execution.','passed':sum(c['passed'] for c in cases),'total':len(cases),'newSchemaCount':7,'legacySchemaCount':3,'cases':cases,'sourceSha256':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(D.rglob('*')) if p.is_file()}}
(R/'evidence/reproduced_contract_checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'total':report['total'],'validator':report['validator'],'capacityExampleGiB':budget['estimatedUsageGiB']},ensure_ascii=False))
