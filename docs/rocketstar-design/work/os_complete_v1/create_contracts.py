from pathlib import Path
import json,copy
R=Path(__file__).resolve().parent;D=R/'contracts';(D/'examples').mkdir(parents=True,exist_ok=True)
def save(n,d): (D/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
S={'type':'string','minLength':1,'maxLength':128};ID={'type':'string','pattern':'^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$'}
N={'type':'integer','minimum':0};H={'type':'string','pattern':'^[0-9a-f]{64}$'}
MODE={'enum':['SIMULATION','HARDWARE_IN_LOOP','OPERATIONAL']}
DATA={'enum':['SYNTHETIC','MEASURED','ESTIMATED','REPLAY']}
def obj(p):return {'type':'object','properties':p,'required':list(p),'additionalProperties':False}
def arr(p,minn=0,maxn=128):return {'type':'array','items':p,'minItems':minn,'maxItems':maxn,'uniqueItems':True}
time=obj({'utcMs':{'type':['integer','null'],'minimum':0},'monotonicMs':N,'bootId':ID,'quality':{'enum':['TRUSTED','DEGRADED','UNTRUSTED']},'uncertaintyMs':{'type':['number','null'],'minimum':0}})
base={'schemaVersion':None,'executionMode':MODE,'dataClass':DATA,'siteId':ID,'nodeId':ID,'messageId':ID,'issuedAt':time}
def schema(name,extra,rules=[]):
 p=copy.deepcopy(base);p['schemaVersion']={'const':'rockstaros.icd.'+name+'.v1'};p.update(extra)
 x={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:rockstaros:icd:'+name+':v1','title':name+' / DESIGN SPECIFICATION ONLY',**obj(p)}
 if rules:x['allOf']=rules
 save(name+'.schema.json',x);return x
schemas={}
schemas['observation']=schema('observation',{'assetId':ID,'channelId':ID,'sequence':N,'stateRevision':N,'configurationDigest':H,'calibrationRef':{'anyOf':[ID,{'type':'null'}]},'unit':{'type':'string','minLength':1,'maxLength':24},'value':{'type':['number','null']},'quality':{'enum':['VALID','STALE','MISSING','INVALID','ESTIMATED']},'observedAt':time,'receivedAt':time},[
 {'if':{'properties':{'quality':{'enum':['MISSING','INVALID']}}},'then':{'properties':{'value':{'type':'null'}}}},
 {'if':{'properties':{'quality':{'const':'VALID'}}},'then':{'properties':{'value':{'type':'number'}}}}
])
payload={'oneOf':[obj({'operationRef':{'const':'reference.noncritical_load.set'},'desiredFlexibleKw':{'type':'number','minimum':0,'maximum':100}}),obj({'operationRef':{'const':'equipment.profile.request'},'profileId':ID,'profileDigest':H})]}
schemas['command']=schema('command',{'workId':ID,'requestId':ID,'commandId':ID,'idempotencyKey':ID,'actorRef':ID,'issuingDeviceRef':ID,'targetAssetId':ID,'targetBootId':ID,'capabilityRef':ID,'authorizationReceiptRef':ID,'authorityEpoch':N,'expiresUtcMs':N,'expectedRevision':N,'configurationDigest':H,'payload':payload,'payloadDigest':H,'envelopeProofRef':ID})
schemas['result']=schema('result',{'commandId':ID,'commandDigest':H,'targetAssetId':ID,'targetBootId':ID,'stateRevision':N,'configurationDigest':H,'status':{'enum':['ACCEPTED','EXECUTING','SUCCEEDED','REJECTED','FAILED','UNKNOWN']},'reasonCode':S,'appliedScope':{'enum':['NONE','SIM_SETTING','CONFIGURATION','PHYSICAL_ACTION']},'observedEffect':{'enum':['NOT_OBSERVED','MATCHED','MISMATCHED','UNKNOWN']},'evidenceRefs':arr(ID),'deviceProofRef':ID},[
 {'if':{'properties':{'status':{'const':'SUCCEEDED'}}},'then':{'properties':{'evidenceRefs':arr(ID,1)}}},
 {'if':{'properties':{'status':{'const':'SUCCEEDED'},'appliedScope':{'const':'PHYSICAL_ACTION'}}},'then':{'properties':{'observedEffect':{'const':'MATCHED'}}}}
])
schemas['authority-lease']=schema('authority-lease',{'authorityEpoch':N,'holderDeviceRef':ID,'targetAssetId':ID,'targetBootId':ID,'approvedProfileDigest':H,'issuedUtcMs':N,'expiresUtcMs':N,'proofRef':ID})
schemas['alarm']=schema('alarm',{'alarmId':ID,'assetId':ID,'faultCode':ID,'severity':{'enum':['INFO','WARNING','CRITICAL']},'state':{'enum':['ACTIVE','ACKNOWLEDGED','CLEARED']},'acknowledgedBy':{'anyOf':[ID,{'type':'null'}]},'conditionPresent':{'type':'boolean'},'procedureRef':ID,'evidenceRefs':arr(ID,1)},[
 {'if':{'properties':{'state':{'const':'ACKNOWLEDGED'}}},'then':{'properties':{'acknowledgedBy':ID}}},
 {'if':{'properties':{'state':{'const':'CLEARED'}}},'then':{'properties':{'conditionPresent':{'const':False}}}}
])
schemas['cargo-manifest']=schema('cargo-manifest',{'cargoId':ID,'manifestRevision':N,'workId':ID,'locationRef':ID,'state':{'enum':['PLANNED','PACKED','LOADED','IN_TRANSIT','RECEIVED','QUARANTINED','ACCEPTED','INSTALLED','HOLD']},'massKg':{'type':['number','null'],'exclusiveMinimum':0},'envelopeMm':{'anyOf':[obj({'x':{'type':'number','exclusiveMinimum':0},'y':{'type':'number','exclusiveMinimum':0},'z':{'type':'number','exclusiveMinimum':0}}),{'type':'null'}]},'handlingProfileRef':ID,'acceptanceEvidenceRefs':arr(ID),'configurationDigest':H},[
 {'if':{'properties':{'state':{'enum':['PACKED','LOADED','IN_TRANSIT','RECEIVED','QUARANTINED','ACCEPTED','INSTALLED']}}},'then':{'properties':{'massKg':{'type':'number'},'envelopeMm':{'type':'object'}}}},
 {'if':{'properties':{'state':{'enum':['ACCEPTED','INSTALLED']}}},'then':{'properties':{'acceptanceEvidenceRefs':arr(ID,1)}}}
])
schemas['release-manifest']=schema('release-manifest',{'releaseId':ID,'componentId':ID,'artifactDigest':H,'sourceRevision':S,'targetProfileId':ID,'schemaMajor':{'type':'integer','minimum':1},'minimumBootVersion':S,'configurationDigest':H,'rollbackPolicyRef':ID,'migrationPlanRef':ID,'testEvidenceRefs':arr(ID,1),'approvalRefs':arr(ID,1),'updateSignerRef':ID})
clock={'utcMs':1000000,'monotonicMs':1000,'bootId':'boot:fixture-A','quality':'TRUSTED','uncertaintyMs':1}
b={'executionMode':'SIMULATION','dataClass':'SYNTHETIC','siteId':'site:fixture','nodeId':'node:fixture','messageId':'message:fixture','issuedAt':clock}
ex={
'observation':{'assetId':'asset:load','channelId':'power:actual','sequence':1,'stateRevision':1,'configurationDigest':'0'*64,'calibrationRef':None,'unit':'kW','value':2.0,'quality':'VALID','observedAt':clock,'receivedAt':clock},
'command':{'workId':'work:fixture','requestId':'request:fixture','commandId':'cmd:fixture','idempotencyKey':'cmd:fixture','actorRef':'person:fixture','issuingDeviceRef':'device:fixture','targetAssetId':'asset:load','targetBootId':'boot:fixture-A','capabilityRef':'capability:placeholder','authorizationReceiptRef':'approval:placeholder','authorityEpoch':1,'expiresUtcMs':1010000,'expectedRevision':1,'configurationDigest':'0'*64,'payload':{'operationRef':'reference.noncritical_load.set','desiredFlexibleKw':2.0},'payloadDigest':'1'*64,'envelopeProofRef':'proof:placeholder'},
'result':{'commandId':'cmd:fixture','commandDigest':'1'*64,'targetAssetId':'asset:load','targetBootId':'boot:fixture-A','stateRevision':2,'configurationDigest':'0'*64,'status':'SUCCEEDED','reasonCode':'SIM_SETTING_STORED','appliedScope':'SIM_SETTING','observedEffect':'NOT_OBSERVED','evidenceRefs':['evidence:fixture'],'deviceProofRef':'proof:placeholder'},
'authority-lease':{'authorityEpoch':1,'holderDeviceRef':'device:fixture','targetAssetId':'asset:load','targetBootId':'boot:fixture-A','approvedProfileDigest':'0'*64,'issuedUtcMs':1000000,'expiresUtcMs':1030000,'proofRef':'proof:placeholder'},
'alarm':{'alarmId':'alarm:fixture','assetId':'asset:load','faultCode':'POWER_DEFICIT','severity':'CRITICAL','state':'ACTIVE','acknowledgedBy':None,'conditionPresent':True,'procedureRef':'procedure:fixture','evidenceRefs':['evidence:fixture']},
'cargo-manifest':{'cargoId':'cargo:fixture','manifestRevision':0,'workId':'work:fixture','locationRef':'location:bench','state':'PLANNED','massKg':None,'envelopeMm':None,'handlingProfileRef':'handling:fixture','acceptanceEvidenceRefs':[],'configurationDigest':'0'*64},
'release-manifest':{'releaseId':'release:fixture','componentId':'dev.rock.colony.supervisor','artifactDigest':'1'*64,'sourceRevision':'DESIGN-EXAMPLE-NOT-A-BUILD','targetProfileId':'GROUND-REF-v1','schemaMajor':1,'minimumBootVersion':'TEST-ONLY','configurationDigest':'0'*64,'rollbackPolicyRef':'rollback:fixture','migrationPlanRef':'migration:fixture','testEvidenceRefs':['evidence:fixture'],'approvalRefs':['approval:placeholder'],'updateSignerRef':'signer:placeholder'}
}
for name,extra in ex.items():save('examples/'+name+'.json',{'schemaVersion':'rockstaros.icd.'+name+'.v1',**b,**extra})
(D/'README.md').write_text('''# RockstarOS ICD v1 — 設計契約

本フォルダーは実装に渡す構造定義です。旧C0.1 runtimeへは未接続で、実機モードを有効化しません。7種のDraft 2020-12 Schemaと合成例を収録します。

examplesのID、digest、proofRef、capabilityRef、approvalRefは全て例示です。digestを計算した実認証メッセージではなく、鍵や有効な承認も含みません。SIMULATIONとSYNTHETICを明示しています。

型検証は署名・PoP・本人確認・内容digest・時刻の比較・現在権限・現物状態・物理作用を検証しません。各参照が保存台帳に存在すること、同じcommandに承認が結び付くこと、schemaの整数と実装の型の一致、expiry>issued、現在時刻の不確かさ、機器generation/revision、operation登録、payloadDigestは受信側が再判定します。

executionModeは将来の接続契約として3分類を定義します。OPERATIONALと書くだけでは接続権や認定は得られません。全examplesは模擬です。

7つのschemaは静的な設計成果物であり、動作するアダプター、プロトコルサーバー、署名処理ではありません。
''')
print('Created 7 proposed schemas and synthetic structural examples.')
