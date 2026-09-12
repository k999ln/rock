from pathlib import Path
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

with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for relative in sorted(set(included)):
        path = source / relative
        info = zipfile.ZipInfo(
            "rockstaros-fashion-brand-ops/" + relative,
            date_time=(2026, 9, 12, 0, 0, 0),
        )
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o755 if path.suffix == ".command" else 0o644) << 16
        archive.writestr(info, path.read_bytes())

print(output)
