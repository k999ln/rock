"""Bounded USB CDC health/stop driver. MCU telemetry never supplies OS authority."""
import argparse
import binascii
import fcntl
import json
import os
from pathlib import Path
import select
import signal
import stat
import struct
import termios
import time

FRAME = struct.Struct('<2sBBIIIHH')
STATUS, HEARTBEAT, ARM, STOP = 1, 2, 3, 4

def encode(kind, boot, sequence, epoch, flags=0):
    if kind not in (STATUS, HEARTBEAT, ARM, STOP):
        raise ValueError('invalid kind')
    body = struct.pack('<2sBBIIIH', b'MN', 1, kind, boot, sequence, epoch, flags)
    return body + struct.pack('<H', binascii.crc_hqx(body, 0xffff))

class Decoder:
    def __init__(self):
        self.buffer = bytearray()
    def feed(self, data):
        if len(data) > 4096:
            raise ValueError('oversized serial read')
        self.buffer.extend(data)
        frames = []
        while len(self.buffer) >= FRAME.size:
            p = bytes(self.buffer[:FRAME.size])
            magic, version, kind, boot, sequence, epoch, flags, crc = FRAME.unpack(p)
            if magic != b'MN' or version != 1 or kind not in (STATUS, HEARTBEAT, ARM, STOP) or binascii.crc_hqx(p[:18], 0xffff) != crc:
                del self.buffer[0]
                continue
            del self.buffer[:FRAME.size]
            frames.append({'kind': kind, 'boot': boot, 'sequence': sequence, 'epoch': epoch, 'flags': flags})
        return frames

class SupervisorDriver:
    def __init__(self, path, clock=time.monotonic):
        self.clock, self.decoder = clock, Decoder()
        self.fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK | os.O_NOFOLLOW)
        try:
            if not stat.S_ISCHR(os.fstat(self.fd).st_mode):
                raise ValueError('explicit character device required')
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.previous = termios.tcgetattr(self.fd)
            settings = termios.tcgetattr(self.fd)
            settings[0] = 0; settings[1] = 0
            settings[2] = termios.CLOCAL | termios.CREAD | termios.CS8
            settings[3] = 0; settings[4] = termios.B115200; settings[5] = termios.B115200
            settings[6][termios.VMIN] = 0; settings[6][termios.VTIME] = 0
            termios.tcsetattr(self.fd, termios.TCSANOW, settings)
        except BaseException:
            os.close(self.fd)
            raise
        self.boot = self.epoch = None
        self.sequence = 0; self.report_sequence = 0
        self.last_seen = None; self.last_sent = 0; self.flags = 0
        self.closed = False
    def _send(self, kind):
        if self.boot is None or self.sequence >= 0xffffffff:
            return False
        self.sequence += 1
        packet = encode(kind, self.boot, self.sequence, self.epoch)
        # A partial write is a failed frame. The MCU will reject it and time out.
        try:
            if os.write(self.fd, packet) != len(packet):
                self.last_seen = None
                return False
        except (BlockingIOError, OSError):
            self.last_seen = None
            return False
        return True
    def poll(self, timeout=0.05):
        readable, _, _ = select.select([self.fd], [], [], timeout)
        if readable:
            data = os.read(self.fd, 4096)
            if not data:
                self.last_seen = None
                raise ConnectionError('supervisor disconnected')
            for frame in self.decoder.feed(data):
                if frame['kind'] != STATUS or not frame['boot'] or not frame['epoch'] or not frame['sequence'] or frame['flags'] & ~255:
                    continue
                changed = frame['boot'] != self.boot
                if not changed and (frame['sequence'] <= self.report_sequence or frame['epoch'] < self.epoch):
                    continue
                if changed:
                    self.boot, self.sequence = frame['boot'], 0
                epoch_changed = frame['epoch'] != self.epoch
                self.epoch = frame['epoch']; self.report_sequence = frame['sequence']
                self.flags = frame['flags']; self.last_seen = self.clock()
                if changed or epoch_changed:
                    self._send(STOP)
        now = self.clock()
        if self.last_seen is not None and now - self.last_seen < 0.2 and now - self.last_sent >= 0.1:
            self._send(HEARTBEAT); self.last_sent = now
        return self.snapshot()
    def snapshot(self):
        fresh = self.last_seen is not None and 0 <= self.clock() - self.last_seen < 0.2
        return {'schema': 'rockstaros.mini-supervisor-health/1',
                'state': 'observed' if fresh else 'unavailable', 'bootNonce': self.boot,
                'placeEpoch': self.epoch, 'flags': self.flags if fresh else None,
                'clockBasis': 'host_boot_monotonic',
                'observedAtMonotonicMs': int(self.last_seen * 1000) if fresh else None,
                'expiresAtMonotonicMs': int((self.last_seen + 0.2) * 1000) if fresh else None,
                'physicalConditionsObserved': bool(fresh and self.flags & 31 == 31),
                'opticalOrMotionAuthority': False, 'biometricAuthority': False,
                'signedHardwareIdentity': False}
    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self._send(STOP)
            termios.tcsetattr(self.fd, termios.TCSANOW, self.previous)
        finally:
            os.close(self.fd)

def validate_usb_identity(device, expected_serial, sysfs=Path('/sys/class/tty')):
    """Select the owner's actual SDK bench board; this is not attestation."""
    if not expected_serial or len(expected_serial) > 128 or not expected_serial.isalnum():
        raise ValueError('actual bench USB serial must be configured')
    path = Path(device)
    if path.parent != Path('/dev') or not path.name.startswith('ttyACM') or not path.name[6:].isdigit():
        raise ValueError('explicit /dev/ttyACM number required')
    node = (sysfs / path.name / 'device').resolve(strict=True)
    for candidate in [node, *list(node.parents)[:7]]:
        if (candidate / 'idVendor').is_file():
            observed = tuple((candidate / name).read_text().strip() for name in ('idVendor', 'idProduct', 'serial'))
            if observed != ('2e8a', '0009', expected_serial):
                raise ValueError('configured USB bench identity does not match')
            return
    raise ValueError('USB identity was not found')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--device', required=True)
    parser.add_argument('--state-dir', required=True, type=Path)
    parser.add_argument('--expected-usb-serial', required=True)
    args = parser.parse_args()
    validate_usb_identity(args.device, args.expected_usb_serial)
    args.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = args.state_dir.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.getuid():
        raise ValueError('private runtime directory required')
    stopped = False
    def stop(_signum, _frame):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGTERM, stop); signal.signal(signal.SIGINT, stop)
    driver = SupervisorDriver(args.device)
    try:
        while not stopped:
            value = driver.poll()
            temporary = args.state_dir / 'health.tmp'
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, 'w') as output:
                json.dump(value, output)
            temporary.replace(args.state_dir / 'health.json')
    finally:
        driver.close()
        (args.state_dir / 'health.json').unlink(missing_ok=True)

if __name__ == '__main__':
    main()
