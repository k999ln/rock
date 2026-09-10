#!/usr/bin/python3
"""Read installed runtime inventory and run small ordinary compatibility checks."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile


def main():
    shell = Path('/bin/sh').resolve()
    assert shell == Path('/bin/dash') and shell.is_file()
    applets = set(subprocess.check_output(['/bin/busybox','--list'],text=True).splitlines())
    assert not applets.intersection({'ash','awk','hush','sh'})
    ordinary = subprocess.run(['/bin/sh','-c','set -eu; value=ready; test "$value" = ready'],capture_output=True)
    failed = subprocess.run(['/bin/sh','-c','set -e; false; exit 0'],capture_output=True)
    unset = subprocess.run(['/bin/sh','-c','set -u; unset ROCK_MISSING_TEST; test "$ROCK_MISSING_TEST" = value'],capture_output=True)
    assert ordinary.returncode == 0 and failed.returncode != 0 and unset.returncode != 0
    assert hasattr(urllib.request.HTTPPasswordMgr,'_reduce_uri_with_scheme')
    assert hasattr(zipfile,'_decompressor_needs_input')
    data = b'Rock star os normal archive roundtrip\n' * 30
    results = []
    for compression in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer,'w',compression=compression) as archive:
            archive.writestr('ordinary.txt',data)
        with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as archive:
            with archive.open('ordinary.txt') as stream:
                output = b''.join(iter(lambda:stream.read(127),b''))
                assert output == data
        results.append({'compression':compression,'input_bytes':len(data),'chunk_read_bytes':127,'roundtrip':True})
    files = [shell,Path(urllib.request.__file__),Path(zipfile.__file__)]
    result = {'schema':'rock-runtime-inventory/1','status':'PASS','python':sys.version,'shell':str(shell),
              'excluded_applets':['ash','awk','hush','sh'],'busybox_applet_count':len(applets),
              'sha256':{str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in files},
              'shell_required_options':{'set_eu':True,'errexit':True,'nounset':True},
              'python_official_backport_symbols_present':True,'normal_archive_roundtrips':results,
              'scope':'installed source/binary inventory and ordinary compatibility; not a complete security audit'}
    print('ROCK_RUNTIME_INVENTORY '+json.dumps(result,sort_keys=True),flush=True)


if __name__ == '__main__':
    main()
