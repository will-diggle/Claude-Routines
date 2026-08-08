"""
ab_compare.py
=============
Compare two write-stage runs built from the SAME factbase.

Used to answer one question: does one API call per (language, level, length,
story) produce better word counts than one call writing every story at once?

Usage:
    python ab_compare.py output/armA.json output/armB.json [--labels batched per-article]

Reads two DailyBundle files and reports, per language/level/length:
  articles produced, average words, and whether that lands in the target band.
Also reports native journalism, which has its own (much longer) targets.
"""

import argparse
import json
import sys
from pathlib import Path

# Targets must match WORDS_PER_ARTICLE in bilinguist_write.py.
WORD_TARGETS = {
    "A1":     {"short": (60, 75),  "longer": (100, 120)},
    "A2":     {"short": (65, 80),  "longer": (110, 130)},
    "B1":     {"short": (75, 90),  "longer": (150, 170)},
    "B2":     {"short": (75, 90),  "longer": (150, 170)},
    "C1":     {"short": (85, 100), "longer": (250, 270)},
    "C2":     {"short": (85, 100), "longer": (250, 270)},
    "Native": {"short": (85, 100), "longer": (250, 270)},
}


def avg_words(articles):
    if not articles:
        return 0.0
    return sum(len(a.get("body", "").split()) for a in articles) / len(articles)


def band(avg, target):
    if not target or avg <= 0:
        return "  "
    lo, hi = target
    if lo <= avg <= hi:
        return "OK"
    return "--" if avg < lo else "++"


def rows(bundle):
    """Return {(lang, level, length): (n_articles, avg_words)} for every combo."""
    out = {}
    for lang, levels in (bundle.get("briefings") or {}).items():
        for level, lengths in levels.items():
            for length, payload in lengths.items():
                arts = payload.get("articles", [])
                out[(lang, level, length)] = (len(arts), avg_words(arts))
    for lang, lengths in (bundle.get("nativeJournalism") or {}).items():
        if not isinstance(lengths, dict):
            continue
        for length, arts in lengths.items():
            out[(lang, "Native", length)] = (len(arts), avg_words(arts))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("arm_a")
    ap.add_argument("arm_b")
    ap.add_argument("--labels", nargs=2, default=["A:batched", "B:per-article"])
    args = ap.parse_args()

    for p in (args.arm_a, args.arm_b):
        if not Path(p).exists():
            sys.exit(f"Not found: {p}")

    a = json.load(open(args.arm_a, encoding="utf-8"))
    b = json.load(open(args.arm_b, encoding="utf-8"))
    la, lb = args.labels
    ra, rb = rows(a), rows(b)

    fa = a.get("factbase") or []
    fb = b.get("factbase") or []
    print(f"Factbase: arm A {len(fa)} stories | arm B {len(fb)} stories", end="")
    print("  ** DIFFERENT — not a controlled comparison **" if len(fa) != len(fb) else "  (identical)")
    print()

    hdr = f"{'combo':22} {'target':>11} | {la:>18} | {lb:>18} | delta"
    print(hdr)
    print("-" * len(hdr))

    improved = regressed = same = 0
    for key in sorted(set(ra) | set(rb)):
        lang, level, length = key
        na, wa = ra.get(key, (0, 0.0))
        nb, wb = rb.get(key, (0, 0.0))
        target = WORD_TARGETS.get(level, {}).get(length)
        tstr = f"{target[0]}-{target[1]}" if target else "-"
        sa, sb = band(wa, target), band(wb, target)
        delta = wb - wa
        # "Better" = closer to the middle of the target band.
        if target:
            mid = sum(target) / 2
            if abs(wb - mid) < abs(wa - mid) - 1:
                improved += 1
            elif abs(wb - mid) > abs(wa - mid) + 1:
                regressed += 1
            else:
                same += 1
        combo = f"{lang}/{level}/{length}"
        print(f"{combo:22} {tstr:>11} | {na:2}art {wa:6.1f}w {sa} | "
              f"{nb:2}art {wb:6.1f}w {sb} | {delta:+6.1f}")

    print()
    print(f"Closer to target in arm B: {improved} | further: {regressed} | unchanged: {same}")
    print("OK = within band, -- = under, ++ = over")

    missing_a = [k for k, (n, _) in ra.items() if n == 0]
    missing_b = [k for k, (n, _) in rb.items() if n == 0]
    if missing_a:
        print(f"\nEmpty in {la}: {missing_a}")
    if missing_b:
        print(f"Empty in {lb}: {missing_b}")


if __name__ == "__main__":
    main()
