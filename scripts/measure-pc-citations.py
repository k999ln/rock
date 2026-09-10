#!/usr/bin/env python3
"""Fixed, PC-only before/after/CLI machine-path comparison. No UI or network."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import selectors
import subprocess
import sys
import time

BEFORE='05e834d1d3e06f1b8c5669361f549285cdb75765'
AFTER='8b6a22acf40e1c975a65007d817bc72da465a5c6'
INPUT='systems/rock-star-os/os/tools/fixtures/citations.md'
INPUT_SHA='bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e'
OUTPUT_SHA='30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6'
ROUTES=('P','A','B')

def sha(data):return hashlib.sha256(data).hexdigest()
def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def now():return datetime.now(timezone.utc).isoformat()
def require(value,message):
    if not value:raise ValueError(message)
def save(path,value):
    with path.open('xb') as stream:stream.write(canonical(value)+b'\n')
def manifest(root):
    result={}
    for path in sorted(root.rglob('*')):
        require(not path.is_symlink(),'source symlink not allowed')
        if path.is_file():result[str(path.relative_to(root))]=sha(path.read_bytes())
    return result

def prepare(repo,out):
    out.mkdir(mode=0o700)
    snapshots=out/'sources';snapshots.mkdir(mode=0o700)
    provenance={}
    for label,commit in (('before',BEFORE),('after',AFTER)):
        target=snapshots/label;target.mkdir(mode=0o700)
        paths=subprocess.check_output(['git','-C',str(repo),'ls-tree','-r','--name-only','-z',commit,'--',
            'toolkits/mr','vendor/mr',INPUT]).decode().split('\0')
        paths=[name for name in paths if name]
        require(INPUT in paths,'fixed input is missing')
        entries={}
        for name in paths:
            path=target/name;path.parent.mkdir(parents=True,exist_ok=True)
            raw=subprocess.check_output(['git','-C',str(repo),'show',commit+':'+name])
            with path.open('xb') as stream:stream.write(raw)
            path.chmod(0o600)
            entries[name]={'sha256':sha(raw),'git_blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()}
        provenance[label]={'commit':commit,'files':entries}
    raw=(snapshots/'after'/INPUT).read_bytes()
    require(len(raw)==150 and sha(raw)==INPUT_SHA,'fixed input mismatch')
    require((snapshots/'before'/INPUT).read_bytes()==raw,'before/after inputs differ')
    for name in ('toolkits/mr/rock_star_tools.py','vendor/mr/provenance.json','vendor/mr/citation-strip.py'):
        require(provenance['before']['files'][name]['sha256']==provenance['after']['files'][name]['sha256'],
            'original business CLI/vendor changed')
    plan={'schema':'rock.b05.pc-machine-comparison/1','state':'PREREGISTERED_BEFORE_EXECUTION','created_utc':now(),
        'runner_sha256':sha(Path(__file__).read_bytes()),'python_executable':str(Path(sys.executable).resolve()),
        'python_version':sys.version,'platform':platform.platform(),'normal_user':os.geteuid()!=0,
        'source_tree_sha256':sha(canonical(manifest(snapshots))),'source_provenance':provenance,
        'input':{'path':INPUT,'bytes':150,'sha256':INPUT_SHA},'expected_output':{'bytes':155,'sha256':OUTPUT_SHA},
        'routes':{'P':'unchanged MR CLI, new process per result','A':'actual preserved before MCP stdio, in-process MR function',
            'B':'actual preserved after MCP stdio, bounded fixed CLI child'},
        'first_order':['P','A','B'],'repeat_orders':[['P','A','B'],['B','P','A'],['A','B','P']],
        'recovery_order':['P','A','B'],'result_samples':15,'automatic_retries':0,'outliers_removed':0,
        'deadline_seconds':{'session_or_cli':12,'stdio_call':8,'normal_close':5,'cleanup_fallback':2,'whole_run':120},
        'first_timing':'before Popen until full validated 155-byte result; MCP includes initialize/list',
        'repeat_timing':'P: Popen through full output and exit; A/B: request write through validated response in existing stdio session',
        'recovery_timing':'after confirmed normal process exit, before new Popen through validated same result; A/B repeat initialize/list, P is process restart with reconnect N/A',
        'preparation':'source export/plan creation excluded; interpreter/disk caches not reset',
        'ui_operations':'N/A','human_switches':'N/A','manual_copies':'N/A','native_hub':'NOT_RUN','qemu':'NOT_RUN',
        'recovery_scope':'normal idle companion EOF/exit then new session and pure transformation recomputation; no crash/in-flight/durable-key proof',
        'failure_rule':'retain all completed/failed samples and partial raw output, stop on first mismatch/error/deadline; no added trials',
        'performance_claim':'descriptive three-repeat sample; no superiority guarantee, confidence interval, p95 or human-time claim'}
    save(out/'plan.json',plan);(out/'plan.json').chmod(0o444)
    print(json.dumps({'prepared':str(out),'plan_sha256':sha((out/'plan.json').read_bytes()),'executed':False}))

class Session:
    def __init__(self,argv,env):
        self.process=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
        self.selector=selectors.DefaultSelector();self.stdout=bytearray();self.stderr=bytearray();self.lines=bytearray()
        for stream,name in ((self.process.stdout,'stdout'),(self.process.stderr,'stderr')):
            os.set_blocking(stream.fileno(),False);self.selector.register(stream,selectors.EVENT_READ,name)
    def pump(self,deadline):
        require(time.perf_counter()<deadline,'process response deadline')
        for event,_ in self.selector.select(min(.05,deadline-time.perf_counter())):
            raw=os.read(event.fd,65536)
            if not raw:self.selector.unregister(event.fileobj);continue
            target=getattr(self,event.data);target.extend(raw)
            require(len(target)<=1024*1024,'bounded stdout/stderr exceeded')
            if event.data=='stdout':self.lines.extend(raw)
        require(time.perf_counter()<deadline,'late process observation')
    def send(self,message):
        self.process.stdin.write(canonical(message)+b'\n');self.process.stdin.flush()
    def response(self,ident,deadline):
        while b'\n' not in self.lines:
            require(bool(self.selector.get_map()),'EOF before MCP response');self.pump(deadline)
        raw,_,tail=self.lines.partition(b'\n');self.lines=bytearray(tail)
        value=json.loads(raw)
        require(type(value) is dict and value.get('jsonrpc')=='2.0' and value.get('id')==ident and 'error' not in value,'MCP identity/error')
        return value['result']
    def initialize(self,deadline):
        self.send({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25',
            'capabilities':{},'clientInfo':{'name':'b05-fixed-measurement','version':'1'}}})
        result=self.response(1,deadline);require(result['protocolVersion']=='2025-11-25','protocol mismatch')
        self.send({'jsonrpc':'2.0','method':'notifications/initialized'})
        self.send({'jsonrpc':'2.0','id':2,'method':'tools/list'})
        result=self.response(2,deadline)
        require({row['name'] for row in result['tools']}=={'coconala_check','format_citations','make_free_article','verify_delivery'},'tool set differs')
    def call(self,ident,text,deadline):
        self.send({'jsonrpc':'2.0','id':ident,'method':'tools/call','params':{'name':'format_citations','arguments':{'text':text}}})
        value=self.response(ident,deadline)
        require(value.get('isError') is False,'MCP tool failed')
        output=value['structuredContent']['output']
        require(value['content']==[{'type':'text','text':output}],'MCP output copies differ')
        return output.encode()
    def close(self,seconds):
        started=time.perf_counter()
        if not self.process.stdin.closed:self.process.stdin.close()
        deadline=started+seconds
        while self.selector.get_map():self.pump(deadline)
        self.process.wait(timeout=max(.001,deadline-time.perf_counter()))
        require(time.perf_counter()<deadline,'late normal process exit')
        require(self.process.returncode==0,'process failed normal close')
        require(not self.stderr,'unexpected process diagnostics')
        self.selector.close();self.process.stdout.close();self.process.stderr.close()
        return {'pid':self.process.pid,'exit_code':self.process.returncode,'elapsed_seconds':time.perf_counter()-started,'method':'stdin EOF, drain, wait'}
    def emergency_cleanup(self):
        try:
            if self.process.poll() is None:
                if not self.process.stdin.closed:self.process.stdin.close()
                try:self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:self.process.terminate();self.process.wait(timeout=2)
        finally:
            self.selector.close()
            for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
                stream.close()

def validate_output(raw):require(len(raw)==155 and sha(raw)==OUTPUT_SHA,'full output differs')
def run(out):
    plan_raw=(out/'plan.json').read_bytes();plan=json.loads(plan_raw);sources=out/'sources'
    require(not (out/'report.json').exists() and not (out/'samples.jsonl').exists(),'refuse repeated measurement')
    require(sha(Path(__file__).read_bytes())==plan['runner_sha256'],'runner changed after registration')
    require(sha(canonical(manifest(sources)))==plan['source_tree_sha256'],'sources changed after registration')
    require(str(Path(sys.executable).resolve())==plan['python_executable'] and sys.version==plan['python_version'],'interpreter changed')
    require(os.geteuid()!=0,'normal user required')
    evidence=out/'evidence';evidence.mkdir(mode=0o700)
    sessions={};all_sessions=[];samples=[];closes=[];first=time.perf_counter()
    report={'schema':plan['schema'],'status':'FAIL','started_utc':now(),'plan_sha256':sha(plan_raw),
        'scope':'PC same-output machine paths only; no UI/native/financial/durable-key claim','samples':samples,'normal_stops':closes,
        'ui_operations':'N/A','human_switches':'N/A','manual_copies':'N/A','host_load_start':list(os.getloadavg())}
    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PYTHONUNBUFFERED':'1'}
    text=(sources/'after'/INPUT).read_bytes().decode()
    def measure(route,phase,round_number):
        require(time.perf_counter()-first<120,'whole experiment deadline')
        index=len(samples)+1;ident=100+index;started=time.perf_counter_ns()
        row={'sample':index,'route':route,'phase':phase,'round':round_number,'started_utc':now(),'status':'FAIL',
             'input_sha256':INPUT_SHA,'input_bytes':150}
        session=None
        try:
            side='before' if route=='A' else 'after';toolkit=sources/side/'toolkits/mr'
            if route=='P':
                session=Session([sys.executable,'-I','-B',str(toolkit/'rock_star_tools.py'),'citations','--input',sources/'after'/INPUT],env)
                all_sessions.append(session);session.process.stdin.close()
                deadline=time.perf_counter()+12
                while session.selector.get_map():session.pump(deadline)
                session.process.wait(timeout=max(.001,deadline-time.perf_counter()))
                require(session.process.returncode==0 and not session.stderr,'CLI failed')
                raw=bytes(session.stdout);validate_output(raw)
                row['pid']=session.process.pid
            else:
                if route not in sessions:
                    session=Session([sys.executable,'-B',str(toolkit/'mcp_server.py')],env)
                    sessions[route]=session;all_sessions.append(session)
                    deadline=time.perf_counter()+12;session.initialize(deadline)
                else:session=sessions[route];deadline=time.perf_counter()+8
                row['pid']=session.process.pid
                raw=session.call(ident,text,deadline);validate_output(raw)
            row.update(status='PASS_OUTPUT',elapsed_ns=time.perf_counter_ns()-started,output_bytes=len(raw),output_sha256=sha(raw))
            (evidence/(f'{index:02d}-{route}-{phase}.md')).write_bytes(raw)
            if route=='P':
                closes.append({'phase':phase,'route':route,**session.close(5),'persistent_session':'N/A'})
        except BaseException as error:
            row.update(elapsed_ns=time.perf_counter_ns()-started,error=type(error).__name__+': '+str(error))
            raise
        finally:
            samples.append(row)
            with (out/'samples.jsonl').open('ab') as log:log.write(canonical(row)+b'\n');log.flush();os.fsync(log.fileno())
    try:
        for route in plan['first_order']:measure(route,'session_start_first_result',0)
        for round_number,order in enumerate(plan['repeat_orders'],1):
            for route in order:measure(route,'repeat',round_number)
        for route in plan['recovery_order']:
            if route in sessions:
                old=sessions.pop(route);closes.append({'phase':'before_reconnect','route':route,**old.close(5)})
                require(old.process.poll()==0 and old.process.stdin.closed,'old companion not stopped')
            # CLI has already exited normally: this is process restart, not a
            # simulated persistent connection or an in-flight replay guarantee.
            measure(route,'normal_restart_same_input',0)
        for route,session in list(sessions.items()):closes.append({'phase':'final','route':route,**session.close(5)})
        require(len(samples)==plan['result_samples'],'sample count differs')
        require(sha(canonical(manifest(sources)))==plan['source_tree_sha256'],'source changed during experiment')
        require((out/'plan.json').read_bytes()==plan_raw,'plan changed during experiment')
        report['status']='PASS_SCOPED_MACHINE_COMPARISON'
    except BaseException as error:
        report['error']=type(error).__name__+': '+str(error)
    finally:
        cleanup=[]
        for index,session in enumerate(all_sessions,1):
            try:session.emergency_cleanup();cleanup.append({'pid':session.process.pid,'exit_code':session.process.returncode,'closed':True})
            except BaseException as error:cleanup.append({'pid':session.process.pid,'closed':False,'error':str(error)});report['status']='FAIL'
            (evidence/f'process-{index:02d}-stdout.bin').write_bytes(session.stdout)
            (evidence/f'process-{index:02d}-stderr.bin').write_bytes(session.stderr)
        report.update(cleanup=cleanup,source_unchanged=sha(canonical(manifest(sources)))==plan['source_tree_sha256'],
            completed_utc=now(),whole_elapsed_seconds=time.perf_counter()-first,host_load_end=list(os.getloadavg()))
        save(out/'report.json',report)
    print(json.dumps({'status':report['status'],'samples':len(samples),'report':str(out/'report.json')}))
    if report['status']!='PASS_SCOPED_MACHINE_COMPARISON':raise SystemExit(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=('prepare','run'));parser.add_argument('--repo',type=Path);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();out=args.output.resolve()
    if args.mode=='prepare':prepare(args.repo.resolve(),out)
    else:run(out)
