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

# Narrative is prose the writer builds sentences from. Glossary is lookup data —
# figures and names reproduced verbatim in every language. Only narrative caps article
# length, so a combined total flatters the factbase: the "~103 words per story" that
# drove the native target down counted both.
NARRATIVE_FIELDS = ("what_happened", "attribution", "verified", "contested")
GLOSSARY_FIELDS  = ("numbers", "proper_nouns", "key_terms")
FACT_FIELDS = NARRATIVE_FIELDS + GLOSSARY_FIELDS

# Gemini 2.5 Flash, USD per 1M tokens.
RATE_IN, RATE_OUT, RATE_THINK = 0.30, 2.50, 3.50
USD_TO_GBP = 0.79


def words(story, fields=FACT_FIELDS):
    n = 0
    for f in fields:
        v = story.get(f) or []
        n += sum(len(str(x).split()) for x in v) if isinstance(v, list) else len(str(v).split())
    return n


def narrative(story):
    return words(story, NARRATIVE_FIELDS)


def glossary(story):
    return words(story, GLOSSARY_FIELDS)


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

    # Selection must be shared, or a per-story comparison means nothing. An unmatched
    # slug used to score silently as 0 words for B and read as "deepening lost facts".
    # Arm B should run with --deepen --from <arm A's factbase>.
    if b.get("selection_from"):
        print(f"B reused A's selection ({b['selection_from']}) — selection is identical "
              f"by construction ✓")
    missing = [s.get("slug") for s in fa if s.get("slug") not in by_slug_b]
    if missing:
        print()
        print("** SELECTION DIVERGED — comparison is NOT valid **")
        print(f"   {len(missing)} of {len(fa)} A stories absent from B: {missing[:5]}")
        print("   Arm B must run: bilinguist_gather.py --deepen --from factbase_A.json")
        print()

    print()
    print("NARRATIVE is what caps article length. GLOSSARY is lookup data.")
    hdr = (f"{'story':32} {'A narr':>7} {'B narr':>7} {'x':>5}   "
           f"{'A gloss':>7} {'B gloss':>7} {'x':>5}")
    print(hdr)
    print("-" * len(hdr))
    tan = tbn = tag = tbg = 0
    for s in fa:
        sb = by_slug_b.get(s.get("slug"), {})
        an_, bn_ = narrative(s), narrative(sb)
        ag_, bg_ = glossary(s), glossary(sb)
        tan += an_; tbn += bn_; tag += ag_; tbg += bg_
        mn = f"{bn_ / an_:.1f}x" if an_ else "-"
        mg = f"{bg_ / ag_:.1f}x" if ag_ else "-"
        print(f"{str(s.get('slug'))[:32]:32} {an_:>7} {bn_:>7} {mn:>5}   "
              f"{ag_:>7} {bg_:>7} {mg:>5}")
    n = max(len(fa), 1)
    print("-" * len(hdr))
    print(f"{'TOTAL':32} {tan:>7} {tbn:>7} {(tbn / tan if tan else 0):>4.1f}x   "
          f"{tag:>7} {tbg:>7} {(tbg / tag if tag else 0):>4.1f}x")
    print(f"{'AVERAGE PER STORY':32} {tan // n:>7} {tbn // n:>7} {'':>5}   "
          f"{tag // n:>7} {tbg // n:>7}")
    ta, tb = tan + tag, tbn + tbg
    print(f"{'(combined, the old metric)':32} {ta // n:>7} {tb // n:>7}")

    # What article length does the NARRATIVE support? Glossary words cannot be
    # spun into prose, so including them was the flattering part of the old number.
    print()
    for label, avg in (("A", tan // n), ("B", tbn // n)):
        verdict = "supports 180-200 word articles" if avg >= 180 else \
                  f"caps articles near {avg} words without inventing"
        print(f"  {label}: ~{avg} words of NARRATIVE per story — {verdict}")

    ua, ub = a.get("usage_metadata", {}), b.get("usage_metadata", {})
    ca, cb = cost(ua), cost(ub)
    print()
    print(f"{'':10} {'in':>9} {'out':>9} {'thinking':>10} {'USD':>9} {'GBP':>9}")
    for label, u, c in (("A", ua, ca), ("B", ub, cb)):
        print(f"{label:10} {u.get('prompt_token_count',0):>9,} "
              f"{u.get('candidates_token_count',0):>9,} "
              f"{u.get('thoughts_token_count',0):>10,} {c:>9.4f} {c*USD_TO_GBP:>9.4f}")
    # Prefer the deepening calls' own metered usage. When B reuses A's selection its
    # usage_metadata is "A's gather + deepening", so cb - ca is the same number — but
    # only if that carry-forward happened, so measure it directly when we can.
    extra = b.get("per_story_usage") or b.get("deepen_usage")
    label = "per-story collection" if b.get("per_story") else "deepening"
    extra_usd = cost(extra) if extra else (cb - ca)
    src = "metered extra calls" if extra else "B total minus A total"
    print(f"\nExtra cost of {label}: GBP {extra_usd * USD_TO_GBP:+.4f}/day ({src})")
    if extra:
        calls = extra.get("calls", 0)
        print(f"  {calls} calls, GBP {extra_usd * USD_TO_GBP / max(calls,1):.4f} each")
    print(f"  A total GBP {ca * USD_TO_GBP:.4f}/day → B total GBP {cb * USD_TO_GBP:.4f}/day"
          f"  ({(cb / ca if ca else 0):.1f}x)")
    print(f"  Annualised: GBP {(cb - ca) * USD_TO_GBP * 365:+.2f}/year")
    if tbn > tan:
        per = extra_usd * USD_TO_GBP / max(tbn - tan, 1) * 1000
        print(f"  ~GBP {per:.3f} per 1,000 extra words of NARRATIVE")


if __name__ == "__main__":
    main()
