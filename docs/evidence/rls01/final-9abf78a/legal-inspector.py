"""Read-only inspection before packaging a corresponding-source archive."""
import argparse,hashlib,json,tarfile
from pathlib import Path,PurePosixPath
p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--images',type=Path,required=True);p.add_argument('--source',required=True);a=p.parse_args()
assert not a.output.exists()
with a.archive.open('rb') as f:archive_sha=hashlib.file_digest(f,'sha256').hexdigest()
files={};directories=[];manifests={};total=0;source_files={};source_commit=None;regression_reports={}
with tarfile.open(a.archive,'r:gz') as tar:
 for entry in tar:
  name=entry.name.rstrip('/');parts=PurePosixPath(name)
  assert name and not parts.is_absolute() and str(parts)==name and '..' not in parts.parts and name not in files and name not in directories
  if entry.isdir():directories.append(name);continue
  assert entry.isfile() and not entry.sparse and entry.size<=2*1024**3
  total+=entry.size;assert total<=4*1024**3 and len(files)<40000
  small_json=entry.size<=8*1024**2 and name.endswith('.json')
  with tar.extractfile(entry) as stream:
   raw_json=stream.read() if small_json else None
   digest=hashlib.sha256(raw_json).hexdigest() if small_json else hashlib.file_digest(stream,'sha256').hexdigest()
  files[name]={'bytes':entry.size,'sha256':digest,'mode':entry.mode}
  if name=='corresponding-source/rock-source.tar':
   with tar.extractfile(entry) as stream,tarfile.open(fileobj=stream,mode='r|') as source_tar:
    source_commit=source_tar.pax_headers.get('comment');source_names=set();source_total=0
    for member in source_tar:
     p=PurePosixPath(member.name)
     assert member.name and not p.is_absolute() and str(p)==member.name and '..' not in p.parts and member.name not in source_names
     source_names.add(member.name);assert len(source_names)<40000
     if member.isdir():continue
     assert member.isfile() and not member.sparse and member.size<=2*1024**3
     source_total+=member.size;assert source_total<=4*1024**3
     with source_tar.extractfile(member) as data:source_files[member.name]=hashlib.file_digest(data,'sha256').hexdigest()
  if small_json:
   try:value=json.loads(raw_json)
   except (UnicodeDecodeError,json.JSONDecodeError):continue
   if isinstance(value,dict) and value.get('schema')=='rock-build-corresponding-sources/1':manifests[name]=value
   if isinstance(value,dict) and value.get('schema')=='rock-native-regressions/1':regression_reports[name]=value
assert len(manifests)==1,'exact corresponding sources manifest required'
manifest=next(iter(manifests.values()));manifest_name=next(iter(manifests))
observed={name:{key:record[key] for key in ('sha256','bytes')} for name,record in files.items() if name!=manifest_name}
assert manifest['files']==observed,'legal manifest inventory differs from every actual regular member'
images=a.images.resolve(strict=True);freeze_path=images/'freeze-manifest.json';freeze=json.loads(freeze_path.read_text())
assert manifest['source_commit']==a.source==freeze['source_commit']
assert source_commit==a.source and source_files==freeze['source_files_sha256'],'nested full Git archive commit/files differ from frozen source'
bound_reports={name:report for name,report in regression_reports.items() if files[name]['sha256']==freeze['source_report_sha256']}
assert bound_reports,'the exact successful regression report must accompany the same release'
ci=next(iter(bound_reports.values()))
assert ci['status']=='PASS' and ci['source_unchanged'] is True and ci['changed_inputs']==[]
assert ci['total_python_test_executions']==freeze['source_tests']['python_executions'] and len(ci['checks'])==freeze['source_tests']['checks']
assert all(check['passed'] is True and check['exit_code']==0 and check['skipped'] is False and check['unclean_log'] is False for check in ci['checks'])
assert all(source_files.get(name)==sha for name,sha in ci['input_sha256'].items())
assert {check['log_sha256'] for check in ci['checks']}<={v['sha256'] for v in files.values()},'successful regression log bytes missing'
failed_reports={name:r for name,r in regression_reports.items() if r['status']=='FAIL' and r['input_sha256']==ci['input_sha256']}
assert failed_reports,'the original same-source local regression failure must remain in the corresponding-source bundle'
assert all(check['log_sha256'] in {v['sha256'] for v in files.values()} for r in failed_reports.values() for check in r['checks'])
regression_provenance={'success_report_members':list(bound_reports),'success_report_sha256':freeze['source_report_sha256'],'machine':ci['machine'],'platform':ci['platform'],'python':ci['python'],'python_executions':ci['total_python_test_executions'],'checks':len(ci['checks']),'native_inputs':len(ci['input_sha256']),'original_failure_members':list(failed_reports),'original_failure_machines':sorted({r['machine'] for r in failed_reports.values()}),'all_success_and_failure_logs_present':True}
assert manifest['source_archive_sha256']==freeze['source_archive_sha256']==files['corresponding-source/rock-source.tar']['sha256']
assert manifest['freeze_sha256']==hashlib.sha256(freeze_path.read_bytes()).hexdigest()
assert manifest['profile_sha256']==hashlib.sha256((images/'profile.json').read_bytes()).hexdigest()
assert manifest['configuration_sha256']==freeze['configuration_sha256']
assert manifest['image_sha256']==freeze['files_sha256']
provenance={item['sha256'] for name,item in files.items() if name.startswith('provenance/')}
assert {manifest['freeze_sha256'],manifest['profile_sha256'],*manifest['configuration_sha256'].values()}<=provenance
buildroot='87aaca4164ea9d5c8085854953018263f7963f07c22e73a2a2185cc98c581c34'
assert any(name.startswith('corresponding-source/') and value['sha256']==buildroot for name,value in files.items())
report={'source_regression_provenance':regression_provenance,'full_git_archive_file_count':len(source_files),'full_git_archive_commit':source_commit,'full_git_archive_inventory_match':True,'source_image_profile_configuration_and_source_archive_bindings':'PASS','schema':'rock-final-legal-bundle-readback/1','status':'REGULAR_ARCHIVE_READBACK_PASS_NOT_LICENSE_CLEARANCE','archive_sha256':archive_sha,'archive_bytes':a.archive.stat().st_size,'expanded_file_bytes':total,'file_count':len(files),'directories':directories,'files':files,'corresponding_sources_manifests':manifests}
a.output.write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('files','directories','corresponding_sources_manifests')}))
