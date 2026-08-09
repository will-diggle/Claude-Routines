"""
ab_gather_compare.py
====================
Compare two factbases built from the SAME scraped headlines.

Answers one question: does an extra grounded call per story produce enough more
source material to justify its cost?

This matters because source material caps article length. Measured 2026-08-09,
gather produced ~103 words of facts per story while native articles were asking
for 250 — and that gap is what made the writer pad, then invent.

Usage:
    python ab_gather_compare.py factbase_A.json factbase_B.json
"""

import json
import sys
from pathlib import Path

FACT_FIELDS = ("what_happened", "attribution", "verified", "contested",
               "numbers", "proper_nouns", "key_terms")

# Gemini 2.5 Flash, USD per 1M tokens.
RATE_IN, RATE_OUT, RATE_THINK = 0.30, 2.50, 3.50
USD_TO_GBP = 0.79


def words(story):
    n = 0
    for f in FACT_FIELDS:
        v = story.get(f) or []
        n += sum(len(str(x).split()) for x in v) if isinstance(v, list) else len(str(v).split())
    return n


def cost(usage):
    return (usage.get("prompt_token_count", 0) / 1e6 * RATE_IN
            + usage.get("candidates_token_count", 0) / 1e6 * RATE_OUT
            + usage.get("thoughts_token_count", 0) / 1e6 * RATE_THINK)


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: ab_gather_compare.py factbase_A.json factbase_B.json")
    for p in sys.argv[1:3]:
        if not Path(p).exists():
            sys.exit(f"Not found: {p}")

    a = json.load(open(sys.argv[1], encoding="utf-8"))
    b = json.load(open(sys.argv[2], encoding="utf-8"))
    fa, fb = a.get("factbase", []), b.get("factbase", [])

    print(f"A: {len(fa)} stories, deepened={a.get('deepened', False)}")
    print(f"B: {len(fb)} stories, deepened={b.get('deepened', False)}")
    if len(fa) != len(fb):
        print("** different story counts — selection differed, not a clean comparison **")

    by_slug_b = {s.get("slug"): s for s in fb}

    print()
    hdr = f"{'story':44} {'A words':>8} {'B words':>8} {'change':>9}"
    print(hdr)
    print("-" * len(hdr))
    ta = tb = 0
    for s in fa:
        wa = words(s)
        wb = words(by_slug_b.get(s.get("slug"), {}))
        ta += wa
        tb += wb
        mult = f"{wb / wa:.1f}x" if wa else "-"
        print(f"{str(s.get('slug'))[:44]:44} {wa:>8} {wb:>8} {mult:>9}")
    n = max(len(fa), 1)
    print("-" * len(hdr))
    print(f"{'TOTAL':44} {ta:>8} {tb:>8} {(tb / ta if ta else 0):>8.1f}x")
    print(f"{'AVERAGE PER STORY':44} {ta // n:>8} {tb // n:>8}")

    # What article length does that support?
    print()
    for label, avg in (("A", ta // n), ("B", tb // n)):
        verdict = "supports 180-200 word articles" if avg >= 180 else \
                  f"caps articles near {avg} words without inventing"
        print(f"  {label}: ~{avg} words of source per story — {verdict}")

    ua, ub = a.get("usage_metadata", {}), b.get("usage_metadata", {})
    ca, cb = cost(ua), cost(ub)
    print()
    print(f"{'':10} {'in':>9} {'out':>9} {'thinking':>10} {'USD':>9} {'GBP':>9}")
    for label, u, c in (("A", ua, ca), ("B", ub, cb)):
        print(f"{label:10} {u.get('prompt_token_count',0):>9,} "
              f"{u.get('candidates_token_count',0):>9,} "
              f"{u.get('thoughts_token_count',0):>10,} {c:>9.4f} {c*USD_TO_GBP:>9.4f}")
    print(f"\nExtra cost of deepening: GBP {(cb - ca) * USD_TO_GBP:+.4f}/day")
    if tb > ta:
        per = (cb - ca) * USD_TO_GBP / max(tb - ta, 1) * 1000
        print(f"  ~GBP {per:.3f} per 1,000 extra words of source")


if __name__ == "__main__":
    main()
