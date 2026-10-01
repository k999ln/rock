"""Bounded exact QMP framebuffer recorder for the owned native demo.

Produces untouched PNGs and original monotonic timestamps; it does not render
product scenes, repeat frames to fake a result, or change the guest image.
"""
import hashlib,json,struct,threading,time
from datetime import datetime,timezone
from pathlib import Path

class NativeFrameRecorder:
    def __init__(self,monitor,folder,*,seconds=90,period=.25):
        assert 60<=seconds<=120 and period==.25
        self.monitor=monitor;self.folder=Path(folder);self.seconds=seconds;self.period=period
        self.folder.mkdir(mode=0o700,parents=True,exist_ok=False)
        self.frames=[];self.errors=[];self.done=threading.Event();self.thread=None
    def start(self):
        assert self.thread is None
        self.started=time.monotonic();self.started_utc=datetime.now(timezone.utc).isoformat()
        self.thread=threading.Thread(target=self._run,name='owned-native-frame-recorder',daemon=True);self.thread.start()
    def _run(self):
        try:
            next_at=self.started
            while not self.done.is_set():
                elapsed=time.monotonic()-self.started
                if elapsed>=self.seconds:break
                index=len(self.frames);assert index<=480
                path=self.folder/f'{index:04d}.png';requested=time.monotonic()
                self.monitor.command('screendump',{'filename':str(path),'format':'png'})
                captured=time.monotonic();data=path.read_bytes()
                assert data[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',data[16:24])==(720,960)
                self.frames.append({'index':index,'file':path.name,'requested_seconds':requested-self.started,
                                    'captured_seconds':captured-self.started,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
                next_at+=self.period;self.done.wait(max(0,next_at-time.monotonic()))
        except BaseException as error:self.errors.append(repr(error))
        finally:self.ended=time.monotonic();self.done.set()
    def stop(self):
        assert self.thread is not None
        self.done.set();self.thread.join(timeout=10);assert not self.thread.is_alive()
        elapsed=self.ended-self.started
        intervals=[b['captured_seconds']-a['captured_seconds'] for a,b in zip(self.frames,self.frames[1:])]
        report={'schema':'rock-qmp-original-frame-recording/1','status':'PASS_RAW_CAPTURE' if not self.errors and 60<=elapsed<=121 and self.frames else 'FAIL',
                'started_utc':self.started_utc,'recorded_seconds':elapsed,'requested_seconds':self.seconds,'frame_period_seconds':self.period,
                'max_interframe_seconds':max(intervals) if intervals else None,'errors':self.errors,'frames':self.frames,
                'scope':'Unaltered real 720x960 framebuffer of one owned QEMU guest, original order and elapsed time; synthetic funds'}
        (self.folder/'frame-index.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        if report['status']=='FAIL':raise AssertionError('actual demo recording incomplete: '+repr(self.errors))
        return report
