"""PDF text-layer detection and extraction with PyMuPDF.

NOTE: PyMuPDF is AGPL-3.0 (see LICENSES.md). This module is the only place it
is used for reading; keep it isolated so it can be swapped for pypdfium2.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pymupdf

# A page with fewer non-whitespace chars than this is treated as "no text
# layer" and routed to OCR. Scanned pages commonly carry 0 chars, or a few
# stray chars from a scanner's header/footer stamp.
DEFAULT_MIN_CHARS = int(os.environ.get("SCANNER_MIN_TEXT_CHARS", "50"))
# If images cover more than this fraction of the page AND text is sparse
# (< 4x threshold), treat as a scan with a thin text stamp.
IMAGE_COVERAGE_SCAN = 0.6


@dataclass
class PageText:
    page: int                 # 1-based
    char_count: int           # non-whitespace chars in the text layer
    image_coverage: float     # fraction of page area covered by images (0..1)
    has_text_layer: bool
    text: str
    tables: list[list[list[str | None]]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _image_coverage(page: pymupdf.Page) -> float:
    area = abs(page.rect) or 1.0
    covered = 0.0
    for info in page.get_image_info():
        r = pymupdf.Rect(info["bbox"]) & page.rect
        covered += abs(r)
    return min(1.0, covered / area)


def analyze_pdf(path: str | Path, min_chars: int = DEFAULT_MIN_CHARS,
                extract_tables: bool = True) -> list[PageText]:
    """Return per-page text-layer info and text for every page."""
    out: list[PageText] = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc):
            text = page.get_text("text", sort=True)
            chars = sum(1 for ch in text if not ch.isspace())
            cov = _image_coverage(page)
            has_text = chars >= min_chars and not (cov >= IMAGE_COVERAGE_SCAN and chars < 4 * min_chars)
            tables: list[list[list[str | None]]] = []
            if has_text and extract_tables:
                try:
                    # Read cells by bbox: Table.extract() mangles spacing/punctuation
                    # in PyMuPDF 2.0 (e.g. "Model Year" -> "ModelYear").
                    for t in page.find_tables().tables:
                        tables.append([
                            [page.get_textbox(pymupdf.Rect(c)).strip() if c else None for c in row.cells]
                            for row in t.rows
                        ])
                except Exception:  # table finder is best-effort
                    pass
            out.append(PageText(page=i + 1, char_count=chars, image_coverage=round(cov, 3),
                                has_text_layer=has_text, text=text, tables=tables))
    return out


def subset_pdf(path: str | Path, pages: list[int], dest: str | Path) -> None:
    """Write a new PDF containing only the given 1-based pages, in order."""
    with pymupdf.open(path) as src, pymupdf.open() as dst:
        for p in pages:
            dst.insert_pdf(src, from_page=p - 1, to_page=p - 1)
        dst.save(dest)


def page_count(path: str | Path) -> int:
    with pymupdf.open(path) as doc:
        return doc.page_count
