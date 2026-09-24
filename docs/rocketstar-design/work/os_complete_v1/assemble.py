from pathlib import Path
import json,re,shutil,csv,hashlib
R=Path(__file__).resolve().parents[2];W=R/'work/os_complete_v1';P=R/'outputs/RockstarOS_Complete_Design_v1_0';P.mkdir(exist_ok=True)
STEM='RockstarOS_Complete_Design_v1_0'
def save(name,data):
 p=P/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def mdtable(rows):return '\n'.join('| '+' | '.join(str(x).replace('|','／') for x in r)+' |' for r in [rows[0],['---']*len(rows[0])]+rows[1:])
root=(W/'root_sections.md').read_text().replace('DB・索引・WAL等をrawの2倍、その他の記録に8GiBを配分し、100GiBの80%を使用可能とすると','DB・索引・WAL等をrawの2倍、その他の記録に8GiBを配分し、100GiBのデータ領域の80%を使用可能とすると')
root=root.replace('圧縮による節約は計上しない。','その他8GiBの内訳は結果台帳4GiB、転送待ち2GiB、ログ・隔離入口等2GiB。rootfs A/B、更新と復旧の作業領域、AIモデル、原映像はこの100GiBに含めず、別予算を要求する。圧縮による節約は計上しない。')
parts=re.split(r'^## (\w+) \| (.+)\n',root,flags=re.M);rs=[{'id':parts[i],'title':parts[i+1],'body':parts[i+2].strip()} for i in range(1,len(parts),3)]
def contribution(name,prefix):
 t=(W/'contributions'/name).read_text();a=re.split(r'^## (.+)\n',t,flags=re.M);intro=re.sub(r'^# .+\n','',a[0]).strip();out=[]
 for i in range(1,len(a),2):
  title=re.sub(r'^(OS-P\d+|NS-\d+|\d+\.)\s*','',a[i]);body=a[i+1].strip()
  if i==1 and intro:body=intro+'\n\n'+body
  out.append({'id':f'{prefix}-{(i+1)//2:02d}','title':title,'body':body})
 return out
sections=rs[:4]+contribution('os_platform.md','platform')+rs[4:8]+contribution('network_security.md','network')+contribution('flight_equipment.md','flight')+rs[8:]
assert len(sections)==32
service_rows=[
('identity','Identity & Authority','人・機器・役割・有限権限','認証・鍵参照・失効台帳','Platform、Brokerの検証API','不明な資格で新規操作を許さない'),
('registry','Asset Registry','拠点・設備・構成・校正・所在','asset/profileの正本','版付き登録・参照API','不明な構成は操作不可'),
('telemetry','Telemetry & Alarms','観測の品質・時刻・警報','観測／警報DB','adapter入力、購読API','欠測と保存失敗を明示'),
('work','Work & Procedures','提案・工程・承認・担当','仕事・手順・cargo対応','PlatformとBrokerのAPI','activeの照合待ちを維持'),
('command-broker','Command Broker','有限指令・claim・結果照合','指令／承認／結果DB','認可検査、adapter、receipt','新規送信停止、UNKNOWN保存'),
('scheduler','Resource Scheduler','資源の予約と競合調整','予約・優先順位・計画','観測・仕事・提案API','局所制御を待たせない'),
('adapter-gateway','Device Adapter','機種別有限操作の翻訳','接続世代・転送履歴','機器allowlistとBroker','再送せず結果を照会'),
('links','Link Gateway','拠点外配送・蓄積転送','期限・宛先・spool','外部通信と限定受信API','現地制御継続、期限検査'),
('evidence','Evidence Store','証拠file・hash・引渡し','内容fileと受領索引','所有サービスの参照API','未完fileを公開しない'),
('updater','Update & Recovery','版・配布署名・A/B・復元','release manifest・復旧記録','保守資格とPlatform','旧版保持または読取復旧'),
('shell','avokado / Shell','表示・音声・利用者操作','期限付きUI状態','Platformだけへ提案','途中入力を承認にしない'),
('planner','Local AI Planner','限定情報で作業案を生成','隔離された一時context','読取と提案APIのみ','停止しても定型操作可'),
('health','Health & Audit','監督サービスの状態と監査','health・監査参照','readinessと観測API','局所保護の代用にしない')]
services=[dict(zip(['id','name','responsibility','ownedStore','allowedInterface','failureBehavior'],r),implementationStatus='DESIGN_ONLY',processCountFixed=False) for r in service_rows]
profiles=[{'id':x,'status':s,'operationalRelease':False} for x,s in [('GROUND-REF-v1','DESIGN_SELECTED_NEW_IMAGE_NOT_BUILT'),('EDGE-HUB-v1','PORT_AND_HARDWARE_ACCEPTANCE_OPEN'),('COLONY-OPS-v1','MISSION_AND_EQUIPMENT_INPUTS_OPEN'),('FLIGHT-EVAL-v1','CFS_RTEMS_FIRST_EVALUATION_CANDIDATE'),('SAT-EVAL-v1','MANAGEMENT_PAYLOAD_BOUNDARY_SELECTED')]]
policy={'appliesTo':['GROUND-REF-v1'],'status':'DESIGN_SELECTED_NOT_IMPLEMENTED','humanSessionSeconds':900,'readCapabilitySeconds':300,'approvalSeconds':60,'approvalMaxUses':1,'deviceLeaseSeconds':30,'commandMaxSeconds':10,'deviceCertificateSeconds':86400,'renewRemainingSeconds':28800,'revocationFreshnessMaxSeconds':300,'keyOverlapMaxSeconds':3600,'maxUtcUncertaintySeconds':2,'lastTimeConfirmationMaxSeconds':86400,'spoolBytes':2*2**30,'spoolMaxMessages':20000,'quarantineBytes':64*2**20,'quarantineMaxMessages':1000,'ledgerBytes':4*2**30,'ledgerMinimumRetentionDays':90,'unresolvedAutoDelete':False,'smallPayloadMaxBytes':4096,'fileChunkMaxBytes':262144,'priorities':[{'id':f'P{i}','quotaMiB':q,'ttlDays':t,'schedulingShare':s} for i,q,t,s in [(0,256,30,.5),(1,256,1,.2),(2,512,7,.2),(3,1024,7,.1)]],'throttleP3AtFraction':.8,'throttleP2AtFraction':.9}
openinputs=[{'id':k,'value':None,'responsibleDiscipline':o,'requiredDeliverable':v,'ifUnset':'対象の実機運用を解放しない。開発参照profileは別管理。'} for k,o,v in [('mission','ミッション／居住','場所・人数・滞在・補給・退避と資源収支'),('flight_target','機上／基盤OS','CPU・基板・版・BSP・compilerとbuild受入'),('control_timing','GNC／局所制御','sensor/actuator・モデル・周期・誤差・HIL'),('independence','電気／信頼性','冗長台数・電源・バス・共通原因解析'),('equipment_ratings','電力／空気／水／熱','定格・故障モード・許容時間・ICD'),('radio','衛星／通信','RF波形・周波数・リンク予算・可視・試験'),('production_trust','セキュリティ／運用','鍵保管・人と装置の資格発行／失効／復旧'),('measured_budgets','性能／ソフト','CPU・RAM・記録・通信の測定と上限')]]
cat={'schema':'rockstaros.design-catalog/1','version':'1.0','date':'2026-09-24','title':'RockstarOS 設計書完全版','scope':'OS and system software architecture, contracts, operations and verification; not complete physical vehicle manufacture or flight release','names':{'rocket':'rocketstar','os':'RockstarOS','satellite':'A-LINK','interface':'avokado'},'operationalRelease':False,'profiles':profiles,'services':services,'groundReferencePolicy':policy,'openInputs':openinputs,'sourceRepoHead':'5d5f3dc4f73ac3389c8dbc00f9ca6e8beba526e0'}
save('design_catalog.json',cat)
# Each requirement is a future acceptance obligation; evidence can be partial and is never a release.
spec='''scope|環境と証拠を区分し、合成結果を実機合格へ昇格させない|V0,V1|modeの構造例、既存35SIM|端から端までの分類と表示拒否
architecture|地上・Hub・機上・衛星の対象profileを分ける|V1,V4|設計のみ|各対象imageのbuildと起動
architecture|WANやUI停止時も局所制御・必要警報を継続する|V3,V4|旧C0.1同一host別process模型|電源・計算機・バスを含む故障注入
services|13の論理責任と各正本writerを実装へ対応付ける|V1,V2|設計のみ|process/UID/DB/APIの責任照合
services|所有者以外からDB・機器へ直接書込みできない|V2|元OSの部分実装読取|実権限で拒否と迂回試験
platform-01|source・kernel・compiler・driver・profileを固定する|V1,V4|元repoSHA読取|固定manifestと再現build
platform-01|E3 Hubのarchitectureとdriverを個別受入する|V3,V4|既存E3仕様読取|音声・GPU・給電・熱・復旧実測
platform-02|AIとToolのUID・namespace・syscall・資源を隔離する|V2|設計のみ|CPU枯渇・OOM・禁止入出力試験
platform-03|IPCの本人をOS由来peer資格から取得する|V1,V2|既存Platform読取|専用socket・偽装・資格失効試験
platform-03|版・型・容量・同時数・期限を入口で制限する|V1,V2|新schema構造検査|profile上限・burst・timeout試験
platform-04|指令UNKNOWN中はWeb Workをactiveに保つ|V1|既存WorkとBroker読取|新adapterの状態対応試験
platform-04|sample結果で実工程を完了させない|V1|既存Work読取|新templateのSIM分類拒否試験
platform-04|局所DBを単一writer・WAL/FULLで保存する|V1,V3|設計DDL限定検査|媒体の電源断・WAL破損・checkpoint
platform-05|bootで世代・状態・資格・未照合を先に確認する|V1,V3|旧模型の再起動試験|新imageと実機の復旧試験
platform-05|強制停止後の承認とleaseを再利用しない|V1,V3|旧模型の世代/期限試験|実際の発行・失効・再開試験
platform-05|更新とデータ移行の中断・復元を処理する|V1,V4|既存QEMU部分実装読取|対象機の署名起動・移行・rollback
platform-05|backupは整合したDBと索引を一組で取得する|V1,V3|設計のみ|鍵非平文・全損復元・二重writer排除
platform-06|同じsource/image/profileで統合受入する|V1|設計のみ|Workから結果reviewまで一周
icd|7型schemaの未知項目・欠落・不正型を拒否する|V0,V1|新7schema・構造例43項目の一部|runtimeへの組込と境界値網羅
icd|時刻品質・世代・連番・単位を観測に保存する|V1,V3|observation構造例|欠測・逆順・旧boot・校正試験
icd|古い契約を明示adapterで移し暗黙互換にしない|V1|旧3schemaの標準構造確認|旧APPLIEDと新結果の意味検証
command_state|承認を対象・内容・構成・期限に拘束する|V1,V2|旧模型のdigest試験|新暗号proofと資格による検証
command_state|永続claimを保存してから外部送信する|V1,V3|旧模型・新DDL一意制約|全クラッシュ点で確認
command_state|同じIDの変更を拒否し同一内容だけ過去結果を返す|V1,V3|旧模型とDDL限定検査|機器側重複判定・保持期限試験
command_state|返事喪失をUNKNOWNにし自動execute再送をしない|V1,V3|旧模型の応答喪失試験|新経路の落失・再起動・新ID抑止
command_state|SUCCEEDEDを作用範囲と必要証拠へ結び付ける|V1,V3|result構造拒否例|実測・機器証明と相関検査
persistence|意図・receipt・現物観測を独立記録する|V1,V3|設計DDL・旧模型|実作用と保存間の停止・照合
persistence|証拠file確定後に索引を登録する|V1,V3|設計のみ|電源断・file欠損・hash不一致
capacity|実測byteと負荷から容量を算定する|V1,V4|44.914GiBの仮定計算|対象workload測定と保持上限
capacity|満杯時に未照合記録を消さず新規作用を止める|V1,V2|設計のみ|DB/spool/ledger満杯・枯渇試験
network-01|IP相手をmTLSで確認し状態変更0RTTを禁止する|V2|一次資料に基づく設計|実証明書と再送攻撃・誤相手拒否
network-02|人・機器・processを別の資格として検証する|V2|設計のみ|WebAuthn/機器登録/IPC連携
network-02|AIは提案のみ、有限capabilityで対象操作を限定する|V2|設計のみ|PoP・scope・audience・本文変更拒否
network-03|鍵用途と信頼ルートを分離し登録・失効を監査する|V2,V3|設計のみ|鍵保管・侵害復旧・交代・二者確認
network-03|期限切れや失効情報の古さで新規権限を解放しない|V2|設計のみ|オフライン・失効・時刻未確定
network-04|署名を本文全体と承認・capabilityの内容へ拘束する|V2|schema参照は構造のみ|canonical化・署名・参照置換攻撃
network-04|時刻誤差を含め保守的に期限を判定する|V1,V2|旧模型の時計検査は別契約|UTC/単調時計/boot/誤差の異常試験
network-04|長距離回線は提案を運び現地で新しく承認する|V2,V3|設計のみ|長遅延・重複・古い提案の再判定
network-05|BP配送・受信・実行を別の状態として保持する|V2,V3|設計のみ|BP/BPSec構成・経路・相互接続
network-05|優先度別容量・TTL・公平配分を適用する|V2|地上参照数値を設計選定|暗号込み量・P0偽装・満杯試験
network-05|結果台帳をspoolから分け未照合を自動削除しない|V1,V2|設計のみ|90日保持・4GiB枯渇の縮退試験
flight-01|cFS/RTEMS評価構成を版・CPU/BSP単位で固定する|V4|一次資料確認のみ|互換build・driver・実機受入
flight-02|cFE/OSAL/PSP/BSPとmission appの責任を分ける|V4|設計のみ|message辞書・境界・依存試験
flight-02|A-LINK管理系と通信ペイロードを分離する|V3,V4|既存透過中継案読取|帯域・電源・熱・fault伝播試験
flight-03|周期・締切・WCET・待ち・割込みを計上する|V4|計算方法の設計|機体応答から期限導出・対象CPU解析
flight-03|CPU/RAM/stack/queueを故障時まで予算化する|V4|設計のみ|ピーク・欠測・burst・stack測定
flight-04|局所missionの起動・遷移・復旧条件を値入り定義する|V3,V4|モード骨格のみ|飛行phase別表・禁止条件・HIL
flight-04|機上healthを独立保護の証明にしない|V3,V4|一次資料と設計|共通電源/時計/CPU障害の解析
flight-05|生命維持の制御と保護を現地に置く|V3,V4,V5|旧電力模型の限定例|空気・水・熱・電力の機器受入
mission_modes|Coreと設備と通信のモードを区別する|V1,V3|設計のみ|状態遷移表と誤表示・再開検査
mission_modes|epoch更新と旧holder排除後に監督権を移す|V2,V3|旧模型のepoch検査|分断・旧機復活・別機実証
avokado|欠測・採取時刻・実測分類と希望/観測を表示する|V1,V3|操作設計のみ|現地利用者の表示・誤解防止受入
avokado|MIC OFF/所有者変更でbufferと入力ticketを失効する|V2,V3|既存E3仕様読取|実Hubのprivacy/停止/再起動検証
avokado|AIの文書入力で権限を増やさず秘密を渡さない|V2|設計のみ|悪意文書・tool結果・鍵アクセス拒否
logistics|貨物検収と設備稼働を別状態で証拠に結ぶ|V1,V3|cargo構造拒否例|計量・封印・受渡し・commissioning
logistics|各個体の再使用履歴と検査判定を保持する|V1,V5|rocketstar C3方針|実機荷重・熱・修理・再飛行判定
faults|機器別に異常応答と再開条件を定める|V3,V4,V5|11異常の設計表|故障期限・連鎖・復旧回数の試験
verification|実装・模型・物理試験の証拠を同じ版へ追跡する|V0,V1|43契約/DDLと旧35を別管理|構成別evidence registryの統合
migration|release manifestで版・互換・試験・復旧を確認する|V1,V4|release構造例|署名・実image・data移行の受入
open_inputs|未入力の実機条件で運用を解放しない|V1,V4,V5|openInputsのnullを保存|値入りミッション/機器profileの認定'''
items=[]
for i,line in enumerate(spec.splitlines(),1):
 sec,req,levels,ev,remaining=line.split('|');assert sec in {x['id'] for x in sections},sec
 items.append({'id':f'OSR-{i:03d}','sectionId':sec,'requirement':req,'verificationLevels':levels.split(','),'evidenceAvailable':ev,'acceptanceStillRequired':remaining,'status':'DESIGN_BASELINE_ACCEPTANCE_PENDING','operationallyVerified':False})
save('requirements.json',{'schema':'rockstaros.requirements/1','items':items})
with (P/'requirements.csv').open('w',newline='',encoding='utf-8-sig') as f:
 w=csv.writer(f);w.writerow(['要求ID','章ID','要求','検証段階','今回までの部分証拠','残る受入','実機合格'])
 for x in items:w.writerow([x['id'],x['sectionId'],x['requirement'],','.join(x['verificationLevels']),x['evidenceAvailable'],x['acceptanceStillRequired'],'いいえ'])
# Preserve source registries and immutable legacy evidence, avoiding bundled environments or original repo copies.
(P/'sources').mkdir(exist_ok=True);sources=[]
for f in (W/'contributions').glob('*sources.json'):
 d=json.loads(f.read_text());shutil.copy2(f,P/'sources'/f.name)
 for key in ['sources','web_sources','local_sources']:sources+=d.get(key,[])
sources.append({'id':'SC-W01','title':'JSON Schema Draft 2020-12','url':'https://json-schema.org/draft/2020-12','design_use':'7型の構造契約と標準validatorの方言。暗号・機器作用は保証しない'})
save('sources/index.json',{'date':'2026-09-24','sources':sources})
(P/'evidence').mkdir(exist_ok=True);shutil.copy2(W/'qa/contract_checks.json',P/'evidence/contract_checks.json')
budget=json.loads((W/'capacity_example.json').read_text());budget.update({'scope':'Data partition only','otherBudgetBreakdownGiB':{'resultLedger':4,'transferSpool':2,'logsAndQuarantine':2},'excludedScopes':['rootfs A/B','update/recovery scratch','AI models','raw audio/video']});save('capacity_example.json',budget)
shutil.copytree(W/'contracts',P/'contracts',dirs_exist_ok=True)
old=R/'outputs/RockstarOS_Colony_C0_1';ref=P/'reference_c0_1';ref.mkdir(exist_ok=True)
for n in ['contracts','runtime','evidence']:
 shutil.copytree(old/n,ref/n,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.sqlite*','*.db*'))
(ref/'README.md').write_text('過去のColony C0.1の模型・契約・35件の試験証拠を変更せず同梱した。今回のv1契約とは別版。公開HMACとactor文字列は認証ではない。実機ドライバー、機上OS、電波、生命維持制御は含まない。旧evidence内のNOT_RUNは当時の状態で、本版の契約検証で3つの旧schema例の構造確認だけを追加した。\n')
validate=(W/'verify_contracts.py').read_text().replace("R=Path(__file__).resolve().parent","R=Path(__file__).resolve().parents[1]").replace("legacy=Path(__file__).resolve().parents[2]/'outputs/RockstarOS_Colony_C0_1/contracts'","legacy=R/'reference_c0_1/contracts'").replace("(R/'qa/contract_checks.json').write_text","(R/'evidence/reproduced_contract_checks.json').write_text").replace("(R/'capacity_example.json').write_text","(R/'evidence/reproduced_capacity_example.json').write_text")
(P/'validation').mkdir(exist_ok=True);(P/'validation/verify_contracts.py').write_text(validate)
baselines=[]
for path in [R/'outputs/rocketstar_C3_Integrated_Design_Baseline.pdf',old/'RockstarOS_Colony_C0_1_Integrated_Design.pdf']:
 baselines.append({'path':str(path),'sha256':sha(path),'includedInThisPackage':False})
save('sources/baselines.json',{'baselines':baselines,'rocketC3OpenDesignItems':28,'operationalRelease':False})
checks=json.loads((W/'qa/contract_checks.json').read_text());oldchecks=json.loads((old/'evidence/test_results.json').read_text())
sub={'{{SERVICE_TABLE}}':mdtable([['論理サービス','責任・正本','許可経路／停止時']]+[[r[1],r[2]+'。'+r[3],r[4]+'。'+r[5]] for r in service_rows]),'{{CAPACITY_TABLE}}':mdtable([['予算','本版の地上参照値','確定に必要な確認'],['観測保存','8機器×16ch×1Hz、7日、256byte仮定','実測byte、索引、WAL、証拠増加'],['データ領域','100GiB、通常80%上限','100GiBは仮定。OS/更新/AI領域は別'],['転送待ち','2GiB／20,000件、P0–P3','実回線と暗号込み。隔離入口64MiB別枠'],['結果台帳','4GiB、90日以上、未照合は自動削除しない','満杯で新規監督操作を止める'],['CPU／RAM','数値未設定、profileなしはread-only','常駐、ピーク、故障時、応答時間'],['更新・復旧','別領域と旧版を必要量予約','image、data移行、全損復元の実測']]),'{{VERIFICATION_SUMMARY}}':f"本版で **{checks['passed']}/{checks['total']}項目合格**。jsonschema 4.26.0による新7型と旧3型の構造例、選択した拒否条件、SQLite設計DDLの5表・一意キー・外部キーを検査した。7つのschema自体もDraft 2020-12のメタschemaで確認した。これは暗号・OS起動・実行性能の試験ではない。個別結果と対象hashはevidence/contract_checks.jsonに収録する。",
'{{REQUIREMENTS_TABLE}}':mdtable([['要求ID','満たすべき条件','受入段階','残る確認']]+[[x['id'],x['requirement'],','.join(x['verificationLevels']),x['acceptanceStillRequired']] for x in items]),'{{SOURCE_TABLE}}':mdtable([['資料ID','根拠資料','この設計での用途']]+[[s['id'],f"[{s['title']}]({s['url']})" if s.get('url') else s['title'],s.get('design_use',s.get('design_application',s.get('scope','ローカル既存仕様・模型の範囲確認。詳細とhashはsources台帳')))] for s in sources])}
for s in sections:
 for token,value in sub.items():s['body']=s['body'].replace(token,value)
save('sections.json',{'sections':[dict(x,number=i+1) for i,x in enumerate(sections)]})
text='# RockstarOS 設計書完全版 v1.0\n\n2026-09-24 / rocketstar・A-LINK・avokado・コロニー\n\n'
for i,s in enumerate(sections,1):text+=f"## {i:02d} {s['title']}\n\n"+s['body']+'\n\n'
(W/'assembled.md').write_text(text)
(P/'README.md').write_text(f'''# RockstarOS 設計書完全版 v1.0

2026-09-24。OSとシステムソフトの設計基準書。rocketstarの製造・実飛行・有人居住の認定版ではない。

- `{STEM}.pdf`：32章、配置・処理・権限・保存・通信・機上評価・運用・試験。
- `{STEM}.md`：編集可能な本文。2つのSVG図を相対参照する。
- `design_catalog.json`：5配備profile、13論理サービス、地上参照ポリシー、8未入力群。
- `requirements.json/csv`：{len(items)}要求と受入条件。全件の実機受入は未完了。
- `contracts/`：7型Draft 2020-12、合成例、5表の設計DDL。runtimeへ未統合。
- `sources/`：一次資料URL、元repo SHA、ローカル出典hash、過去版の場所。
- `evidence/contract_checks.json`：今回43/43の構造・DDL確認。
- `reference_c0_1/`：旧35件模型試験とそのruntime。今回の新機能試験ではない。
- `capacity_example.json`：100GiBデータ領域の仮定計算。benchmarkではない。
- `manifest.json`：配布ファイルのSHA-256。秘密鍵・実機操作資格は含まない。

## 検証を再現する場合

独立したPython 3.12環境へ `jsonschema==4.26.0` を導入し、このpackage内で `python validation/verify_contracts.py` を実行する。結果はevidence/reproduced_*.jsonへ保存し、出荷時の証拠を上書きしない。必要なDBはメモリー内だけに作る。元OS repoや実設備へ接続しない。Schemaを通過することは本人確認・署名検証・物理完了を意味しない。

元RockstarOSの読取基準SHA：5d5f3dc4f73ac3389c8dbc00f9ca6e8beba526e0。今回そのrepoへ変更を加えていない。新OS image、cFS/RTEMS build、実機driver、無線接続、飛行・居住設備は本packageに完成品として含まれない。
''')
print(json.dumps({'chapters':len(sections),'requirements':len(items),'services':len(services),'sources':len(sources),'package':str(P)},ensure_ascii=False))
