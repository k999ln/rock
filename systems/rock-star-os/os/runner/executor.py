"""Real fixed Linux process adapter. No fallback to an unisolated callback."""
import json
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import sys
import time

from blackberryrock.packages import canonical
from .protocol import MAX_OUTPUT, RunnerError, decode


class IsolatedRecipeExecutor:
    def __init__(self, launcher, worker_file, entry_file):
        self.paths = [str(Path(path).resolve(strict=True)) for path in (launcher, worker_file, entry_file)]
        for path in self.paths:
            info = os.stat(path)
            if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o022:
                raise RunnerError('fixed executor components must be regular and not group/world writable')
        if not os.access(self.paths[0], os.X_OK):
            raise RunnerError('isolated launcher is not executable')

    def execute(self, text, recipe, cancel):
        if sys.platform != 'linux':
            raise RunnerError('actual Linux isolation NOT_RUN on this host; no fallback')
        parent_net = os.readlink('/proc/self/ns/net')
        parent_mount = os.readlink('/proc/self/ns/mnt')
        process = subprocess.Popen(self.paths, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, start_new_session=True)
        raw, sent = canonical({'text': text, 'recipe': recipe}), 0
        output, diagnostic = bytearray(), bytearray()
        deadline = time.monotonic() + 3
        selector = selectors.DefaultSelector()
        for stream, action in ((process.stdin, selectors.EVENT_WRITE), (process.stdout, selectors.EVENT_READ), (process.stderr, selectors.EVENT_READ)):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, action)
        try:
            while selector.get_map():
                if cancel.is_set():
                    raise RunnerError('execution cancelled')
                if time.monotonic() >= deadline:
                    raise RunnerError('isolated execution exceeded 3 seconds')
                for key, event in selector.select(0.02):
                    stream = key.fileobj
                    if event & selectors.EVENT_WRITE:
                        try:
                            count = os.write(stream.fileno(), raw[sent:sent + 16384])
                            sent += count
                        except BrokenPipeError:
                            sent = len(raw)
                        if sent == len(raw):
                            selector.unregister(stream)
                            stream.close()
                    else:
                        part = os.read(stream.fileno(), 16384)
                        if not part:
                            selector.unregister(stream)
                            stream.close()
                            continue
                        destination = output if stream is process.stdout else diagnostic
                        destination.extend(part)
                        limit = MAX_OUTPUT * 6 + 4096 if stream is process.stdout else 8192
                        if len(destination) > limit:
                            raise RunnerError('isolated process exceeded output or diagnostic bound')
            code = process.wait(timeout=max(0.01, deadline - time.monotonic()))
            if code:
                # Diagnostics can contain input-derived ValueErrors: bound and avoid returning raw text.
                raise RunnerError('isolated recipe process exited with code ' + str(code))
            lines = diagnostic.decode('utf-8').splitlines()
            proofs = [line[len('ROCK_RUNNER_ISOLATION '):] for line in lines if line.startswith('ROCK_RUNNER_ISOLATION ')]
            if len(proofs) != 1:
                raise RunnerError('actual isolation proof missing')
            proof = json.loads(proofs[0])
            if (proof.get('kind') != 'actual_linux_isolated_process' or not proof.get('socket_syscall_denied')
                    or proof.get('wallet_path_visible') is not False or proof.get('network_namespace') == parent_net
                    or proof.get('mount_namespace') == parent_mount):
                raise RunnerError('actual isolation proof rejected')
            value = decode(bytes(output))
            if not isinstance(value, dict) or set(value) != {'text'} or not isinstance(value['text'], str):
                raise RunnerError('invalid fixed worker result')
            if len(value['text'].encode('utf-8')) > MAX_OUTPUT:
                raise RunnerError('worker output exceeds 128 KiB')
            return value['text'], {**proof, 'outer_pid': process.pid,
                                   'outer_network_namespace': parent_net, 'outer_mount_namespace': parent_mount}
        finally:
            selector.close()
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=2)
            for stream in (process.stdin, process.stdout, process.stderr):
                if not stream.closed:
                    stream.close()
