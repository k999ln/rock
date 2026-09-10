#!/usr/bin/env python3
"""Synthetic C-PC01/02 acceptance: real CLI, adapter and actual MCP startup.

No native Hub, USB, network, durable idempotency or hostile-code sandbox proof.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / 'tests/mr_pc_probe.py'
FIXTURE = ROOT / 'systems/rock-star-os/os/tools/fixtures/citations.md'
EXPECTED_INPUT = 'bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e'
EXPECTED_OUTPUT = '30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def source_hashes(toolkit):
    vendor = toolkit / 'vendor/mr'
    if not vendor.is_dir():
        vendor = toolkit.parents[1] / 'vendor/mr'
    result = {str(Path('vendor/mr') / path.name): digest(path.read_bytes())
              for path in sorted(vendor.iterdir()) if path.is_file()}
    for name in ('rock_star_tools.py', 'pc_citations.py', 'pc_citations_worker.py', 'mcp_server.py'):
        result[name] = digest((toolkit / name).read_bytes())
    return result


def invoke(argv, raw, isolated=True):
    started = time.monotonic()
    process = subprocess.Popen([sys.executable, *(['-I'] if isolated else []), '-B', *map(str, argv)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        out, err = process.communicate(raw, timeout=12)
    except BaseException:
        process.terminate()
        process.communicate(timeout=7)
        raise
    require(process.returncode == 0, 'Process did not exit successfully.')
    return out, err, {'pid': process.pid, 'exit_code': process.returncode,
                      'elapsed_seconds': time.monotonic() - started}


def observe(err, parent):
    events = [json.loads(line) for line in err.splitlines()]
    require(len(events) == 2 and [v['event'] for v in events] == ['child_started', 'child_finished'],
            'Missing exact process observation pair.')
    first, last = events
    require(first['pid'] == last['pid'] and first['pid'] != parent and
            first['parent_pid'] == last['parent_pid'] == parent and last['exit_code'] == 0 and
            last['temporary_removed'] is True and last['pipes_closed'] is True and
            last['poisoned'] is False and not first['synthetic_fault'] and not last['synthetic_fault'],
            'Process identity or cleanup evidence failed.')
    return events


def request_bytes(text):
    values = [
        {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-11-25',
          'capabilities': {}, 'clientInfo': {'name': 'synthetic-pc-acceptance', 'version': '1'}}},
        {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
        {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'},
        {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {
          'name': 'format_citations', 'arguments': {'text': text}}},
        {'jsonrpc': '2.0', 'id': 4, 'method': 'ping'}]
    return ''.join(json.dumps(value, ensure_ascii=False) + '\n' for value in values).encode()


def mcp_output(raw):
    values = [json.loads(line) for line in raw.splitlines()]
    require([v['id'] for v in values] == [1, 2, 3, 4], 'MCP response identity/order changed.')
    require(values[0]['result']['protocolVersion'] == '2025-11-25', 'MCP protocol changed.')
    require({v['name'] for v in values[1]['result']['tools']} ==
            {'coconala_check', 'format_citations', 'make_free_article', 'verify_delivery'}, 'Tool list changed.')
    require(values[2]['result']['isError'] is False and values[3]['result'] == {}, 'MCP operation failed.')
    output = values[2]['result']['structuredContent']['output']
    require(values[2]['result']['content'] == [{'type': 'text', 'text': output}], 'MCP outputs disagree.')
    return output.encode()


def verify(toolkit, output):
    output.mkdir(mode=0o700)  # Refuse to overwrite an existing report directory.
    report = {'schema': 'rock.pc-citations-acceptance/1', 'status': 'FAIL',
              'scope': 'PC-only synthetic CLI/adapter/MCP stdio; no native Hub/USB acceptance',
              'platform': platform.platform(), 'python': sys.version, 'normal_user': os.geteuid() != 0,
              'synthetic': True,
              'not_proven': ['native runtime connection', 'durable idempotency/crash recovery',
                            'kernel-enforced filesystem/network sandbox', 'Windows adapter']}
    try:
        before = source_hashes(toolkit)
        raw = FIXTURE.read_bytes()
        require(len(raw) == 150 and digest(raw) == EXPECTED_INPUT, 'Synthetic input changed.')
        direct, err, d = invoke([toolkit / 'rock_star_tools.py', 'citations', '--input', FIXTURE], b'')
        require(not err, 'Direct CLI diagnostics were unexpected.')
        adapter, err, a = invoke([PROBE, 'adapter', toolkit], raw)
        a['child_observations'] = observe(err, a['pid'])
        plain, err, p = invoke([toolkit / 'mcp_server.py'], request_bytes(raw.decode()), isolated=False)
        require(not err, 'Plain MCP diagnostics were unexpected.')
        mcp = mcp_output(plain)
        observed, err, m = invoke([PROBE, 'mcp', toolkit], request_bytes(raw.decode()))
        m['child_observations'] = observe(err, m['pid'])
        require(direct == adapter == mcp == mcp_output(observed), 'Exact output comparison failed.')
        require(len(direct) == 155 and digest(direct) == EXPECTED_OUTPUT, '155-byte baseline changed.')
        require(before == source_hashes(toolkit), 'Source files changed during acceptance.')
        for name, data in (('direct-cli.md', direct), ('adapter.md', adapter), ('mcp.md', mcp)):
            (output / name).write_bytes(data)
        report.update(status='PASS', input_bytes=150, input_sha256=EXPECTED_INPUT,
                      output_bytes=155, output_sha256=EXPECTED_OUTPUT, exact_bytes_equal=True,
                      source_unchanged=True, source_sha256=before, observer_sha256=digest(PROBE.read_bytes()),
                      processes={'direct_cli': d, 'adapter': a, 'plain_mcp': p, 'observed_mcp': m})
    except BaseException as error:
        report['failure_type'] = type(error).__name__
        raise
    finally:
        (output / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--toolkit', type=Path, default=ROOT / 'toolkits/mr')
    args = parser.parse_args()
    print(json.dumps(verify(args.toolkit.resolve(), args.output.resolve()), indent=2))
