#!/usr/bin/env python3
"""Compare a generated PDF against a reference PDF from this kit.

Usage:  pip install pymupdf
        python3 compare.py reference/spec-sheet.pdf my-spec-sheet.pdf
        python3 compare.py reference/brochure.pdf   my-brochure.pdf

Checks page count, page size, and the position of every Latin text line
(Arabic is shaped differently by different engines, so check it by eye).
Pass = every line within TOL points of the reference (1 pt = 0.35 mm).
"""
import re, sys
import pymupdf as fitz

TOL = 2.0

def lines(page):
    out = {}
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = " ".join("".join(s["text"] for s in l["spans"]).split())
            if t and not re.search("[؀-ۿ]", t) and t != "•" and t not in out:
                out[t] = l["bbox"][:2]
    return out

ref, got = fitz.open(sys.argv[1]), fitz.open(sys.argv[2])
fails = []
if len(ref) != len(got):
    fails.append(f"page count {len(got)} != reference {len(ref)}")
for i, (rp, gp) in enumerate(zip(ref, got)):
    if abs(rp.rect.width - gp.rect.width) > 1 or abs(rp.rect.height - gp.rect.height) > 1:
        fails.append(f"p{i+1}: size {gp.rect.width:.1f}x{gp.rect.height:.1f} != {rp.rect.width:.1f}x{rp.rect.height:.1f}")
    rl, gl = lines(rp), lines(gp)
    for t, (x, y) in rl.items():
        if t not in gl:
            fails.append(f"p{i+1}: missing line: {t[:60]!r}")
            continue
        dx, dy = gl[t][0] - x, gl[t][1] - y
        if abs(dx) > TOL or abs(dy) > TOL:
            fails.append(f"p{i+1}: {t[:50]!r} off by x{dx:+.1f} y{dy:+.1f} pt")
print("PASS" if not fails else "FAIL\n  " + "\n  ".join(fails))
sys.exit(1 if fails else 0)
