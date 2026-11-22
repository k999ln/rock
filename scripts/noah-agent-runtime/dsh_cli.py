"""Official dsh headless profile, inside Noah's existing no-network container.

The upstream loop and filesystem tools do the work. This adapter only fixes the
local route, removes unavailable surfaces and validates the final event.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile


def profile(base, model):
    if not base.startswith("http://127.0.0.1:") or model not in ("qwen2.5:1.5b", "qwen3:4b"):
        raise ValueError("Unknown model route")
    # JSON is valid YAML. Whole-row config replacement is the official patch API.
    rows = [
        {"id": "agent-default-model", "config": {"provider": "noah-local", "model": model}},
        {"id": "llm-pi-ai", "config": {"providers": {"noah-local": {
            "api": "openai-completions", "baseURL": base,
            "apiKeyEnv": "OPENAI_API_KEY", "retryPolicy": {"mode": "normal", "maxRetries": 0},
            "models": [{"id": model, "contextWindow": 8192, "maxTokens": 2048, "reasoningEfforts": False}],
            "compat": {"supportsDeveloperRole": False, "supportsStore": False},
        }}}},
    ]
    # No background title model call, delegation, browser, network or interactive
    # approvals. Headless inherits the official workspace-write filesystem policy.
    rows.extend({"id": key, "disabled": True} for key in (
        "session-title-llm", "tool-web", "tool-subagent", "tool-subagent-fork",
        "tool-subagent-control", "tool-agent-team", "tool-workflow", "tool-goal",
        "tool-skill", "tool-todo", "tool-fs-search", "tool-bash", "tool-pwsh",
    ))
    return rows


def consume(lines):
    session_id = None
    final = None
    for line in lines:
        if len(line.encode()) > 131072:
            raise ValueError("DSH event exceeded the output bound")
        value = json.loads(line)
        if not isinstance(value, dict) or final is not None:
            raise ValueError("Invalid DSH event order")
        if value.get("type") == "session":
            if session_id is not None or not isinstance(value.get("sessionId"), str) or not value["sessionId"]:
                raise ValueError("Invalid DSH session")
            session_id = value["sessionId"]
        elif value.get("type") == "error":
            raise ValueError("DSH reported an error")
        elif value.get("type") == "final":
            final = value
    if (not final or not session_id or final.get("sessionId") != session_id
            or not isinstance(final.get("reason"), dict) or final["reason"].get("kind") != "completed"
            or not isinstance(final.get("text"), str)):
        raise ValueError("DSH did not confirm a completed task")
    return final["text"]


def main():
    pathlib.Path('/tmp/noah-dsh.patch.yml').write_text(json.dumps(profile(os.environ['OPENAI_BASE_URL'], os.environ['NOAH_MODEL'])))
    env = dict(os.environ, DSH_HOME='/home/agent/.dsh', DSH_TELEMETRY_DISABLED='1')
    command = ['node', '/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js',
               '--profile', 'headless', '--patch', '/tmp/noah-dsh.patch.yml', '--permission-mode', 'workspace-write',
               '--approval-policy', 'never', '--json', '-']
    # Output goes to bounded scratch files, not a pipe that could deadlock on
    # stderr. The container fsize/time/memory limits also apply to this process.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        result = subprocess.run(command, input=pathlib.Path('/tmp/request.txt').read_bytes(),
                                cwd='/workspace', env=env, stdout=out, stderr=err)
        out.seek(0)
        try:
            answer = consume(line.decode() for line in out)
            if result.returncode:
                raise ValueError('DSH process failed')
        except (ValueError, TypeError, AttributeError) as error:
            err.seek(0)
            print(str(error), file=sys.stderr)
            print(err.read(8192).decode(errors='replace'), file=sys.stderr)
            sys.exit(1)
        print(answer)


if __name__ == '__main__':
    main()
