"""
Test: does dropping forced JSON output (response_schema + response_mime_type) improve
compliance on the rules we've measured failing -- word count, political titles, quote
formatting -- given there's only one task here (one article, not a list)?

Same fact-bases as test_native_exact_210.py (hardcoded, identical facts held constant),
SAME instructions (word count, political titles, quote rules, structure -- nothing in the
rule text changes), only the output mechanism changes: plain HEADLINE:/BODY: text instead
of a JSON-schema-forced object. Python parses the simple text format directly -- no JSON
needed at all, matching "we can python around this issue."

2 Gemini calls (Flash), fully unconstrained generation (no response_mime_type, no
response_schema -- a plain generate_content call, bypassing call_gemini's hardcoded JSON
mode). Standalone -- no pipeline stages, never touches the data repo or the live app.

    python test_native_no_json.py
"""

import re
import sys

from google import genai
from google.genai import types

import bilinguist_write as W
from test_native_exact_210 import TRUMP_STORY, JENSEN_STORY

# Same rule text as production -- only the output-format instruction changes, from a JSON
# schema description to plain text with simple markers.
_ORIG_OUTPUT_FORMAT = W.OUTPUT_FORMAT_SINGLE
PLAIN_OUTPUT_FORMAT = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "First, draft the article. Count its words by actually going through it and counting --"
    " not estimating. If the count is outside the word count range given above, revise the "
    "draft and count again. Repeat until the count is genuinely inside the range.\n\n"
    "Once it is, output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n"
    "SELF-CHECK WORD COUNT: <the exact number of words you counted in the body above>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these three fields."
)


def build_plain_prompt(story: dict) -> str:
    import bilinguist_write as _w
    _w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    prompt = _w.build_native_prompt("en", [story], "longer")
    _w.OUTPUT_FORMAT_SINGLE = _ORIG_OUTPUT_FORMAT
    return prompt


def parse_plain(raw: str) -> tuple[str, str, str]:
    m = re.search(
        r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*?)\n*SELF-CHECK WORD COUNT:\s*(\d+)",
        raw, re.DOTALL)
    if not m:
        # Self-check line missing/malformed -- fall back to headline/body only.
        m2 = re.search(r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*)", raw, re.DOTALL)
        if not m2:
            return "", raw.strip(), ""
        return m2.group(1).strip(), m2.group(2).strip(), ""
    return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()


def write_native_plain(client: "genai.Client", story: dict) -> None:
    prompt = build_plain_prompt(story)
    print(f"\n{'=' * 20} NATIVE EN (no JSON, plain text) — {story['slug']} — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    # Deliberately bypasses call_gemini -- it hardcodes response_mime_type="application/json"
    # regardless of schema, which would defeat the point of this test.
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    raw = response.text or ""
    if not raw:
        print(f"[{story['slug']}] ERROR: no response", file=sys.stderr)
        return
    headline, body, self_check = parse_plain(raw)
    actual = len(body.split())
    print(f"\n{'=' * 20} NATIVE EN (no JSON, plain text) — {story['slug']} — RESULT ({actual} words, self-reported: {self_check or 'none given'}) {'=' * 20}\n")
    print(f"Headline: {headline}\n")
    print(body)


if __name__ == "__main__":
    genai_client = genai.Client()
    write_native_plain(genai_client, TRUMP_STORY)
    write_native_plain(genai_client, JENSEN_STORY)
