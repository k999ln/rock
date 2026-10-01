"""A bounded text interpreter, not a general-purpose OS sandbox."""
import hashlib
import json
import re
import sys

OPS = {"trim_lines", "collapse_blank_lines", "sort_lines", "unique_lines",
       "prefix_lines", "replace_literal", "proposal_draft", "organize_citations", "utf8_sha256"}


def validate_recipe(recipe):
    """Validate the same finite language in the package verifier and isolated worker."""
    if not isinstance(recipe, list) or not 1 <= len(recipe) <= 16:
        raise ValueError("recipe requires 1 to 16 steps")
    for step in recipe:
        if not isinstance(step, dict) or not isinstance(step.get("op"), str) or step["op"] not in OPS:
            raise ValueError("unknown operation; shell/file/network execution is forbidden")
        op = step["op"]
        expected = ({"op", "value"} if op == "prefix_lines" else
                    {"op", "old", "new"} if op == "replace_literal" else
                    {"op", "format"} if op == "proposal_draft" else {"op"})
        if set(step) != expected:
            raise ValueError("invalid step fields")
        for key in expected - {"op"}:
            if not isinstance(step[key], str) or len(step[key]) > 128:
                raise ValueError("step argument too long")
        if op == "replace_literal" and not step["old"]:
            raise ValueError("replace_literal.old must not be empty")
        if op == "proposal_draft" and step["format"] not in {"standard", "concise"}:
            raise ValueError("proposal format must be standard or concise")
    return recipe


def _json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate JSON field")
        value[key] = item
    return value


def _reject_constant(_):
    raise ValueError("non-finite JSON number")


def _field(value, name, maximum):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum
            or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value)):
        raise ValueError(f"invalid proposal {name}")
    return value.strip()


def _items(value, name):
    values = [value] if isinstance(value, str) else value
    if not isinstance(values, list) or not 1 <= len(values) <= 40:
        raise ValueError(f"proposal {name} requires 1 to 40 items")
    return [_field(item, name, 8000) for item in values]


def proposal_draft(text, style):
    try:
        data = json.loads(text, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
    except (ValueError, RecursionError) as error:
        raise ValueError("proposal input must be valid JSON with unique fields") from error
    required = {"title", "requirements", "deliverables"}
    allowed = required | {"deadline", "price"}
    if not isinstance(data, dict) or not required <= set(data) or set(data) - allowed:
        raise ValueError("proposal requires title, requirements, deliverables; optional deadline and price only")
    title = _field(data["title"], "title", 160)
    requirements = _items(data["requirements"], "requirements")
    deliverables = _items(data["deliverables"], "deliverables")
    deadline = _field(data["deadline"], "deadline", 200) if "deadline" in data else "未確認"
    price = _field(data["price"], "price", 100) if "price" in data else "未確認"
    if style == "standard":
        proposal = (f"ご依頼「{title}」について、次の内容で進める案です。\n\n確認する要件\n"
                    + "\n".join(f"- {item}" for item in requirements)
                    + "\n\n予定する納品物\n" + "\n".join(f"- {item}" for item in deliverables)
                    + f"\n\n希望納期: {deadline}\n希望金額: {price}\n\n内容を確認してから、提案文を仕上げます。")
    else:
        proposal = (f"「{title}」の提案案\n要件: " + " / ".join(requirements)
                    + "\n納品物: " + " / ".join(deliverables)
                    + f"\n希望納期: {deadline}\n希望金額: {price}")
    return _json_text({"schema_version": 1, "kind": "proposal_draft", "state": "draft",
                       "format": style, "proposal": proposal,
                       "checklist": ["募集内容と提案内容の一致を確認", "納品物と修正範囲を確認", "納期と金額を確認"],
                       "warnings": [f"{label}が未指定です。" for key, label in
                                    (("deadline", "納期"), ("price", "金額")) if key not in data],
                       "external_submission": False, "revenue_verified": False})


def _markdown_segments(text):
    """Conservatively protect fences, indented lines and matching backtick spans.

    Incomplete fences/spans are protected through the end and prevent appending
    a references section. This is a bounded subset, not a full Markdown parser.
    """
    blocks, pending, fence, incomplete = [], [], None, False
    for line in text.splitlines(keepends=True):
        match = re.match(r"^[ \t>]*(`{3,}|~{3,})([^\r\n]*)(?:\r?\n)?$", line)
        if fence:
            blocks.append((True, line))
            if (match and match[1][0] == fence[0] and len(match[1]) >= fence[1]
                    and not match[2].strip()):
                fence = None
            continue
        is_fence = match and not (match[1][0] == "`" and "`" in match[2])
        if is_fence or line.startswith(("    ", "\t")):
            if pending:
                blocks.append((False, "".join(pending)))
                pending = []
            blocks.append((True, line))
            if is_fence:
                fence = (match[1][0], len(match[1]))
        else:
            pending.append(line)
    if pending:
        blocks.append((False, "".join(pending)))
    incomplete = fence is not None
    segments = []
    for protected, block in blocks:
        if protected:
            segments.append((True, block))
            continue
        runs = list(re.finditer(r"`+", block))
        cursor, index = 0, 0
        while index < len(runs):
            opener = runs[index]
            slash_index = opener.start() - 1
            while slash_index >= 0 and block[slash_index] == "\\":
                slash_index -= 1
            backslashes = opener.start() - slash_index - 1
            if backslashes % 2:
                index += 1
                continue
            closing = index + 1
            while closing < len(runs) and len(runs[closing][0]) != len(opener[0]):
                closing += 1
            segments.append((False, block[cursor:opener.start()]))
            if closing == len(runs):
                segments.append((True, block[opener.start():]))
                incomplete = True
                cursor = len(block)
                break
            end = runs[closing].end()
            segments.append((True, block[opener.start():end]))
            cursor, index = end, closing + 1
        if cursor < len(block):
            segments.append((False, block[cursor:]))
    return segments, incomplete


_LINK = re.compile(r"\[([^\[\]\r\n]{1,160})\]\((https?://[^\s()<>\x00-\x20\x7f]{1,2048})\)")
_MARKER = re.compile(r"（出典:[ \t]*([^\r\n）]*)）")


def organize_citations(text):
    segments, incomplete = _markdown_segments(text)
    pairs = {}

    def collect(match):
        content, cursor, found = match[1], 0, []
        for link in _LINK.finditer(content):
            if content[cursor:link.start()].strip(" \t,;、") or not link[1].strip():
                return match[0]
            found.append((link[2], link[1]))
            cursor = link.end()
        if not found or content[cursor:].strip(" \t,;、"):
            return match[0]
        for url, label in found:
            pairs.setdefault(url, label)
        return ""

    cleaned = "".join(block if protected else _MARKER.sub(collect, block)
                      for protected, block in segments)
    if not pairs or incomplete:
        return text
    protected, _ = _markdown_segments(cleaned)
    mask = "".join(re.sub(r"[^\r\n]", " ", block) if code else block for code, block in protected)
    header = re.search(r"^ {0,3}##[ \t]+出典[ \t]*\r?$", mask, re.M)
    newline = "\r\n" if "\r\n" in text and "\n" not in text.replace("\r\n", "") else "\n"
    if header:
        next_heading = re.search(r"^ {0,3}#{1,2}[ \t]+", mask[header.end():], re.M)
        end = header.end() + next_heading.start() if next_heading else len(cleaned)
        existing = {link[2] for link in _LINK.finditer(mask[header.end():end])}
        additions = [(url, label) for url, label in pairs.items() if url not in existing]
        if not additions:
            return cleaned
        before, after = cleaned[:end], cleaned[end:]
        prefix = "" if before.endswith("\n") else newline
        rendered = newline.join(f"- [{label}]({url})" for url, label in additions) + newline
        return before + prefix + rendered + (newline if after else "") + after
    prefix = "" if cleaned.endswith(newline + newline) else newline if cleaned.endswith("\n") else newline + newline
    return (cleaned + prefix + "## 出典" + newline + newline
            + newline.join(f"- [{label}]({url})" for url, label in pairs.items()) + newline)


def utf8_sha256(text):
    raw = text.encode("utf-8")
    return _json_text({"schema_version": 1, "kind": "utf8_text_sha256", "encoding": "UTF-8",
                       "scope": "user_supplied_text_only", "byte_length": len(raw),
                       "sha256": hashlib.sha256(raw).hexdigest(), "file_verified": False})


def transform(text, recipe):
    validate_recipe(recipe)
    if not isinstance(text, str) or len(text.encode()) > 65536:
        raise ValueError("input exceeds 64 KiB")
    for step in recipe:
        op = step["op"]
        lines = text.split("\n")
        if op == "trim_lines":
            text = "\n".join(line.strip() for line in lines).strip()
        elif op == "collapse_blank_lines":
            out = []
            for line in lines:
                if line.strip() or not out or out[-1].strip():
                    out.append(line)
            text = "\n".join(out)
        elif op == "sort_lines":
            text = "\n".join(sorted(lines))
        elif op == "unique_lines":
            text = "\n".join(dict.fromkeys(lines))
        elif op == "prefix_lines":
            text = "\n".join(step["value"] + line for line in lines)
        elif op == "replace_literal":
            text = text.replace(step["old"], step["new"])
        elif op == "proposal_draft":
            text = proposal_draft(text, step["format"])
        elif op == "organize_citations":
            text = organize_citations(text)
        elif op == "utf8_sha256":
            text = utf8_sha256(text)
        else:
            raise ValueError("unknown operation")
        if len(text.encode()) > 131072:
            raise ValueError("output exceeds 128 KiB")
    return text


if __name__ == "__main__":
    try:
        raw_request = sys.stdin.buffer.read(524289)
        if len(raw_request) > 524288:
            raise ValueError("request exceeds 512 KiB")
        request = json.loads(raw_request, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
        if not isinstance(request, dict) or set(request) != {"text", "recipe"}:
            raise ValueError("request requires text and recipe only")
        result = transform(request["text"], request["recipe"])
        print(json.dumps({"text": result}, ensure_ascii=False))
    except (ValueError, KeyError, TypeError, RecursionError) as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
