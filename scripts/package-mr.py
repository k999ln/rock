from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
metadata=json.loads((root/'vendor/mr/provenance.json').read_text())
for record in metadata['files']:
    assert hashlib.sha256((root/'vendor/mr'/record['file']).read_bytes()).hexdigest()==record['sha256'],record['file']
out=root/'public/toolkits/mr-toolkit.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
    for base,prefix in [(root/'toolkits/mr',''),(root/'vendor/mr','vendor/mr/')]:
        for path in sorted(base.rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                info=zipfile.ZipInfo('loop-mr-tools/'+prefix+path.relative_to(base).as_posix(),date_time=(2026,9,5,0,0,0))
                info.compress_type=zipfile.ZIP_DEFLATED
                info.external_attr=0o644<<16
                archive.writestr(info,path.read_bytes())
print(out)
