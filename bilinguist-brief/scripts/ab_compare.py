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



def _openings(articles, n=4):
    """First n words of each body, lowercased — for spotting formulaic openings."""
    out = []
    for a in articles:
        w = a.get("body", "").split()[:n]
        if w:
            out.append(" ".join(x.lower().strip('.,;:"«»„“”') for x in w))
    return out


def _mean_pairwise_overlap(articles):
    """Mean Jaccard overlap of word sets across articles in a combo.

    These articles cover DIFFERENT stories, so shared topic vocabulary is limited.
    A high figure means the prose is formulaic — the same constructions reused —
    which is the risk of writing each article blind to the others.
    """
    sets = [set(w.lower().strip('.,;:"«»„“”') for w in a.get("body", "").split())
            for a in articles]
    sets = [x for x in sets if x]
    if len(sets) < 2:
        return 0.0
    tot = cnt = 0
    for i in range(len(sets)):
        for j in range(i + 1, len(sets)):
            u = sets[i] | sets[j]
            if u:
                tot += len(sets[i] & sets[j]) / len(u)
                cnt += 1
    return tot / cnt if cnt else 0.0


def variety(bundle):
    """{(lang, level, length): (distinct_opening_ratio, mean_overlap)}"""
    out = {}
    def add(key, arts):
        if len(arts) < 2:
            return
        ops = _openings(arts)
        ratio = len(set(ops)) / len(ops) if ops else 0.0
        out[key] = (ratio, _mean_pairwise_overlap(arts))
    for lang, levels in (bundle.get("briefings") or {}).items():
        for level, lengths in levels.items():
            for length, payload in lengths.items():
                add((lang, level, length), payload.get("articles", []))
    for lang, lengths in (bundle.get("nativeJournalism") or {}).items():
        if isinstance(lengths, dict):
            for length, arts in lengths.items():
                add((lang, "Native", length), arts)
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

    # How much source material does each story actually carry? The native prompt asks
    # for 250-270 words while forbidding invented facts, so if a story holds far fewer
    # words of source than that, the target is unreachable without padding.
    FIELDS = ("what_happened", "attribution", "verified", "contested", "numbers",
              "proper_nouns", "key_terms")
    if fa:
        print()
        print(f"{'story':46} {'source words':>12}")
        print("-" * 60)
        counts = []
        for story in fa:
            n = 0
            for f in FIELDS:
                v = story.get(f) or []
                if isinstance(v, list):
                    n += sum(len(str(x).split()) for x in v)
                else:
                    n += len(str(v).split())
            counts.append(n)
            print(f"{str(story.get('slug'))[:46]:46} {n:>12}")
        avg = sum(counts) / len(counts)
        print(f"{'AVERAGE':46} {avg:>12.0f}")
        print(f"\nNative/longer asks for 250-270 words from ~{avg:.0f} words of source.")
        if avg < 250:
            print(f"  -> target exceeds available material by ~{250 - avg:.0f} words per story.")
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

    # ---- variety: does writing each article blind to the others make them samey? ----
    va, vb = variety(a), variety(b)
    print()
    hdr2 = f"{'combo':22} | {'distinct openings':>24} | {'word overlap':>20}"
    print(hdr2)
    print("-" * len(hdr2))
    dull_a = dull_b = 0
    for key in sorted(set(va) | set(vb)):
        oa, la_ = va.get(key, (0.0, 0.0))
        ob, lb_ = vb.get(key, (0.0, 0.0))
        if oa and oa < 1.0:
            dull_a += 1
        if ob and ob < 1.0:
            dull_b += 1
        combo = "/".join(x for x in key if x)
        print(f"{combo:22} | {oa:9.0%} -> {ob:9.0%}      | {la_:8.1%} -> {lb_:6.1%}")
    print()
    print(f"Combos with a repeated opening — A: {dull_a} | B: {dull_b}")
    print("distinct openings: 100% = every article starts differently (higher is better)")
    print("word overlap: mean pairwise, across DIFFERENT stories (lower is better)")

    missing_a = [k for k, (n, _) in ra.items() if n == 0]
    missing_b = [k for k, (n, _) in rb.items() if n == 0]
    if missing_a:
        print(f"\nEmpty in {la}: {missing_a}")
    if missing_b:
        print(f"Empty in {lb}: {missing_b}")


if __name__ == "__main__":
    main()
