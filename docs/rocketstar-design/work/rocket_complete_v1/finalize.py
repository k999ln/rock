from pathlib import Path
import json,re,hashlib,zipfile,shutil,csv
from pypdf import PdfReader
R=Path(__file__).resolve().parents[2];W=R/'work/rocket_complete_v1';P=R/'outputs/rocketstar_Complete_Design_R1_0';STEM='rocketstar_Complete_Design_R1_0'
def load(p):return json.loads(p.read_text())
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
checks=[]
def check(name,condition):
 checks.append({'name':name,'passed':bool(condition)});assert condition,name
sections=load(P/'sections.json')['items'];req=load(P/'requirements.json')['items'];icds=load(P/'system_interfaces.json')['items'];reg=load(P/'reference_c3/design_register.json');pl=load(P/'reference_c3/payload_interfaces.json');src=load(P/'sources.json');profile=load(P/'mission_profile.json');audit=load(P/'mass_audit/audit.json')
pdf=PdfReader(P/(STEM+'.pdf'));whole='\n'.join(p.extract_text() or '' for p in pdf.pages);md=(P/(STEM+'.md')).read_text()
check('master has all numbered chapters',all(f"{s['number']:02d} {s['title']}" in whole for s in sections))
check('all current requirements appear in PDF',all(x['id'] in whole for x in req))
check('all current interface identifiers appear in PDF',all(x['id'] in whole for x in icds))
check('no unresolved template tokens','{{' not in md and '{{' not in whole)
check('unique current identifiers',len({x['id'] for x in req})==len(req) and len({x['id'] for x in icds})==len(icds))
section_keys={x['key'] for x in sections}|set(load(P/'sections.json')['section_groups'])
check('all requirement chapter or group references resolve',all(x['section_key'] in section_keys for x in req))
with (P/'requirements.csv').open(encoding='utf-8-sig',newline='') as f:csv_items=list(csv.DictReader(f))
for x in csv_items:
 for field in ['rdr_links','required_evidence','physical_verified']:x[field]=json.loads(x[field])
check('requirement JSON and CSV every field identical',csv_items==req)
ids={x['id'] for x in reg['items']}
check('all requirement RDR links valid',all(set(x['rdr_links'])<=ids for x in req))
check('all interface RDR links valid',all(set(x['rdr_links'])<=ids for x in icds))
check('all inherited RDR fields referenced by current requirements',set().union(*(set(x['rdr_links']) for x in req))==ids)
check('requirements not physically verified',all(x['physical_verified'] is False for x in req))
check('interfaces values remain open',all(x['status']=='open' and x['numeric_values'] is None for x in icds))
check('C3 state distribution preserved',reg['status_counts']=={'requirement_locked':2,'architecture_selected':6,'analysis_assumption':4,'open':28,'certified':0})
check('13 inherited payload interfaces',len(pl['interfaces'])==13)
check('no manufacturing or flight release',all(x is False for x in [profile['manufacturing_release'],profile['flight_release'],reg['manufacturing_release'],reg['flight_release'],audit['physical_validation']]))
check('open mission inputs remain explicit null',all(x['value'] is None for x in profile['open_inputs'].values()))
check('all primary references appear in master',all(x['url'] in md for x in src['sources']))
check('current master image links resolve',all((P/url).is_file() for url in re.findall(r'!\[[^\]]*\]\(([^)]+)\)',md)))
check('independent numeric comparison recorded',audit['counts']['scalar_field_comparisons']==4790 and audit['independent_checks']['all_checked_numeric_fields_match'])
check('historical copies byte-identical',all(hashlib.sha256((P/x['copy']).read_bytes()).hexdigest()==x['sha256'] for x in src['c3_copies']))
check('context source copies byte-identical',all(hashlib.sha256((P/f['copy']).read_bytes()).hexdigest()==f['sha256'] for x in src['local_baselines'] for f in x['files']))
check('PDF page count matches rendering record',load(W/'qa/pdf_content.json')['pages']==len(pdf.pages))
review=load(W/'qa/visual_review.json')
check('all final pages visually reviewed',review['pdf_sha256']==hashlib.sha256((P/(STEM+'.pdf')).read_bytes()).hexdigest() and set(review['pages_reviewed'])==set(range(1,len(pdf.pages)+1)) and review['status']=='PASS')
write(P/'evidence/package_checks.json',{'kind':'document and data integrity checks; not physical qualification','checks':checks,'passed':len(checks),'failed':0,'chapters':len(sections),'pages':len(pdf.pages),'requirements':len(req),'system_interfaces':len(icds),'inherited_design_items':len(reg['items']),'inherited_payload_interfaces':len(pl['interfaces']),'primary_sources':len(src['sources'])})
for name in ['pdf_content.json','visual_review.json']:
 shutil.copy2(W/'qa'/name,P/'evidence'/name)
shutil.copy2(W/'contributions/content_review.md',P/'evidence/content_review.md')
write(P/'evidence/review_resolution.json',{'R-01':'Mass comparison explicitly limited to upper-stage two-segment illustration; not both-stage return validation.','R-02':'Added dedicated aero/flight-dynamics/GNC responsibility, model, and evidence section.','R-03':'Added pre-deorbit TPS state-evaluation requirement and unknown coverage treatment.','R-04':'Added stage power/energy/internal thermal/data/RF/CPU budgets; RDR-026 linked in mass closure.'})
readme=f'''# rocketstar ロケット完全版設計書 R1.0

2026-09-24 / {len(pdf.pages)}ページ・{len(sections)}章。無人の小型衛星輸送、両段回収・同機番再使用を対象とする統合システム設計。

- [{STEM}.pdf]({STEM}.pdf)：読書・共有用。目次、機能図、質量監査、各系統、製造・検証・再使用条件を収録。
- [{STEM}.md]({STEM}.md)：編集可能な本文。画像は同梱の相対パスで参照。
- [mission_profile.json](mission_profile.json)：利用者要求、選定方式、比較仮定、未設定の物理入力。
- [requirements.json](requirements.json) / [CSV](requirements.csv)：{len(req)}要求、章、C3台帳、検証と必要証拠。
- [system_interfaces.json](system_interfaces.json)：{len(icds)}全体接続。具体的な機器・数値は未確定。
- [reference_c3/design_register.md](reference_c3/design_register.md)：既存40項目。要求固定2、方式選定6、解析仮定4、未確定28、認定0。
- [reference_c3/payload_interfaces.md](reference_c3/payload_interfaces.md)：衛星との13接続。
- [mass_audit/mass_performance.md](mass_audit/mass_performance.md) / [audit.json](mass_audit/audit.json)：独立監査。4,790項目は算術照合数。
- [sources.json](sources.json)：一次資料、ローカル基準の出典と同一性。
- [evidence/package_checks.json](evidence/package_checks.json)：文書検査。飛行・実機性能の証拠ではない。

`reference_c3`と`context`は出典の保存用。旧名称、旧絶対パス、当時の参照先を原文どおり残す。これらの旧版のリンク先を全て同梱したわけではなく、現行の採用値はR1.0本文と台帳に従う。旧C3の生成外観画像は意匠参考で、製造図や機体写真ではない。

## 到達点

機体設計の分野と追跡範囲をまとめた完全版。加工図面、実部品BOM、飛行用設定、製造・充填・点火の作業手順は未作成。構造・推進・熱・飛行・両段回収・再使用の実機証拠、運用許認可は未取得。全長やエンジンを架空の数値で確定していない。

618.6tと819.7tは計算比較値で、採用済みの打上げ質量ではない。550km・53度・500kg×2は比較仮定。質量監査の帰還横断判定は上段の説明用条件に限り、第1段帰還を含む成功判定ではない。

## 計算監査の再現

Python標準ライブラリーのみを使う。出典4ファイルを読み、監査側のreplayで生成して照合する。パッケージの任意の場所から実行する場合、`mass_audit/run_audit.py`に`--source`で`reference_c3`の絶対パスを渡す。再実行すると監査記録とreplayが更新され、配布時のmanifestとは異なるファイルになるため、作業用のコピーで実行する。

## 版の変更

C3の物理方式・意匠と未確定状態を保持し、R1.0で機体本体の各設計分野、飛行力学、資源、搭載・電装・OS接続、地上運用、整備再使用、要求・検証を統合した。OSの地上契約とボタンの設計は参照のみ。ボタン操作を飛行コマンドへ割り当てていない。

`manifest.json`は配布ファイルのSHA-256とサイズを記録する。内容の工学認定を意味しない。
'''
(P/'README.md').write_text(readme)
files=[]
for f in sorted(P.rglob('*')):
 if f.is_file() and f.name!='manifest.json':files.append({'path':str(f.relative_to(P)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
write(P/'manifest.json',{'title':'rocketstar Complete System Design','revision':'R1.0','date':'2026-09-24','manufacturing_release':False,'flight_release':False,'files':files})
out=R/'outputs/rocketstar_Complete_Design_R1_0_package.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(P.rglob('*')):
  if f.is_file():z.write(f,str(Path(P.name)/f.relative_to(P)))
with zipfile.ZipFile(out) as z:assert z.testzip() is None
print(json.dumps({'pdf':str(P/(STEM+'.pdf')),'pages':len(pdf.pages),'chapters':len(sections),'package_checks':len(checks),'files':len(files)+1,'zip_bytes':out.stat().st_size},ensure_ascii=False))
