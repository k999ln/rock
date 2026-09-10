#!/usr/bin/env python3
"""Actual OS UI -> owned TLS development runner, stop/restart, same-key recovery.

This is an existing remote recipe fixture. It is not the MR CLI adapter,
physical USB, a production cloud, or a same-product citation comparison.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import signal
import sqlite3
import subprocess
import sys
import time
import traceback


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('source','config','sandbox-config','output'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--commit',required=True)
    parser.add_argument('--fixture',choices=('remote-text','citations'),default='remote-text')
    parser.add_argument('--service-state',type=Path)
    parser.add_argument('--resume-from',type=Path)
    parser.add_argument('--baseline-from',type=Path)
    parser.add_argument('--resume-stage',choices=('editor','offline-pending','restart-history'),default='editor')
    args=parser.parse_args(); base=args.source.resolve(strict=True)
    sys.path[:0]=[str(base/'os/desktop'),str(base/'os'),str(base/'src')]
    spec=importlib.util.spec_from_file_location('pc_link_business',base/'os/desktop/verify-business.py')
    b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
    import game_authority_observer as authority
    from blackberryrock.packages import canonical
    from registry.publish import publish
    from registry.transport import HTTPSOrigin
    from runner.build_fixture import remote_fixture, remote_citation_fixture
    from game_exchange.current_restore import snapshot as typed_snapshot
    config=json.loads(args.config.read_text()); assert config['schema']=='rock-desktop-device/7'
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False,mode=0o700)
    service_state=args.service_state.resolve(strict=True) if args.service_state else output
    limits=b.contract.plan('lifecycle')['limits'];profile=b.retention.retention_profile(config)
    observer=authority.Observer(base/'os/game_exchange/sandbox.py',args.sandbox_config.resolve(),config['game']['authority_id'],output)
    assert args.sandbox_config.resolve() == Path(config['game']['config']), 'observed authority differs from device binding'
    assert observer.input_hashes['sandbox_config_sha256'] == config['game']['sha256'], 'observed authority bytes differ from device binding'
    previous=args.resume_from.resolve(strict=True) if args.resume_from else None
    if previous:
        original_plan=json.loads((previous/'plan.json').read_text());original_report=json.loads((previous/('2' if args.resume_stage=='restart-history' else '1')/'report.json').read_text())
        assert original_plan['config']==config and original_plan['source_commit']==args.commit
        assert original_report['status']=='FAIL' and original_report['owned_device_running'] is True
        if args.resume_stage=='editor':assert "submit(driver,inputs[0])" in original_report['traceback']
        elif args.resume_stage=='restart-history':
            assert "open_history(driver,'遠隔の状態を照合中')" in original_report['traceback']
            assert json.loads((previous/'1/report.json').read_text())['status']=='PASS_SCOPED_PC_LINK'
        else:
            assert "label='offline-pending'" in original_report['traceback']
            assert any(row['phrase']=='遠隔で完了' for row in original_report['ui_states'])
            assert sum(row['phrase']=='この内容の送信に同意して実行' for row in original_report['ui_states'])==2
        assert json.loads((previous/'owned-services-stopped.json').read_text())
        before_authority=json.loads((previous/'authority-before.json').read_text())
    else:before_authority=observer.invoke('snapshot')
    citation_mode=args.fixture=='citations'
    inputs=tuple((base/'os/tools/fixtures/citations.md').read_text() for _ in range(2)) if citation_mode else ('  PC link before  ','  PC link recovery  ')
    expected_output_sha='e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7' if citation_mode else None
    tool_id='org.rockstar.citation-organizer' if citation_mode else 'org.rockstar.remote-text'
    tool_title='引用整理' if citation_mode else '遠隔で入力文章を整える'
    tool_version='1.1.0' if citation_mode else '1.0.0'
    visible_result='紹介文です' if citation_mode else None
    plan={'schema':'rock-owned-pc-link-ui/1','source_commit':args.commit,'service_state':str(service_state),'config':config,'limits':limits,
          'observer_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'cycles':3,'shutdown_policy':'every cycle: exactly one new dispatched receipt and guest SHUTDOWN event',
          'ui_phase_seconds':360,'server_start_seconds':10,'server_stop_seconds':10,
          'fixture_stop':{'runner':{'signal':'SIGTERM','expected_returncode':0},
                          'registry':{'signal':'SIGTERM','expected_returncode':-signal.SIGTERM,
                                      'reason':'registry.server has no signal handler; original fail retained, no OS termination change'}},
          'fixture':args.fixture,'tool_id':tool_id,'tool_version':tool_version,
          'inputs':inputs,'expected_outputs':None if citation_mode else [v.strip() for v in inputs],
          'expected_output_sha256':expected_output_sha,
          'remote_pending_ocr':{'row':[32,271,680,315],'scale':2,'language':'eng+jpn','psm':7,'confidence_minimum':45,'selects_input':False},
          'fault':'Normal SIGTERM of only this probe\'s owned runner process; restart same DB after OS restart',
          'operations':['connected result','runner stop','second explicit consent while unavailable','local saved result and Wallet',
                        'normal shutdown with pending remote request','restart while runner offline','pending history',
                        'restart same runner DB','same original key completes','normal shutdown',
                        'offline result after another OS restart','normal shutdown'],
          'physical_usb':'NOT_RUN','mr_adapter_native_connection':'NOT_IMPLEMENTED',
          'scope':'Explicit signed '+args.fixture+' fixture through owned Linux VM TLS; no real funds or human timing claim'}
    if previous:plan['continuation']={'previous':str(previous),'previous_plan_sha256':hashlib.sha256((previous/'plan.json').read_bytes()).hexdigest(),'previous_report_sha256':hashlib.sha256((previous/('2' if args.resume_stage=='restart-history' else '1')/'report.json').read_bytes()).hexdigest(),'boundary':'same original running OS at '+args.resume_stage+'; retain every already submitted request without repeating it'}
    b.guest.save(output/'plan.json',plan);(output/'plan.json').chmod(0o444)
    b.guest.save(output/'authority-before.json',before_authority)
    summary={'status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),'cycles':[],'services':[]}
    env=dict(os.environ,PYTHONPATH=str(base/'src')+':'+str(base/'os'),PYTHONDONTWRITEBYTECODE='1')
    fixtures=base/'os/registry/fixtures';ca=fixtures/'development-ca.pem'
    registry=runner=None;logs=[];runner_starts=0;old_remote=None;old_device=None;old_host=None

    def spawn(command,label):
        stream=(output/(label+'.log')).open('xb');logs.append(stream)
        process=subprocess.Popen(command,env=env,stdin=subprocess.DEVNULL,stdout=stream,stderr=subprocess.STDOUT)
        summary['services'].append({'label':label,'pid':process.pid,'started_unix':time.time(),'argv':command})
        return process

    def ready(process,port):
        deadline=time.monotonic()+10
        while True:
            assert process.poll() is None,'owned fixture stopped before readiness'
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.3):return
            except OSError:
                if time.monotonic()>=deadline:raise TimeoutError('owned fixture readiness deadline')
                time.sleep(.1)

    def stop(process,label,*,expected_returncode=0):
        if process is None:return
        assert process.poll() is None,'owned fixture exited before explicit stop'
        started=time.monotonic();process.terminate();code=process.wait(timeout=10)
        summary['services'].append({'label':label,'pid':process.pid,'exit_code':code,'expected_returncode':expected_returncode,
                                    'signal':'SIGTERM','stop_seconds':time.monotonic()-started})
        b.guest.save(output/'services.json',summary['services'])
        assert code==expected_returncode,'owned fixture did not meet its declared termination contract'

    def start_runner():
        nonlocal runner_starts
        runner_starts+=1
        process=spawn([sys.executable,'-B','-m','runner.serve','--state',str(service_state/'runner'),
                       '--endpoint-id','runner-linux-cloud','--mode','cloud','--launcher',str(output/'runner-sandbox'),
                       '--worker',str(base/'src/blackberryrock/recipe_worker.py'),'--ca',str(ca),
                       '--public-fixture-key',str(fixtures/'PUBLIC-FIXTURE-KEY.pem'),'--port','9444'],
                      'runner-'+str(runner_starts))
        ready(process,9444);return process

    def closed_sql(path):
        return sqlite3.connect(path.resolve().as_uri()+'?mode=ro&immutable=1',uri=True)

    def device_snapshot(data,folder):
        result={};remote=[];powers=[]
        for role,(source,_) in profile['sources'].items():
            target=folder/(role+'.sqlite3');b.power.export_closed_database(data,source,target);target.chmod(0o600)
            with closing(closed_sql(target)) as db:
                db.execute('PRAGMA query_only=ON');assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                result[role]=typed_snapshot(db)
                if role=='wallet_cache':
                    import wallet_cache_retention
                    cache_profile=dict(profile,sources={'wallet_cache':profile['sources']['wallet_cache']})
                    result[role]=b.retention.business_snapshot(data,cache_profile)[0]['wallet_cache']
                if role=='power':
                    db.row_factory=sqlite3.Row;powers=[dict(r) for r in db.execute('SELECT * FROM requests')]
                if role=='remote':
                    db.row_factory=sqlite3.Row;remote=[dict(r) for r in db.execute('SELECT * FROM remote_jobs ORDER BY created')]
        b.guest.save(folder/'device-snapshot.json',result)
        b.guest.save(folder/'remote-private.json',remote)
        b.guest.save(folder/'power-rows.json',powers)
        return result,remote,powers

    def host_snapshot():
        with closing(closed_sql(service_state/'runner/jobs.sqlite3')) as db:
            db.execute('PRAGMA query_only=ON');assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            evidence=typed_snapshot(db);db.row_factory=sqlite3.Row
            rows=[dict(r) for r in db.execute('SELECT * FROM jobs ORDER BY created_at')]
        return evidence,rows

    def open_history(driver,phrase):
        driver.nav('history');driver.click('別の場所',seek=True,label='remote-history')
        first=driver.wait(tool_title,label='first-remote-record-title')
        assert 250<first['y']<400
        driver.native.click(first['x'],first['y'])
        wait_pending(driver,'original-pending-record-opened')

    def wait_pending(driver,label):
        # This one fixed read-only status row gets its own observer-only OCR.
        # Business/soak allowlists and every confidence/deadline remain unchanged.
        # Original page OCR still runs for error/resource checks. Never click
        # from this crop; retain its actual pixels and full token confidence.
        from PIL import Image,ImageOps
        region=(32,271,680,315);deadline=time.monotonic()+limits['ui_state_seconds']
        if driver.operation_deadline is not None:deadline=min(deadline,driver.operation_deadline)
        while True:
            lines,metadata=driver.scan(deadline)
            source=driver.folder/'probe.png';analysis=driver.folder/'remote-status-analysis.png'
            with Image.open(source) as original:
                crop=original.crop(region);ImageOps.expand(crop.resize((crop.width*2,crop.height*2),Image.Resampling.BICUBIC),border=10,fill='white').save(analysis)
            remaining=deadline-time.monotonic();assert remaining>0
            result=subprocess.run(['tesseract',str(analysis),'stdout','-l','eng+jpn','--psm','7','tsv'],capture_output=True,text=True,check=True,timeout=min(10,remaining),env=dict(env,OMP_THREAD_LIMIT='1'))
            analysis.unlink();refined=b.mapped_ocr(result.stdout,region,scale=2)
            matched=b.locate(refined,'遠隔の状態を照合中')
            if matched:
                assert len(matched)==1 and time.monotonic()<=deadline
                proof=driver.retain(metadata,label,lines+refined)
                driver.report['ui_states'].append({'phrase':'遠隔の状態を照合中','matches':matched,'read_only_region':region,'ocr_tokens':refined,'screenshot_sha256':proof['sha256'],'observed_unix':time.time()});return
            assert time.monotonic()<deadline,'original remote status observation deadline'
            time.sleep(.5)

    def submit(driver,text):
        driver.top();label=driver.wait('入力テキスト',label='input-label')
        assert 170<label['y']<600
        if citation_mode:
            driver.click('サンプルを入力',seek=True,label='same-public-citation-sample')
        else:
            driver.native.click(250,label['y']+72);driver.native.keys(['ctrl','a']);driver.native.type(text)
        driver.click('別の場所で実行',seek=True,label='remote-destination')
        driver.wait('TLS開発接続',seek=True,label='named-owned-endpoint')
        driver.click('この送信先で内容を確認',seek=True,label='prepare-not-send')
        driver.wait('まだ送信していません',label='explicit-consent-required')
        driver.click('この内容の送信に同意して実行',seek=True,label='explicit-remote-consent')

    def saved_local(driver):
        driver.nav('history')
        driver.click('引用整理',exact_line=True,within=b.HISTORY_TITLE,regions=(b.HISTORY_TITLE,),label='saved-local-history')
        driver.wait('紹介文です',label='local-result-available')
        driver.nav('wallet');driver.wait('Wallet',label='wallet-still-available')

    try:
        initial_folder=output/'baseline';initial_folder.mkdir(mode=0o700)
        initial_record=json.loads((b.guest.BASE/config['name']/'running.json').read_text())
        if previous:
            assert b.guest.running(initial_record)
            owned=json.loads((previous/('2' if args.resume_stage=='restart-history' else '1')/'owned-record.json').read_text())
            assert initial_record=={k:v for k,v in owned.items() if k not in ('running','reused')}
            baseline=(args.baseline_from.resolve(strict=True) if args.baseline_from else previous)/'baseline'
            old_device=json.loads((baseline/'device-snapshot.json').read_text())
            initial_remote=json.loads((baseline/'remote-private.json').read_text())
            prior_power=json.loads((baseline/'power-rows.json').read_text())
        else:
            with b.closed_device(config,initial_record) as data:old_device,initial_remote,prior_power=device_snapshot(data,initial_folder)
        assert not initial_remote,'dedicated PC probe requires no prior remote jobs'
        if previous and args.resume_stage=='restart-history':
            old_device=json.loads((previous/'1/device-snapshot.json').read_text());old_remote=json.loads((previous/'1/remote-private.json').read_text());old_host=json.loads((previous/'1/runner-snapshot.json').read_text());prior_power=json.loads((previous/'1/power-rows.json').read_text())
        for port in (9443,9444):
            with socket.socket() as probe:probe.bind(('127.0.0.1',port))
        registry=spawn([sys.executable,'-B','-m','registry.server','--state',str(service_state/'registry'),
                        '--authors',str(fixtures/'approved-authors.json'),'--cert',str(ca),
                        '--fixture-key',str(fixtures/'PUBLIC-FIXTURE-KEY.pem')],'registry')
        ready(registry,9443)
        package=output/(args.fixture+'.rock.json');package.write_bytes(canonical(remote_citation_fixture() if citation_mode else remote_fixture()))
        summary['package_sha256']=hashlib.sha256(package.read_bytes()).hexdigest()
        summary['publish_receipt']=publish('https://127.0.0.1:9443',ca,fixtures/'PUBLIC-AUTHOR-TOKEN.txt',package,
                                           'pc-link-'+hashlib.sha256(package.read_bytes()).hexdigest())
        subprocess.run(['cc','-O2','-Wall','-Wextra','-Werror','-o',str(output/'runner-sandbox'),str(base/'os/runner/sandbox_launcher.c')],check=True)
        if not previous or args.resume_stage=='editor':runner=start_runner()
        for cycle in ((2,3) if previous and args.resume_stage=='restart-history' else (1,2,3)):
            folder=output/str(cycle);folder.mkdir(mode=0o700)
            report={'status':'RUNNING','input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],'ui_states':[]}
            record=monitor=sampler=None;started=time.monotonic()
            try:
                observer.invoke('start');record=b.guest.start(config);b.guest.save(folder/'owned-record.json',record)
                assert record.get('reused') is False or (previous and ((cycle==1 and args.resume_stage!='restart-history') or (cycle==2 and args.resume_stage=='restart-history'))), 'unexpected reused QEMU boot'
                sampler=b.ResourceSampler(record,limits);sampler.start();monitor=b.power.Monitor(record['qmp_socket'],report)
                driver=b.ScreenDriver(monitor,folder,report,record,sampler,limits)
                if previous and cycle==2 and args.resume_stage=='restart-history':driver.wait('実行履歴',label='same-restarted-history')
                elif previous and cycle==1 and args.resume_stage=='offline-pending':wait_pending(driver,'same-running-pending-request')
                else:driver.wait('入力テキスト' if previous and cycle==1 else 'ツール名・説明・IDで検索',seconds=limits['boot_seconds'],label='resume-existing-editor' if previous and cycle==1 else 'boot')
                driver.booting=False;report['boot_ui_seconds']=time.monotonic()-started
                driver.operation_deadline=time.monotonic()+360
                if cycle==1:
                    if not (previous and args.resume_stage=='offline-pending'):
                        if not previous:
                            driver.click('一覧を更新',label='registry-refresh')
                            driver.wait('カタログの取得を受け付けました',label='refresh-banner-visible-before-input')
                            driver.click('ツール名・説明・IDで検索',label='remote-tool-search')
                            driver.native.type(tool_id);driver.native.keys(['ret'])
                            driver.click(tool_title,label='remote-tool-detail')
                            driver.click('v'+tool_version+' をインストール',seek=True,label='remote-tool-install')
                            driver.click('この権限を確認して利用を許可',seek=True,label='remote-tool-approve')
                            driver.click('ツールを開く',seek=True,label='remote-editor')
                        submit(driver,inputs[0]);driver.wait('遠隔で完了',label='connected-complete')
                        driver.wait(visible_result or inputs[0].strip(),seek=True,label='actual-remote-result')
                        stop(runner,'runner-offline');runner=None
                        driver.click('このツールの入力画面を開く',seek=True,label='second-editor')
                        submit(driver,inputs[1]);wait_pending(driver,'offline-pending')
                    saved_local(driver)
                elif cycle==2:
                    open_history(driver,'遠隔の状態を照合中')
                    runner=start_runner();recovery=time.monotonic()
                    driver.wait('遠隔で完了',label='same-request-completed')
                    driver.wait(visible_result or inputs[1].strip(),seek=True,label='recovered-actual-result')
                    report['runner_restart_to_result_seconds']=time.monotonic()-recovery
                    saved_local(driver)
                else:
                    driver.nav('history');driver.click('別の場所',seek=True,label='offline-history')
                    driver.wait('遠隔で完了',label='retained-completion')
                    # Newest card is the second original request. The title is
                    # observed before clicking its fixed first-card body.
                    title=driver.wait(tool_title,label='retained-product-title')
                    assert 210<title['y']<350
                    driver.native.click(title['x'],title['y']);driver.wait(visible_result or inputs[1].strip(),seek=True,label='offline-retained-result')
                    saved_local(driver)
                driver.operation_deadline=None
                report['normal_shutdown_seconds']=b.clean_shutdown(driver,record);sampler.stop()
                if runner:stop(runner,'runner-post-cycle-'+str(cycle));runner=None
                observer.invoke('stop');after_authority=observer.invoke('snapshot');authority.unchanged(before_authority,after_authority)
                with b.closed_device(config,record) as data:state,remote,powers=device_snapshot(data,folder)
                report['power_boot_id']=b.verify_power(prior_power,powers,report['qmp_events']);prior_power=powers
                host,host_rows=host_snapshot();b.guest.save(folder/'runner-snapshot.json',host)
                assert len(remote)==2 and len({r['key'] for r in remote})==2
                assert remote[0]['state']=='succeeded'
                if cycle==1:
                    assert remote[1]['state']=='unknown' and remote[1]['send_claimed']==1
                    assert remote[1]['input_text']==inputs[1] and remote[1]['package'] is not None
                    assert len(host_rows)==1 and host_rows[0]['state']=='succeeded'
                else:
                    assert all(r['state']=='succeeded' and r['input_text'] is None and r['package'] is None for r in remote)
                    assert len(host_rows)==2 and all(r['state']=='succeeded' for r in host_rows)
                    for first,last in zip(old_remote,remote):
                        assert {k:first[k] for k in ('key','prepare_sha','preview','tool_id','package_hash','target','endpoint_id','input_sha','consent','submit_sha','receipt','created')}=={k:last[k] for k in ('key','prepare_sha','preview','tool_id','package_hash','target','endpoint_id','input_sha','consent','submit_sha','receipt','created')}
                    if cycle==3:assert remote==old_remote and host==old_host
                for index,row in enumerate(host_rows):
                    assert row['key']==remote[index]['key'] and row['owner']=='alice'
                    actual_output=json.loads(row['output_json'])
                    if citation_mode:assert len(actual_output.encode())==151 and hashlib.sha256(actual_output.encode()).hexdigest()==expected_output_sha
                    else:assert actual_output==inputs[index].strip()
                    proof=json.loads(row['execution_json'])
                    assert proof['kind']=='actual_linux_isolated_process' and proof['socket_syscall_denied'] is True and proof['wallet_path_visible'] is False
                    received=json.loads(remote[index]['remote_status'])
                    assert received['receipt']['request_sha256']==row['request_sha256']
                if old_device:
                    before_jobs=next(t for t in old_device['hub']['tables'] if t['name']=='hub_jobs')
                    after_jobs=next(t for t in state['hub']['tables'] if t['name']=='hub_jobs')
                    assert before_jobs==after_jobs,'saved local Hub jobs changed during remote recovery'
                    for role in set(state)-({'power','remote','wallet_cache','hub'} if cycle==1 else {'power','remote','wallet_cache'}):assert state[role]==old_device[role],role+' changed'
                    import wallet_cache_retention
                    wallet_cache_retention.compare(old_device['wallet_cache'],state['wallet_cache'])
                old_device,old_remote,old_host=state,remote,host
                report.update(status='PASS_SCOPED_PC_LINK',remote_keys=[r['key'] for r in remote],
                              remote_states=[r['state'] for r in remote],runner_jobs=len(host_rows),authority_unchanged=True)
            except Exception as error:
                report.update(status='FAIL',error=repr(error),traceback=traceback.format_exc());raise
            finally:
                report['elapsed_seconds']=time.monotonic()-started
                report['owned_device_running']=bool(record and b.guest.running(record))
                b.guest.save(folder/'report.json',report)
                if sampler:sampler.stop()
                if monitor:monitor.close()
                summary['cycles'].append({k:report.get(k) for k in ('status','error','elapsed_seconds','owned_device_running')})
        summary['status']='PASS_SCOPED_PC_LINK'
    except Exception as error:summary.update(status='FAIL',error=repr(error))
    finally:
        # On failure, preserve an active OS and its service state for diagnosis.
        # Successfully completed probes stop only their own registry child.
        if summary['status']=='PASS_SCOPED_PC_LINK':
            try:stop(registry,'registry-stop',expected_returncode=-signal.SIGTERM)
            except Exception as error:summary.update(status='FAIL',error=repr(error),cleanup_traceback=traceback.format_exc())
        summary['finished_utc']=datetime.now(timezone.utc).isoformat()
        b.guest.save(output/'summary.json',summary);print(json.dumps(summary,ensure_ascii=False))
        for stream in logs:stream.close()
    return 0 if summary['status']=='PASS_SCOPED_PC_LINK' else 1


if __name__=='__main__':raise SystemExit(main())
