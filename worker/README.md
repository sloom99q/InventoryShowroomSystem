# showroom-scanner (parked)

Local document extraction for scanned vehicle documents: PyMuPDF for digital text layers,
Docling with a local OCR backend (Apple Vision `ocrmac` on macOS, RapidOCR elsewhere) for scans,
and `vin.py` for chassis candidate detection with ambiguity flags and suggestions (never silent
corrections). `tests/fixtures/` holds synthetic digital, scanned, low-quality and ambiguous samples
with ground truth in `expected.json`.

**Not connected to the app yet.** v1 reads digital PDFs in the browser
(`web/src/lib/pdfText.ts`, `web/src/lib/vin.ts` — a port of `vin.py`). Connect this worker only if
the showroom's real documents are mostly scans. Keep `vin.py` and `vin.ts` in sync.

```sh
uv sync                      # models are cached in ~/.cache/docling (offline by default)
```
