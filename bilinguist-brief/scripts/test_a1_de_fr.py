"""
Minimal, standalone A1 test. No fixtures, no factbase, no pipeline stages -- just two
hardcoded native articles (German, French) rewritten straight to A1, printed to stdout.

Uses the real, tuned rewrite prompt (build_rewrite_prompt) exactly as production does --
this checks the prompt itself, not a stripped-down variant. 2 Gemini calls total.

    python test_a1_de_fr.py
"""

import sys

from google import genai

import bilinguist_write as W

DE_ARTICLE = {
    "genre": "GLOBAL NEWS",
    "slug": "trump-secret-flight-iran-threat",
    "headline": "Trump soll wegen Morddrohung heimlich Flugzeug gewechselt haben",
    "body": (
        "Donald Trump soll im vergangenen Monat nach einem Nato-Gipfel in Ankara heimlich "
        "das Flugzeug gewechselt haben, um einer als konkret eingestuften Morddrohung aus "
        "dem Iran zu entgehen. Dies geht aus Berichten hervor, die sich auf einen "
        "US-Beamten und bestätigendes Material berufen. Demnach bestieg Trump zunächst vor "
        "Fernsehkameras die reguläre Air Force One. Minuten später sei er jedoch mithilfe "
        "eines Catering-Lastwagens unbemerkt in eine kleinere C-32A-Maschine der "
        "US-Luftwaffe gebracht worden. Dieses Flugzeug flog ihn anschließend nach "
        "Großbritannien. Die größere Air Force One, an Bord der sich Journalisten und "
        "einige Mitarbeiter des Weißen Hauses befanden, diente als Täuschungsmanöver und "
        "flog eine andere Route.\n\n"
        "Durch die Operation sei Trumps tatsächlicher Aufenthaltsort für mehrere Stunden "
        "verschleiert worden, selbst vor einigen hochrangigen Regierungsbeamten. Der "
        "Vorfall ereignete sich vor dem Hintergrund eskalierender Spannungen zwischen den "
        "Vereinigten Staaten und dem Iran. Der Kommunikationsdirektor des Weißen Hauses, "
        "Steven Cheung, beantwortete direkte Fragen zu der Entscheidung für den "
        "Flugzeugwechsel nicht."
    ),
}

FR_ARTICLE = {
    "genre": "GLOBAL NEWS",
    "slug": "trump-secret-flight-iran-threat",
    "headline": "Trump aurait secrètement changé d'avion après une menace iranienne",
    "body": (
        "Donald Trump aurait secrètement changé d'avion le mois dernier en Turquie, à "
        "l'issue d'un sommet de l'OTAN, en raison d'une menace d'assassinat iranienne. "
        "Selon un responsable américain, l'opération a été conçue comme une ruse pour "
        "déjouer ce risque. Après avoir embarqué publiquement à bord de l'avion "
        "présidentiel Air Force One devant les caméras à l'aéroport international "
        "d'Ankara, M. Trump aurait été transféré discrètement vers un appareil militaire "
        "plus petit, un C-32A de l'US Air Force, à l'aide d'un camion de restauration "
        "aéroportuaire. L'avion présidentiel habituel a ensuite servi de leurre, "
        "poursuivant sa route avec à son bord des journalistes et une partie du personnel "
        "de la Maison Blanche.\n\n"
        "Le C-32A a transporté M. Trump vers la Grande-Bretagne, dissimulant sa position "
        "réelle pendant plusieurs heures, y compris à certains hauts fonctionnaires de son "
        "administration. Des sources indiquent que les journalistes et certains membres du "
        "personnel voyageant à bord de l'avion leurre n'étaient pas informés du "
        "changement. Cet incident est survenu dans un contexte d'escalade des hostilités "
        "entre les États-Unis et l'Iran. Interrogé sur la décision de changer d'appareil, "
        "le directeur de la communication de la Maison Blanche, Steven Cheung, n'a pas "
        "directement répondu aux questions."
    ),
}

# Native grade both were actually graded at (needed for the "reduce" cut-rule logic).
W._NATIVE_GRADES = {"de": "C1", "fr": "C1"}


def run(lang: str, article: dict) -> None:
    prompt = W.build_rewrite_prompt(lang, "A1", "longer", article)
    print(f"\n{'=' * 20} {lang.upper()} A1 — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    client = genai.Client()
    raw, finish = W.call_gemini(
        client, W.MODEL_2S, prompt, f"test/{lang}-A1", schema=W._SCHEMA_ARTICLE,
        max_output_tokens=4096,
    )
    if not raw:
        print(f"[{lang}] ERROR: no response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw)
    body = (parsed or {}).get("body", "")
    print(f"\n{'=' * 20} {lang.upper()} A1 — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)


if __name__ == "__main__":
    run("de", DE_ARTICLE)
    run("fr", FR_ARTICLE)
