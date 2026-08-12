"""
Minimal, standalone A1 + A2 test on Claude Haiku. No fixtures, no factbase, no pipeline
stages -- the same two hardcoded native articles (German, French) used in
test_a1_de_fr.py / test_a2_de_fr.py, rewritten to A1 and A2, printed to stdout.

Uses the real, tuned rewrite prompt (build_rewrite_prompt) exactly as production does --
same prompt text Gemini gets, only the model changes. Forces claude-haiku-4-5 directly
(not via --api claude / WRITER_BACKEND, since these standalone scripts call the API
helpers directly rather than going through main()). 4 Claude calls total.

    python test_a1_a2_de_fr_claude.py
"""

import sys

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


def run(lang: str, level: str, article: dict) -> None:
    prompt = W.build_rewrite_prompt(lang, level, "longer", article)
    print(f"\n{'=' * 20} {lang.upper()} {level} (Claude Haiku) — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_claude(
        W.CLAUDE_MODEL_BEGINNER, prompt, f"test/{lang}-{level}-haiku",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=4096,
    )
    if not raw:
        print(f"[{lang}/{level}] ERROR: no response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw)
    body = (parsed or {}).get("body", "")
    print(f"\n{'=' * 20} {lang.upper()} {level} (Claude Haiku) — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)


if __name__ == "__main__":
    for level in ("A1", "A2"):
        run("de", level, DE_ARTICLE)
        run("fr", level, FR_ARTICLE)
