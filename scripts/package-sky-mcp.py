from pathlib import Path
from io import BytesIO
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / 'public/toolkits/sky-mcp-connector.zip'
sources = [
    root / 'toolkits/sky-mcp-connector',
    root / 'toolkits/mr',
    root / 'toolkits/fashion-brand-ops',
]

buffer = BytesIO()
with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
    for source in sources:
        for path in sorted(source.rglob('*')):
            if not path.is_file() or '__pycache__' in path.parts or 'node_modules' in path.parts or path.suffix in {'.db', '.db-shm', '.db-wal'}:
                continue
            name = 'sky-mcp-pack/' + path.relative_to(source.parent).as_posix()
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 12, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if path.suffix in {'.command', '.mjs'} and (path.name == 'server.mjs' or path.suffix == '.command') else 0o644) << 16
            archive.writestr(info, path.read_bytes())

payload = buffer.getvalue()
if '--check' in sys.argv:
    if not output.exists() or output.read_bytes() != payload:
        raise SystemExit('Sky MCP Connector ZIPがsourceと一致しません。npm run mcp:packageを実行してください。')
    print(f'{output}: sourceと一致')
else:
    output.write_bytes(payload)
    print(output)
