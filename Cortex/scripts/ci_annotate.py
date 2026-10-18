"""Print stdin as one GitHub Actions error annotation (CI-only helper).

Job logs of this repo need admin rights to download, but check-run
annotations are public, so failures are surfaced this way.
Usage: tail -c 3500 pytest.log | python scripts/ci_annotate.py "title"
"""

import sys

title = sys.argv[1] if len(sys.argv) > 1 else "output"
body = sys.stdin.read() or "(empty)"
body = body.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
print(f"::error title={title}::{body}")
