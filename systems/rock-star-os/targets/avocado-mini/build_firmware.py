"""Cross-build the pinned LED-only MCU target; never flash hardware."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess

SDK_COMMIT = '079c6f39023649b154152db30f1d781e884879bc'
TINYUSB_COMMIT = '86ad6e56c1700e85f1c5678607a762cfe3aa2f47'
PICOTOOL_COMMIT = '2041936441b48a3cc53ae3da9e805229fe8f4e18'

def run(args, **kwargs):
    return subprocess.check_output([str(a) for a in args], text=True, **kwargs).strip()

def build(args):
    source = Path(__file__).resolve().parent / 'firmware'
    sdk = args.sdk.resolve(); output = args.output.resolve()
    for path, expected in [(sdk, SDK_COMMIT), (sdk / 'lib/tinyusb', TINYUSB_COMMIT)]:
        if run(['git', '-C', path, 'rev-parse', 'HEAD']) != expected:
            raise ValueError('Pinned official SDK/submodule revision required: ' + str(path))
        if run(['git', '-C', path, 'diff', '--name-only', 'HEAD']):
            raise ValueError('SDK tracked source differs from the pinned revision.')
    compiler = args.toolchain.resolve() / 'bin/arm-none-eabi-gcc'
    version = run([compiler, '-dumpfullversion'])
    if version != '14.3.1':
        raise ValueError('This recorded build profile uses Arm GNU 14.3.rel1 (14.3.1).')
    env = dict(os.environ, PICO_SDK_PATH=str(sdk),
               PATH=str(compiler.parent) + os.pathsep + str(args.cmake.resolve().parent) + os.pathsep + os.environ['PATH'])
    before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in source.iterdir() if p.is_file()}
    subprocess.run([str(args.cmake.resolve()), '-S', str(source), '-B', str(output),
                    '-DCMAKE_BUILD_TYPE=Release', '-DPICO_NO_PICOTOOL=0'], env=env, check=True)
    picotool = output / '_deps/picotool-src'
    if not picotool.is_dir() or run(['git', '-C', picotool, 'rev-parse', 'HEAD']) != PICOTOOL_COMMIT:
        raise ValueError('This profile requires the pinned SDK-fetched picotool revision.')
    subprocess.run([str(args.cmake.resolve()), '--build', str(output), '-j', '4'], env=env, check=True)
    if before != {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in source.iterdir() if p.is_file()}:
        raise ValueError('Firmware source changed during the build; discard this evidence.')
    artifacts = {}
    for suffix in ('elf', 'bin', 'uf2'):
        p = output / ('rockstar_mini_supervisor.' + suffix)
        artifacts[p.name] = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size}
    elf = output / 'rockstar_mini_supervisor.elf'
    symbols = run([compiler.with_name('arm-none-eabi-nm'), '-S', elf])
    symbol = re.search(r'^([0-9a-f]+)\s+00000012\s+r\s+usbd_desc_device$', symbols, re.MULTILINE)
    if not symbol:
        raise ValueError('Compiled USB device descriptor must be inspectable.')
    address = int(symbol[1], 16); data = elf.read_bytes()
    if data[:7] != b'\x7fELF\x01\x01\x01':
        raise ValueError('Expected ELF32 little-endian firmware.')
    section_offset = struct.unpack_from('<I', data, 32)[0]
    section_size, section_count = struct.unpack_from('<HH', data, 46)
    descriptor = None
    for i in range(section_count):
        section_address, offset, length = struct.unpack_from('<III', data, section_offset + i * section_size + 12)
        if section_address <= address and address + 18 <= section_address + length:
            descriptor = data[offset + address - section_address:offset + address - section_address + 18]
            break
    if descriptor is None or descriptor[:2] != b'\x12\x01' or descriptor[8:12] != b'\x8a\x2e\x09\x00':
        raise ValueError('Compiled RP2350 USB VID/PID must match the Linux bench driver (2e8a:0009).')
    result = {'schema': 'rockstaros.mini-mcu-build/1', 'board': 'pico2', 'sdkTag': '2.3.1',
              'sdkCommit': SDK_COMMIT, 'tinyusbCommit': TINYUSB_COMMIT, 'picotoolCommit': PICOTOOL_COMMIT,
              'compilerVersion': version, 'cmakeVersion': run([args.cmake.resolve(), '--version']).splitlines()[0],
              'sources': before, 'artifacts': artifacts,
              'compiledUsbDescriptor': {'vendorId': '2e8a', 'productId': '0009',
                                        'sha256': hashlib.sha256(descriptor).hexdigest(),
                                        'meaning': 'Pico SDK RP2350 development identifier; not signed identity or production VID permission'},
              'scope': 'unsigned LED/contact bench firmware; no laser/motor/biometric/network authority',
              'physicalBootAccepted': False, 'productionSigned': False, 'factoryRelease': False}
    (output / 'mini-build-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for name in ('sdk', 'toolchain', 'cmake', 'output'): p.add_argument('--' + name, type=Path, required=True)
    build(p.parse_args())
