"""A non-networked example tool. It is not wired to the runner yet."""

import json
import sys


def main() -> int:
    request = json.load(sys.stdin)
    name = request.get("name", "world")
    if not isinstance(name, str) or len(name) > 100:
        raise ValueError("name must be a string of at most 100 characters")
    json.dump({"message": f"hello {name}"}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
