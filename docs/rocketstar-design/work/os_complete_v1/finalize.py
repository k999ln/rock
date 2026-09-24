from pathlib import Path
import json,hashlib,zipfile,re,sqlite3,shutil
from pypdf import PdfReader
R=Path(__file__).resolve().parents[2];W=R/'work/os_complete_v1';P=R/'outputs/RockstarOS_Complete_Design_v1_0';STEM='RockstarOS_Complete_Design_v1_0'
def read(n):return json.loads((P/n).read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
cat=read('design_catalog.json');req=read('requirements.json')['items'];secs=read('sections.json')['sections'];ev=read('evidence/contract_checks.json');pdf=PdfReader(P/(STEM+'.pdf'))
assert len(cat['services'])==13 and len(cat['profiles'])==5 and len(cat['openInputs'])==8
assert len(req)==60 and len({r['id'] for r in req})==60 and all(not r['operationallyVerified'] for r in req)
assert len(secs)==32 and [s['number'] for s in secs]==list(range(1,33))
assert all(r['sectionId'] in {s['id'] for s in secs} for r in req)
assert not cat['operationalRelease'] and all(x['value'] is None for x in cat['openInputs'])
assert ev['passed']==ev['total']==43 and len(ev['cases'])==43 and all(c['passed'] for c in ev['cases'])
for n,h in ev['sourceSha256'].items():assert sha(P/n)==h,n
assert read('reference_c0_1/evidence/test_results.json')['passed']==35
reproduced=read('evidence/reproduced_contract_checks.json');assert reproduced==ev
assert len(pdf.pages)==41 and len(pdf.outline)==32
page_text='\n'.join(p.extract_text() for p in pdf.pages)
assert all(r['id'] in page_text for r in req)
md=(P/(STEM+'.md')).read_text();assert '{{' not in md
for f in re.findall(r'!\[[^\]]*\]\(([^)]+)\)',md):assert (P/f).exists(),f
policy=cat['groundReferencePolicy'];assert sum(x['quotaMiB'] for x in policy['priorities'])*2**20==policy['spoolBytes'];assert sum(x['schedulingShare'] for x in policy['priorities'])==1
cap=read('capacity_example.json');calc=8*16*256*86400*7*2/2**30+8;assert calc==cap['estimatedUsageGiB'] and cap['headroomGiB']==80-calc
sourceids=[s['id'] for s in read('sources/index.json')['sources']];assert len(sourceids)==len(set(sourceids))
checks={'date':'2026-09-24','status':'PASS','pdfPages':41,'chapters':32,'requirements':60,'logicalServices':13,'profiles':5,'newSchemas':7,'contractAndDdlCases':43,'legacySimTestsReferencedNotRerun':35,'contractFileHashesVerified':len(ev['sourceSha256']),'schemaReproductionMatchesOriginal':True,'allRequirementsHaveSections':True,'allRequirementsOperationallyVerified':False,'allPagesRenderedAndVisuallyInspected':True,'layoutCorrection':'TOC consolidated; command lifecycle orphan removed; long transition labels wrapped at arrow; page 14 re-rendered and inspected','pdfTextAndOutline':'PASS','capacityArithmetic':'PASS','newOsOrHardwareTestsRun':False,'independentReview':'No material catalog/requirement/evidence inconsistencies; full-envelope storage, result dedup and unknown-result ownership corrected before finalization.'}
(P/'evidence/package_checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
shutil.copy2(W/'qa/pdf_content.json',P/'evidence/pdf_content.json')
# Reproduction outputs are retained as repeat evidence of the same 43 checks, not extra test cases.
files=[p for p in P.rglob('*') if p.is_file() and p.name!='manifest.json']
assert not any('__pycache__' in p.parts or 'qa-deps' in p.parts for p in files)
manifest={'schema':'rockstaros.package-manifest/1','date':'2026-09-24','name':STEM,'operationalRelease':False,'hashAlgorithm':'sha256','manifestSelfExcluded':True,'files':[{'path':str(p.relative_to(P)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(files)]}
(P/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
z=R/'outputs'/f'{STEM}_package.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as out:
 for p in sorted(P.rglob('*')):
  if p.is_file():out.write(p,str(Path(P.name)/p.relative_to(P)))
with zipfile.ZipFile(z) as zp:
 assert zp.testzip() is None
 assert len(zp.namelist())==len(files)+1
print(json.dumps({'pdf':str(P/(STEM+'.pdf')),'pages':len(pdf.pages),'zip':str(z),'packageFiles':len(files)+1,'zipBytes':z.stat().st_size,'qa':'PASS'},ensure_ascii=False))
