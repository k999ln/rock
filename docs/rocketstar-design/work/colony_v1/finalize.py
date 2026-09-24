from pathlib import Path
import hashlib,json,zipfile
from pypdf import PdfReader
R=Path(__file__).resolve().parents[2];P=R/'outputs/RockstarOS_Colony_C0_1';W=R/'work/colony_v1'
result=json.loads((P/'evidence/test_results.json').read_text())
assert result['testsRun']==result['passed']==35 and not (result['errors'] or result['failures'] or result['skipped'])
for rel,dig in result['sourceSha256'].items():assert hashlib.sha256((P/'runtime'/rel).read_bytes()).hexdigest()==dig,rel
for p in P.rglob('*.json'):json.loads(p.read_text())
profile=json.loads((P/'mission_profile.json').read_text());assert all(v is None for v in profile['mission'].values())
assert not any(profile['operationalRelease'].values())
req=json.loads((P/'requirements.json').read_text())['items'];assert len({x['id'] for x in req})==36
assert not any(x['hardwareVerified'] for x in req)
body=(P/'RockstarOS_Colony_C0_1_Integrated_Design.md').read_text()
for x in req:assert x['id'] in body
reader=PdfReader(P/'RockstarOS_Colony_C0_1_Integrated_Design.pdf')
assert len(reader.pages)==18
pdftext='\n'.join(p.extract_text() or '' for p in reader.pages)
for x in req:assert x['id'] in pdftext
assert not '{{' in body
assert not list(P.rglob('*.sqlite*'))
layout=json.loads((W/'qa/pdf_content.json').read_text())
(P/'evidence/document_checks.json').write_text(json.dumps({'pdfPages':18,'chapterCount':15,'allRequirementIdsPresent':True,'packagedPythonMatchesTestHashes':True,'allJsonParses':True,'missionInputsRemainUnset':True,'physicalReleaseGranted':False,'visualReview':'All 18 final page renders reviewed in contact sheets; full page review of command flow and test evidence. Orphan continuation pages corrected. No visible clipping or overlaps.','schemaStandardValidation':'NOT_RUN; jsonschema not installed','chapters':layout['chapters']},ensure_ascii=False,indent=2)+'\n')
files={str(p.relative_to(P)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(P.rglob('*')) if p.is_file() and p.name!='manifest.json'}
(P/'manifest.json').write_text(json.dumps({'package':'RockstarOS Colony C0.1','generatedOn':'2026-09-23','mode':'design_and_SIM_ONLY','hashAlgorithm':'SHA-256','scope':'All package files except this manifest; hashes ensure byte consistency, not physical truth.','files':files},ensure_ascii=False,indent=2)+'\n')
z=R/'outputs/RockstarOS_Colony_C0_1_package.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as f:
    for p in sorted(P.rglob('*')):
        if p.is_file():f.write(p,str(p.relative_to(P.parent)))
with zipfile.ZipFile(z) as f:
    assert f.testzip() is None
    for rel,dig in files.items():assert hashlib.sha256(f.read(P.name+'/'+rel)).hexdigest()==dig
print(json.dumps({'pdfPages':18,'requirements':36,'testsPassed':35,'files':len(files)+1,'archive':str(z),'archiveBytes':z.stat().st_size,'manifestChecked':True},ensure_ascii=False))
