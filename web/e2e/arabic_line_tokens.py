"""Given compare.py failure lines (JSON list in argv[2]) for reference PDF argv[1],
print the ones that are NOT Latin tokens sitting inside an Arabic line (JSON list).
Used to tell the known Chromium/Typst run-order difference apart from real layout errors."""
import json, re, sys
import pymupdf as f

d = f.open(sys.argv[1])
AR = re.compile('[؀-ۿﭐ-﷿ﹰ-﻿]')
bad = []
for line in json.loads(sys.argv[2]):
    m = re.match(r"p(\d+):.*\(at x(\d+) y(\d+)\)", line)
    if not m:
        bad.append(line)
        continue
    p, x, y = int(m[1]) - 1, float(m[2]), float(m[3])
    near = [w[4] for w in d[p].get_text('words') if abs(w[1] - y) < 3 and abs(w[0] - x) < 60]
    if not any(AR.search(t) for t in near):
        bad.append(line)
print(json.dumps(bad))
