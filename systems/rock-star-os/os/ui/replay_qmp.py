#!/usr/bin/env python3
"""Replay real native UI input on an already-running QEMU; never asserts app success.

No VM startup/shutdown, disk mutation, monitor shell commands or guest API are
provided. Correlate screenshots with authoritative Hub receipts separately.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import socket
import time


class Monitor:
    def __init__(self, path):
        self.connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.connection.settimeout(5)
        self.connection.connect(str(path))
        self.stream = self.connection.makefile("rwb", buffering=0)
        self.sequence = 0
        greeting = self.read()
        if "QMP" not in greeting:
            raise RuntimeError("QMP greeting is missing")
        self.command("qmp_capabilities")

    def read(self):
        line = self.stream.readline(65537)
        if not line or len(line) > 65536:
            raise RuntimeError("QMP frame is missing or exceeds 64 KiB")
        return json.loads(line)

    def command(self, name, arguments=None):
        self.sequence += 1
        identity = "native-ui-" + str(self.sequence)
        self.stream.write(json.dumps({"execute": name, "arguments": arguments or {}, "id": identity}).encode() + b"\n")
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            reply = self.read()
            if reply.get("id") == identity:
                if "error" in reply:
                    raise RuntimeError(str(reply["error"]))
                return reply.get("return")
        raise TimeoutError("QMP response deadline exceeded")

    def close(self):
        self.stream.close()
        self.connection.close()


def native_sequence():
    return [
        {"capture": "00-hub"},
        {"click": [360, 363]}, {"wait": 0.7}, {"capture": "01-tool-detail"},
        {"click": [360, 793]}, {"wait": 1.6}, {"capture": "02-install-response"},
        {"click": [360, 835]}, {"wait": 1.6}, {"capture": "03-approval-response"},
        {"click": [360, 835]}, {"wait": 0.7}, {"capture": "04-editor"},
        {"click": [250, 425]}, {"keys": ["ctrl", "a"]},
        {"type": "Native OS\nLocal resultx"}, {"keys": ["backspace"]},
        {"wait": 1.2},
        {"capture": "05-keyboard-input"},
        {"keys": ["ctrl", "ret"]}, {"wait": 2.5}, {"capture": "06-run-response"},
        {"click": [442, 913]}, {"wait": 0.5}, {"capture": "07-history"},
        {"click": [606, 913]}, {"wait": 0.5}, {"capture": "08-wallet"},
    ]


def character_keys(character):
    if "a" <= character <= "z" or "0" <= character <= "9":
        return [character]
    if "A" <= character <= "Z":
        return ["shift", character.lower()]
    simple = {" ": "spc", "\n": "ret", "-": "minus", "=": "equal", ",": "comma",
              ".": "dot", "/": "slash", ";": "semicolon", "'": "apostrophe", "`": "grave_accent",
              "[": "bracket_left", "]": "bracket_right", "\\": "backslash"}
    if character in simple:
        return [simple[character]]
    shifted = dict(zip("!@#$%^&*()_+<>?:\"~{}|", "1234567890-=,./;'`[]\\"))
    if character in shifted:
        base = shifted[character]
        return ["shift", simple.get(base, base)]
    raise ValueError("native key replay supports ASCII US-keyboard characters only")


def validate(steps, width, height):
    if not isinstance(steps, list) or not 1 <= len(steps) <= 300:
        raise ValueError("steps must contain 1–300 actions")
    for step in steps:
        if not isinstance(step, dict) or len(step) != 1:
            raise ValueError("each step must have exactly one action")
        action, value = next(iter(step.items()))
        if action == "capture":
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", value):
                raise ValueError("capture names must be simple safe filename stems")
        elif action == "click":
            if (not isinstance(value, list) or len(value) != 2 or
                    any(type(n) is not int for n in value) or not 0 <= value[0] < width or not 0 <= value[1] < height):
                raise ValueError("click coordinates are outside the framebuffer")
        elif action == "keys":
            if (not isinstance(value, list) or not 1 <= len(value) <= 4 or
                    any(not isinstance(key, str) or not re.fullmatch(r"[a-z0-9_]+", key) for key in value)):
                raise ValueError("keys must contain 1–4 QEMU qcode names")
        elif action == "type":
            if not isinstance(value, str) or len(value) > 4096:
                raise ValueError("typed text exceeds its bound")
            for character in value:
                character_keys(character)
        elif action == "wait":
            if type(value) not in (int, float) or not 0 <= value <= 30:
                raise ValueError("wait must be 0–30 seconds")
        elif action == "wheel":
            if type(value) is not int or not -20 <= value <= 20:
                raise ValueError("wheel must be -20–20 steps; positive means down")
        else:
            raise ValueError("unknown replay action")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qmp", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--steps", type=Path, help="JSON action array; default is the documented first-tool flow")
    parser.add_argument("--width", type=int, default=720)
    parser.add_argument("--height", type=int, default=960)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    if not 320 <= args.width <= 4096 or not 320 <= args.height <= 4096:
        parser.error("framebuffer dimensions must be 320–4096")
    steps = json.loads(args.steps.read_text()) if args.steps else native_sequence()
    validate(steps, args.width, args.height)
    if args.validate_only:
        print("PASS native input replay schema; no QMP connection or actions performed")
        return
    if not args.qmp or not args.output:
        parser.error("--qmp and --output are required for replay")
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"status": "RUNNING", "application_success": "NOT_ASSERTED",
              "scope": "Real QMP pointer/keyboard input and framebuffer captures; verify backend receipts separately",
              "started_utc": datetime.now(timezone.utc).isoformat(), "dimensions": [args.width, args.height], "steps": []}
    monitor = None

    def keys(names):
        monitor.command("send-key", {"keys": [{"type": "qcode", "data": key} for key in names], "hold-time": 80})
        time.sleep(0.12)

    try:
        monitor = Monitor(args.qmp)
        for index, step in enumerate(steps):
            action, value = next(iter(step.items()))
            if action == "capture":
                monitor.command("screendump", {"filename": str(args.output / (value + ".png")), "format": "png"})
            elif action == "click":
                x, y = value
                position = [{"type": "abs", "data": {"axis": "x", "value": round(x * 32767 / (args.width - 1))}},
                            {"type": "abs", "data": {"axis": "y", "value": round(y * 32767 / (args.height - 1))}}]
                monitor.command("input-send-event", {"events": position + [{"type": "btn", "data": {"down": True, "button": "left"}}]})
                time.sleep(0.08)
                monitor.command("input-send-event", {"events": [{"type": "btn", "data": {"down": False, "button": "left"}}]})
                time.sleep(0.15)
            elif action == "keys":
                keys(value)
            elif action == "type":
                for character in value:
                    keys(character_keys(character))
            elif action == "wait":
                time.sleep(value)
            elif action == "wheel":
                for _ in range(abs(value)):
                    button = "wheel-down" if value > 0 else "wheel-up"
                    for pressed in (True, False):
                        monitor.command("input-send-event", {"events": [{"type": "btn", "data": {"down": pressed, "button": button}}]})
                    time.sleep(0.1)
            report["steps"].append({"index": index, "action": step, "status": "SENT"})
        report["status"] = "REPLAY_COMPLETED"
        print("Native QMP replay completed; application success has NOT been inferred from clicks")
    except BaseException as error:
        report["status"] = "REPLAY_FAILED"
        report["error"] = str(error)
        raise
    finally:
        if monitor:
            monitor.close()
        report["finished_utc"] = datetime.now(timezone.utc).isoformat()
        (args.output / "native-input-replay.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
