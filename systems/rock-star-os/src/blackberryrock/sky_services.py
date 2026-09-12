"""OS-owned installer and supervisor for reviewed local Sky MCP services.

Only services pinned in the OS catalog may be installed. Bundles are verified
before extraction, entrypoints are constrained to Python files inside the
bundle, and personal data lives outside the replaceable package directory.
"""
from __future__ import annotations

import hashlib
import json
import os
from contextlib import closing
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import threading
import time
from urllib.request import urlopen
import zipfile


CATALOG_SCHEMA = "rockstaros-sky-service-catalog/1"
MAX_BUNDLE_BYTES = 16 * 1024 * 1024
MAX_EXPANDED_BYTES = 32 * 1024 * 1024
MAX_FILES = 256


class SkyServiceError(ValueError):
    pass


def _canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def _digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else _canonical(value)).hexdigest()


def _identifier(value, maximum=100):
    if (not isinstance(value, str) or not 1 <= len(value) <= maximum
            or not value.replace("-", "").replace(".", "").isalnum()
            or value[0] in ".-"):
        raise SkyServiceError("invalid service identifier")
    return value


def _relative(value):
    if not isinstance(value, str) or not value or len(value) > 300 or "\\" in value or "\x00" in value:
        raise SkyServiceError("invalid bundle path")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or str(path) == ".":
        raise SkyServiceError("bundle path must stay inside the reviewed package")
    return path


def _load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SkyServiceError("reviewed service metadata is unavailable") from error


def validate_catalog(value):
    if not isinstance(value, dict) or set(value) != {"schema", "services"} or value.get("schema") != CATALOG_SCHEMA:
        raise SkyServiceError("invalid Sky service catalog")
    services = value.get("services")
    if not isinstance(services, list) or not 1 <= len(services) <= 64:
        raise SkyServiceError("bounded Sky service catalog required")
    result = {}
    required = {"id", "name", "version", "bundle", "sha256", "plugin_manifest_sha256",
                "permissions", "data_policy", "price", "dashboard_url"}
    for item in services:
        if not isinstance(item, dict) or set(item) != required:
            raise SkyServiceError("invalid Sky service catalog entry")
        service_id = _identifier(item["id"])
        if service_id in result:
            raise SkyServiceError("duplicate Sky service id")
        if (not isinstance(item["name"], str) or not 1 <= len(item["name"].strip()) <= 80
                or not isinstance(item["version"], str)
                or len(item["version"]) > 32
                or not all(part.isdigit() for part in item["version"].split("."))
                or len(item["version"].split(".")) != 3):
            raise SkyServiceError("invalid Sky service identity")
        _relative(item["bundle"])
        if any(not isinstance(item[field], str) or len(item[field]) != 64
               or any(character not in "0123456789abcdef" for character in item[field])
               for field in ("sha256", "plugin_manifest_sha256")):
            raise SkyServiceError("invalid reviewed service digest")
        if (item["permissions"] != ["subscription.read", "subscription.write", "local.files"]
                or item["data_policy"] != {"storage": "device_private", "network": "loopback_only"}
                or item["price"] != {"currency": "USD", "amount_minor": 0, "unit": "install"}
                or item["dashboard_url"] != "http://127.0.0.1:8765"):
            raise SkyServiceError("unsupported service permissions, data policy, price, or endpoint")
        result[service_id] = dict(item)
    return result


def validate_plugin(value, expected):
    if (not isinstance(value, dict)
            or set(value) != {"schemaVersion", "id", "name", "version", "description", "privacy", "entrypoints"}
            or value.get("schemaVersion") != 1
            or value.get("id") != expected["id"]
            or value.get("version") != expected["version"]):
        raise SkyServiceError("bundle plugin identity does not match the OS catalog")
    if (value.get("privacy") != {"networkRequired": False, "dataDirectory": "./data", "sensitiveData": True}
            or not isinstance(value.get("name"), str) or not isinstance(value.get("description"), str)):
        raise SkyServiceError("bundle privacy contract is unsupported")
    entries = value.get("entrypoints")
    if not isinstance(entries, dict) or set(entries) != {"mcp", "dashboard"}:
        raise SkyServiceError("bundle must provide MCP and dashboard entrypoints")
    expected_entries = {
        "mcp": {"transport": "stdio", "command": "python3", "args": ["scripts/mcp_server.py"]},
        "dashboard": {"command": "python3", "args": ["scripts/run_local.py", "--port", "8765"],
                      "url": expected["dashboard_url"]},
    }
    if entries != expected_entries:
        raise SkyServiceError("bundle entrypoints differ from the reviewed OS contract")
    return value


class SkyServiceManager:
    def __init__(self, state, catalog, bundles, *, python=None, clock=None, popen=None):
        self.state = Path(state)
        self.catalog_path = Path(catalog)
        self.bundle_root = Path(bundles)
        self.python = python or sys.executable
        self.clock = clock or time.time
        self.popen = popen or subprocess.Popen
        self.lock = threading.RLock()
        self.processes = {}
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.state, 0o700)
        self.packages = self.state / "packages"
        self.data = self.state / "data"
        self.packages.mkdir(mode=0o700, exist_ok=True)
        self.data.mkdir(mode=0o700, exist_ok=True)
        self.db = self.state / "services.sqlite3"
        self.catalog = validate_catalog(_load_json(self.catalog_path))
        with closing(self._connect()) as connection, connection:
            connection.executescript("""
            CREATE TABLE IF NOT EXISTS sky_services(
              id TEXT PRIMARY KEY, version TEXT NOT NULL, package_sha256 TEXT NOT NULL,
              install_path TEXT NOT NULL, desired_state TEXT NOT NULL, last_error TEXT,
              installed_at REAL NOT NULL, updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sky_service_receipts(
              key TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL, result TEXT NOT NULL, created_at REAL NOT NULL
            );
            """)
            connection.execute("UPDATE sky_services SET desired_state='stopped',last_error=? WHERE desired_state='running'",
                               ("OS service restarted; start again from Sky",))

    def _connect(self):
        connection = sqlite3.connect(self.db, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    def _service(self, service_id):
        _identifier(service_id)
        try:
            return self.catalog[service_id]
        except KeyError as error:
            raise SkyServiceError("service is not in the reviewed OS catalog") from error

    def _bundle(self, service):
        relative = _relative(service["bundle"])
        bundle = self.bundle_root.joinpath(*relative.parts)
        root = self.bundle_root.resolve()
        try:
            bundle.resolve().relative_to(root)
            info = bundle.lstat()
        except (OSError, ValueError) as error:
            raise SkyServiceError("reviewed service bundle is unavailable") from error
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_BUNDLE_BYTES or info.st_nlink != 1:
            raise SkyServiceError("reviewed service bundle is unsafe or too large")
        raw = bundle.read_bytes()
        if _digest(raw) != service["sha256"]:
            raise SkyServiceError("service bundle digest does not match the OS catalog")
        return bundle

    def _extract(self, bundle, destination, service):
        total = 0
        seen = set()
        try:
            with zipfile.ZipFile(bundle) as archive:
                entries = archive.infolist()
                if not 1 <= len(entries) <= MAX_FILES:
                    raise SkyServiceError("service bundle file count is outside the OS limit")
                for entry in entries:
                    path = _relative(entry.filename)
                    key = str(path).rstrip('/')
                    if key in seen:
                        raise SkyServiceError("service bundle may not contain duplicate paths")
                    seen.add(key)
                    mode = entry.external_attr >> 16
                    if stat.S_ISLNK(mode):
                        raise SkyServiceError("service bundle may not contain symbolic links")
                    total += entry.file_size
                    if entry.file_size > MAX_BUNDLE_BYTES or total > MAX_EXPANDED_BYTES:
                        raise SkyServiceError("expanded service bundle exceeds the OS limit")
                    target = destination.joinpath(*path.parts)
                    target.resolve().relative_to(destination.resolve())
                    if entry.is_dir():
                        target.mkdir(parents=True, exist_ok=True, mode=0o700)
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    with archive.open(entry) as source, target.open("xb") as output:
                        shutil.copyfileobj(source, output, length=64 * 1024)
                    os.chmod(target, 0o700 if target.suffix == ".py" else 0o600)
        except (zipfile.BadZipFile, OSError, ValueError) as error:
            if isinstance(error, SkyServiceError):
                raise
            raise SkyServiceError("service bundle could not be safely expanded") from error
        plugin_path = destination / ".rockstaros" / "plugin.json"
        raw = plugin_path.read_bytes()
        if _digest(raw) != service["plugin_manifest_sha256"]:
            raise SkyServiceError("plugin manifest digest does not match the OS catalog")
        return validate_plugin(json.loads(raw), service)

    def _verify_install(self, bundle, install_path, service):
        try:
            root_info = install_path.lstat()
            install_path.resolve().relative_to(self.packages.resolve())
        except (OSError, ValueError) as error:
            raise SkyServiceError("installed service path is outside OS package storage") from error
        if not stat.S_ISDIR(root_info.st_mode) or stat.S_ISLNK(root_info.st_mode):
            raise SkyServiceError("installed service root must be a real directory")
        expected = set()
        try:
            with zipfile.ZipFile(bundle) as archive:
                for entry in archive.infolist():
                    path = _relative(entry.filename)
                    key = str(path).rstrip('/')
                    if key in expected:
                        raise SkyServiceError("service bundle may not contain duplicate paths")
                    expected.add(key)
                    target = install_path.joinpath(*path.parts)
                    info = target.lstat()
                    mode = info.st_mode
                    if entry.is_dir():
                        if not stat.S_ISDIR(mode) or stat.S_ISLNK(mode):
                            raise SkyServiceError("installed service directory changed after review")
                    elif (not stat.S_ISREG(mode) or stat.S_ISLNK(mode) or info.st_nlink != 1
                          or info.st_size != entry.file_size
                          or _digest(target.read_bytes()) != _digest(archive.read(entry))):
                        raise SkyServiceError("installed service file changed after review")
        except (zipfile.BadZipFile, OSError, ValueError) as error:
            if isinstance(error, SkyServiceError):
                raise
            raise SkyServiceError("installed service could not be reverified") from error
        actual = {path.relative_to(install_path).as_posix() for path in install_path.rglob('*')}
        if actual != expected:
            raise SkyServiceError("installed service contains missing or additional files")
        plugin = install_path / ".rockstaros" / "plugin.json"
        if _digest(plugin.read_bytes()) != service["plugin_manifest_sha256"]:
            raise SkyServiceError("installed plugin manifest changed after review")

    def _preflight_mcp(self, install_path, service):
        script = install_path / "scripts" / "mcp_server.py"
        request = b'\n'.join((
            b'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}',
            b'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}', b''))
        env = {**os.environ, "ROCKSTAR_LEDGER_DB": str(self.data / service["id"] / "ledger.sqlite3")}
        try:
            result = subprocess.run([self.python, "-I", "-B", str(script)], cwd=install_path,
                                    input=request, capture_output=True, timeout=8, env=env)
            lines = result.stdout.splitlines()
            replies = [json.loads(line) for line in lines]
            tools = replies[1]["result"]["tools"]
        except (OSError, subprocess.TimeoutExpired, UnicodeError, json.JSONDecodeError, KeyError, IndexError) as error:
            raise SkyServiceError("MCP preflight did not return a valid capability list") from error
        names = {item.get("name") for item in tools if isinstance(item, dict)}
        required = {"ledger_summary", "list_subscriptions", "subscription_coverage", "update_coverage_source"}
        if result.returncode or not required.issubset(names):
            raise SkyServiceError("MCP preflight is missing reviewed subscription capabilities")
        return sorted(names)

    def _ready(self, service, timeout=6):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            process = self.processes.get(service["id"])
            if process is not None and process.poll() is not None:
                return False
            try:
                with urlopen(service["dashboard_url"] + "/api/summary", timeout=0.4) as response:
                    if response.status == 200 and json.loads(response.read()).get("coverage") is not None:
                        return True
            except (OSError, ValueError, json.JSONDecodeError):
                time.sleep(0.05)
        return False

    def _start(self, service, install_path):
        running = self.processes.get(service["id"])
        if running is not None and running.poll() is None and self._ready(service, timeout=0.5):
            return
        if self._ready(service, timeout=0.2):
            raise SkyServiceError("the reviewed dashboard port is already owned by another process")
        data = self.data / service["id"]
        data.mkdir(parents=True, exist_ok=True, mode=0o700)
        env = {**os.environ, "ROCKSTAR_LEDGER_DB": str(data / "ledger.sqlite3")}
        command = [self.python, "-I", "-B", str(install_path / "scripts" / "run_local.py"), "--port", "8765"]
        process = self.popen(command, cwd=install_path, env=env, stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        self.processes[service["id"]] = process
        if not self._ready(service):
            if process.poll() is None:
                process.kill()
                process.wait(timeout=2)
            self.processes.pop(service["id"], None)
            raise SkyServiceError("service did not become ready within the OS startup limit")

    def _receipt(self, key, request, operation):
        _identifier(key, 128)
        request_sha = _digest(request)
        with closing(self._connect()) as connection, connection:
            old = connection.execute("SELECT * FROM sky_service_receipts WHERE key=?", (key,)).fetchone()
            if old:
                if old["request_sha256"] != request_sha:
                    raise SkyServiceError("idempotency key was already used for a different service action")
                return json.loads(old["result"])
            result = operation(connection)
            connection.execute("INSERT INTO sky_service_receipts VALUES(?,?,?,?)",
                               (key, request_sha, _canonical(result).decode(), self.clock()))
            connection.commit()
            return result

    def activate(self, service_id, expected_sha256, key):
        service = self._service(service_id)
        if expected_sha256 != service["sha256"]:
            raise SkyServiceError("Sky approval does not match the OS-reviewed service bundle")
        request = {"op": "activate", "id": service_id, "expected_sha256": expected_sha256}
        with self.lock:
            def operation(connection):
                bundle = self._bundle(service)
                target = self.packages / service_id / service["version"]
                row = connection.execute("SELECT * FROM sky_services WHERE id=?", (service_id,)).fetchone()
                if not target.exists():
                    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    staging = Path(tempfile.mkdtemp(prefix=f".{service_id}-", dir=target.parent))
                    try:
                        self._extract(bundle, staging, service)
                        os.replace(staging, target)
                    except BaseException:
                        shutil.rmtree(staging, ignore_errors=True)
                        raise
                elif (row and (row["version"] != service["version"]
                      or row["package_sha256"] != service["sha256"]
                      or Path(row["install_path"]).resolve() != target.resolve())):
                    raise SkyServiceError("installed service state does not match the reviewed package")
                self._verify_install(bundle, target, service)
                capabilities = self._preflight_mcp(target, service)
                self._start(service, target)
                now = self.clock()
                connection.execute("""INSERT INTO sky_services VALUES(?,?,?,?,?,?,?,?)
                  ON CONFLICT(id) DO UPDATE SET version=excluded.version,package_sha256=excluded.package_sha256,
                  install_path=excluded.install_path,desired_state='running',last_error=NULL,updated_at=excluded.updated_at""",
                  (service_id, service["version"], service["sha256"], str(target), "running", None,
                   row["installed_at"] if row else now, now))
                return {"id": service_id, "version": service["version"], "state": "running",
                        "dashboard_url": service["dashboard_url"], "mcp_tools": capabilities,
                        "data_location": "device_private", "network": "loopback_only"}
            return self._receipt(key, request, operation)

    def lifecycle(self, service_id, action, key):
        service = self._service(service_id)
        if action not in ("stop", "uninstall"):
            raise SkyServiceError("unsupported Sky service lifecycle action")
        request = {"op": action, "id": service_id}
        with self.lock:
            def operation(connection):
                row = connection.execute("SELECT * FROM sky_services WHERE id=?", (service_id,)).fetchone()
                if not row:
                    raise SkyServiceError("service is not installed")
                process = self.processes.pop(service_id, None)
                if process is not None and process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=2)
                now = self.clock()
                if action == "uninstall":
                    install = Path(row["install_path"])
                    install.resolve().relative_to(self.packages.resolve())
                    if not stat.S_ISDIR(install.lstat().st_mode) or stat.S_ISLNK(install.lstat().st_mode):
                        raise SkyServiceError("installed service root is unsafe")
                    shutil.rmtree(install)
                    connection.execute("DELETE FROM sky_services WHERE id=?", (service_id,))
                else:
                    connection.execute("UPDATE sky_services SET desired_state='stopped',last_error=NULL,updated_at=? WHERE id=?",
                                       (now, service_id))
                return {"id": service_id, "state": "not_installed" if action == "uninstall" else "stopped",
                        "data_preserved": True, "receipts_preserved": True}
            return self._receipt(key, request, operation)

    def snapshot(self):
        with self.lock, closing(self._connect()) as connection, connection:
            rows = {row["id"]: row for row in connection.execute("SELECT * FROM sky_services")}
            services = []
            for service_id, service in self.catalog.items():
                row = rows.get(service_id)
                process = self.processes.get(service_id)
                running = bool(process is not None and process.poll() is None and self._ready(service, timeout=0.1))
                services.append({"id": service_id, "name": service["name"], "version": service["version"],
                    "state": "running" if running else (row["desired_state"] if row else "not_installed"),
                    "package_sha256": service["sha256"], "dashboard_url": service["dashboard_url"],
                    "permissions": service["permissions"], "data_policy": service["data_policy"],
                    "price": service["price"], "last_error": row["last_error"] if row else None})
            return {"configured": True, "services": services, "installation": "os_managed",
                    "approval": "exact_bundle_digest", "receipts_preserved": True}

    def close(self):
        with self.lock:
            for service_id, process in list(self.processes.items()):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=2)
                self.processes.pop(service_id, None)
