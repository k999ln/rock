"""Host-only fixed auth ROI checks. Unknown frames stay in anonymous memory.

No OCR guesses, guest RPC, bearer reveal, or timing-based success. Exact pixels
are intentionally fail-closed when the reviewed source/font/rendering changes.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import time


MANIFEST = Path(__file__).with_name('pin-readiness.json')
MAX_FRAME = 4 * 1024 * 1024


def profiles():
    value = json.loads(MANIFEST.read_text())
    if value['schema'] != 'rock.native-pin-readiness/1':
        raise ValueError('unreviewed PIN frame profile')
    root = Path(__file__).resolve().parents[2]
    for name, expected in value['sources'].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError('PIN frame source/font changed; regenerate and review the C guard')
    return value['profiles']


def inspect_frame(raw, profile, definitions):
    from PIL import Image
    if profile not in definitions or not 0 < len(raw) <= MAX_FRAME:
        return {'recognized': False}
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != 'PNG' or image.size != (720, 960):
                return {'recognized': False}
            image = image.convert('RGB')
            spec = definitions[profile]
            def digest(rect):
                return hashlib.sha256(image.crop(rect).tobytes()).hexdigest()
            if not all(digest(row['rect']) == row['sha256'] for row in spec['fixed']):
                return {'recognized': False}
            pin = digest(spec['pin_rect'])
            count = next((int(n) for n, expected in spec['pin_sha256'].items() if expected == pin), None)
            sign = digest(spec['sign_rect'])
            if count is None or sign not in (spec['sign_disabled_sha256'], spec['sign_enabled_sha256']):
                return {'recognized': False}
            return {'recognized': True, 'profile': profile, 'masked_digits': count,
                    'sign_enabled': sign == spec['sign_enabled_sha256'],
                    'pin_roi_sha256': pin, 'sign_roi_sha256': sign}
    except (OSError, ValueError, Image.DecompressionBombError):
        return {'recognized': False}


def memory_frame(monitor):
    # QEMU opens this already-owned anonymous Linux file. No unreviewed full
    # framebuffer is written to the evidence folder, /tmp, or a failure PNG.
    descriptor = os.memfd_create('rock-native-auth-roi', flags=os.MFD_CLOEXEC)
    try:
        monitor.command('screendump', {'filename': f'/proc/{os.getpid()}/fd/{descriptor}', 'format': 'png'})
        size = os.fstat(descriptor).st_size
        if not 0 < size <= MAX_FRAME:
            raise ValueError('bounded auth framebuffer required')
        os.lseek(descriptor, 0, os.SEEK_SET)
        raw = os.read(descriptor, MAX_FRAME + 1)
        if len(raw) != size:
            raise ValueError('incomplete auth framebuffer')
        return raw
    finally:
        os.close(descriptor)


def wait_ready(monitor, profile, digits, deadline, definitions, *, clock=time.monotonic, sleep=time.sleep):
    if profile not in definitions or digits not in (0, 4):
        raise ValueError('reviewed auth profile and explicit empty/four-digit state required')
    observed, samples = {'recognized': False}, 0
    while clock() < deadline:
        raw = memory_frame(monitor)
        samples += 1
        observed = inspect_frame(raw, profile, definitions)
        if clock() >= deadline:
            break
        if observed.get('recognized') and observed['masked_digits'] == digits and observed['sign_enabled'] == (digits == 4):
            return raw, {**observed, 'samples': samples}
        sleep(min(.05, max(0, deadline - clock())))
    state = (str(observed['masked_digits']) + ' masked digits, enabled=' + str(observed['sign_enabled'])
             if observed.get('recognized') else 'unrecognized auth frame')
    raise TimeoutError('reviewed PIN readiness was not observed within the original stage deadline: ' + state)


class PinReadinessMixin:
    def wait_pin_ready(self, profile, digits, deadline):
        if not hasattr(self, '_pin_profiles'):
            self._pin_profiles = profiles()
        raw, observation = wait_ready(self.monitor, profile, digits, deadline, self._pin_profiles)
        self.report.setdefault('pin_readiness', []).append(observation)
        # Keep the exact verified frame until its planned capture or sign input.
        self._verified_pin_frame = raw
        if digits == 0:
            self._pin_confirmation = (profile, raw)

    def capture(self, name):
        names = {'auth-01-explicit-enrollment': 'enroll', '06-owner-issue-confirmation': 'atm'}
        if name not in names:
            return super().capture(name)
        profile, raw = getattr(self, '_pin_confirmation', None) or (None, None)
        if profile != names[name] or raw is None:
            raise ValueError('planned auth capture requires the exact verified confirmation frame')
        path = self.output / (name + '.png')
        with path.open('xb') as target:
            target.write(raw)
        self.report['screenshots'].append({'name': path.name, 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(), 'dimensions': [720, 960]})
        self._pin_confirmation = None
