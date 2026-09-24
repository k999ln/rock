from pathlib import Path
import json,re,shutil,hashlib,csv

R=Path(__file__).resolve().parents[2]
W=R/'work/rocket_complete_v1'; P=R/'outputs/rocketstar_Complete_Design_R1_0'
STEM='rocketstar_Complete_Design_R1_0'
P.mkdir(parents=True,exist_ok=True)
def save(name,value):
 p=P/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def table(rows):return '\n'.join('| '+' | '.join(map(str,r))+' |' for r in [rows[0],['---']*len(rows[0])]+rows[1:])
def split(path):
 parts=re.split(r'^## (.+)\n',path.read_text(),flags=re.M)
 return [(parts[i],parts[i+1].strip()) for i in range(1,len(parts),2)]

# Historic evidence stays byte-identical. It is not promoted to R1.0 performance.
copied=[]
for f in sorted((R/'outputs/rocketstar_C3_package').iterdir()):
 if f.is_file() and f.suffix in {'.md','.json','.csv','.py','.svg','.png','.txt'}:
  dest=P/'reference_c3'/f.name;dest.parent.mkdir(exist_ok=True);shutil.copy2(f,dest)
  copied.append({'original':str(f.relative_to(R)),'copy':str(dest.relative_to(P)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
for f in (W/'mass_audit').rglob('*'):
 if f.is_file() and f.suffix in {'.py','.md','.json'}:
  dest=P/'mass_audit'/f.relative_to(W/'mass_audit');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
for name in ['requirements.json','requirements.csv','system_interfaces.json']:
 shutil.copy2(W/'contributions'/name,P/name)

profile={
 'document':'rocketstar mission profile','revision':'R1.0','date':'2026-09-24',
 'requirements':{'name':'rocketstar','uncrewed':True,'small_satellite_launch':True,'stage_count':2,'recover_and_reuse_both_stages':True,'reuse_same_serial_required':True},
 'selected_for_study':{'propellants':['LOX','liquid methane'],'stage1_recovery':'downrange offshore vertical landing','stage2_recovery':'designated land vertical landing','payload_door':'retained leeward door','windward_tps':'continuous reusable thermal protection','flight_software_candidate':'cFS + RTEMS; not flight selected or qualified'},
 'comparison_assumptions':{'status':'analysis_assumption_not_guaranteed_performance','satellites':2,'satellite_mass_each_kg':500,'payload_total_kg':1000,'orbit_altitude_km':550,'inclination_deg':53},
 'open_inputs':{},'manufacturing_release':False,'flight_release':False,'physical_validation':False}
opens=[
 ('launch_country','発射国・適用制度','運用/システム','RDR-040'),('launch_site','射場・射向の条件','運用/飛行','RDR-002'),
 ('recovery_sites','両段の回収区域・設備条件','回収/飛行','RDR-029'),('payload_envelope','衛星実機の包絡・質量特性','衛星/構造','RDR-032'),
 ('injection_tolerances','投入状態・許容誤差','ミッション/衛星','RDR-002'),('coupled_performance','同一構成の上昇・帰還・余裕','統合性能','RDR-005'),
 ('vehicle_dimensions','全高・直径・板厚・可動範囲','構造/配置','RDR-007'),('engine_selection','型式・個数・運転範囲・寿命','推進','RDR-014'),
 ('materials_processes','材料・接合・製造工程','材料/製造','RDR-008'),('tps_selection','熱防護の材料・厚さ・取付','熱/構造','RDR-018'),
 ('avionics_selection','計算機・電源・回路・ハーネス','電装','RDR-024'),('link_specification','管制RF・周波数・可視・容量','通信/運用','RDR-033'),
 ('reuse_life','再使用回数・寿命・検査限界','整備/品質','RDR-036'),('schedule_cost','開発期間・体制・費用・調達','プロジェクト','RDR-039')]
for key,title,owner,rdr in opens:profile['open_inputs'][key]={'value':None,'meaning':title,'responsible_discipline':owner,'rdr':rdr}
save('mission_profile.json',profile)

base=[
 {'id':'RS-S01','title':'NASA Appendix L — Interface Requirements Document Outline','url':'https://www.nasa.gov/reference/appendix-l-interface-requirements-document-outline/','design_application':'責任・座標・許容差・機械/流体/電気/データ/環境の接続内容'},
 {'id':'RS-S02','title':'NASA Systems Engineering Handbook — Product Realization','url':'https://www.nasa.gov/reference/5-0-product-realization/','design_application':'設計検証・資格評価・各個体の受入とリリースの区別'},
 {'id':'RS-S03','title':'ECSS-E-ST-10C Rev.1 — System Engineering General Requirements','url':'https://ecss.nl/standard/ecss-e-st-10c-rev-1-system-engineering-general-requirements-15-february-2017/','design_application':'仕様、機能構成、予算、比較、要求対応の管理'},
 {'id':'M-S1','title':'NASA Glenn — Ideal Rocket Equation','url':'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/','design_application':'質量比と比推力による理想増分。実軌道や本機性能を保証しない'}]
vr=json.loads((W/'contributions/vehicle_reuse_sources.json').read_text())
av=json.loads((W/'contributions/avionics_payload_sources.json').read_text())
sources=base+vr['sources']+av['primary_sources']
local=[]
for s in av['local_baselines']:
 entries=[]
 for path in s['paths']:
  f=R/path
  assert f.exists(),path
  if 'rocketstar_C3_package' in path:dest=P/'reference_c3'/f.name
  else:
   dest=P/'context'/s['id']/f.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
  entries.append({'original':path,'copy':str(dest.relative_to(P)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 local.append({'id':s['id'],'title':s['title'],'used':s['used'],'files':entries})
save('sources.json',{'checked':'2026-09-24','scope':'method references; no compliance or qualification claim','sources':sources,'local_baselines':local,'c3_copies':copied})

roots={};root_order=[]
for title,body in split(W/'root_sections.md'):
 key,title=title.split(' | ',1);roots[key]=(title,body);root_order.append(key)
sections=[]
def add(key,title,body):sections.append({'key':key,'title':title,'body':body})
for key in root_order[:7]:add(key,*roots[key])
mass=split(W/'mass_audit/mass_performance.md')
groups=[('質量・性能の位置付けと再現監査',[0,1]),('質量区分と状態別の重量',[2,3]),('理想上昇性能と帰還量の照合',[4,5]),('逆算値・衛星残留の比較',[6,7]),('性能を確定する条件と監査記録',[8,9])]
for j,(title,indices) in enumerate(groups):
 body='\n\n'.join('### '+re.sub(r'^\d+\. ','',mass[i][0])+'\n\n'+mass[i][1] for i in indices)
 add('mass'+str(j+1),title,body)
for j,(title,body) in enumerate(split(W/'contributions/vehicle_reuse.md'),1):add('v'+str(j),re.sub(r'^\d+\. ','',title),body)
add('aero_gnc','空力・飛行力学・航法制御の結合設計',(W/'contributions/aero_gnc.md').read_text())
for j,(title,body) in enumerate(split(W/'contributions/avionics_payload.md'),1):add('av'+str(j),re.sub(r'^AVP-\d+ ','',title),body)
budget='''各段は地上接続を外してから回収側へ引き渡すまで、自段に必要な資源を持つ。ピーク電力と総エネルギーを別に管理し、帰還前の待機や回収後の記録も積み上げる。上昇が終わった時点で収支を切らない。

| 予算ID | 積み上げる入力・出力 | 確定する根拠 |
| --- | --- | --- |
| BUD-PWR | モード別の負荷、同時動作、突入、配電損失、供給・保護 | 実機器仕様、配線、切替過渡、故障時の負荷試験 |
| BUD-ENG | モードの継続時間、電池の使用可能量、温度・劣化・残余 | 両段別の全時間帯、実電池特性、容量・劣化試験 |
| BUD-THM | 外部加熱、内部発熱、断熱、熱伝導・放射、許容温度 | 同じ形状・材質・時刻条件の熱モデルと相関試験 |
| BUD-DATA | 計測レート、最大メッセージ、欠測時間、保存・再送枠 | 最大負荷での生成・保管・読み出し、記録満杯時の動作 |
| BUD-RF | 各段/衛星/地上の視線、アンテナ姿勢、伝搬、回線容量 | 各管制経路の収支・可視解析、RF/EMCと実回線試験 |
| BUD-CPU | 周期、締切、実行時間、割込み、キュー、メモリー | 対象CPU/BSP/機器での最悪条件・異常時の測定 |

電源の比較では、負荷側エネルギーをモード別電力×継続時間の和として求め、損失・劣化・許容残余を供給側へ一度ずつ計上する。負荷のピークを平均消費へ置き換えない。電池容量、母線電圧、電線、保護器、ヒーター、機上データ量にはまだ数値を採用していない。

熱予算はTPS表面だけでなく、推進剤、電池、計算機、センサー、扉機構を含む。センサーが動く温度と校正が有効な温度を区別する。真空での放熱、地上待機、再突入、接地後で境界条件を切り替え、通風を軌道上の冷却能力へ流用しない。

管制通信は機体姿勢・遮蔽・飛行区域・待機を含む。avokadoに電源があるだけで衛星の見通しや地上経路が生まれるわけではなく、全経路が届かない場合は通信待ちとなる。A-LINKの透明中継案では利用者とゲートウェイの同時可視性が必要で、衛星2機による常時接続、衛星内蓄積や衛星間通信を実装済みとはしない。

予算の正本は構成版・状態・入力出典・不確かさ・担当を持つ。未設定は0 W、0秒、0 bitに変換しない。余裕の残る分野と不足する分野を平均せず、一つでも必須条件が閉じなければ、その構成を成立済みへ進めない。'''
add('budgets','電力・熱・記録・通信の資源予算',budget)
for key in root_order[7:]:add(key,*roots[key])
for i,s in enumerate(sections,1):s['number']=i
section_map={s['key']:s for s in sections}

req=json.loads((P/'requirements.json').read_text())
items=req['items']
icds=json.loads((P/'system_interfaces.json').read_text())['items']
def sec(x):
 key=x['section_key'];key='mass1' if key=='mass' else key
 assert key in section_map,key
 return f"{section_map[key]['number']:02d}"
r=[['要求ID / 章','要求・確認対象','検証 / 段階','必要な実機・設計証拠']]
for x in items:r.append([x['id']+' / '+sec(x),x['statement'],x['verification_method']+' / '+x['gate'],'・'.join(x['required_evidence'])+'（'+', '.join(x['rdr_links'])+'）'])
replacements={
 '{{REQUIREMENTS_TABLE}}':table(r),
 '{{INTERFACE_TABLE}}':table([['ICD / 接続','両側・管理責任','確定する内容']]+[[x['id']+' '+x['name'],x['side_a']+' ↔ '+x['side_b']+' / '+x['owner'],'・'.join(x['required_fields'])] for x in icds]),
 '{{OPEN_INPUT_TABLE}}':table([['未確定の入力','主な責任','対応台帳']]+[[title,owner,rdr] for key,title,owner,rdr in opens]),
 '{{EVIDENCE_SUMMARY}}':table([['今回確認した範囲','確認結果','証拠の限界'],['C3質量計算の再現','JSON・Markdownが原本とバイト一致','入力と式の再現であり物理性能の確認ではない'],['独立数式照合','4,790数値項目・最大差 約3.64×10⁻¹²','上昇/逆算434行＋帰還表4行の算術'],['設計状態と参照','C3台帳40件、認定証拠0','方式選定・仮定と未確定を維持'],['R1.0本文と付録','章・要求・ICD・出典・ファイル同一性を検査','文書・データの整合性。実機・飛行の検証ではない']]),
 '{{SOURCES_TABLE}}':table([['資料ID','一次資料 / 参照文書','本書で使う範囲']]+[[x['id'],f"[{x['title']}]({x['url']})",x['design_application']] for x in sources]+[[x['id'],x['title'],' / '.join(x['used'][:2])+'。同梱contextまたはreference_c3を参照。'] for x in local])}
for s in sections:
 for token,value in replacements.items():s['body']=s['body'].replace(token,value)
 for source in sources:
  s['body']=re.sub(r'\['+re.escape(source['id'])+r'\](?!\()',f"[{source['id']}]({source['url']})",s['body'])
 # Full report source already has the inline primary link; keep it unchanged.
md='# rocketstar ロケット完全版設計書 R1.0\n\n2026-09-24 / 両段再使用・無人小型衛星輸送 / 統合システム設計\n\n'
md+='\n\n'.join(f"## {s['number']:02d} {s['title']}\n\n{s['body']}" for s in sections)+'\n'
(W/'assembled.md').write_text(md)
save('sections.json',{'revision':'R1.0','section_groups':{'mass':{'entry':'mass1','members':['mass1','mass2','mass3','mass4','mass5'],'meaning':'質量関連要求の本文参照は08章から続く08-12章の一連の設計と監査を指す'}},'items':[{k:v for k,v in s.items() if k!='body'} for s in sections]})
print(json.dumps({'chapters':len(sections),'requirements':len(items),'system_interfaces':len(icds),'primary_sources':len(sources),'characters':len(md)},ensure_ascii=False))
