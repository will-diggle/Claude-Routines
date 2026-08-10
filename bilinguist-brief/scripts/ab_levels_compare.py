"""
ab_levels_compare.py
====================
Compare two bundles that share one native pass and differ only in how Stage 7 wrote the
CEFR level articles.

  ARM A  --levels-from factbase   each level article written from the fact-base
  ARM B  --levels-from native     the graded native article rewritten down a level

Reports, per (language, level, length):
  - word count against the band
  - FACT ORDER: whether the figures in the level article appear in the same order as in
    the native article it was derived from. This is the thing arm B is supposed to
    guarantee and arm A only asks for, so it is measured rather than assumed.
  - cost and wall clock

Usage:
    python ab_levels_compare.py armA.json armB.json
"""

import json
import re
import sys
from pathlib import Path

# Same source as the prompt builder and check.py, so the comparison cannot be measuring
# against a band the writer was never asked for.
from bilinguist_prompts import word_band  # noqa: F401

RATE_IN, RATE_OUT, RATE_THINK = 0.30, 2.50, 3.50
USD_TO_GBP = 0.79

# CANONICAL bands, before the per-language factor. Read via band_for().
TARGETS = {
    "A1": {"short": (85, 105), "longer": (180, 200)},
    "A2": {"short": (95, 115), "longer": (210, 230)},
    "B1": {"short": (95, 115), "longer": (210, 230)},
    "B2": {"short": (95, 115), "longer": (210, 230)},
    "C1": {"short": (95, 115), "longer": (210, 230)},
    "C2": {"short": (95, 115), "longer": (210, 230)},
}

_NUM = re.compile(r"\d[\d.,]*")


def band_for(level: str, length: str, lang: str) -> tuple:
    canon = TARGETS.get(level, {}).get(length, (0, 9999))
    return word_band(f"{canon[0]}-{canon[1]}", lang)


def figures(text: str) -> list:
    """Figures in the order they appear, digits only so 1.000 and 1,000 compare equal."""
    out = []
    for m in _NUM.finditer(text or ""):
        d = "".join(c for c in m.group(0) if c.isdigit())
        if d:
            out.append(d.lstrip("0") or "0")
    return out


def is_ordered_subsequence(small: list, big: list) -> bool:
    """Does `small` appear inside `big` in the same relative order?"""
    it = iter(big)
    return all(any(x == y for y in it) for x in small)


def native_index(bundle: dict) -> dict:
    idx = {}
    for lang, by_len in (bundle.get("nativeJournalism") or {}).items():
        if isinstance(by_len, dict):
            for length, arts in by_len.items():
                for a in arts or []:
                    if a.get("slug"):
                        idx[(lang, length, a["slug"])] = a
    return idx


def cost(u: dict) -> float:
    return (u.get("input_tokens", 0) / 1e6 * RATE_IN
            + u.get("output_tokens", 0) / 1e6 * RATE_OUT
            + u.get("thinking_tokens", 0) / 1e6 * RATE_THINK)


def combos(bundle: dict):
    for lang, levels in (bundle.get("briefings") or {}).items():
        for level, lengths in (levels or {}).items():
            for length, payload in (lengths or {}).items():
                arts = (payload or {}).get("articles") or []
                if arts:
                    yield (lang, level, length), arts


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: ab_levels_compare.py armA.json armB.json")
    for p in sys.argv[1:3]:
        if not Path(p).exists():
            sys.exit(f"Not found: {p}")
    a = json.load(open(sys.argv[1], encoding="utf-8"))
    b = json.load(open(sys.argv[2], encoding="utf-8"))

    nat = native_index(a) or native_index(b)
    same_native = (a.get("nativeGrades") == b.get("nativeGrades"))
    print(f"native grades identical across arms: {'yes ✓' if same_native else 'NO — arms did not share one native pass'}")
    print(f"native articles available for order-checking: {len(nat)}")

    ca, cb = dict(combos(a)), dict(combos(b))
    keys = sorted(set(ca) | set(cb))

    hdr = (f"{'combo':22} {'A wds':>6} {'B wds':>6} {'target':>9}  "
           f"{'A band':>7} {'B band':>7}  {'A order':>8} {'B order':>8}")
    print()
    print(hdr)
    print("-" * len(hdr))

    tot = {"a_band": 0, "b_band": 0, "n": 0, "a_ord": 0, "b_ord": 0, "ord_n": 0}
    for key in keys:
        lang, level, length = key
        lo, hi = band_for(level, length, lang)
        row = {}
        for tag, src in (("a", ca.get(key) or []), ("b", cb.get(key) or [])):
            words = [len((x.get("body") or "").split()) for x in src]
            avg = sum(words) // max(len(words), 1)
            band = sum(1 for w in words if lo <= w <= hi)
            ok = tot_ord = 0
            for art in src:
                source = nat.get((lang, length, art.get("slug")))
                if not source:
                    continue
                lf, nf = figures(art.get("body")), figures(source.get("body"))
                if not lf:
                    continue
                tot_ord += 1
                if is_ordered_subsequence(lf, nf):
                    ok += 1
            row[tag] = (avg, band, len(words), ok, tot_ord)
        (aa, ab_, an, ao, aon) = row["a"]
        (ba, bb_, bn, bo, bon) = row["b"]
        tot["a_band"] += ab_; tot["b_band"] += bb_; tot["n"] += max(an, bn)
        tot["a_ord"] += ao; tot["b_ord"] += bo; tot["ord_n"] += max(aon, bon)
        def frac(ok, n):
            return f"{ok}/{n}" if n else "—"
        combo = f"{lang}-{level}-{length}"
        band_t = f"{lo}-{hi}"
        print(f"{combo:22} {aa:>6} {ba:>6} {band_t:>9}  "
              f"{frac(ab_, an):>7} {frac(bb_, bn):>7}  "
              f"{frac(ao, aon):>8} {frac(bo, bon):>8}")

    print("-" * len(hdr))
    a_band = f"{tot['a_band']}/{tot['n']}"
    b_band = f"{tot['b_band']}/{tot['n']}"
    a_ord  = f"{tot['a_ord']}/{tot['ord_n']}"
    b_ord  = f"{tot['b_ord']}/{tot['ord_n']}"
    label = "TOTAL in band / order"
    print(f"{label:22} {'':>6} {'':>6} {'':>9}  "
          f"{a_band:>7} {b_band:>7}  {a_ord:>8} {b_ord:>8}")
    print()
    print("'order' = the figures in the level article appear in the same sequence as in the")
    print("native article for that story. Arm B is meant to guarantee this by construction.")

    # Bundles do not carry costs — they are written to a separate costs_{date}.json, so
    # the workflow copies one per arm and passes them as the 3rd and 4th arguments.
    if len(sys.argv) >= 5:
        print()
        for label, path in (("A", sys.argv[3]), ("B", sys.argv[4])):
            try:
                stages = (json.load(open(path, encoding="utf-8")).get("stages") or {})
            except Exception as e:
                print(f"  arm {label}: costs unavailable ({e})")
                continue
            keys = ("2S", "2B", "2M")
            gbp = sum(cost(stages.get(k) or {}) for k in keys) * USD_TO_GBP
            calls = sum((stages.get(k) or {}).get("calls", 0) for k in keys)
            print(f"  arm {label}: level writing GBP {gbp:.4f} ({calls} calls)")


if __name__ == "__main__":
    main()
