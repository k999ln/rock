from pathlib import Path
import json,hashlib,zipfile
R=Path(__file__).resolve().parents[2];P=R/'outputs/Avokado_Power_Button_Engineering_v1'
sources=json.loads((P/'sources.json').read_text())['sources'];p=P/'hardware_boundary.md';t=p.read_text()
for s in sources:t=t.replace('['+s['id']+']',f"[{s['id']}: {s['title']}]({s['url']})")
p.write_text(t)
p=P/'Avokado_Power_Button_Engineering_v1.md';t=p.read_text().replace('根拠と範囲は付属hardware_boundary.mdとsources.jsonを参照する。','根拠は[ASRock公式manual](https://download.asrock.com/IPC/Manual/4X4-AI350.pdf)と[ACPI 6.6 Power Button Override](https://uefi.org/specs/ACPI/6.6/04_ACPI_Hardware_Specification.html#power-button-override)。適用範囲は付属hardware_boundary.mdとsources.jsonを参照する。');p.write_text(t)
p=P/'USER_CONTROLS.md';p.write_text(p.read_text().replace('30件','32件'))
report=json.loads((P/'evidence/test_results.json').read_text());policy=json.loads((P/'button_behavior.json').read_text())
assert report['passed']==report['total']==policy['modelTestCount']==32
assert len(report['cases'])==32 and all(c['passed'] for c in report['cases'])
for n,h in report['sourceSha256'].items():assert hashlib.sha256((P/n).read_bytes()).hexdigest()==h,n
assert not policy['hardwareQualified']
review={'date':'2026-09-24','status':'PASS_AFTER_CORRECTION','independentReview':'Hardware boundaries and double-action reviewed. Transition-origin gesture promotion identified and corrected.','correction':'Normal gesture admission is latched at down; BOOTING/SHUTTING_DOWN/UPDATING gestures cannot become normal actions just because host becomes ready. Emergency hold remains available.','regressionTests':['test_transition_origin_short_is_not_promoted_after_host_ready','test_transition_origin_long_is_not_promoted_after_host_ready'],'transitionOriginsPerRegressionTest':['BOOTING','SHUTTING_DOWN','UPDATING'],'finalBehavioralTestsPassed':32,'hardwareTestsPerformed':False}
(P/'evidence/review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
files=[p for p in sorted(P.rglob('*')) if p.is_file() and p.name!='manifest.json'];assert not any('__pycache__' in p.parts for p in files)
manifest={'id':'AVO-PWR-BEHAVIOR-01','version':'1.0','scope':'Design and isolated behavioral model; not hardware firmware or qualified power circuitry','hardwareQualified':False,'files':[{'path':str(p.relative_to(P)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(P/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
z=R/'outputs/Avokado_Power_Button_Engineering_v1_package.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as f:
 for p in sorted(P.rglob('*')):
  if p.is_file():f.write(p,str(Path(P.name)/p.relative_to(P)))
with zipfile.ZipFile(z) as f:assert f.testzip() is None
print(json.dumps({'finalTestsPassed':32,'files':len(files)+1,'zip':str(z),'zipBytes':z.stat().st_size},ensure_ascii=False))
