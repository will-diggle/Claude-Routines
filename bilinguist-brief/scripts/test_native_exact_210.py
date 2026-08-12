"""
Test: does telling native to write EXACTLY 210 words (a single number, "count every word,
revise until you match") produce tighter compliance than the current range instruction
(206-225, "count every word before submitting")?

Isolates ONLY this one variable -- reuses the exact same two fact-bases already gathered in
the previous test (13-point/463-word Trump, 12-point/560-word Jensen Huang, hardcoded below
verbatim from that run's log), so any difference in native's output is attributable to the
word-count phrasing alone, not to different input facts. Previous result on these same
facts, with the range instruction: Trump 276 words, Jensen 269 words.

2 Gemini calls (native EN x 2, Gemini Flash). Standalone -- no pipeline stages, never
touches the data repo or the live app.

    python test_native_exact_210.py
"""

import sys

from google import genai

import bilinguist_write as W

TRUMP_STORY = {
    "slug": "trump-secret-flight-iran-threat",
    "genre": "GLOBAL NEWS",
    "what_happened": [
        "Donald Trump attended a NATO summit in Ankara, Turkey, last month.",
        "He had travelled to Turkey on a new Boeing 747-8 jet, which was gifted by Qatar.",
        "Before his departure from Turkey, US intelligence detected a credible Iranian assassination threat targeting him and Air Force One.",
        "A 'deception operation' was subsequently initiated by top administration officials.",
        "Mr Trump publicly boarded an older model of Air Force One, a Boeing VC-25A, in Ankara, in full view of television cameras.",
        "Minutes later, he was secretly transferred from this plane to a smaller Air Force C-32A aircraft.",
        "The transfer involved concealing his movement inside an airport catering truck.",
        "The catering truck then drove him across the tarmac to the C-32A.",
        "Mr Trump then flew secretly on the C-32A to RAF Mildenhall in Britain.",
        "The older Air Force One, carrying journalists and some White House staff, departed separately, serving as a decoy.",
        "Journalists and some staff were reportedly unaware of the switch and believed they were flying with the president.",
        "Upon arrival in Britain, Mr Trump was reportedly brought back to the older Air Force One to disembark publicly.",
        "Mr Trump had publicly stated on Truth Social that he would use the 'former Air Force One' for 'old time's sake' and to allow US troops to tour the new plane.",
    ],
    "attribution": [
        "The Washington Post first reported the story.",
        "The New York Times corroborated the report.",
        "CBS News exclusively reported that US intelligence detected a plot to fire a missile at the plane Mr Trump was on.",
        "US officials familiar with the operation and another person with knowledge of the president's travel spoke to The Washington Post on condition of anonymity.",
        "A US official confirmed the operation to The New York Times.",
        "Mr Trump told CBS News chief White House correspondent Nancy Cordes that the decision was made by the military and Secret Service due to a threat.",
        "White House communications director Steven Cheung issued a statement defending the new aircraft's security protocols.",
        "Donald Mihalek, a former Secret Service agent, stated that the agency has used decoy motorcades and flights in the past.",
    ],
    "verified": [
        "Donald Trump secretly switched planes in Turkey last month due to an Iranian assassination threat.",
        "He used an airport catering truck to transfer between the planes.",
        "Mr Trump flew on an Air Force C-32A, while an older Air Force One served as a decoy.",
        "The event occurred after a NATO summit in Ankara, Turkey.",
        "Journalists and some White House staff were unaware of the secret plane swap.",
    ],
    "contested": [
        "The White House's public statements that Mr Trump was aboard Air Force One contradicted the actual events.",
        "Mr Trump's public reason for switching planes, citing 'old time's sake' and allowing troops to tour the new plane, differed from reports that the Secret Service advised the switch for security reasons.",
    ],
    "numbers": ["July 8", "10:20 p.m."],
    "proper_nouns": ["Donald Trump", "Iran", "Turkey", "Ankara", "NATO summit", "Air Force One",
                      "Boeing VC-25A", "Boeing 747-8", "Qatar", "Air Force C-32A", "RAF Mildenhall",
                      "Britain", "The Washington Post", "The New York Times", "CBS News", "Truth Social",
                      "White House", "US Secret Service", "Steven Cheung", "Nancy Cordes", "Donald Mihalek"],
    "key_terms": ["secret flight", "plane swap", "catering truck", "assassination threat",
                   "deception operation", "decoy plane", "military aircraft"],
    "notification_line": "Donald Trump reportedly used a catering truck to board a secret military flight from Turkey due to an Iranian threat.",
    "headline": "Donald Trump reportedly used a catering truck to board a secret military flight from Turkey due to an Iranian threat.",
}

JENSEN_STORY = {
    "slug": "jensen-huang-ai-financing-china-risk",
    "genre": "BUSINESS & ECONOMY",
    "what_happened": [
        "Nvidia announced partnerships with six major financial firms to establish independent financing platforms for artificial intelligence (AI) infrastructure.",
        "The initiative aims to mobilise more than $500 billion in third-party capital over time to fund the buildout of AI infrastructure.",
        "The capital is intended to finance the construction of AI data centres, chip factories, and power stations.",
        "Nvidia Chief Executive Jensen Huang stated that the company's AI factory platform is an investable asset and an infrastructure asset.",
        "These financing platforms are designed to help Nvidia customers, including frontier AI labs, enterprises, and AI clouds, access capital at attractive rates.",
        "The financial partners will independently underwrite each project, assessing factors such as customer demand, utilisation, cash flow, and residual value.",
        "Analysts have expressed concerns that this significant cash infusion could further increase enterprise AI infrastructure costs and exacerbate the existing shortage of AI chips for data centres.",
        "The plan relies on the assumption that Nvidia's Graphics Processing Units (GPUs) will retain their value over time, similar to tangible assets like commercial real estate.",
        "The biggest risk factor identified for the plan's success is the potential for an expanding supply of low-priced chips from China, which could impact GPU value.",
        "Some analysts have also raised concerns about circular financing, suggesting that Nvidia's investments might primarily serve to support its own market rather than foster genuine innovation.",
        "The Bank of England previously warned in July that AI developments could pose a risk to financial stability, particularly if companies taking on debt fail to deliver sustainable profits.",
        "Nvidia's stock fell by 2.86% on Monday following the announcement of the partnerships.",
    ],
    "attribution": [
        "Nvidia and its financial partners announced the fund.",
        "Jensen Huang, Nvidia CEO, made statements regarding the fund and AI as an investable asset.",
        "Simon Maine, managing director for communications at Brookfield Asset Management, clarified the $500 billion figure.",
        "Mark Tauschek, a distinguished analyst at Info-Tech Research Group, commented on potential cost hikes and chip shortages.",
        "Sanchit Vir Gogia, chief analyst at Greyhound Research, agreed with Tauschek's projections.",
        "Ben Emons, founder of FedWatch Advisors, identified China as a major threat to the plan.",
        "David Solomon, Chairman and CEO of Goldman Sachs, expressed confidence in Nvidia's leadership.",
        "The Bank of England issued a warning in its financial stability report.",
        "Stacy Rasgon from Bernstein Research noted concerns about an AI bubble.",
    ],
    "verified": [
        "Nvidia partnered with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs, and KKR.",
        "The fund aims to mobilise more than $500 billion in third-party capital.",
        "Jensen Huang is the CEO of Nvidia.",
        "The initiative focuses on financing AI infrastructure, including data centres and GPU clusters.",
        "Nvidia's stock fell by 2.86% after the announcement.",
    ],
    "contested": [
        "The precise amount of money earmarked for the fund was unclear, with the statement merely saying it would be more than $500 billion.",
        "Analysts and consultants agreed it is highly unlikely any of these funds would be dispensed directly to enterprises, but would instead impact the overall AI supply chain.",
        "Mark Tauschek projected a 15%-20% cost hike for enterprises due to the fund.",
        "Sanchit Vir Gogia estimated that AI chip prices would remain roughly the same for another year, increasing only at a good price if customers sign a long-term commitment.",
        "Ben Emons believes depreciation could undermine the thesis that Nvidia's AI infrastructure is an investable asset.",
        "Stacy Rasgon from Bernstein Research noted that the size of the deal could exacerbate fears of an AI bubble.",
    ],
    "numbers": ["$500 billion", "2.86%", "15%", "20%"],
    "proper_nouns": ["Nvidia", "Jensen Huang", "Apollo", "BlackRock", "Blackstone", "Brookfield",
                      "Goldman Sachs", "KKR", "China", "Graphics Processing Units", "GPU", "AI",
                      "Simon Maine", "Brookfield Asset Management", "Mark Tauschek",
                      "Info-Tech Research Group", "Sanchit Vir Gogia", "Greyhound Research",
                      "Ben Emons", "FedWatch Advisors", "David Solomon", "Bank of England",
                      "Stacy Rasgon", "Bernstein Research"],
    "key_terms": ["AI fund", "AI infrastructure", "financing platforms", "third-party capital",
                   "data centres", "chip factories", "power stations", "investable asset",
                   "AI chip shortage", "GPU value", "circular financing", "financial stability"],
    "notification_line": "Nvidia has partnered with six financial firms to launch a $500 billion AI fund to finance AI infrastructure amid concerns over China market risks.",
    "headline": "Nvidia unveils $500bn AI fund amid China market fears",
}

# Override ONLY the word-count instruction -- everything else in the real native prompt
# (structure, genre rules, political titles, attribution, glossary) stays untouched.
_ORIG_RULE = W.NATIVE_WORD_RULE["longer"]
EXACT_210_RULE = (
    "Write exactly 210 words. Count every word before submitting. If your count is not "
    "210, revise the article and count again until it is. This is a precise target, not a "
    "range -- 208 or 213 is a miss, not close enough."
)


def write_native(client: "genai.Client", story: dict) -> None:
    W.NATIVE_WORD_RULE["longer"] = EXACT_210_RULE
    prompt = W.build_native_prompt("en", [story], "longer")
    W.NATIVE_WORD_RULE["longer"] = _ORIG_RULE

    print(f"\n{'=' * 20} NATIVE EN (exact-210 instruction) — {story['slug']} — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, "gemini-2.5-flash", prompt, f"test/en-native-210-{story['slug']}",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=8192,
    )
    if not raw:
        print(f"[{story['slug']}] ERROR: no response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw) or {}
    body = parsed.get("body", "")
    print(f"\n{'=' * 20} NATIVE EN (exact-210 instruction) — {story['slug']} — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(f"Headline: {parsed.get('headline', '')}\n")
    print(body)


if __name__ == "__main__":
    genai_client = genai.Client()
    write_native(genai_client, TRUMP_STORY)
    write_native(genai_client, JENSEN_STORY)
