#!/usr/bin/env python3
"""Compare a generated PDF against a reference PDF (or the showroom's original).

Usage:  pip install pymupdf
        python3 compare.py reference/spec-sheet.pdf my-spec-sheet.pdf

Checks page count, page size, and the position of every Latin WORD of the reference:
each must exist in the generated PDF (same page, same order) within TOL points
(1 pt = 0.35 mm). Arabic is shaped differently by different engines: check it by eye.
Word-based, so it does not depend on how a PDF tool groups words into lines.
"""
import re, sys
import pymupdf as fitz

TOL = 2.0
AR = re.compile("[؀-ۿﭐ-﷿ﹰ-﻿]")

def words(page):
    out = []
    for x0, y0, x1, y1, w, *_ in page.get_text("words", sort=True):
        w = w.strip("✓•")
        if w and not AR.search(w):
            out.append((w, x0, y0))
    return out

ref, got = fitz.open(sys.argv[1]), fitz.open(sys.argv[2])
fails = []
if len(ref) != len(got):
    fails.append(f"page count {len(got)} != reference {len(ref)}")
for i, (rp, gp) in enumerate(zip(ref, got)):
    if abs(rp.rect.width - gp.rect.width) > 1 or abs(rp.rect.height - gp.rect.height) > 1:
        fails.append(f"p{i+1}: size {gp.rect.width:.1f}x{gp.rect.height:.1f} != {rp.rect.width:.1f}x{rp.rect.height:.1f}")
    pool = words(gp)
    for w, x, y in words(rp):
        best = min((c for c in pool if c[0] == w), key=lambda c: abs(c[1] - x) + abs(c[2] - y), default=None)
        if best is None:
            fails.append(f"p{i+1}: missing word {w!r} (at x{x:.0f} y{y:.0f})")
            continue
        pool.remove(best)
        dx, dy = best[1] - x, best[2] - y
        if abs(dx) > TOL or abs(dy) > TOL:
            fails.append(f"p{i+1}: {w!r} off by x{dx:+.1f} y{dy:+.1f} pt (at x{x:.0f} y{y:.0f})")
print("PASS" if not fails else f"FAIL ({len(fails)})\n  " + "\n  ".join(fails[:40]))
sys.exit(1 if fails else 0)
