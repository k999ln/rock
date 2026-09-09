#!/usr/bin/env python3
"""Native-renderer integration evidence, NOT a Rock OS boot test.

Starts the real platform/Wallet classes on disposable paths with their dedicated
UIDs. Uses the existing host Hub interpreter for this test, not the target OS
sandbox. All catalog, installed, job and Wallet data comes from those services.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid


def identity(uid, groups):
    os.setgroups(groups)
    os.setgid(uid)
    os.setuid(uid)
    os.umask(0o077)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if os.geteuid() != 0 or not Path("/proc/sys/kernel/ostype").exists():
        raise SystemExit("Run only as root inside the disposable Linux test VM")
    args.source, args.binary, args.output = args.source.resolve(), args.binary.resolve(), args.output.resolve()
    spec = importlib.util.spec_from_file_location("rock_ui_test_platform", args.source / "os/platform/service.py")
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    args.output.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix="rock-ui-live-"))
    directory.chmod(0o755)
    platform_dir, wallet_dir = directory / "platform", directory / "wallet"
    for path, uid, gid, mode in ((platform_dir, 1002, 1000, 0o750), (wallet_dir, 1003, 1002, 0o750)):
        path.mkdir()
        os.chown(path, uid, gid)
        path.chmod(mode)
    platform_socket, wallet_socket = platform_dir / "api.sock", wallet_dir / "api.sock"
    handoff = directory / "device-handoff.json"
    shutil.copyfile(args.source / "os/entitlement/fixtures/device-handoff.json", handoff)
    os.chown(handoff, 0, 0)
    handoff.chmod(0o644)

    def serve_wallet():
        identity(1003, [1002])
        with service.Server(wallet_socket, service.WalletService(wallet_dir, provisioning_file=handoff), {0, 1002}, 1002) as server:
            server.serve_forever(poll_interval=0.1)

    def serve_platform():
        identity(1002, [1000])

        class PreviewPlatform(service.Platform):
            def snapshot(self):
                snapshot = super().snapshot()
                snapshot["device"].update(
                    hardware="Debian native-renderer integration test",
                    sandbox="Host interpreter for UI test; not target OS sandbox",
                )
                return snapshot

        platform = PreviewPlatform(platform_dir, args.source / "examples/registry", wallet_socket=wallet_socket)
        platform.hub = service.Hub(platform_dir / "hub.db", {service.TEST_PUBLISHER: service.PUBLIC_TEST_KEY})
        with service.Server(platform_socket, platform, {0, 1000}, 1000) as server:
            server.serve_forever(poll_interval=0.1)

    processes = [multiprocessing.Process(target=serve_wallet), multiprocessing.Process(target=serve_platform)]
    evidence = {"scope": "Debian native Cairo renderer with live local services; NOT Rock OS boot evidence",
                "created_utc": datetime.now(timezone.utc).isoformat(), "screenshots": [], "checks": []}

    def call(op, **fields):
        request = {"v": 1, "op": op, **fields}
        if op != "snapshot":
            request["key"] = "native-preview-" + str(uuid.uuid4())
        return service.call(platform_socket, request, 1002)

    def screenshot(name, page, **fields):
        path = args.output / (name + ".png")
        command = [str(args.binary), "--socket", str(platform_socket), "--font",
                   str(args.source / "os/assets/NotoSansCJKjp-Regular.otf"),
                   "--screenshot", str(path), "--page", page]
        for key, value in fields.items():
            command += ["--" + key.replace("_", "-"), str(value)]
        subprocess.run(command, check=True)
        evidence["screenshots"].append(path.name)

    try:
        for process in processes:
            process.start()
        for _ in range(100):
            if all(process.is_alive() for process in processes) and platform_socket.exists() and wallet_socket.exists():
                try:
                    initial = call("snapshot")["snapshot"]
                    break
                except (OSError, ValueError):
                    pass
            time.sleep(0.05)
        else:
            raise RuntimeError("temporary platform services did not become ready")
        assert initial["wallet"]["simulation_only"] is True
        assert initial["wallet"]["available_minor"] == 0
        assert initial["hub"]["installed"] == []
        screenshot("native-live-hub", "hub")
        screenshot("native-live-wallet-zero", "wallet")
        tool = "org.rockstar.text-tidy"
        receipt = call("install", id=tool, version="1.0.0")["result"]
        call("approve", id=tool, approved_hash=receipt["hash"])
        sample = "  Native Cairo  \n\n\n  Local result  \n"
        run = call("run", id=tool, text=sample, target="device_local")["result"]
        for _ in range(100):
            state = call("snapshot")["snapshot"]
            job = next(item for item in state["hub"]["jobs"] if item["id"] == run["id"])
            if job["status"] not in ("running", "cancel_requested"):
                break
            time.sleep(0.05)
        assert job["status"] == "succeeded", job
        assert "Native Cairo" in job["output"]
        screenshot("native-live-installed", "installed")
        screenshot("native-live-detail", "detail", tool=tool)
        screenshot("native-live-detail-actions", "detail", tool=tool, scroll=400)
        screenshot("native-live-history", "history")
        screenshot("native-live-result", "result", job=job["id"])
        text_path = directory / "input.txt"
        text_path.write_text(sample)
        screenshot("native-live-editor", "editor", tool=tool, text_file=text_path)
        updated = call("update", id=tool, version="2.0.0")["result"]
        after_update = call("snapshot")["snapshot"]
        assert after_update["hub"]["installed"][0]["enabled"] == 0
        screenshot("native-live-approval", "detail", tool=tool, scroll=240)
        call("approve", id=tool, approved_hash=updated["hash"])
        call("rollback", id=tool, version="1.0.0")
        after_rollback = call("snapshot")["snapshot"]
        assert after_rollback["hub"]["installed"][0]["version"] == "1.0.0"
        assert after_rollback["hub"]["installed"][0]["enabled"] == 0
        call("uninstall", id=tool)
        after_uninstall = call("snapshot")["snapshot"]
        assert after_uninstall["hub"]["installed"] == []
        assert any(item["id"] == job["id"] for item in after_uninstall["hub"]["jobs"])
        assert initial['wallet']['membership']['registered'] is False
        call('wallet.register')
        registered = call('snapshot')['snapshot']['wallet']
        assert registered['membership']['registered'] is True
        assert registered['membership']['entitlement']['auto_renew'] is False
        screenshot('native-live-wallet-registered', 'wallet')
        terms = registered['membership']['terms_version']
        call('wallet.consent', accepted=True, terms_version=terms)
        sale = call('wallet.sale', amount_minor=2000)['result']
        call('wallet.settle', id=sale['id'])
        accepted_bill = call('wallet.bill', period=datetime.now(timezone.utc).strftime('%Y-%m'))
        assert accepted_bill['result']['accepted'] is True
        for _ in range(160):
            wallet = call('snapshot')['snapshot']['wallet']
            if wallet['billed_minor'] == 888:
                break
            time.sleep(0.05)
        assert wallet['billed_minor'] == 888 and wallet['available_minor'] == 1112, wallet
        call('wallet.bill', period=datetime.now(timezone.utc).strftime('%Y-%m'))
        assert call('snapshot')['snapshot']['wallet']['billed_minor'] == 888
        screenshot('native-live-wallet-paid', 'wallet')
        screenshot('native-live-wallet-balance', 'wallet', scroll=430)
        call('wallet.consent', accepted=False, terms_version=terms)
        canceled = call('snapshot')['snapshot']['wallet']
        assert canceled['membership']['entitlement']['auto_renew'] is False
        assert canceled['membership']['entitlement']['subscription_state'] == 'CANCEL_AT_PERIOD_END'
        screenshot('native-live-wallet-canceled', 'wallet')
        evidence["checks"] = ["live signed catalog", "real empty initial state and simulator zero",
                              "install", "hash-specific approval", "actual host recipe completion",
                              "update disables permissions", "rollback disables permissions",
                              "uninstall preserves execution history", "native renderer uses live socket",
                              "registration does not imply consent", "exact versioned consent", "simulator 888 charge once",
                              "cancel clears current membership intent while preserving paid access"]
        evidence["job"] = {key: job[key] for key in ("id", "status", "output", "tool_id", "version")}
        evidence["status"] = "PASS"
        (args.output / "native-live-test.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
        print("PASS native Cairo live-service integration; not target OS boot evidence")
    finally:
        for process in processes:
            if process.is_alive(): process.terminate()
        for process in processes:
            process.join(timeout=5)
            if process.is_alive(): process.kill(); process.join()
        shutil.rmtree(directory)


if __name__ == "__main__":
    main()
