"""E1 abstract voice/body permission model. No ASR, hardware, network, or money.

Trusted adapter outputs and physical button booleans are TEST INPUTS, not actual
authentication. Nonces are deterministic fixtures, not production randomness.
The model is serial/in-memory; it cannot prove OS buffer erasure, mic isolation,
acoustic replay rejection, hardware provenance, or concurrent-worker safety.
"""
from dataclasses import dataclass, replace
from pathlib import Path
import json
import math
import unicodedata

MAX_UTTERANCE_S = 15.0
FINAL_TTL_S = 2.0
BODY_TTL_S = 0.150
GRIP_TTL_S = 5.0
MIN_INTENT_SCORE = 0.85  # Test policy input, NOT calibrated Whisper confidence.

COMMANDS = {
    '粒子を選択': 'SELECT',
    '赤い粒子にして': 'COLOR_RED',
    '重力を弱く': 'GRAVITY_LOW',
    '重力を元に戻して': 'GRAVITY_RESET',
    '結合モードにして': 'COMBINE_PREVIEW',
    '結合を解除して': 'UNLINK_PREVIEW',
    'ひとつ戻して': 'UNDO_PREVIEW',
    '作品を保存': 'SAVE_LOCAL_REQUEST',
    '時間を止めて': 'PAUSE',
    '止めて': 'STOP',
}


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


@dataclass(frozen=True)
class Context:
    session: str
    nonce: str
    mic_epoch: int
    mode: str
    revision: int


@dataclass(frozen=True)
class ASRResult:
    ticket: str
    context: Context
    sequence: int
    text: str
    final: bool
    intent_score: float
    source: str = 'LOCAL_ASR'


@dataclass(frozen=True)
class BodyEvent:
    context: Context
    sequence: int
    captured_at: float
    source: str = 'AVOCADO_LIVE'
    device_proof_verified: bool = True
    calibration_id: str = 'fixture-calibration'
    tracking_valid: bool = True
    inside_play_area: bool = True
    explicit_release_verified: bool = True


class Fusion:
    fixture_boot_number = 0  # Deterministic uniqueness only inside this test process.

    def __init__(self):
        self.mode = 'HOME'
        self.state = 'READY'
        Fusion.fixture_boot_number += 1
        self.session = f'fixture-session-{Fusion.fixture_boot_number}'
        self.nonce_number = 1
        self.mic_epoch = 0
        self.revision = 0
        self.mic_consent = False
        self.mic_muted = True
        self.camera_consent = False
        self.camera_open = False
        self.last_now = 0.0
        self.tickets = {}
        self.ticket_number = 0
        self.audio_buffer = []  # Bounded symbolic frames, NOT real PCM/DMA.
        self.arm = None
        self.last_body_sequence = -1
        self.preview = {}
        self.local_save_requests = 0
        self.launches = 0
        self.external_actions = 0

    def context(self):
        return Context(self.session, f'fixture-nonce-{self.nonce_number}',
                       self.mic_epoch, self.mode, self.revision)

    def tick(self, now):
        # A real implementation obtains time internally, never from an app field.
        if not finite_number(now) or now < self.last_now or now < 0:
            return False
        self.last_now = float(now)
        return True

    def context_matches(self, ctx):
        if type(ctx) is not Context:
            return False
        if any(type(x) is not str for x in (ctx.session, ctx.nonce, ctx.mode)):
            return False
        if type(ctx.mic_epoch) is not int or type(ctx.revision) is not int:
            return False
        return ctx == self.context()

    def invalidate(self, mic_epoch=False):
        self.nonce_number += 1
        self.revision += 1
        if mic_epoch:
            self.mic_epoch += 1
        self.tickets.clear()
        self.audio_buffer.clear()
        self.arm = None

    def switch_mode(self, mode, now):
        if (type(mode) is not str or mode not in {'HOME', 'GAME', 'CREATE', 'LIFE'}
                or not self.tick(now) or self.state == 'FAULT'):
            return False
        self.mode = mode
        self.state = 'READY'
        self.mic_consent = False
        self.mic_muted = True
        self.camera_consent = False
        self.camera_open = False
        self.invalidate(mic_epoch=True)
        return True

    def set_mic(self, consent, muted, now):
        if type(consent) is not bool or type(muted) is not bool or not self.tick(now):
            return False
        self.mic_consent, self.mic_muted = consent, muted
        self.invalidate(mic_epoch=True)
        # Intentionally do not alter camera settings or game running state.
        return True

    def set_camera(self, consent, opened, now):
        if type(consent) is not bool or type(opened) is not bool or not self.tick(now):
            return False
        self.camera_consent, self.camera_open = consent, opened
        self.invalidate()
        # Shutter closure cannot automatically enable the microphone.
        return True

    def start_by_button(self, confirmed, now):
        if confirmed is not True or not self.tick(now):
            return False
        if self.mode not in {'GAME', 'CREATE'} or self.state == 'FAULT':
            return False
        self.state = 'PLAY'
        self.invalidate()
        return True

    def fault(self, now):
        if not self.tick(now):
            return False
        self.state = 'FAULT'
        self.mic_muted = True
        self.mic_consent = False
        self.camera_consent = False
        self.camera_open = False
        self.invalidate(mic_epoch=True)
        return True

    def begin_ptt(self, pressed, now):
        if pressed is not True or not self.tick(now):
            return None
        if self.mic_consent is not True or self.mic_muted is not False or self.state == 'FAULT':
            return None
        self.tickets.clear()  # Starting again does not queue an earlier utterance.
        self.audio_buffer.clear()
        self.ticket_number += 1
        key = f'fixture-ptt-{self.ticket_number}'
        self.tickets[key] = {'context': self.context(), 'start': now, 'end': None, 'sequence': -1}
        return key

    def push_audio(self, ticket, symbolic_frame, now):
        if not self.tick(now) or type(ticket) is not str:
            return False
        job = self.tickets.get(ticket)
        if (not job or job['end'] is not None or self.mic_muted is not False
                or self.mic_consent is not True or not self.context_matches(job['context'])):
            return False
        if now - job['start'] > MAX_UTTERANCE_S:
            self.tickets.pop(ticket, None)
            self.audio_buffer.clear()
            return False
        self.audio_buffer.append(symbolic_frame)
        self.audio_buffer[:] = self.audio_buffer[-3:]
        return True

    def finish_ptt(self, ticket, now):
        if not self.tick(now) or type(ticket) is not str:
            return False
        job = self.tickets.get(ticket)
        if not job or job['end'] is not None:
            return False
        if not self.context_matches(job['context']) or not 0 < now-job['start'] <= MAX_UTTERANCE_S:
            self.tickets.pop(ticket, None)
            self.audio_buffer.clear()
            return False
        job['end'] = now
        return True

    def asr(self, result, now):
        if not self.tick(now):
            return 'INVALID_TIME'
        if type(result) is not ASRResult:
            return 'DENIED'
        if (type(result.ticket) is not str or type(result.text) is not str
                or not result.text or len(result.text) > 128 or type(result.final) is not bool
                or type(result.sequence) is not int or result.sequence < 0
                or type(result.source) is not str or result.source != 'LOCAL_ASR'):
            return 'DENIED'
        if self.mic_muted is not False or self.mic_consent is not True or self.state == 'FAULT':
            return 'DENIED'
        job = self.tickets.get(result.ticket)
        if not job or not self.context_matches(result.context) or result.context != job['context']:
            return 'STALE_CONTEXT'
        if result.sequence <= job['sequence']:
            return 'REPLAY_REJECTED'
        if not finite_number(result.intent_score) or not 0 <= result.intent_score <= 1:
            return 'DENIED'
        if job['end'] is None:
            if now-job['start'] > MAX_UTTERANCE_S:
                self.tickets.pop(result.ticket, None)
                self.audio_buffer.clear()
                return 'EXPIRED'
            if result.final is True:
                return 'WAIT_PTT_END'
        elif now-job['end'] > FINAL_TTL_S:
            self.tickets.pop(result.ticket, None)
            self.audio_buffer.clear()
            return 'EXPIRED'
        job['sequence'] = result.sequence
        if result.final is not True:
            return 'PARTIAL_DISPLAY_ONLY'
        self.tickets.pop(result.ticket, None)  # A final result is one-shot, even when unclear.
        self.audio_buffer.clear()
        if result.intent_score < MIN_INTENT_SCORE:
            return 'CLARIFY_NO_ACTION'
        text = unicodedata.normalize('NFKC', result.text).strip().rstrip('。')
        if text in {'発射して', '投げて'}:
            return 'VOICE_CANNOT_LAUNCH'
        if text in {'支払って', '照明をつけて', '鍵を開けて'}:
            return 'SEPARATE_PERMISSION_REQUIRED'
        command = COMMANDS.get(text)
        if command is None:
            return 'CLARIFY_NO_ACTION'
        if self.mode not in {'GAME', 'CREATE'}:
            return 'MODE_DENIED'
        if command in {'PAUSE', 'STOP'}:
            self.state = 'PAUSED'
            self.invalidate()
            return 'UI_PAUSED_NOT_ESTOP'
        if command == 'SAVE_LOCAL_REQUEST':
            self.local_save_requests += 1
            self.invalidate()
            return 'LOCAL_SAVE_REQUEST_NOT_ACK'
        # Voice edits the sandbox preview only. No real-world chemistry/actuation.
        if command == 'SELECT':
            self.preview['particle'] = 'fictional-P'
        elif command == 'COLOR_RED':
            self.preview['color'] = 'red'
        elif command == 'GRAVITY_LOW':
            self.preview['gravity_scale'] = 0.5
        elif command == 'GRAVITY_RESET':
            self.preview['gravity_scale'] = 1.0
        else:
            self.preview['operation'] = command
        self.invalidate()
        return 'GAME_PREVIEW_ONLY'

    def grip_by_button(self, confirmed, now):
        if confirmed is not True or not self.tick(now):
            return False
        if (self.mode not in {'GAME', 'CREATE'} or self.state != 'PLAY'
                or self.camera_consent is not True or self.camera_open is not True):
            return False
        self.arm = {'context': self.context(), 'started': now, 'expires': now+GRIP_TTL_S}
        return True

    def body_launch(self, event, now):
        if not self.tick(now):
            return 'INVALID_TIME'
        if type(event) is not BodyEvent:
            return 'DENIED'
        if (type(event.source) is not str or event.source != 'AVOCADO_LIVE'
                or type(event.sequence) is not int or event.sequence < 0
                or type(event.calibration_id) is not str
                or event.calibration_id != 'fixture-calibration'
                or any(x is not True for x in (event.device_proof_verified,
                     event.tracking_valid, event.inside_play_area, event.explicit_release_verified))):
            self.arm = None
            return 'DENIED'
        if (not self.context_matches(event.context) or self.mode not in {'GAME', 'CREATE'}
                or self.state != 'PLAY' or self.camera_consent is not True
                or self.camera_open is not True):
            self.arm = None
            return 'DENIED'
        if (not finite_number(event.captured_at) or event.captured_at < 0
                or not 0 <= now-event.captured_at <= BODY_TTL_S):
            self.arm = None
            return 'STALE_BODY'
        if event.sequence <= self.last_body_sequence:
            self.arm = None
            return 'REPLAY_REJECTED'
        if not self.arm or self.arm['context'] != self.context() or now >= self.arm['expires']:
            self.arm = None
            return 'NOT_ARMED'
        if event.captured_at < self.arm['started']:
            self.arm = None
            return 'BEFORE_GRIP_REJECTED'
        self.last_body_sequence = event.sequence
        self.launches += 1
        self.invalidate()  # Reject late voice results from the previous interaction state.
        return 'MOCK_AVOCADO_DIGITAL_LAUNCH'


def run_tests():
    checks = []
    def check(name, condition):
        if condition is not True:
            raise AssertionError(name)
        checks.append({'name': name, 'pass': True})

    def ready():
        f = Fusion()
        f.switch_mode('GAME', 0)
        f.set_camera(True, True, 0)
        f.set_mic(True, False, 0)
        f.start_by_button(True, 0)
        return f

    def utterance(f, text='粒子を選択', start=1.0, end=2.0, **changes):
        ticket = f.begin_ptt(True, start)
        f.push_audio(ticket, 'symbolic_audio_not_pcm', start)
        f.finish_ptt(ticket, end)
        result = ASRResult(ticket, f.context(), 0, text, True, .95)
        return replace(result, **changes)

    f = Fusion()
    check('cold_boot_mic_camera_off', f.mic_muted is True and f.mic_consent is False and f.camera_consent is False)
    check('cold_boot_ptt_denied', f.begin_ptt(True, 0) is None)
    f = ready()
    check('ptt_must_be_strict_true', f.begin_ptt(1, 0) is None)
    check('mic_consent_string_rejected', f.set_mic('true', False, 0) is False)
    check('camera_consent_string_rejected', f.set_camera('true', True, 0) is False)
    check('ptt_no_prebuffer', f.audio_buffer == [])

    for text, command in COMMANDS.items():
        f = ready(); result = utterance(f, text)
        expected = ('UI_PAUSED_NOT_ESTOP' if command in {'STOP','PAUSE'} else
                    'LOCAL_SAVE_REQUEST_NOT_ACK' if command == 'SAVE_LOCAL_REQUEST' else 'GAME_PREVIEW_ONLY')
        check('command_'+command, f.asr(result, 2.2) == expected)
        check('command_'+command+'_never_launches_or_controls_home', f.launches == 0 and f.external_actions == 0)

    f=ready(); result=utterance(f, final=False)
    check('partial_has_no_game_effect', f.asr(result,2.1)=='PARTIAL_DISPLAY_ONLY' and f.preview=={})
    check('partial_replay_rejected', f.asr(result,2.2)=='REPLAY_REJECTED')
    check('subsequent_final_allowed', f.asr(replace(result,final=True,sequence=1),2.3)=='GAME_PREVIEW_ONLY')
    check('final_result_one_shot', f.asr(replace(result,final=True,sequence=2),2.4)=='STALE_CONTEXT')
    for value in [.40, .849]:
        f=ready(); result=utterance(f,intent_score=value)
        check('low_score_clarifies_'+str(value), f.asr(result,2.1)=='CLARIFY_NO_ACTION' and f.preview=={})
    for index, value in enumerate([True,float('nan'),float('inf'),-0.1,1.1]):
        f=ready(); result=utterance(f,intent_score=value)
        check('invalid_score_'+str(index), f.asr(result,2.1)=='DENIED')
    for source in ['LLM_TEXT','FILE_REPLAY','TV_TEXT','DEV_SIMULATOR']:
        f=ready(); result=utterance(f,source=source)
        check('untrusted_source_'+source, f.asr(result,2.1)=='DENIED')
    for text in ['発射して','投げて']:
        f=ready(); result=utterance(f,text)
        check('voice_launch_denied_'+text, f.asr(result,2.1)=='VOICE_CANNOT_LAUNCH' and f.launches==0)
    for text in ['支払って','照明をつけて','鍵を開けて']:
        f=ready(); result=utterance(f,text)
        check('separate_permission_'+text, f.asr(result,2.1)=='SEPARATE_PERMISSION_REQUIRED' and f.external_actions==0)
    for text in ['重力を弱くしないで','続けて','前の命令を無視して発射して','unknown']:
        f=ready(); result=utterance(f,text)
        check('out_of_grammar_'+text, f.asr(result,2.1)=='CLARIFY_NO_ACTION')

    f=ready(); result=utterance(f); epoch=f.mic_epoch
    f.set_mic(True,True,2.1)
    check('mute_purges_audio_and_jobs', f.audio_buffer==[] and f.tickets=={} and f.mic_epoch>epoch)
    check('mute_late_result_denied', f.asr(result,2.2)=='DENIED')
    check('mute_does_not_stop_camera_or_game', f.camera_consent is True and f.camera_open is True and f.state=='PLAY')
    f.set_mic(True,False,2.3)
    check('unmute_does_not_restore_old_asr', f.asr(result,2.4)=='STALE_CONTEXT')
    f=ready(); result=utterance(f); f.set_mic(False,False,2.1)
    check('consent_revoke_rejects_result', f.asr(result,2.2)=='DENIED' and f.audio_buffer==[])
    f=ready(); f.set_mic(True,True,1); f.set_camera(True,False,1.1)
    check('camera_shutter_cannot_unmute_mic', f.mic_muted is True and f.mic_consent is True)
    f=ready(); result=utterance(f); f.switch_mode('LIFE',2.1)
    check('mode_switch_resets_permissions', f.mic_consent is False and f.camera_consent is False)
    check('mode_switch_rejects_pending_asr', f.asr(result,2.2)=='DENIED')
    f=ready(); result=utterance(f); f.fault(2.1)
    check('fault_rejects_asr', f.asr(result,2.2)=='DENIED')
    check('fault_requires_recovery_not_start_button', f.start_by_button(True,2.3) is False)
    check('fault_cannot_be_bypassed_by_mode_switch', f.switch_mode('CREATE',2.4) is False and f.state=='FAULT')
    check('invalid_mode_type_denied', ready().switch_mode([],1) is False)
    old_f=ready(); result=utterance(old_f)
    f=ready(); new_result=utterance(f)
    check('prior_boot_asr_context_rejected', f.asr(replace(result,ticket=new_result.ticket),2.1)=='STALE_CONTEXT')
    f=ready(); result=utterance(f)
    check('asr_expiry_rejects_and_discards', f.asr(result,4.001)=='EXPIRED' and f.tickets=={} and f.audio_buffer==[])
    check('expired_asr_clock_rollback_rejected', f.asr(result,2.5)=='INVALID_TIME')
    f=ready(); ticket=f.begin_ptt(True,1)
    f.push_audio(ticket,'frame',1)
    check('max15s_capture_enforced', f.finish_ptt(ticket,16.001) is False and f.audio_buffer==[])
    f=ready(); ticket=f.begin_ptt(True,1)
    result=ASRResult(ticket,f.context(),0,'粒子を選択',True,.95)
    check('final_cannot_execute_before_ptt_release', f.asr(result,1.1)=='WAIT_PTT_END')
    f=ready(); old=utterance(f); f.begin_ptt(True,2.1)
    check('new_ptt_cancels_old_job', f.asr(old,2.2)=='STALE_CONTEXT')
    f=ready(); result=utterance(f)
    check('asr_context_bool_epoch_rejected', f.asr(replace(result,context=replace(result.context,mic_epoch=True)),2.1)=='STALE_CONTEXT')
    f=ready(); result=utterance(f,final=1)
    check('asr_final_integer_rejected', f.asr(result,2.1)=='DENIED')

    f=ready(); f.grip_by_button(True,1); event=BodyEvent(f.context(),1,1.05)
    check('fresh_live_explicit_body_launch', f.body_launch(event,1.1)=='MOCK_AVOCADO_DIGITAL_LAUNCH')
    check('body_replay_not_second_launch', f.body_launch(event,1.11)=='DENIED' and f.launches==1)
    for name, changes in [
        ('voice_source',{'source':'LOCAL_ASR'}),('dev_source',{'source':'DEV_SIMULATOR'}),
        ('no_device_proof',{'device_proof_verified':False}),('integer_proof',{'device_proof_verified':1}),
        ('no_explicit_action',{'explicit_release_verified':False}),('bad_tracking',{'tracking_valid':False}),
        ('outside_area',{'inside_play_area':False}),('wrong_calibration',{'calibration_id':'stale'}),
        ('bool_sequence',{'sequence':True})]:
        f=ready(); f.grip_by_button(True,1); event=replace(BodyEvent(f.context(),1,1.05),**changes)
        check('body_gate_'+name, f.body_launch(event,1.1)=='DENIED' and f.launches==0 and f.arm is None)
    for name,timestamp in [('stale',.5),('future',1.2),('nan',float('nan')),('bool',True)]:
        f=ready(); f.grip_by_button(True,1); event=BodyEvent(f.context(),1,timestamp)
        check('body_timestamp_'+name, f.body_launch(event,1.1)=='STALE_BODY')
    f=ready(); event=BodyEvent(f.context(),1,1)
    check('body_requires_grip_action', f.body_launch(event,1.1)=='NOT_ARMED')
    f=ready(); f.grip_by_button(True,1); event=BodyEvent(f.context(),1,6)
    check('grip_lease_expires', f.body_launch(event,6)=='NOT_ARMED')
    f=ready(); f.grip_by_button(True,1); event=BodyEvent(f.context(),1,.99)
    check('release_captured_before_grip_rejected', f.body_launch(event,1.05)=='BEFORE_GRIP_REJECTED' and f.launches==0)
    f=ready(); f.grip_by_button(True,0); event=BodyEvent(f.context(),1,-.01)
    check('negative_body_timestamp_rejected', f.body_launch(event,.01)=='STALE_BODY')
    old_f=ready(); old_f.grip_by_button(True,1); old_event=BodyEvent(old_f.context(),1,1.05)
    f=ready(); f.grip_by_button(True,1)
    check('prior_boot_body_context_rejected', f.body_launch(old_event,1.1)=='DENIED')
    f=ready(); f.grip_by_button(True,1); f.set_mic(True,True,1.1)
    check('mic_mute_cancels_prior_mixed_intent', f.arm is None)
    check('new_body_action_works_while_mic_muted', f.grip_by_button(True,1.2) is True and f.body_launch(BodyEvent(f.context(),1,1.25),1.3)=='MOCK_AVOCADO_DIGITAL_LAUNCH')
    f=ready(); result=utterance(f,'重力を弱く'); f.grip_by_button(True,2.05); oldbody=BodyEvent(f.context(),1,2.1)
    f.asr(result,2.1)
    check('voice_change_invalidates_old_body_context', f.body_launch(oldbody,2.2)=='DENIED' and f.launches==0)
    f=ready(); result=utterance(f); f.grip_by_button(True,2.05)
    f.body_launch(BodyEvent(f.context(),1,2.1),2.1)
    check('body_launch_invalidates_old_voice_context', f.asr(result,2.2)=='STALE_CONTEXT' and f.preview=={})
    f=ready(); result=utterance(f,'止めて'); f.grip_by_button(True,2.05); oldbody=BodyEvent(f.context(),1,2.1)
    f.asr(result,2.1)
    check('voice_stop_blocks_following_launch', f.body_launch(oldbody,2.2)=='DENIED' and f.state=='PAUSED')
    check('resume_needs_button', f.start_by_button(False,2.3) is False)
    check('explicit_resume_button', f.start_by_button(True,2.4) is True)
    f=ready(); f.set_camera(True,False,1)
    check('closed_camera_cannot_arm_body', f.grip_by_button(True,1.1) is False)
    check('final_fixture_external_actions_zero', f.external_actions==0)

    return {
        'revision':'MINI200-E1-INTERACTION-REF1', 'date':'2026-09-21',
        'checks':checks, 'pass_count':len(checks), 'fail_count':0,
        'actual_asr_runs':0, 'physical_tests':0, 'external_actions':0,
        'implemented':'Serial in-memory authorization/context reference model only.',
        'not_implemented':['Whisper inference','VAD','AEC','wake word','microphone hardware mute',
            'device signature verification','speaker authentication','real controller/camera',
            'concurrent process buffers','durable deduplication','actual file save','home/payment drivers'],
        'limits':['LOCAL_ASR and verified booleans are trusted fixture adapter outputs, not security implementations.',
            'Acoustic TV/recording replay through a real microphone can still look like speech; these tests cannot identify that.',
            'Intent score 0.85 is a synthetic policy threshold, not calibrated Whisper confidence.',
            'TTL and freshness values are proposed bounds, not measured ASR/tracking latency.',
            'Software buffer deletion does not prove electrical isolation or DSP/DMA memory erasure.',
            'Voice stop is a best-effort UI pause, never a physical emergency stop.']
    }


if __name__ == '__main__':
    if not __debug__:
        raise RuntimeError('Run normally, not with -O')
    result = run_tests()
    out = Path(__file__).resolve().parent/'tests.json'
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['revision','pass_count','fail_count','actual_asr_runs','physical_tests','external_actions']},ensure_ascii=False))
