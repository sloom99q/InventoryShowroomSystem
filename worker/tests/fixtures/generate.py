"""Reproducible fixture generator for the document-scanner worker.

Run:  uv run python tests/fixtures/generate.py

Writes PDFs/PNGs plus ``expected.json`` (ground truth) next to this file.
Everything is drawn with reportlab's built-in fonts and rasterised with PyMuPDF,
so no system fonts are needed. Noise is seeded, so output is stable.

All documents are SPECIMENS for testing. Issuers, owners and dealers are
fictitious; no real authority's branding is reproduced.

The VIN check digit is computed here independently of the package code so the
ground truth does not depend on the code under test.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent
SEED = 3779

# --- independent check-digit implementation (49 CFR 565) -------------------
_T = {**{str(d): d for d in range(10)}, **dict(zip("ABCDEFGH", range(1, 9))),
      **dict(zip("JKLMN", range(1, 6))), "P": 7, "R": 9,
      **dict(zip("STUVWXYZ", range(2, 10)))}
_W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]


def with_check_digit(vin_with_placeholder: str) -> str:
    assert len(vin_with_placeholder) == 17 and vin_with_placeholder[8] == "?"
    s = sum(_T[c] * w for c, w in zip(vin_with_placeholder.replace("?", "0"), _W))
    r = s % 11
    return vin_with_placeholder[:8] + ("X" if r == 10 else str(r)) + vin_with_placeholder[9:]


def cd_ok(vin: str) -> bool:
    return with_check_digit(vin[:8] + "?" + vin[9:]) == vin


# --- vehicle records (ground truth) ----------------------------------------
VEHICLES = {
    "digital": dict(
        vin=with_check_digit("1GNSKCKD?PR123456"), brand="Chevrolet", model="Tahoe High Country",
        year=2023, color="Iridescent Pearl White", mileage_km=18450, body="SUV",
        engine="L87-6.2L-0458812", origin="United States", spec="GCC",
    ),
    "scanned": dict(
        vin=with_check_digit("1GKS2DKL?NR245871"), brand="GMC", model="Yukon Denali",
        year=2022, color="Onyx Black", mileage_km=42310, body="SUV",
        engine="L86-6.2L-2245190", origin="United States", spec="GCC",
    ),
    "lowq": dict(
        vin=with_check_digit("2C3CDXGJ?MH581234"), brand="Dodge", model="Charger Scat Pack",
        year=2021, color="Granite Crystal", mileage_km=67900, body="Sedan",
        engine="ESF-6.4L-7713402", origin="Canada", spec="GCC",
    ),
    # Mercedes (EU) VINs do not use the NA check digit; this one intentionally
    # FAILS it, to prove we report it as info rather than rejecting.
    "card": dict(
        vin="W1NYC7HJ2RX512345", brand="Mercedes-Benz", model="G 63 AMG",
        year=2024, color="Obsidian Black", mileage_km=12450, body="SUV",
        engine=None, origin="Austria", spec="GCC",
    ),
    # Dense in OCR-confusable glyphs: 1 (I), 0 (O/Q), 5 (S), 8 (B), 2 (Z), 6 (G).
    "ambiguous": dict(
        vin=with_check_digit("1FT8W3BT?SEB08612"), brand="Ford", model="F-350 Super Duty",
        year=2025, color="Oxford White", mileage_km=5120, body="Pickup",
        engine="6.7L-PSD-0815260", origin="United States", spec="GCC",
    ),
    "nonstandard": dict(
        vin="URJ202-4012345", brand="Toyota", model="Land Cruiser ZX",
        year=2019, color="Pearl White", mileage_km=88200, body="SUV",
        engine="3UR-1158802", origin="Japan", spec="JDM",
    ),
    "mixed": dict(
        vin=with_check_digit("5YJ3E1EB?NF105280"), brand="Tesla", model="Model 3 Long Range",
        year=2022, color="Midnight Silver Metallic", mileage_km=35600, body="Sedan",
        engine=None, origin="United States", spec="GCC",
    ),
}

SPECIMEN = "SPECIMEN - TEST FIXTURE - NOT A VALID DOCUMENT"


def _grouped(vin: str) -> str:
    """Print VIN in spaced groups, as some certificates do: WMI VDS VIS."""
    return f"{vin[:3]} {vin[3:9]} {vin[9:]}"


def draw_certificate(c: canvas.Canvas, v: dict, cert_no: str, issue: str,
                     *, vin_grouped: bool = False, font: str = "Helvetica") -> None:
    W, H = A4
    c.setFillColor(colors.HexColor("#0b3d2e"))
    c.rect(0, H - 34 * mm, W, 34 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(18 * mm, H - 16 * mm, "VEHICLE EXPORT CERTIFICATE")
    c.setFont("Helvetica", 10)
    c.drawString(18 * mm, H - 23 * mm, "Emirate Traffic & Licensing Directorate (fictitious issuer)")
    c.drawString(18 * mm, H - 29 * mm, "United Arab Emirates")
    c.setFillColor(colors.HexColor("#b00020"))
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(W - 18 * mm, H - 29 * mm, SPECIMEN)

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    y = H - 46 * mm
    c.drawString(18 * mm, y, f"Certificate No.: {cert_no}")
    c.drawRightString(W - 18 * mm, y, f"Issue Date: {issue}")
    y -= 6 * mm
    c.drawString(18 * mm, y, "Exporter: Al Noor Premium Motors LLC (fictitious), Al Quoz, Dubai")
    y -= 6 * mm
    c.drawString(18 * mm, y, "Destination: Riyadh, Kingdom of Saudi Arabia")

    rows = [
        ("Make", v["brand"]),
        ("Model", v["model"]),
        ("Model Year", str(v["year"])),
        ("Colour", v["color"]),
        ("Chassis No. (VIN)", _grouped(v["vin"]) if vin_grouped else v["vin"]),
        ("Engine No.", v["engine"] or "N/A (electric)"),
        ("Body Type", v["body"]),
        ("Country of Origin", v["origin"]),
        ("Specification", v["spec"]),
        ("Mileage (km)", f"{v['mileage_km']:,}"),
    ]
    y -= 12 * mm
    x0, x1, x2 = 18 * mm, 78 * mm, W - 18 * mm
    rh = 9 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y + 2 * mm, "VEHICLE PARTICULARS")
    c.setLineWidth(0.8)
    for i, (k, val) in enumerate(rows):
        top = y - i * rh
        if i % 2 == 0:
            c.setFillColor(colors.HexColor("#eef3f1"))
            c.rect(x0, top - rh, x2 - x0, rh, fill=1, stroke=0)
        c.setFillColor(colors.black)
        c.rect(x0, top - rh, x1 - x0, rh, fill=0, stroke=1)
        c.rect(x1, top - rh, x2 - x1, rh, fill=0, stroke=1)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x0 + 3 * mm, top - rh + 3 * mm, k)
        if k.startswith("Chassis"):
            c.setFont(font + ("-Bold" if font == "Courier" else ""), 13)
        else:
            c.setFont("Helvetica", 11)
        c.drawString(x1 + 3 * mm, top - rh + 3 * mm, val)

    y = y - len(rows) * rh - 14 * mm
    c.setFont("Helvetica", 9)
    for line in (
        "This certifies that the vehicle described above has been cleared for export",
        "and that no outstanding traffic fines or financial liens are recorded.",
        "Remarks: Vehicle inspected and odometer reading verified at the time of issue.",
    ):
        c.drawString(18 * mm, y, line)
        y -= 5 * mm
    c.drawString(18 * mm, 30 * mm, "Authorised signatory: ____________________")
    c.drawRightString(W - 18 * mm, 30 * mm, "Stamp: [ SPECIMEN ]")


def certificate_pdf_bytes(v: dict, cert_no: str, issue: str, **kw) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, invariant=1)  # invariant -> deterministic
    c.setTitle("Vehicle Export Certificate (specimen)")
    draw_certificate(c, v, cert_no, issue, **kw)
    c.showPage()
    c.save()
    return buf.getvalue()


def rasterize(pdf_bytes: bytes, dpi: int, page: int = 0) -> Image.Image:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pix = doc[page].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples)


def degrade(img: Image.Image, *, angle: float, noise: float, blur: float = 0.0,
            jpeg_quality: int | None = None, seed: int = SEED) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=255)
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    arr = np.asarray(img, dtype=np.float32)
    arr += rng.normal(0, noise, arr.shape)
    # sparse salt & pepper speckles like a photocopier
    speck = rng.random(arr.shape)
    arr[speck < 0.0008] = 0
    arr[speck > 0.9995] = 255
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
    if jpeg_quality:
        b = io.BytesIO()
        img.save(b, "JPEG", quality=jpeg_quality)
        img = Image.open(io.BytesIO(b.getvalue())).convert("L")
    return img


def image_only_pdf(images: list[tuple[Image.Image, int]], path: Path, jpeg_quality: int = 75) -> None:
    """Write a PDF whose pages are only images (no text layer)."""
    doc = pymupdf.open()
    for img, dpi in images:
        b = io.BytesIO()
        img.save(b, "JPEG", quality=jpeg_quality)
        w_pt, h_pt = img.width * 72 / dpi, img.height * 72 / dpi
        page = doc.new_page(width=w_pt, height=h_pt)
        page.insert_image(page.rect, stream=b.getvalue())
    doc.set_metadata({})
    doc.save(path, garbage=4, deflate=True, no_new_id=True)


def listing_card_png(v: dict, path: Path) -> None:
    W, H = 1200, 675  # points; rendered at 1.5x -> 1800x1012 px (typical phone screenshot scale)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H), invariant=1)
    c.setFillColor(colors.HexColor("#111418"))
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#c9a54c"))
    c.rect(0, H - 8, W, 8, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 44)
    c.drawString(60, H - 90, f"{v['year']} {v['brand']} {v['model']}")
    c.setFont("Helvetica", 22)
    c.setFillColor(colors.HexColor("#c9c9c9"))
    c.drawString(60, H - 130, "Showroom listing card  |  GCC Specs  |  Single owner  |  Full service history")
    # car image placeholder
    c.setFillColor(colors.HexColor("#1f252c"))
    c.roundRect(60, 120, 520, 360, 16, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#5b6670"))
    c.setFont("Helvetica", 20)
    c.drawCentredString(320, 290, "[ vehicle photo ]")
    specs = [
        ("VIN", v["vin"]),
        ("Year", str(v["year"])),
        ("Mileage", f"{v['mileage_km']:,} km"),
        ("Exterior Color", v["color"]),
        ("Interior", "Black Nappa Leather"),
        ("Engine", "4.0L V8 Biturbo"),
        ("Warranty", "Dealer warranty until 2027"),
        ("Price", "AED 845,000"),
    ]
    y = H - 200
    for k, val in specs:
        c.setFont("Helvetica", 20)
        c.setFillColor(colors.HexColor("#9aa4ad"))
        c.drawString(630, y, k.upper())
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 26 if k == "VIN" else 24)
        c.drawString(830, y, val)
        y -= 50
    c.setFillColor(colors.HexColor("#6c7680"))
    c.setFont("Helvetica", 14)
    c.drawString(60, 60, "Al Noor Premium Motors (fictitious) - Sheikh Zayed Road, Dubai - " + SPECIMEN)
    c.showPage()
    c.save()
    doc = pymupdf.open(stream=buf.getvalue(), filetype="pdf")
    pix = doc[0].get_pixmap(dpi=108)  # 1.5x
    pix.save(path)


def nonstandard_pdf(v: dict, path: Path) -> None:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, invariant=1)
    W, H = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(18 * mm, H - 22 * mm, "EXPORT CERTIFICATE - ENGLISH TRANSLATION")
    c.setFont("Helvetica", 10)
    c.drawString(18 * mm, H - 29 * mm, "Translated from the Japanese original (fictitious translation bureau)")
    c.setFillColor(colors.HexColor("#b00020"))
    c.drawString(18 * mm, H - 35 * mm, SPECIMEN)
    c.setFillColor(colors.black)
    lines = [
        "Registration No.: Shinagawa 300 sa 12-34 (deregistered)",
        f"Date of First Registration: {v['year']}/03",
        f"Make: {v['brand']}",
        f"Model / Type: {v['model']}  (CBA-URJ202W)",
        f"Chassis No.: {v['vin']}",
        f"Engine Model: {v['engine'].split('-')[0]}",
        f"Colour: {v['color']}",
        "Fixed Number of Passengers: 8",
        f"Odometer: {v['mileage_km']:,} km",
        "Purpose: Export to United Arab Emirates (Jebel Ali)",
    ]
    y = H - 50 * mm
    c.setFont("Helvetica", 12)
    for ln in lines:
        c.drawString(22 * mm, y, ln)
        y -= 9 * mm
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(18 * mm, y - 6 * mm,
                 "Note: Japanese domestic-market vehicles carry a frame (chassis) number, not a 17-character VIN.")
    c.showPage()
    c.save()
    path.write_bytes(buf.getvalue())


def mixed_pdf(v: dict, path: Path) -> None:
    """Page 1: digital cover letter; page 2: scanned certificate (no text)."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4, invariant=1)
    W, H = A4
    c.setFont("Helvetica-Bold", 14)
    c.drawString(18 * mm, H - 25 * mm, "Al Noor Premium Motors LLC (fictitious)")
    c.setFont("Helvetica", 11)
    text = [
        "To: Inventory Department",
        "Subject: Stock intake - documents attached",
        "",
        "Please find attached the scanned export certificate for the vehicle received today.",
        "The vehicle will be listed after pre-delivery inspection.",
        "",
        "Regards,",
        "Logistics Team",
        "",
        SPECIMEN,
    ]
    y = H - 40 * mm
    for ln in text:
        c.drawString(18 * mm, y, ln)
        y -= 7 * mm
    c.showPage()
    c.save()
    cover = pymupdf.open(stream=buf.getvalue(), filetype="pdf")
    cert_img = degrade(rasterize(certificate_pdf_bytes(v, "EXC-2026-0071190", "2026-10-21"), 200),
                       angle=-0.6, noise=6, seed=SEED + 7)
    tmp = OUT / "_tmp_scan.pdf"
    image_only_pdf([(cert_img, 200)], tmp)
    scan = pymupdf.open(tmp)
    cover.insert_pdf(scan)
    scan.close()
    tmp.unlink()
    cover.set_metadata({})
    cover.save(path, garbage=4, deflate=True, no_new_id=True)


def main() -> None:
    V = VEHICLES
    manifest: dict = {"_note": "Ground truth for tests. VIN = exact expected chassis id.", "fixtures": []}

    def entry(file, key, kind, description, match="exact", slow=True, methods=None, **extra):
        v = V[key]
        vin_norm = v["vin"].replace("-", "")
        e = {
            "file": file, "input_kind": kind, "description": description,
            "expected_vin": vin_norm, "expected_vin_raw": v["vin"],
            "expected_candidate_kind": "vin17" if len(vin_norm) == 17 else "nonstandard",
            "check_digit_valid": cd_ok(vin_norm) if len(vin_norm) == 17 else None,
            "match": match, "slow": slow, "expected_methods": methods,
            "fields": {"brand": v["brand"], "model": v["model"], "year": v["year"],
                       "color": v["color"], "mileage_km": v["mileage_km"]},
        }
        e.update(extra)
        manifest["fixtures"].append(e)

    # (a) digital certificate
    (OUT / "a_digital_certificate.pdf").write_bytes(
        certificate_pdf_bytes(V["digital"], "EXC-2026-0045812", "2026-10-14"))
    entry("a_digital_certificate.pdf", "digital", "pdf",
          "Digital export certificate with text layer; VIN in a key/value table.",
          slow=False, methods=["text_layer"])

    # (b) scanned at 200 dpi, slight rotation and noise, no text layer
    img = degrade(rasterize(certificate_pdf_bytes(V["scanned"], "EXC-2026-0051337", "2026-10-02"), 200),
                  angle=0.8, noise=8, seed=SEED + 1)
    image_only_pdf([(img, 200)], OUT / "b_scanned_certificate.pdf")
    entry("b_scanned_certificate.pdf", "scanned", "pdf",
          "Image-only PDF, 200 dpi, 0.8 deg rotation, gaussian noise + speckles.",
          methods=["ocr"])

    # (c) low quality: 120 dpi, blur, heavy JPEG artifacts
    img = degrade(rasterize(certificate_pdf_bytes(V["lowq"], "EXC-2026-0060044", "2026-09-28"), 120),
                  angle=-1.2, noise=10, blur=0.7, jpeg_quality=22, seed=SEED + 2)
    image_only_pdf([(img, 120)], OUT / "c_lowquality_scan.pdf", jpeg_quality=30)
    entry("c_lowquality_scan.pdf", "lowq", "pdf",
          "Image-only PDF, 120 dpi, -1.2 deg, blur 0.7, JPEG q~22 artifacts.",
          match="exact_or_flagged_suggestion", methods=["ocr"])

    # (d) PNG listing card
    listing_card_png(V["card"], OUT / "d_listing_card.png")
    entry("d_listing_card.png", "card", "image",
          "Dark-theme showroom listing card PNG (1800x1012). EU VIN: check digit intentionally not NA-valid.",
          methods=["ocr"])

    # (e) ambiguous chars; VIN printed in spaced groups in Courier, scanned 150 dpi
    img = degrade(rasterize(certificate_pdf_bytes(V["ambiguous"], "EXC-2026-0068821", "2026-10-25",
                                                  vin_grouped=True, font="Courier"), 150),
                  angle=0.5, noise=9, blur=0.5, jpeg_quality=45, seed=SEED + 3)
    image_only_pdf([(img, 150)], OUT / "e_ambiguous_vin_scan.pdf", jpeg_quality=50)
    entry("e_ambiguous_vin_scan.pdf", "ambiguous", "pdf",
          "VIN dense in 0/1/5/8/B/S/2/6 glyphs, printed in spaced groups (WMI VDS VIS) in Courier, "
          "scanned 150 dpi with blur/JPEG. OCR may read O/I/S/B variants; must surface as flagged suggestion.",
          match="exact_or_flagged_suggestion", methods=["ocr"])

    # (f) non-17 manufacturer chassis id
    nonstandard_pdf(V["nonstandard"], OUT / "f_nonstandard_chassis.pdf")
    entry("f_nonstandard_chassis.pdf", "nonstandard", "pdf",
          "Japanese export certificate translation with frame number URJ202-4012345 (not a VIN).",
          slow=False, methods=["text_layer"])

    # (g) mixed: digital cover + scanned certificate
    mixed_pdf(V["mixed"], OUT / "g_mixed_digital_and_scan.pdf")
    entry("g_mixed_digital_and_scan.pdf", "mixed", "pdf",
          "2 pages: page 1 digital cover letter (no VIN), page 2 scanned certificate. Tests hybrid per-page routing.",
          methods=["text_layer", "ocr"], expected_vin_page=2)

    (OUT / "expected.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for e in manifest["fixtures"]:
        print(f"{e['file']:32s} {e['expected_vin']:18s} cd_valid={e['check_digit_valid']}")


if __name__ == "__main__":
    main()
