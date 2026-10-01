#!/usr/bin/env python3
"""90-second real QEMU framebuffer demo on one previously prepared test device."""
import argparse,hashlib,importlib.util,json,sys,time,traceback
from datetime import datetime,timezone
from pathlib import Path


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    for name in ('source','config','sandbox-config','output'):ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--commit',required=True);args=ap.parse_args();base=args.source.resolve(strict=True)
    sys.path[:0]=[str(base/'os/desktop'),str(base/'os'),str(base/'src'),str(Path(__file__).parent)]
    spec=importlib.util.spec_from_file_location('demo_business',base/'os/desktop/verify-business.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
    spec=importlib.util.spec_from_file_location('native_frames',Path(__file__).with_name('record-native-frames.py'));frames=importlib.util.module_from_spec(spec);spec.loader.exec_module(frames)
    import game_authority_observer as authority
    config=json.loads(args.config.read_text());assert config['schema']=='rock-desktop-device/7'
    out=args.output.resolve();out.mkdir(mode=0o700,parents=True,exist_ok=False)
    limits=b.contract.plan('lifecycle')['limits'];profile=b.retention.retention_profile(config)
    observer=authority.Observer(base/'os/game_exchange/sandbox.py',args.sandbox_config.resolve(),config['game']['authority_id'],out)
    assert args.sandbox_config.resolve(strict=True)==Path(config['game']['config']).resolve(strict=True)
    assert observer.input_hashes['sandbox_config_sha256']==config['game']['sha256']
    before=observer.invoke('snapshot');b.guest.save(out/'authority-before.json',before)
    initial_record=json.loads((b.guest.BASE/config['name']/'running.json').read_text())
    with b.closed_device(config,initial_record) as data:
        before_state,before_rows,before_powers=b.retention.business_snapshot(data,profile)
    b.guest.save(out/'guest-before.json',before_state)
    b.guest.save(out/'power-before.json',before_powers)
    plan={'schema':'rockstaros-qemu-demo-plan/1','source_commit':args.commit,'config':config,'seconds':90,'frames_per_second':4,
          'capture':'QMP original 720x960 pixels; no generated scenes, graphic overlay, speed change or fabricated product result',
          'prepared_device':'Citation tool already installed, account enrolled, Wallet and Game connected earlier; not a first-install timing test',
          'simulation_only':True,'qemu':True,'expected_available_minor':8906,'operations':['execute actual citation sample','reopen latest saved result','view synthetic Wallet','view Game connections and retained completed receipt'],
          'observer_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'recorder_sha256':hashlib.sha256(Path(frames.__file__).read_bytes()).hexdigest()}
    b.guest.save(out/'plan.json',plan);(out/'plan.json').chmod(0o444)
    report={'status':'RUNNING','started_utc':datetime.now(timezone.utc).isoformat(),'input_events':[],'screenshots':[],'qmp_events':[],'qmp_commands':[],'ui_states':[],'chapters':[]}
    record=monitor=sampler=recorder=None
    def chapter(title):
        elapsed=time.monotonic()-recorder.started;assert elapsed<90
        report['chapters'].append({'title':title,'seconds':elapsed})
    def hold_until(seconds):
        remaining=recorder.started+seconds-time.monotonic()
        if remaining>0:recorder.done.wait(remaining)
        assert not recorder.errors
    try:
        observer.invoke('start');record=b.guest.start(config);b.guest.save(out/'owned-record.json',record)
        sampler=b.ResourceSampler(record,limits);sampler.start();monitor=b.power.Monitor(record['qmp_socket'],report)
        driver=b.ScreenDriver(monitor,out,report,record,sampler,limits)
        driver.wait('ツール名・説明・IDで検索',seconds=limits['boot_seconds'],label='ready-before-recording');driver.booting=False
        recorder=frames.NativeFrameRecorder(monitor,out/'frames',seconds=90);recorder.start()
        driver.operation_deadline=recorder.started+90
        chapter('QEMU上のHub');hold_until(4)
        driver.nav('hub');driver.click('ツール名・説明・IDで検索',label='citation-search')
        driver.native.type('org.rockstar.citation-organizer');driver.native.keys(['ret'])
        driver.click('引用整理',exact_line=True,within=b.CATALOG_TITLE,regions=(b.CATALOG_TITLE,),label='citation-tool')
        driver.click('ツールを開く',seek=True,label='existing-installed-tool');driver.click('サンプルを入力',seek=True,label='public-sample')
        chapter('同じ公開サンプルを実処理');driver.native.keys(['ctrl','ret']);driver.wait('紹介文です',label='actual-worker-result')
        chapter('保存された実行結果');hold_until(29)
        driver.nav('history');driver.click('引用整理',exact_line=True,within=b.HISTORY_TITLE,regions=(b.HISTORY_TITLE,),label='reopen-latest-result')
        driver.wait('紹介文です',label='reopened-same-result');chapter('履歴から再表示');hold_until(40)
        driver.nav('wallet');driver.wait('シミュレーター',label='synthetic-wallet')
        driver.wait('利用可能なテスト残高',seek=True,label='synthetic-available-balance')
        driver.wait('$89.06',seek=True,label='actual-post-financial-balance')
        chapter('合成Wallet・実際の資金ではありません');hold_until(51)
        driver.native.click(152,26);driver.wait('合成WalletからGameへ',label='game-home');chapter('本人が接続した合成Game');hold_until(62)
        driver.wait('交換の履歴',seek=True,label='game-history');driver.wait('交換完了',seek=True,label='completed-game-history')
        chapter('完了した交換の履歴');hold_until(76)
        driver.nav('history');driver.click('引用整理',exact_line=True,within=b.HISTORY_TITLE,regions=(b.HISTORY_TITLE,),label='final-saved-job')
        driver.wait('紹介文です',label='final-result-retained');chapter('成果はHubの履歴に保存');hold_until(90)
        capture=recorder.stop();report['capture']={k:v for k,v in capture.items() if k!='frames'}
        driver.operation_deadline=None;report['normal_shutdown_seconds']=b.clean_shutdown(driver,record);sampler.stop();observer.invoke('stop')
        b.guest.save(out/'authority-after.json',observer.invoke('snapshot'))
        with b.closed_device(config,record) as data:
            state,rows,powers=b.retention.business_snapshot(data,profile)
            b.guest.save(out/'guest-state.json',state)
            b.guest.save(out/'power-after.json',powers)
            b.verify_power(before_powers,powers,report['qmp_events'])
            original_jobs={r['id']:r for r in before_rows['hub_jobs']}
            final_jobs={r['id']:r for r in rows['hub_jobs']}
            assert len(final_jobs)==len(original_jobs)+1 and all(final_jobs.get(k)==v for k,v in original_jobs.items())
            citation=[r for r in rows['hub_jobs'] if r['tool_id']=='org.rockstar.citation-organizer'];assert citation
            latest=max(citation,key=lambda r:r['created'])
            assert latest['status']=='succeeded' and hashlib.sha256(latest['output'].encode()).hexdigest()=='e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7'
            report['recorded_job']={k:latest[k] for k in ('id','tool_id','version','package_hash','status')};report['recorded_job']['output_sha256']=hashlib.sha256(latest['output'].encode()).hexdigest()
            b.guest.save(out/'guest-state.json',state)
        report['status']='PASS_RAW_DEMO_PENDING_ENCODE_AND_VISUAL_REVIEW'
    except Exception as error:report.update(status='FAIL',error=repr(error),traceback=traceback.format_exc())
    finally:
        if recorder and recorder.thread and recorder.thread.is_alive():
            try:recorder.stop()
            except Exception as error:report['capture_error']=repr(error)
        if sampler:sampler.stop()
        if monitor:monitor.close()
        report['owned_device_running']=bool(record and b.guest.running(record));report['finished_utc']=datetime.now(timezone.utc).isoformat();b.guest.save(out/'report.json',report)
        print(json.dumps({k:report.get(k) for k in ('status','error','owned_device_running','normal_shutdown_seconds')},ensure_ascii=False))
    return 0 if report['status'].startswith('PASS') else 1

if __name__=='__main__':raise SystemExit(main())
