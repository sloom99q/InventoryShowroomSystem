"""Docling-based conversion with a configurable, LOCAL OCR backend.

Configuration (env vars, all optional):

* ``SCANNER_OCR_BACKEND``   ocrmac | rapidocr | tesseract | tesserocr | easyocr | auto
                            default: ocrmac on macOS, rapidocr elsewhere
* ``SCANNER_OCR_LANG``      comma-separated languages in the backend's own codes
                            (e.g. "eng" / "eng,ara" for tesseract, "en-US" for ocrmac)
* ``DOCLING_ARTIFACTS_PATH`` pre-downloaded models dir (default ~/.cache/docling/models)
* ``SCANNER_ALLOW_DOWNLOADS=1`` allow Hugging Face downloads (default: offline)
"""

from __future__ import annotations

import html
import os
import platform
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Offline by default: never reach out to Hugging Face at runtime.
if os.environ.get("SCANNER_ALLOW_DOWNLOADS") != "1":
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

BACKENDS = ("ocrmac", "rapidocr", "tesseract", "tesserocr", "easyocr", "auto")
DEFAULT_ARTIFACTS = Path.home() / ".cache" / "docling" / "models"


def default_backend() -> str:
    env = os.environ.get("SCANNER_OCR_BACKEND")
    if env:
        return env
    return "ocrmac" if platform.system() == "Darwin" else "rapidocr"


def artifacts_path() -> Path | None:
    p = Path(os.environ.get("DOCLING_ARTIFACTS_PATH", DEFAULT_ARTIFACTS)).expanduser()
    return p if p.exists() else None


@dataclass
class DoclingPage:
    page: int
    text: str


@dataclass
class DoclingTable:
    page: int
    rows: list[list[str]]


@dataclass
class DoclingResult:
    backend: str
    pages: list[DoclingPage] = field(default_factory=list)
    tables: list[DoclingTable] = field(default_factory=list)
    status: str = ""
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _langs(backend: str) -> list[str] | None:
    env = os.environ.get("SCANNER_OCR_LANG")
    if env:
        return [x.strip() for x in env.split(",") if x.strip()]
    # Explicit defaults: Docling's tesseract default asks for spa/fra/deu
    # traineddata, which a stock `brew install tesseract` does not ship.
    return {"tesseract": ["eng"], "tesserocr": ["eng"], "ocrmac": ["en-US"]}.get(backend)


def build_ocr_options(backend: str, full_page: bool = True) -> Any:
    from docling.datamodel.pipeline_options import (
        EasyOcrOptions,
        OcrAutoOptions,
        OcrMacOptions,
        OcrMode,
        RapidOcrOptions,
        TesseractCliOcrOptions,
        TesseractOcrOptions,
    )

    classes = {
        "ocrmac": OcrMacOptions,
        "rapidocr": RapidOcrOptions,
        "tesseract": TesseractCliOcrOptions,
        "tesserocr": TesseractOcrOptions,
        "easyocr": EasyOcrOptions,
        "auto": OcrAutoOptions,
    }
    if backend not in classes:
        raise ValueError(f"Unknown OCR backend {backend!r}; choose one of {', '.join(BACKENDS)}")
    if backend == "ocrmac" and platform.system() != "Darwin":
        raise RuntimeError("ocrmac (Apple Vision) is only available on macOS")
    kwargs: dict[str, Any] = {}
    if full_page:
        kwargs["mode"] = OcrMode.FULL_PAGE
    langs = _langs(backend)
    if langs is not None:
        kwargs["lang"] = langs
    return classes[backend](**kwargs)


_converters: dict[tuple[str, bool], Any] = {}
_lock = threading.Lock()


def get_converter(backend: str, force_ocr: bool = True) -> Any:
    """Build (and cache) a DocumentConverter. Model loading is the slow part,
    so a long-running worker should reuse converters across jobs."""
    key = (backend, force_ocr)
    with _lock:
        if key in _converters:
            return _converters[key]
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import (
            DocumentConverter,
            ImageFormatOption,
            PdfFormatOption,
        )

        opts = PdfPipelineOptions(
            do_ocr=True,
            ocr_options=build_ocr_options(backend, full_page=force_ocr),
            do_table_structure=True,
            artifacts_path=artifacts_path(),
        )
        conv = DocumentConverter(
            allowed_formats=[InputFormat.PDF, InputFormat.IMAGE],
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=opts),
                InputFormat.IMAGE: ImageFormatOption(pipeline_options=opts),
            },
        )
        _converters[key] = conv
        return conv


def convert(path: str | Path, backend: str | None = None, force_ocr: bool = True) -> DoclingResult:
    """Run Docling on a PDF or image. Page numbers are 1-based, relative to *path*."""
    backend = backend or default_backend()
    conv = get_converter(backend, force_ocr)
    res = conv.convert(str(path), raises_on_error=False)
    doc = res.document
    out = DoclingResult(backend=backend, status=str(getattr(res.status, "value", res.status)))
    out.errors = [str(getattr(e, "error_message", e)) for e in (res.errors or [])]
    if doc is None:
        return out
    page_nos = sorted(doc.pages.keys()) if doc.pages else [1]
    for p in page_nos:
        md = doc.export_to_markdown(page_no=p)
        out.pages.append(DoclingPage(page=p, text=html.unescape(md)))
    for t in doc.tables:
        page = t.prov[0].page_no if t.prov else 1
        rows = [[html.unescape(c.text) for c in row] for row in t.data.grid]
        out.tables.append(DoclingTable(page=page, rows=rows))
    return out
