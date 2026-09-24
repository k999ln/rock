import json, pathlib, collections
base=pathlib.Path('outputs/RETURN-1_C1_package')
out=pathlib.Path('work/c3_review')
data=json.loads((base/'design_register.json').read_text())
old=json.loads((base/'design_register.json').read_text())
md=(base/'design_register.md').read_text()
data['register_revision']='C3-draft-1'
data['as_of']='2026-09-23'
source={
 'id':'C3','kind':'project_design_revision',
 'title':'RETURN-1 C3 / 統合設計基準書：avokado 意匠の統合改訂',
 'date':'2026-09-23','revision':'C3',
 'path':'/Users/kaiya/Documents/Codex/2026-09-21/codex-threads-01a0bc41-ceb2-72a0-8417/outputs/RETURN-1_C3_package/RETURN-1_C3_Integrated_Design_Baseline.md',
 'package_relative_path':'RETURN-1_C3_Integrated_Design_Baseline.md',
 'scope':'C1方式を継承し、銀サテン・非開口の黒い縦長グラフィック・小さい平面シアン3点・細リングを外観へ統合。機器、窓、LEDを追加せず、材料・寸法・性能・認証を確定しない。G0〜G5の文書上の段階番号を整合。'
}
data['sources'].append(source)
change={
 'issue':'C2外観別紙とC1主文の意匠差、およびRDR-038の旧段階番号',
 'action':'C3で外観指示を主文・図・台帳へ統合。黒グラフィック・シアンは非開口、非機器の平面意匠。G0〜G5を現行番号とし、旧G0〜G6引用は履歴として保持。製造寸法・採用品・性能・台帳状態は変更しない。',
 'affected_ids':['RDR-007','RDR-008','RDR-011','RDR-018','RDR-038']
}
data['supersession'].append(change)
claims={
 'RDR-007':'銀サテン外観、非開口の黒い縦長グラフィック、小さい平面シアン3点、細リングを意匠として統合。窓・カメラ・LED等の機器を追加しない。径・長さ・フィン・脚の具体形状は未確定。',
 'RDR-008':'銀サテンは見た目の指定であり合金・塗装材・表面処理を選定した根拠ではない。意匠のために材料許容値・腐食適合や熱性能を変更しない。',
 'RDR-011':'黒い縦長要素とシアン3点は外装の平面グラフィックで、新しいハッチ・窓・ラッチ・貫通部を追加しない。既存保持式衛星扉の機構設計・荷重・シールは未確定。',
 'RDR-018':'銀サテン・黒いグラフィック・シアン意匠の適用は熱防護機能に従属する。風上TPSを銀色へ置換せず、TPS材料・厚さ・取付や表面処理の熱特性を確定しない。',
 'RDR-038':'現行の判定段階を主文第15章のG0〜G5へ統一。旧版のG0〜G6は出典履歴として区別する。番号整合は試験合格・認定の追加ではない。'
}
for item in data['items']:
 rid=item['id']
 if rid not in claims: continue
 before=next(x for x in old['items'] if x['id']==rid)
 loc='§15' if rid=='RDR-038' else '§02 外観・意匠の適用'
 item['current_evidence'].append({'source_id':'C3','locator':loc,'claim':claims[rid]})
 item['current_disposition'] += ' C3では'+claims[rid]
 if rid=='RDR-038':
  item['required_deliverables']=[s.replace('G0〜G6','G0〜G5') for s in item['required_deliverables']]
  for e in item['current_evidence']:
   if e['source_id']=='BASE': e['claim']='旧版でG0〜G6と試験種別を定義した計画（履歴）。現在適用する番号はC3主文第15章のG0〜G5。'
 start=md.index('### '+rid+' ')
 try: end=md.index('\n### RDR-',start+1)
 except ValueError: end=md.index('\n## 証拠の出典',start+1)
 segment=md[start:end]
 segment=segment.replace(before['current_disposition'],item['current_disposition'])
 before_evidence='<br>'.join(f"[{e['source_id']} {e['locator']}] {e['claim']}" for e in before['current_evidence'])
 after_evidence='<br>'.join(f"[{e['source_id']} {e['locator']}] {e['claim']}" for e in item['current_evidence'])
 assert before_evidence in segment,rid
 segment=segment.replace(before_evidence,after_evidence)
 segment=segment.replace('；'.join(before['required_deliverables']),'；'.join(item['required_deliverables']))
 md=md[:start]+segment+md[end:]
md=md.replace('版 draft-2 / C1 D01〜D08照合 | 2026-09-23','版 C3-draft-1 / C1 D01〜D08を継承、C3意匠を統合 | 2026-09-23')
md=md.replace('出典：本版C1統合設計基準書の第04章','出典：旧C1統合設計基準書の第04章')
section='''## C3の文書改訂

C1の方式選定・計算結果・未確定状態を継承し、C2別紙だった外観をC3へ統合します。銀サテン、非開口の黒い縦長グラフィック、小さい平面シアン3点、細リングは意匠です。カメラ、窓、LED、配線、ハッチ等の機器を追加しません。径・長さ・フィン・脚の具体形状は未確定です。機能と材料の評価は従来どおり必要で、認証・製造・飛行の証拠は増えていません。

外観の根拠はRDR-007/008/011/018へ追記しました。RDR-038は主文のG0〜G5へ段階番号を整合し、旧版G0〜G6の記録は履歴として区別します。C1の根拠を削除・上書きせず、C3の変更範囲だけを追加しています。

'''
md=md.replace('## 現在の主要な未成立点',section+'## 現在の主要な未成立点')
newsource=f"- **C3** [{source['title']}]({source['path']})。{source['scope']} 同梱参照：{source['package_relative_path']}。\n"
md=md.replace('\n本台帳の「いま使える証拠」', '\n'+newsource+'\n本台帳の「いま使える証拠」')
md=md.replace('原資料の版更新、C1方式変更、','原資料の版更新、C1から継承した方式やC3意匠の変更、')
assert {x['id']:x['status'] for x in old['items']}=={x['id']:x['status'] for x in data['items']}
assert all(not x['manufacturing_release'] and not x['certification_evidence'] for x in data['items'])
assert not data['manufacturing_release'] and not data['flight_release'] and data['certified_count']==0
for item in data['items']:
 assert item['current_disposition'] in md, item['id']
 for e in item['current_evidence']:
  assert f"[{e['source_id']} {e['locator']}] {e['claim']}" in md,(item['id'],e)
 assert '；'.join(item['required_deliverables']) in md,item['id']
assert len(data['items'])==40
(out/'design_register.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(out/'design_register.md').write_text(md)
checks={'items':40,'status_counts':dict(collections.Counter(x['status'] for x in data['items'])),'states_unchanged':True,'md_json_evidence_parity':True,'manufacturing_release':False,'flight_release':False,'certified_count':0,'modified_item_ids':list(claims),'c1_files_edited':False}
(out/'register_checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(checks,ensure_ascii=False,indent=2))
