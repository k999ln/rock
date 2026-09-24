"""Verify preserved design artifacts; this is not a physical system test."""
from pathlib import Path
import argparse,hashlib,json,subprocess,zipfile

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=ROOT/'docs/rocketstar-design'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--source',type=Path,help='Optional original task directory for independent copy comparison')
 parser.add_argument('--git',action='store_true',help='Also require every archived source file in the Git index')
 parser.add_argument('--write-report',action='store_true')
 args=parser.parse_args();inv=json.loads((ARCHIVE/'inventory.json').read_text());rows=inv['files'];checks=[]
 def check(name,result):checks.append({'name':name,'passed':bool(result)});assert result,name
 check('inventory identifiers unique',len({x['path'] for x in rows})==len(rows)==inv['file_count'])
 check('inventory byte total',sum(x['bytes'] for x in rows)==inv['total_bytes'])
 check('safe relative source paths',all(not Path(x['path']).is_absolute() and '..' not in Path(x['path']).parts for x in rows))
 check('every copied file has the source bytes',all((ARCHIVE/x['path']).is_file() and (ARCHIVE/x['path']).stat().st_size==x['bytes'] and sha(ARCHIVE/x['path'])==x['sha256'] for x in rows))
 actual={p.relative_to(ARCHIVE).as_posix() for top in ['outputs','work'] for p in (ARCHIVE/top).rglob('*') if p.is_file()}
 check('inventory covers all archived work and outputs',actual=={x['path'] for x in rows})
 check('only documented caches and installed QA dependencies excluded',all('__pycache__' in Path(x['path']).parts or x['path'].endswith('.pyc') or x['path'].startswith('work/os_complete_v1/qa-deps/') or Path(x['path']).name=='.DS_Store' or Path(x['path']).name.startswith('._') for x in inv['excluded_files']))
 zip_count=0
 for row in rows:
  if row['path'].endswith('.zip'):
   with zipfile.ZipFile(ARCHIVE/row['path']) as z:assert z.testzip() is None,row['path']
   zip_count+=1
 check('all preserved ZIPs have valid CRCs',zip_count>0)
 expected=['outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf','outputs/rocketstar_Complete_Design_R1_0_package.zip','outputs/RockstarOS_Complete_Design_v1_0/contracts/operations_store.sql','outputs/Avokado_Power_Button_Engineering_v1/button_behavior.json','outputs/Avokado_Fit_Button_v1/pear_shape_reference.png']
 check('current master and previously missing appendices present',all(x in actual for x in expected))
 check('existing OS PDF equals archived source',sha(ROOT/'docs/rockstaros-complete-design-v1.0.pdf')==sha(ARCHIVE/'outputs/RockstarOS_Complete_Design_v1_0/RockstarOS_Complete_Design_v1_0.pdf'))
 current=ARCHIVE/'outputs/rocketstar_Complete_Design_R1_0'
 manifest=json.loads((current/'manifest.json').read_text())
 check('R1.0 package manifest preserved',all(sha(current/x['path'])==x['sha256'] for x in manifest['files']))
 evidence=json.loads((current/'evidence/package_checks.json').read_text())
 check('R1.0 recorded coverage preserved',evidence['pages']==44 and evidence['chapters']==35 and evidence['requirements']==60 and evidence['system_interfaces']==18)
 check('no flight or manufacturing release inferred',manifest['manufacturing_release'] is False and manifest['flight_release'] is False)
 if args.source:
  check('independent source-to-copy comparison',all((args.source/x['path']).is_file() and sha(args.source/x['path'])==x['sha256'] for x in rows))
 if args.git:
  tracked=set(subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0'))
  check('every inventory file tracked',all('docs/rocketstar-design/'+x['path'] in tracked for x in rows))
  proc=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
  try:
   for row in rows:
    proc.stdin.write((':docs/rocketstar-design/'+row['path']+'\n').encode());proc.stdin.flush()
    header=proc.stdout.readline().decode().strip().split();assert len(header)==3 and header[1]=='blob',row['path']
    size=int(header[2]);data=proc.stdout.read(size);assert proc.stdout.read(1)==b'\n',row['path']
    assert size==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],row['path']
  finally:
   proc.stdin.close();proc.stdout.close();assert proc.wait()==0
  check('Git index blob bytes equal source hashes',True)
 report={'schema':'rocketstar-design-archive-verification/1','scope':'File preservation and documentation integrity, not physical qualification','file_count':len(rows),'bytes':inv['total_bytes'],'zip_count':zip_count,'excluded_count':inv['excluded_count'],'checks':checks,'passed':len(checks),'failed':0,'repository_runtime_changed':False,'manufacturing_release':False,'flight_release':False}
 if args.write_report:(ARCHIVE/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
