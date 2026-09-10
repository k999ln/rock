#!/usr/bin/env python3
"""One canonical same-source repeat, only after root's C completion handoff."""
import argparse,datetime,hashlib,json,os,pathlib,platform,re,socket,subprocess,sys
P=pathlib.Path
def sha(p):
    with P(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def save(p,r):p.write_text(json.dumps(r,indent=2)+'\n')
def errors(p):return re.findall(r'^ERROR: (.+)$',p.read_text(errors='replace'),re.MULTILINE)
def main():
    q=argparse.ArgumentParser()
    for n in ('source','images','original','evidence'):q.add_argument('--'+n,type=P,required=True)
    q.add_argument('--root-handoff-record',type=P,required=True)
    a=q.parse_args();os.umask(0o022)
    assert sys.platform=='linux' and not a.evidence.exists()
    handoff=json.loads(a.root_handoff_record.read_text())
    assert handoff['root_c_ui_recording_finished'] is True and handoff['one_same_source_native_rerun_authorized'] is True
    frozen=json.loads((a.images/'freeze-manifest.json').read_text())
    assert frozen['source_commit']=='9abf78a80d27aa9f847c4051d20e4c552e407276'
    def check():
        assert all(sha(a.source/n)==h for n,h in frozen['source_files_sha256'].items())
        assert all(sha(a.images/n)==h for n,h in frozen['files_sha256'].items())
    check();original=json.loads((a.original/'report.json').read_text());assert original['status']=='FAIL'
    conflicts=[]
    for p in P('/proc').iterdir():
        if not p.name.isdigit():continue
        try:cmd=(p/'cmdline').read_bytes()
        except (FileNotFoundError,ProcessLookupError,PermissionError):continue
        if b'qemu-system-aarch64\0' in cmd or b'-m\0unittest\0' in cmd:conflicts.append(int(p.name))
    assert not conflicts,conflicts
    for port in (9443,9444,9641,9642,9643):
        with socket.socket() as s:s.bind(('127.0.0.1',port))
    a.evidence.mkdir(mode=0o700)
    command=[sys.executable,'-B',str(a.source/'scripts/test-native.py'),'--output',str(a.evidence/'native-tests')]
    plan={'schema':'rock-final-native-clean-repeat-plan/1','created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_commit':frozen['source_commit'],'freeze_sha256':sha(a.images/'freeze-manifest.json'),'image_sha256':frozen['files_sha256'],'original_failed_report_sha256':sha(a.original/'report.json'),'original_main_log_sha256':sha(a.original/'tests.log'),'original_errors':errors(a.original/'tests.log'),'original_error_count':len(errors(a.original/'tests.log')),'root_handoff_record_sha256':sha(a.root_handoff_record),'command':command,'canonical_script_sha256':sha(a.source/'scripts/test-native.py'),'orchestrator_sha256':sha(__file__),'execution_count':1,'source_change':False,'deadline_change':False,'source_tests_binding_change':False,'required_checks':14,'required_python_executions':1631,'required_skips':0,'qemu_and_unittest_processes_at_start':conflicts,'free_ports':[9443,9444,9641,9642,9643],'environment':{'uid':os.geteuid(),'gid':os.getegid(),'umask':'0022','path':os.environ.get('PATH'),'platform':platform.platform(),'python':sys.version,'loadavg':os.getloadavg(),'meminfo':P('/proc/meminfo').read_text(),'disk_free_bytes':os.statvfs('/var/tmp').f_bavail*os.statvfs('/var/tmp').f_frsize},'interpretation':'A repeat does not establish the cause of the original TLS failures; original failure and original CI freeze binding remain unchanged.'}
    save(a.evidence/'plan.json',plan);(a.evidence/'plan.json').chmod(0o444)
    with (a.evidence/'native-driver.log').open('xb') as log:
        code=subprocess.run(command,cwd=a.source,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT).returncode
    result=json.loads((a.evidence/'native-tests/report.json').read_text());check()
    assert result['input_sha256']==original['input_sha256']
    completed_count=result.get('total_python_test_executions',sum(c.get('tests',0) for c in result['checks']))
    if result['status']=='PASS':
        assert code==0 and len(result['checks'])==14 and completed_count==1631 and result['source_unchanged'] is True and not any(c['skipped'] for c in result['checks'])
    assert all(sha(a.evidence/'native-tests'/(c['name']+'.log'))==c['log_sha256'] for c in result['checks'])
    current=errors(a.evidence/'native-tests/tests.log');prior=plan['original_errors']
    report={'schema':'rock-final-native-clean-repeat/1','status':result['status'],'native_exit_code':code,'source_commit':frozen['source_commit'],'plan_sha256':sha(a.evidence/'plan.json'),'native_report_sha256':sha(a.evidence/'native-tests/report.json'),'original_failure_preserved':True,'original_freeze_ci_binding_unchanged':True,'source_and_images_unchanged':True,'checks':len(result['checks']),'python_test_executions':completed_count,'required_checks':14,'required_python_test_executions':1631,'canonical_source_unchanged':result.get('source_unchanged','NOT_REPORTED_AFTER_EARLY_FAILURE'),'skips':any(c['skipped'] for c in result['checks']),'current_errors':current,'same_errors':sorted(set(current)&set(prior)),'new_errors':sorted(set(current)-set(prior)),'not_reproduced_errors':sorted(set(prior)-set(current)),'cause':'UNDETERMINED','finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    save(a.evidence/'report.json',report);print(json.dumps(report),flush=True)
if __name__=='__main__':main()
