"""Host memory/deadline negative guards; real C pixels are checked separately."""
import hashlib
import io
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock

from PIL import Image
import pin_readiness as ready
import wallet_replay as replay


def png(image):
    stream = io.BytesIO(); image.save(stream, format='PNG'); return stream.getvalue()


class PinReadinessTests(unittest.TestCase):
    def setUp(self):
        # Explicit synthetic classifier fixture, not native rendering evidence.
        self.images = []
        for count in range(5):
            image = Image.new('RGB', (720, 960), 'white')
            image.paste((count + 10, 20, 30), (38, 506, 682, 566))
            image.paste('green' if count == 4 else 'gray', (358, 811, 682, 865))
            self.images.append(image)
        def digest(image, rect):
            return hashlib.sha256(image.crop(rect).tobytes()).hexdigest()
        self.definitions = {'atm': {'fixed': [{'rect': [30,22,682,122], 'sha256': digest(self.images[0], (30,22,682,122))}],
            'pin_rect': [38,506,682,566], 'sign_rect': [358,811,682,865],
            'pin_sha256': {str(n):digest(image,(38,506,682,566)) for n,image in enumerate(self.images)},
            'sign_disabled_sha256': digest(self.images[0],(358,811,682,865)),
            'sign_enabled_sha256': digest(self.images[4],(358,811,682,865))}}
        self.raw = [png(image) for image in self.images]

    def test_known_zero_to_four_states_and_unknown_frames(self):
        for n, raw in enumerate(self.raw):
            state = ready.inspect_frame(raw, 'atm', self.definitions)
            self.assertEqual(state['masked_digits'], n)
            self.assertEqual(state['sign_enabled'], n == 4)
        for raw in [b'', b'not png', png(Image.new('RGB',(721,960))), self.raw[4][:20]]:
            self.assertEqual(ready.inspect_frame(raw,'atm',self.definitions), {'recognized':False})
        self.assertFalse(ready.inspect_frame(self.raw[4],'enroll',self.definitions)['recognized'])

    def test_context_and_unknown_pin_or_button_rejected(self):
        for rect in [(30,22,682,122),(38,506,682,566),(358,811,682,865)]:
            image=self.images[4].copy(); image.paste('red',rect)
            self.assertFalse(ready.inspect_frame(png(image),'atm',self.definitions)['recognized'])

    def test_waits_for_actual_four_digits_and_enabled_button(self):
        now=[0.0]; frames=iter(self.raw[1:])
        def sleep(seconds): now[0]+=seconds
        with mock.patch.object(ready,'memory_frame',side_effect=lambda _:next(frames)):
            raw,state=ready.wait_ready(None,'atm',4,25,self.definitions,clock=lambda:now[0],sleep=sleep)
        self.assertEqual(raw,self.raw[4]);self.assertEqual(state['samples'],4)
        self.assertLess(now[0],25)

    def test_disabled_four_digit_frame_never_clicks_or_renews_deadline(self):
        image=self.images[4].copy();image.paste('gray',(358,811,682,865));raw=png(image)
        now=[0.0]
        def sleep(seconds): now[0]+=seconds
        with mock.patch.object(ready,'memory_frame',return_value=raw):
            with self.assertRaisesRegex(TimeoutError,'4 masked digits, enabled=False'):
                ready.wait_ready(None,'atm',4,.1,self.definitions,clock=lambda:now[0],sleep=sleep)
        self.assertAlmostEqual(now[0],.1)

    def test_final_capture_observed_after_deadline_is_rejected(self):
        now=[0.0]
        def late(_):now[0]=25.0;return self.raw[4]
        with mock.patch.object(ready,'memory_frame',side_effect=late):
            with self.assertRaises(TimeoutError):
                ready.wait_ready(None,'atm',4,25,self.definitions,clock=lambda:now[0],sleep=lambda _:None)

    def test_exact_frame_retained_without_reopening_for_planned_capture(self):
        # Test only the memory handoff; no screenshot is written by this guard.
        class UI(ready.PinReadinessMixin):pass
        ui=UI();ui.report={};ui.monitor=None;ui._pin_profiles=self.definitions
        with mock.patch.object(ready,'wait_ready',return_value=(self.raw[0],{'recognized':True})):
            ui.wait_pin_ready('atm',0,25)
        self.assertIs(ui._pin_confirmation[1],self.raw[0])
        self.assertIs(ui._verified_pin_frame,self.raw[0])

    def test_replay_shares_deadline_and_clicks_sign_only_after_visible_readiness(self):
        now=[100.0]; events=[]
        class UI:
            def wait_pin_ready(self,profile,digits,deadline):
                events.append(('ready',digits,deadline)); now[0]+=1
            def capture(self,name): events.append(('capture',name))
            def click(self,x,y): events.append(('click',x,y))
            def pin(self): now[0]+=1;events.append(('pin',))
        def marker(name,remaining):events.append(('marker',name,remaining))
        with mock.patch.object(replay.time,'monotonic',side_effect=lambda:now[0]):
            replay.confirm_pin(UI(),'atm','06-owner-issue-confirmation','ISSUED',marker)
        self.assertEqual(events,[('ready',0,125.0),('capture','06-owner-issue-confirmation'),
            ('click',360,536),('pin',),('ready',4,125.0),('click',520,833),('marker','ISSUED',22.0)])

    def test_replay_rejects_receipt_first_observed_after_original_deadline(self):
        now=[100.0]
        class UI:
            def wait_pin_ready(self,*args):pass
            def capture(self,*args):pass
            def click(self,*args):pass
            def pin(self):pass
        def late_receipt(*args):now[0]=125.0
        with mock.patch.object(replay.time,'monotonic',side_effect=lambda:now[0]):
            with self.assertRaisesRegex(TimeoutError,'receipt was observed after'):
                replay.confirm_pin(UI(),'atm','06-owner-issue-confirmation','ISSUED',late_receipt)

    def test_replay_never_signs_or_records_receipt_when_four_digit_readiness_fails(self):
        events=[]
        class UI:
            def wait_pin_ready(self,profile,digits,deadline):
                if digits==4:raise TimeoutError('synthetic unknown or disabled frame')
            def capture(self,name):pass
            def click(self,x,y):events.append((x,y))
            def pin(self):pass
        with self.assertRaises(TimeoutError):
            replay.confirm_pin(UI(),'atm','06-owner-issue-confirmation','ISSUED',lambda *args:events.append(args))
        self.assertEqual(events,[(360,536)])

    def test_real_child_can_open_only_owned_memory_file_and_fd_closes(self):
        if not hasattr(os,'memfd_create'):
            self.fail('Linux memory capture is required; unsupported is not PASS')
        paths=[];raw=self.raw[4]
        class Monitor:
            def command(self,name,arguments):
                self_name=name; self_arguments=arguments
                if self_name!='screendump':raise AssertionError('only memory screenshot command')
                path=self_arguments['filename'];paths.append(path)
                subprocess.run([sys.executable,'-c','import pathlib,sys; pathlib.Path(sys.argv[1]).write_bytes(sys.stdin.buffer.read())',path],
                               input=raw,check=True,timeout=3)
        self.assertEqual(ready.memory_frame(Monitor()),raw)
        self.assertTrue(paths[0].startswith(f'/proc/{os.getpid()}/fd/'))
        self.assertFalse(Path(paths[0]).exists())

    def test_memory_fd_closes_when_capture_fails(self):
        paths=[]
        class Monitor:
            def command(self,name,args):paths.append(args['filename']);raise OSError('synthetic screenshot failure')
        with self.assertRaises(OSError):ready.memory_frame(Monitor())
        self.assertFalse(Path(paths[0]).exists())


if __name__=='__main__':unittest.main()
