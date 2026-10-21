#!/usr/bin/env python3
"""Select native partition artifacts by attempt, never by their reported outcome."""
import argparse
import json
import math
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import time

PARTS = ("main-0", "main-1", "main-2", "main-3", "support")
MAX_ARTIFACTS = 1000
MAX_PAGES = 10
MAX_INPUT_BYTES = 2 * 1024 * 1024
REQUEST_SECONDS = 20
MAX_ID = (1 << 53) - 1  # actions/download-artifact consumes IDs as JavaScript numbers.
MAX_ATTEMPT = (1 << 31) - 1
NAME_PREFIX = "native-source-part"
NAME = re.compile(r"native-source-part-(main-[0-3]|support)-attempt-([1-9][0-9]{0,9})")
SHA = re.compile(r"[0-9a-f]{40}")
REPO = re.compile(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}")


class SelectionError(ValueError):
    """Only fixed diagnostic codes cross the CLI boundary."""
    CODES = frozenset("NATIVE_ARTIFACT_" + code for code in (
        "INVALID_ARGUMENTS", "INVALID_METADATA", "ARTIFACT_LIMIT", "INCOMPLETE_PAGINATION",
        "DUPLICATE_ID", "INVALID_PART", "FUTURE_ATTEMPT", "DUPLICATE_PART_ATTEMPT",
        "MISSING_PART", "EXPIRED_SELECTED", "INPUT_TOO_LARGE", "REQUEST_FAILED",
        "RUN_MISMATCH", "INPUT_ERROR", "INTERNAL_ERROR"))

    def __init__(self, code):
        super().__init__(code if code in self.CODES else "NATIVE_ARTIFACT_INTERNAL_ERROR")


def fail(code):
    raise SelectionError("NATIVE_ARTIFACT_" + code)


def positive(value, limit=MAX_ID):
    return type(value) is int and 0 < value <= limit


def validate_target(run_id, head_sha, attempt):
    if (not positive(run_id) or type(head_sha) is not str or not SHA.fullmatch(head_sha)
            or not positive(attempt, MAX_ATTEMPT)):
        fail("INVALID_ARGUMENTS")


def select_artifacts(pages, *, run_id, head_sha, attempt):
    """Return exactly five IDs in PARTS order from a complete paginated listing."""
    validate_target(run_id, head_sha, attempt)
    if type(pages) is not list or not 1 <= len(pages) <= MAX_PAGES:
        fail("INVALID_METADATA")
    total = None
    records = []
    for page in pages:
        if type(page) is not dict or type(page.get("total_count")) is not int:
            fail("INVALID_METADATA")
        count, artifacts = page["total_count"], page.get("artifacts")
        if not 0 <= count <= MAX_ARTIFACTS:
            fail("ARTIFACT_LIMIT")
        if total is not None and count != total:
            fail("INCOMPLETE_PAGINATION")
        total = count
        if type(artifacts) is not list or len(artifacts) > 100:
            fail("INVALID_METADATA")
        if len(pages) > 1 and not artifacts:
            fail("INCOMPLETE_PAGINATION")
        records.extend(artifacts)
        if len(records) > MAX_ARTIFACTS:
            fail("ARTIFACT_LIMIT")
    if len(records) != total:
        fail("INCOMPLETE_PAGINATION")

    seen_ids, seen_parts, latest = set(), set(), {}
    for item in records:
        if type(item) is not dict or not positive(item.get("id")):
            fail("INVALID_METADATA")
        ident, name, run = item["id"], item.get("name"), item.get("workflow_run")
        if ident in seen_ids:
            fail("DUPLICATE_ID")
        seen_ids.add(ident)
        if (type(name) is not str or not 1 <= len(name) <= 256
                or type(item.get("expired")) is not bool
                or type(run) is not dict or type(run.get("id")) is not int
                or run["id"] != run_id or run.get("head_sha") != head_sha):
            fail("INVALID_METADATA")
        if not name.startswith(NAME_PREFIX):
            continue
        matched = NAME.fullmatch(name)
        if matched is None:
            fail("INVALID_PART")
        part, raw_attempt = matched.groups()
        number = int(raw_attempt)
        if not positive(number, MAX_ATTEMPT) or number > attempt:
            fail("FUTURE_ATTEMPT")
        key = part, number
        if key in seen_parts:
            fail("DUPLICATE_PART_ATTEMPT")
        seen_parts.add(key)
        if part not in latest or number > latest[part][0]:
            latest[part] = (number, ident, item["expired"])
    if set(latest) != set(PARTS):
        fail("MISSING_PART")
    if any(latest[part][2] for part in PARTS):
        fail("EXPIRED_SELECTED")
    return tuple(latest[part][1] for part in PARTS)


def decode_json(raw):
    if len(raw) > MAX_INPUT_BYTES:
        fail("INPUT_TOO_LARGE")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                fail("INVALID_METADATA")
            result[key] = value
        return result

    def reject_constant(_):
        fail("INVALID_METADATA")

    try:
        return json.loads(raw, object_pairs_hook=unique, parse_constant=reject_constant)
    except SelectionError:
        raise
    except (ValueError, UnicodeError, RecursionError):
        fail("INVALID_METADATA")


def request_json(endpoint):
    """A bounded stdout-only GET; neither credentials nor gh stderr are printed."""
    command = ["gh", "api", "--hostname", "github.com", "--method", "GET", endpoint]
    try:
        with subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL) as process:
            try:
                deadline = time.monotonic() + REQUEST_SECONDS
                output = bytearray()
                with selectors.DefaultSelector() as selector:
                    selector.register(process.stdout, selectors.EVENT_READ)
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0 or not selector.select(remaining):
                            fail("REQUEST_FAILED")
                        block = os.read(process.stdout.fileno(),
                                        min(65536, MAX_INPUT_BYTES + 1 - len(output)))
                        if not block:
                            break
                        output.extend(block)
                        if len(output) > MAX_INPUT_BYTES:
                            fail("INPUT_TOO_LARGE")
                remaining = deadline - time.monotonic()
                if remaining <= 0 or process.wait(timeout=remaining) != 0:
                    fail("REQUEST_FAILED")
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
    except SelectionError:
        raise
    except (OSError, subprocess.SubprocessError):
        fail("REQUEST_FAILED")
    return decode_json(output)


def collect_artifacts(repo, *, run_id, head_sha, attempt, request=request_json):
    """Verify run identity before fetching at most ten 100-artifact pages."""
    validate_target(run_id, head_sha, attempt)
    if (type(repo) is not str or not REPO.fullmatch(repo)
            or repo.split("/")[1] in (".", "..")):
        fail("INVALID_ARGUMENTS")

    def get(endpoint):
        try:
            return request(endpoint)
        except SelectionError:
            raise
        except Exception:
            fail("REQUEST_FAILED")

    base = f"repos/{repo}/actions/runs/{run_id}"
    run = get(base)
    if (type(run) is not dict or type(run.get("id")) is not int or run["id"] != run_id
            or run.get("head_sha") != head_sha or type(run.get("run_attempt")) is not int
            or run["run_attempt"] != attempt):
        fail("RUN_MISMATCH")
    pages = []
    count = None
    for number in range(1, MAX_PAGES + 1):
        page = get(base + f"/artifacts?per_page=100&page={number}")
        if type(page) is not dict or type(page.get("total_count")) is not int:
            fail("INVALID_METADATA")
        observed = page["total_count"]
        if not 0 <= observed <= MAX_ARTIFACTS:
            fail("ARTIFACT_LIMIT")
        if count is not None and observed != count:
            fail("INCOMPLETE_PAGINATION")
        count = observed
        artifacts = page.get("artifacts")
        required = min(100, max(0, count - (number - 1) * 100))
        if type(artifacts) is not list or len(artifacts) != required:
            fail("INCOMPLETE_PAGINATION")
        pages.append(page)
        if number == max(1, math.ceil(count / 100)):
            return select_artifacts(pages, run_id=run_id, head_sha=head_sha, attempt=attempt)
    fail("ARTIFACT_LIMIT")


class SafeParser(argparse.ArgumentParser):
    def error(self, _message):
        fail("INVALID_ARGUMENTS")


def decimal(value, limit):
    if not re.fullmatch(r"[1-9][0-9]{0,18}", value):
        fail("INVALID_ARGUMENTS")
    number = int(value)
    if not positive(number, limit):
        fail("INVALID_ARGUMENTS")
    return number


def main(argv=None):
    try:
        parser = SafeParser(add_help=False, allow_abbrev=False)
        source = parser.add_mutually_exclusive_group(required=True)
        source.add_argument("--input", type=Path)
        source.add_argument("--repo")
        parser.add_argument("--run-id", required=True)
        parser.add_argument("--head-sha", required=True)
        parser.add_argument("--attempt", required=True)
        args = parser.parse_args(argv)
        target = {"run_id": decimal(args.run_id, MAX_ID), "head_sha": args.head_sha,
                  "attempt": decimal(args.attempt, MAX_ATTEMPT)}
        validate_target(**target)
        if args.repo is not None:
            selected = collect_artifacts(args.repo, **target)
        else:
            try:
                with args.input.open("rb") as stream:
                    raw = stream.read(MAX_INPUT_BYTES + 1)
            except OSError:
                fail("INPUT_ERROR")
            selected = select_artifacts(decode_json(raw), **target)
        print("artifact-ids=" + ",".join(str(ident) for ident in selected))
        return 0
    except SelectionError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (Exception, KeyboardInterrupt):
        print("NATIVE_ARTIFACT_INTERNAL_ERROR", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
