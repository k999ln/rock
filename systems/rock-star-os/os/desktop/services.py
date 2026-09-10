"""Owned loopback development store and runner live only with their OS process."""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time

from guest import state_path, status, running, save, directory, require

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO/'src'),str(REPO/'os')]
from blackberryrock.packages import canonical, PUBLIC_TEST_KEY, TEST_PUBLISHER
from registry.publish import publish
from registry.transport import HTTPSOrigin
from runner.build_fixture import remote_fixture
from runner.executor import IsolatedRecipeExecutor
from runner.serve import OWNERS
from runner.server import TLSRunnerServer
from runner.store import RunnerStore


def identity(pid):
    try:
        proc = Path('/proc')/str(pid)
        require(proc.stat().st_uid == os.geteuid(),'different process owner')
        command = (proc/'cmdline').read_bytes().rstrip(b'\0').decode().split('\0')
        require(str(Path(__file__).resolve()) in command and 'run' in command,'different program')
        ticks = (proc/'stat').read_text().rsplit(')',1)[1].split()[19]
        return {'command':command,'start_ticks':ticks}
    except (OSError,ValueError,IndexError):
        return None


def stop(child):
    if child is not None and child.poll() is None:
        child.terminate()
        try: child.wait(5)
        except subprocess.TimeoutExpired:
            child.kill(); child.wait(5)


def supervisor_exited(child):
    # Retain the child as a waitable zombie until its entire session is cleaned
    # up. Reaping here would allow the PID/process-group ID to be reused.
    result = os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    return result is not None


def stop_supervisor(child, grace=5):
    """Only for a newly spawned, unreaped start_new_session=True child."""
    require(os.getpgid(child.pid) == child.pid and os.getsid(child.pid) == child.pid,
            'refusing a supervisor without its owned process group')
    os.killpg(child.pid, signal.SIGTERM)
    deadline = time.monotonic() + grace
    while not supervisor_exited(child) and time.monotonic() < deadline:
        time.sleep(.05)
    # The leader remains unreaped: this group cannot be a recycled PID. Include
    # registry/compiler descendants even when the supervisor already exited.
    os.killpg(child.pid, signal.SIGKILL)
    child.wait(timeout=5)


def startup_check(stopped, device):
    require(not stopped.is_set() and running(device), 'development service startup was stopped')


def compile_launcher(command, stopped, device, timeout=20):
    startup_check(stopped, device)
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, close_fds=True)
    deadline = time.monotonic() + timeout
    try:
        while child.poll() is None:
            startup_check(stopped, device)
            require(time.monotonic() < deadline, 'development launcher compilation timed out')
            stopped.wait(.1)
        require(child.returncode == 0, 'development launcher compilation failed')
        startup_check(stopped, device)
    finally:
        stop(child)


def publish_packages(packages, ca, fixtures, stopped, device):
    from guest import digest
    receipts = []
    for package in packages:
        startup_check(stopped, device)
        # Each attempt has a one-second total deadline; stop is checked
        # between packages. No unbounded publish can delay group cleanup.
        receipts.append(publish('https://127.0.0.1:9443', ca, fixtures/'PUBLIC-AUTHOR-TOKEN.txt',
                                package, 'desktop-'+digest(package), timeout=1))
        startup_check(stopped, device)
    return receipts


def ensure(name, startup_timeout=45):
    device = status(name)
    require(device['running'] and device['network']=='development-services','development network device must be running')
    root = state_path(name)/'services'; directory(root)
    descriptor = os.open(root/'lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(descriptor,fcntl.LOCK_EX)
        record_path,ready_path = root/'supervisor.json',root/'ready.json'
        previous = json.loads(record_path.read_text()) if record_path.exists() else {}
        if isinstance(previous.get('identity'),dict) and identity(previous.get('pid')) == previous['identity']:
            require(previous.get('session')==device['session'],'another device session still owns development services')
            ready = json.loads(ready_path.read_text()) if ready_path.exists() else {}
            require(ready.get('status')=='READY' and ready.get('pid')==previous['pid'],'owned services are not ready; inspect services log')
            return ready
        with (root/'supervisor.log').open('ab') as log:
            child = subprocess.Popen([sys.executable,'-B',str(Path(__file__).resolve()),'run','--name',name],
                                     stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,
                                     start_new_session=True,close_fds=True)
        try:
            deadline = time.monotonic()+startup_timeout
            while True:
                require(not supervisor_exited(child),'development services could not start; existing listeners were preserved')
                ready = json.loads(ready_path.read_text()) if ready_path.exists() else {}
                if ready.get('status')=='READY' and ready.get('pid')==child.pid and ready.get('session')==device['session']:
                    actual = identity(child.pid); require(actual is not None,'owned services identity missing')
                    save(record_path,{'pid':child.pid,'identity':actual,'session':device['session']})
                    return ready
                require(time.monotonic()<deadline,'development services readiness timed out')
                time.sleep(.1)
        except BaseException:
            stop_supervisor(child); raise
    finally:
        os.close(descriptor)


def run(name):
    device = status(name)
    require(device['running'] and device['network']=='development-services','expected live owned network device')
    root = state_path(name)/'services'; directory(root)
    fixtures = REPO/'os/registry/fixtures'; ca=fixtures/'development-ca.pem'
    stopped = threading.Event()
    for sig in (signal.SIGINT,signal.SIGTERM): signal.signal(sig,lambda *_:stopped.set())
    registry = server = store = thread = None
    log = (root/'registry.log').open('ab')
    record = {'status':'STARTING','pid':os.getpid(),'session':device['session'],'fixtures_only':True,
              'bind':'127.0.0.1','production_cloud':'NOT_RUN','physical_usb':'NOT_RUN'}
    try:
        startup_check(stopped, device)
        for port in (9443,9444):
            with socket.socket() as probe:
                probe.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
                probe.bind(('127.0.0.1',port)); probe.listen(1)
        registry = subprocess.Popen([sys.executable,'-B','-m','registry.server','--state',str(root/'registry'),
                 '--authors',str(fixtures/'approved-authors.json'),'--cert',str(ca),
                 '--fixture-key',str(fixtures/'PUBLIC-FIXTURE-KEY.pem')],
                 env=dict(os.environ,PYTHONPATH=str(REPO/'src')+':'+str(REPO/'os')),
                 stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
        transport = HTTPSOrigin('https://127.0.0.1:9443',ca,timeout=1,attempts=1)
        deadline=time.monotonic()+10
        while True:
            startup_check(stopped, device)
            require(registry.poll() is None and not stopped.is_set(),'owned registry stopped before readiness')
            try: transport.request('GET','/index.json',512*1024); break
            except ValueError:
                if time.monotonic()>=deadline: raise
                stopped.wait(.1)
        remote_package=root/'remote-text.rock.json'; remote_package.write_bytes(canonical(remote_fixture()))
        packages = [remote_package,REPO/'examples/registry/org.rockstar.proposal-draft--1.1.0.rock.json']
        receipts = publish_packages(packages, ca, fixtures, stopped, device)
        launcher = root/'runner-sandbox'
        compile_launcher(['/usr/bin/cc','-O2','-Wall','-Wextra','-Werror','-o',str(launcher),str(REPO/'os/runner/sandbox_launcher.c')],stopped,device)
        launcher.chmod(0o755)
        executor=IsolatedRecipeExecutor(launcher,REPO/'src/blackberryrock/recipe_worker.py',REPO/'os/runner/isolated_entry.py')
        store=RunnerStore(root/'runner',endpoint_id='runner-linux-cloud',target='cloud',transport_evidence='pinned_tls_loopback_fixture',
                          owners=OWNERS,publisher_trust={TEST_PUBLISHER:PUBLIC_TEST_KEY},executor=executor)
        server=TLSRunnerServer(('127.0.0.1',9444),store,ca,fixtures/'PUBLIC-FIXTURE-KEY.pem')
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.1},daemon=True);thread.start()
        startup_check(stopped, device)
        record.update(status='READY',published=receipts);save(root/'ready.json',record)
        while not stopped.wait(.3) and running(device):
            require(registry.poll() is None and thread.is_alive(),'owned development service exited')
        record['status']='STOPPED'
    except BaseException as error:
        record.update(status='FAILED',error_type=type(error).__name__)
        raise
    finally:
        errors=[]
        actions=[('registry',lambda:stop(registry))]
        if server is not None:
            if thread is not None and thread.is_alive(): actions += [('runner',server.shutdown),('thread',lambda:thread.join(5))]
            actions.append(('listener',server.server_close))
        if store is not None: actions.append(('store',store.close))
        actions.append(('log',log.close))
        for name,action in actions:
            try: action()
            except BaseException as error: errors.append({'action':name,'error_type':type(error).__name__})
        if errors: record.update(status='FAILED',cleanup_errors=errors)
        save(root/'ready.json',record)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['run']);parser.add_argument('--name',required=True)
    args=parser.parse_args();run(args.name)
