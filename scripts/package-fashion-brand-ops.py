from pathlib import Path
from io import BytesIO
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / "toolkits/fashion-brand-ops"
output = root / "public/toolkits/fashion-brand-ops-connector.zip"
included = [
    ".env.example",
    ".mcp.json",
    "README.md",
    "RockstarOS Sky接続.command",
    "package.json",
    "rockstaros-tool.json",
    "sky-submission.json",
]
included += [str(path.relative_to(source)) for folder in ("db", "scripts", "src") for path in sorted((source / folder).rglob("*")) if path.is_file()]

buffer = BytesIO()
with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
    for relative in sorted(set(included)):
        path = source / relative
        info = zipfile.ZipInfo(
            "rockstaros-fashion-brand-ops/" + relative,
            date_time=(2026, 9, 12, 0, 0, 0),
        )
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o755 if path.suffix == ".command" else 0o644) << 16
        archive.writestr(info, path.read_bytes())

payload = buffer.getvalue()
if "--check" in sys.argv:
    if not output.exists() or output.read_bytes() != payload:
        raise SystemExit(
            "Fashion Brand Ops Connector ZIPがsourceと一致しません。"
            "npm run fashion:packageを実行してください。"
        )
    print(f"{output}: sourceと一致")
else:
    output.write_bytes(payload)
    print(output)
