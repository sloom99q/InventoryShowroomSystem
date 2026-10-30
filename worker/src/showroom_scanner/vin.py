"""VIN / chassis-number candidate detection, normalisation and validation.

Design rules (important for an inventory system where the VIN is identity):

* We NEVER silently correct a VIN. ``VinCandidate.value`` is always exactly what
  was read (after removing separators and upper-casing). Any change we think
  might be right is put in ``suggestions`` together with flags explaining why,
  and ``needs_review`` is set.
* ISO 3779 format = 17 chars from ``[A-HJ-NPR-Z0-9]`` (no I, O, Q).
* The check digit (position 9) is mandatory only for North-American-market
  VINs (49 CFR 565). Many EU / Chinese / Japanese / GCC-spec VINs do not use it,
  so a check-digit mismatch is reported as *information*, never a rejection.
* Manufacturer chassis/frame numbers that are not 17 chars (e.g. Japanese
  domestic ``GRJ200-1012345``) are reported with ``kind="nonstandard"`` - only
  when they are anchored to a chassis/frame/VIN label, to avoid noise.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Iterable

VIN_LENGTH = 17
VIN_ALPHABET = frozenset("ABCDEFGHJKLMNPRSTUVWXYZ0123456789")
FORBIDDEN_LETTERS = {"I": "1", "O": "0", "Q": "0"}
# Pairs that OCR commonly confuses and that are BOTH legal in a VIN. We cannot
# know which one is right from the text alone, so we only flag the positions.
SOFT_CONFUSABLES = {
    "S": "5", "5": "S",
    "B": "8", "8": "B",
    "Z": "2", "2": "Z",
    "G": "6", "6": "G",
}

_TRANSLIT = {
    **{str(d): d for d in range(10)},
    "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8,
    "J": 1, "K": 2, "L": 3, "M": 4, "N": 5, "P": 7, "R": 9,
    "S": 2, "T": 3, "U": 4, "V": 5, "W": 6, "X": 7, "Y": 8, "Z": 9,
}
_WEIGHTS = (8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2)

# Model-year code (position 10), repeating every 30 years.
_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789"  # 1980..2009 / 2010..2039

# Labels that anchor a chassis id. Arabic: رقم الشاصي / رقم الهيكل (chassis no.).
LABEL_RE = re.compile(
    r"(?i)\b(v\.?\s?i\.?\s?n\.?|vehicle\s+identification(?:\s+number|\s+no\.?)?|"
    r"chassis(?:\s+(?:no\.?|number|#))?|frame(?:\s+(?:no\.?|number|#))?)"
    r"|رقم\s*الشاص[يى]|رقم\s*الهيكل|الشاصي"
)
_SEPARATORS_RE = re.compile(r"[\s\-‐-―._/]+")
_TOKEN_SPLIT_RE = re.compile(r"[\s|:;,()\[\]{}<>\"'`*#=]+")
_CODE_TOKEN_RE = re.compile(r"^[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$")
_MAX_JOIN_TOKENS = 6


def normalize(raw: str) -> str:
    """Upper-case and strip separators (spaces, dashes, dots, slashes).

    Does not substitute any characters.
    """
    return _SEPARATORS_RE.sub("", raw).upper()


def check_digit(vin: str) -> str | None:
    """Compute the North-American check digit for a 17-char VIN.

    Returns None if the VIN contains characters with no transliteration value
    (I/O/Q or non-alphanumerics) or has the wrong length.
    """
    vin = vin.upper()
    if len(vin) != VIN_LENGTH:
        return None
    total = 0
    for ch, w in zip(vin, _WEIGHTS):
        v = _TRANSLIT.get(ch)
        if v is None:
            return None
        total += v * w
    r = total % 11
    return "X" if r == 10 else str(r)


def check_digit_valid(vin: str) -> bool | None:
    cd = check_digit(vin)
    if cd is None:
        return None
    return vin[8].upper() == cd


def is_iso3779_format(vin: str) -> bool:
    return len(vin) == VIN_LENGTH and all(c in VIN_ALPHABET for c in vin)


def model_year_candidates(vin: str, today: date | None = None) -> list[int]:
    """Possible model years from position 10 (most recent first, not in future+1)."""
    if len(vin) != VIN_LENGTH:
        return []
    code = vin[9].upper()
    idx = _YEAR_CODES.find(code)
    if idx < 0:
        return []
    limit = (today or date.today()).year + 1
    years = [y for y in (1980 + idx + 30 * k for k in range(3)) if y <= limit]
    return sorted(years, reverse=True)


@dataclass
class Suggestion:
    value: str
    reason: str
    check_digit_valid: bool | None


@dataclass
class VinCandidate:
    value: str                     # as read: separators removed, upper-cased, NO substitutions
    raw: str                       # exact source substring (tokens joined by single space)
    kind: str                      # "vin17" | "nonstandard"
    page: int | None
    method: str | None             # e.g. "text_layer", "ocr:ocrmac"
    format_valid: bool             # ISO 3779 (17 chars, legal alphabet)
    check_digit: dict | None       # {"expected","actual","valid","note"} for 17-char values
    flags: list[str] = field(default_factory=list)
    ambiguous_positions: list[dict] = field(default_factory=list)
    suggestions: list[Suggestion] = field(default_factory=list)
    label_anchored: bool = False
    confidence: float = 0.0
    needs_review: bool = False
    occurrences: int = 1
    pages: list[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def analyze(value: str) -> tuple[bool, dict | None, list[str], list[dict], list[Suggestion]]:
    """Validate a normalised 17-char value and build flags/suggestions.

    Returns (format_valid, check_digit_info, flags, ambiguous_positions, suggestions).
    """
    flags: list[str] = []
    ambiguous: list[dict] = []
    suggestions: list[Suggestion] = []

    format_valid = is_iso3779_format(value)
    if len(value) != VIN_LENGTH:
        flags.append("length_not_17")

    forbidden_pos = [i for i, c in enumerate(value) if c in FORBIDDEN_LETTERS]
    for i in forbidden_pos:
        ambiguous.append({
            "position": i + 1,
            "char": value[i],
            "alternatives": [FORBIDDEN_LETTERS[value[i]]],
            "severity": "illegal_char",
        })
    if forbidden_pos:
        flags.append("contains_I_O_Q")
    other_illegal = [c for c in value if c not in VIN_ALPHABET and c not in FORBIDDEN_LETTERS]
    if other_illegal:
        flags.append("contains_non_alphanumeric")

    for i, c in enumerate(value):
        if c in SOFT_CONFUSABLES:
            ambiguous.append({
                "position": i + 1,
                "char": c,
                "alternatives": [SOFT_CONFUSABLES[c]],
                "severity": "confusable",
            })

    cd_info: dict | None = None
    if len(value) == VIN_LENGTH:
        expected = check_digit(value)
        cd_info = {
            "expected": expected,
            "actual": value[8],
            "valid": None if expected is None else value[8] == expected,
            "note": (
                "Check digit is mandatory only for North-American-market VINs; "
                "a mismatch is informational for other markets."
            ),
        }

    if forbidden_pos and len(value) == VIN_LENGTH:
        fixed = "".join(FORBIDDEN_LETTERS.get(c, c) for c in value)
        suggestions.append(Suggestion(
            value=fixed,
            reason="replaced illegal " + ",".join(
                f"{value[i]}@{i + 1}->{FORBIDDEN_LETTERS[value[i]]}" for i in forbidden_pos
            ),
            check_digit_valid=check_digit_valid(fixed),
        ))

    # If the (possibly I/O/Q-fixed) value fails the check digit, try single
    # soft-confusable swaps that would make it pass. Purely a hint.
    base = suggestions[0].value if suggestions else value
    if is_iso3779_format(base) and check_digit_valid(base) is False:
        for i, c in enumerate(base):
            alt = SOFT_CONFUSABLES.get(c)
            if alt is None:
                continue
            trial = base[:i] + alt + base[i + 1:]
            if check_digit_valid(trial):
                suggestions.append(Suggestion(
                    value=trial,
                    reason=f"single confusable swap {c}@{i + 1}->{alt} satisfies check digit",
                    check_digit_valid=True,
                ))
        if cd_info is not None:
            flags.append("check_digit_mismatch")

    return format_valid, cd_info, flags, ambiguous, suggestions


def _score(c: VinCandidate) -> float:
    s = 0.45
    if c.kind == "vin17":
        if c.format_valid:
            s += 0.15
        if c.check_digit and c.check_digit.get("valid"):
            s += 0.15
        if "contains_I_O_Q" in c.flags:
            s -= 0.2
    else:
        s -= 0.1
    if c.label_anchored:
        s += 0.2
    if c.method and c.method.startswith("ocr"):
        s -= 0.05
    if c.raw.count(" ") > 0:
        s -= 0.05  # value was reassembled across whitespace
    return round(max(0.0, min(1.0, s)), 3)


def _looks_like_vin(v: str) -> bool:
    if len(v) != VIN_LENGTH or not v.isalnum() or not v.isascii():
        return False
    digits = sum(ch.isdigit() for ch in v)
    letters = VIN_LENGTH - digits
    # Every real VIN has a lettered WMI or descriptor and a mostly numeric serial.
    return digits >= 4 and letters >= 1


def _tokens_with_lines(text: str) -> list[list[str]]:
    return [[t for t in _TOKEN_SPLIT_RE.split(line) if t] for line in text.splitlines()]


def _line_has_label(line: str) -> bool:
    return bool(LABEL_RE.search(line))


def find_candidates(
    text: str,
    page: int | None = None,
    method: str | None = None,
) -> list[VinCandidate]:
    """Find 17-char VIN candidates and label-anchored non-standard chassis ids."""
    lines = text.splitlines()
    tokenized = _tokens_with_lines(text)
    found: dict[str, VinCandidate] = {}

    def add(value: str, raw: str, kind: str, anchored: bool) -> None:
        if kind == "vin17":
            fmt, cd, flags, amb, sugg = analyze(value)
        else:
            fmt, cd, sugg = False, None, []
            flags = ["nonstandard_length"]
            amb = [
                {"position": i + 1, "char": ch, "alternatives": [FORBIDDEN_LETTERS.get(ch) or SOFT_CONFUSABLES[ch]],
                 "severity": "confusable"}
                for i, ch in enumerate(value)
                if ch in SOFT_CONFUSABLES or ch in FORBIDDEN_LETTERS
            ]
        cand = VinCandidate(
            value=value, raw=raw, kind=kind, page=page, method=method,
            format_valid=fmt, check_digit=cd, flags=flags,
            ambiguous_positions=amb, suggestions=sugg, label_anchored=anchored,
            pages=[page] if page is not None else [],
        )
        cand.needs_review = bool(
            kind != "vin17" or not fmt or sugg or "check_digit_mismatch" in flags
        )
        cand.confidence = _score(cand)
        prev = found.get(value)
        if prev is None:
            found[value] = cand
        else:
            prev.occurrences += 1
            prev.label_anchored = prev.label_anchored or anchored
            prev.confidence = max(prev.confidence, _score(prev))

    for li, toks in enumerate(tokenized):
        anchored = _line_has_label(lines[li]) or (li > 0 and _line_has_label(lines[li - 1]))
        # Join consecutive code-like tokens; emit any 17-char normalised result.
        code_idx = [i for i, t in enumerate(toks) if _CODE_TOKEN_RE.match(t)]
        for start in code_idx:
            joined = ""
            parts: list[str] = []
            for j in range(start, min(start + _MAX_JOIN_TOKENS, len(toks))):
                t = toks[j]
                if not _CODE_TOKEN_RE.match(t):
                    break
                # Printed VIN groups are upper case; joining ordinary words
                # ("Issue Date 2026...") is noise. Mirrors web/src/lib/vin.ts.
                if j > start and (any(ch.islower() for ch in t) or any(ch.islower() for ch in toks[start])):
                    break
                parts.append(t)
                joined += normalize(t)
                if len(joined) > VIN_LENGTH:
                    break
                if len(joined) == VIN_LENGTH:
                    if _looks_like_vin(joined):
                        add(joined, " ".join(parts), "vin17", anchored)
                    break
            # Also catch a token with glued label, e.g. "VIN1GNSKCKD..." (len 20).
            t = normalize(toks[start])
            if len(t) > VIN_LENGTH and t[:3] in {"VIN"}:
                tail = t[3:]
                if _looks_like_vin(tail):
                    add(tail, toks[start], "vin17", True)

    # Label-anchored non-standard chassis ids on the same line or next line.
    known = set(found)
    for li, line in enumerate(lines):
        m = LABEL_RE.search(line)
        if not m:
            continue
        rest = line[m.end():]
        targets = [rest]
        if li + 1 < len(lines):
            targets.append(lines[li + 1])
        for tgt in targets:
            # First id-like token, skipping filler words such as "Number".
            mm = None
            for tok_m in re.finditer(r"[A-Za-z0-9][A-Za-z0-9\-]{4,24}", tgt.replace("|", " ")):
                if tok_m.group(0).lower() not in {"number", "chassis", "frame"}:
                    mm = tok_m
                    break
            if not mm:
                continue
            raw = mm.group(0).strip("-")
            value = normalize(raw)
            if value in known or any(value in k for k in known):
                break
            digits = sum(ch.isdigit() for ch in value)
            if 6 <= len(value) <= 16 and digits >= 3 and value.isascii():
                add(value, raw, "nonstandard", True)
                break

    return list(found.values())


def merge_candidates(cands: Iterable[VinCandidate]) -> list[VinCandidate]:
    """Merge candidates from several pages; rank best-first."""
    merged: dict[str, VinCandidate] = {}
    for c in cands:
        prev = merged.get(c.value)
        if prev is None:
            merged[c.value] = c
            continue
        prev.occurrences += c.occurrences
        prev.label_anchored = prev.label_anchored or c.label_anchored
        for p in c.pages:
            if p not in prev.pages:
                prev.pages.append(p)
        prev.confidence = max(prev.confidence, c.confidence)
    out = list(merged.values())
    for c in out:
        if c.occurrences > 1:
            c.confidence = round(min(1.0, c.confidence + 0.05), 3)
    out.sort(key=lambda c: (c.kind != "vin17", -c.confidence, c.page or 0))
    return out
