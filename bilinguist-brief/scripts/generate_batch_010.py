#!/usr/bin/env python3
"""Generate Italian dictionary entries for batch 010."""

import json

entries = [
    {
        "language": "it",
        "word": "evento",
        "lemma": "evento",
        "word_type": "noun",
        "translation": "event, happening, occurrence",
        "level": "A1",
        "ipa": "eˈvɛn.to",
        "explanation": "A thing that happens or takes place, especially one of importance.",
        "example_sentence": "L'evento è stato cancellato a causa del maltempo.",
        "example_translation": "The event was cancelled due to bad weather.",
        "tip": "Masculine noun. Common in news contexts.",
        "word_family": "eventuale, eventualità, eventualmente",
        "common_collocations": "evento importante, evento pubblico, evento sportivo, evento culturale",
        "governed_prepositions": None,
        "data": {
            "gender": "m",
            "article_definite": "l'",
            "article_indefinite": "un",
            "singular": "evento",
            "plural": "eventi"
        }
    },
    {
        "language": "it",
        "word": "fabbrica",
        "lemma": "fabbrica",
        "word_type": "noun",
        "translation": "factory, mill, plant",
        "level": "A1",
        "ipa": "ˈfab.bri.ka",
        "explanation": "A building or group of buildings where goods are manufactured or assembled.",
        "example_sentence": "Mio padre lavora in una fabbrica di automobili.",
        "example_translation": "My father works in a car factory.",
        "tip": "Feminine noun. Very common in industrial/economic contexts.",
        "word_family": "fabbricante, fabbricazione, fabbricare",
        "common_collocations": "fabbrica di automobili, fabbrica di tessuti, fabbrica chiusa, fabbrica abbandonata",
        "governed_prepositions": "lavorare in una fabbrica (to work in a factory)",
        "data": {
            "gender": "f",
            "article_definite": "la",
            "article_indefinite": "una",
            "singular": "fabbrica",
            "plural": "fabbriche"
        }
    },
    {
        "language": "it",
        "word": "falda",
        "lemma": "falda",
        "word_type": "noun",
        "translation": "fold, flap, slope, layer, stratum, hem",
        "level": "B1",
        "ipa": "ˈfal.da",
        "explanation": "Multiple meanings: (1) a fold or flap of fabric; (2) the slope of a mountain; (3) a layer of rock or soil (geological); (4) a skirt or hem.",
        "example_sentence": "Le falde della montagna erano coperte di neve.",
        "example_translation": "The slopes of the mountain were covered with snow.",
        "tip": "Feminine noun. Has multiple technical/specialized meanings.",
        "word_family": "falda acquifera, falda freatica",
        "common_collocations": "falda di montagna, falda acquifera, falda freatica, falda di roccia",
        "governed_prepositions": None,
        "data": {
            "gender": "f",
            "article_definite": "la",
            "article_indefinite": "una",
            "singular": "falda",
            "plural": "falde"
        }
    },
    {
        "language": "it",
        "word": "fascia",
        "lemma": "fascia",
        "word_type": "noun",
        "translation": "band, strip, belt, bandage, sash",
        "level": "A2",
        "ipa": "ˈfaʃ.ʃa",
        "explanation": "A long strip of material worn around the body; also a strip of anything wrapped or bound around something else.",
        "example_sentence": "Una fascia di stoffa era legata intorno alla vita.",
        "example_translation": "A strip of cloth was tied around the waist.",
        "tip": "Feminine noun. Very common in fashion and medical contexts.",
        "word_family": "fasciare, fasciatura",
        "common_collocations": "fascia intorno alla vita, fascia per il dolore, fascia ortopedica, fascia tricolore",
        "governed_prepositions": "fascia intorno a (strip around)",
        "data": {
            "gender": "f",
            "article_definite": "la",
            "article_indefinite": "una",
            "singular": "fascia",
            "plural": "fasce"
        }
    },
    {
        "language": "it",
        "word": "fascino",
        "lemma": "fascino",
        "word_type": "noun",
        "translation": "charm, fascination, allure, appeal",
        "level": "A2",
        "ipa": "faʃˈtʃi.no",
        "explanation": "The quality of being attractive or interesting; a strong attraction or charm.",
        "example_sentence": "Il fascino della musica classica è universale.",
        "example_translation": "The charm of classical music is universal.",
        "tip": "Masculine noun. Often used in literary or poetic contexts.",
        "word_family": "fascinare, fascinato, fascinante",
        "common_collocations": "fascino del passato, fascino della natura, fascino personale, esercitare fascino",
        "governed_prepositions": "fascino di/per (charm of/for)",
        "data": {
            "gender": "m",
            "article_definite": "il",
            "article_indefinite": "un",
            "singular": "fascino",
            "plural": "fascini"
        }
    },
    {
        "language": "it",
        "word": "feretro",
        "lemma": "feretro",
        "word_type": "noun",
        "translation": "coffin, bier, casket",
        "level": "B1",
        "ipa": "feˈrɛ.tro",
        "explanation": "A coffin or casket for a dead body; the wooden box in which a corpse is placed for burial.",
        "example_sentence": "Il feretro fu portato lentamente verso la chiesa.",
        "example_translation": "The coffin was slowly carried toward the church.",
        "tip": "Masculine noun. Formal/ceremonial term used in funeral contexts.",
        "word_family": None,
        "common_collocations": "feretro coperto di fiori, feretro di legno, portare il feretro",
        "governed_prepositions": None,
        "data": {
            "gender": "m",
            "article_definite": "il",
            "article_indefinite": "un",
            "singular": "feretro",
            "plural": "feretri"
        }
    },
    {
        "language": "it",
        "word": "fermare",
        "lemma": "fermare",
        "word_type": "verb",
        "translation": "to stop, to halt, to arrest, to detain",
        "level": "A1",
        "ipa": "ferˈma.re",
        "explanation": "To cause something or someone to cease moving or functioning; to interrupt motion.",
        "example_sentence": "Ferma l'auto! C'è un semaforo rosso.",
        "example_translation": "Stop the car! There's a red light.",
        "tip": "Regular -ARE verb. Very common in everyday speech.",
        "word_family": "fermata, fermato, fermatura, fermo",
        "common_collocations": "fermare l'auto, fermare il tempo, fermare qualcuno, fermare la macchina",
        "governed_prepositions": None,
        "data": {
            "is_regular": True,
            "auxiliary": "avere",
            "is_reflexive": False,
            "past_participle": "fermato",
            "present_participle": "fermando",
            "PRESENTE": {
                "io": "fermo",
                "tu": "fermi",
                "lui/lei": "ferma",
                "noi": "fermiamo",
                "voi": "fermate",
                "loro": "fermano"
            },
            "PASSATO_PROSSIMO": {
                "io": "ho fermato",
                "tu": "hai fermato",
                "lui/lei": "ha fermato",
                "noi": "abbiamo fermato",
                "voi": "avete fermato",
                "loro": "hanno fermato"
            },
            "IMPERFETTO": {
                "io": "fermavo",
                "tu": "fermavi",
                "lui/lei": "fermava",
                "noi": "fermavamo",
                "voi": "fermavate",
                "loro": "fermavano"
            },
            "PASSATO_REMOTO": {
                "io": "fermai",
                "tu": "fermasti",
                "lui/lei": "fermò",
                "noi": "fermammo",
                "voi": "fermaste",
                "loro": "fermarono"
            },
            "FUTURO": {
                "io": "fermerò",
                "tu": "fermerai",
                "lui/lei": "fermerà",
                "noi": "fermeremo",
                "voi": "fermerete",
                "loro": "fermeranno"
            },
            "CONDIZIONALE": {
                "io": "fermerei",
                "tu": "fermeresti",
                "lui/lei": "fermerebbe",
                "noi": "fermeremmo",
                "voi": "fermereste",
                "loro": "fermerebbero"
            },
            "CONGIUNTIVO_PRESENTE": {
                "io": "fermi",
                "tu": "fermi",
                "lui/lei": "fermi",
                "noi": "fermiamo",
                "voi": "fermiate",
                "loro": "fermino"
            }
        }
    },
    {
        "language": "it",
        "word": "ferroviario",
        "lemma": "ferroviario",
        "word_type": "adjective",
        "translation": "railway, railroad (adjective)",
        "level": "A2",
        "ipa": "fer.roˈvjaː.rjo",
        "explanation": "Relating to or connected with railways or railroads.",
        "example_sentence": "La linea ferroviaria collega Roma a Milano.",
        "example_translation": "The railway line connects Rome to Milan.",
        "tip": "Adjective. Often used with 'linea' (line), 'stazione' (station), 'trasporto' (transport).",
        "word_family": "ferrovia, ferroviere",
        "common_collocations": "linea ferroviaria, stazione ferroviaria, trasporto ferroviario, rete ferroviaria",
        "governed_prepositions": None,
        "data": {
            "masculine": "ferroviario",
            "feminine": "ferroviaria",
            "comparative": "più ferroviario",
            "superlative": "il più ferroviario"
        }
    },
    {
        "language": "it",
        "word": "figura",
        "lemma": "figura",
        "word_type": "noun",
        "translation": "figure, shape, form, character, face",
        "level": "A1",
        "ipa": "fiˈɡu.ra",
        "explanation": "The form or outline of a person or object; a representation of a human form; a character or personality.",
        "example_sentence": "Una figura umana si muoveva nell'ombra.",
        "example_translation": "A human figure was moving in the shadow.",
        "tip": "Feminine noun. Very common in art, literature, and everyday language.",
        "word_family": "figurare, figurato, figurazione, configurare",
        "common_collocations": "figura umana, figura geometrica, bella figura, figura centrale, figura di un quadro",
        "governed_prepositions": None,
        "data": {
            "gender": "f",
            "article_definite": "la",
            "article_indefinite": "una",
            "singular": "figura",
            "plural": "figure"
        }
    },
    {
        "language": "it",
        "word": "finanziare",
        "lemma": "finanziare",
        "word_type": "verb",
        "translation": "to finance, to fund, to provide funding for",
        "level": "B1",
        "ipa": "finan.tˈsjaː.re",
        "explanation": "To provide money or credit for a project, business, or activity.",
        "example_sentence": "La banca ha deciso di finanziare il nuovo progetto.",
        "example_translation": "The bank decided to finance the new project.",
        "tip": "Regular -ARE verb. Common in business and financial contexts.",
        "word_family": "finanziamento, finanziato, finanziatore, finanziario",
        "common_collocations": "finanziare un progetto, finanziare un'impresa, finanziare una ricerca, finanziare l'energia rinnovabile",
        "governed_prepositions": "finanziare con (to finance with), finanziare da (to finance from)",
        "data": {
            "is_regular": True,
            "auxiliary": "avere",
            "is_reflexive": False,
            "past_participle": "finanziato",
            "present_participle": "finanziando",
            "PRESENTE": {
                "io": "finanzio",
                "tu": "finanzi",
                "lui/lei": "finanzia",
                "noi": "finanziaamo",
                "voi": "finanziate",
                "loro": "finanziano"
            },
            "PASSATO_PROSSIMO": {
                "io": "ho finanziato",
                "tu": "hai finanziato",
                "lui/lei": "ha finanziato",
                "noi": "abbiamo finanziato",
                "voi": "avete finanziato",
                "loro": "hanno finanziato"
            },
            "IMPERFETTO": {
                "io": "finanziavo",
                "tu": "finanziavi",
                "lui/lei": "finanziava",
                "noi": "finanziavamo",
                "voi": "finanziavate",
                "loro": "finanziavano"
            },
            "PASSATO_REMOTO": {
                "io": "finanziai",
                "tu": "finanziasti",
                "lui/lei": "finanziò",
                "noi": "finanzammo",
                "voi": "finanziaste",
                "loro": "finanziarono"
            },
            "FUTURO": {
                "io": "finanzierò",
                "tu": "finanzierai",
                "lui/lei": "finanzierà",
                "noi": "finanzieremo",
                "voi": "finanzierete",
                "loro": "finanzieranno"
            },
            "CONDIZIONALE": {
                "io": "finanzierai",
                "tu": "finanzieresti",
                "lui/lei": "finanzierebbe",
                "noi": "finanzieremmo",
                "voi": "finanziereste",
                "loro": "finanzierebbe"
            },
            "CONGIUNTIVO_PRESENTE": {
                "io": "finanzi",
                "tu": "finanzi",
                "lui/lei": "finanzi",
                "noi": "finanziaamo",
                "voi": "finanziate",
                "loro": "finanzino"
            }
        }
    },
    {
        "language": "it",
        "word": "flusso",
        "lemma": "flusso",
        "word_type": "noun",
        "translation": "flow, flux, stream, current",
        "level": "A2",
        "ipa": "ˈflus.so",
        "explanation": "The continuous movement of a liquid, gas, or energy in a particular direction; the rate at which something flows.",
        "example_sentence": "Il flusso dell'acqua era molto forte dopo la pioggia.",
        "example_translation": "The flow of water was very strong after the rain.",
        "tip": "Masculine noun. Common in scientific and technical contexts.",
        "word_family": "flusso sanguigno, flusso migratorio, afflusso, deflusso",
        "common_collocations": "flusso dell'acqua, flusso di traffico, flusso sanguigno, flusso migratorio, flusso di dati",
        "governed_prepositions": "flusso di (flow of)",
        "data": {
            "gender": "m",
            "article_definite": "il",
            "article_indefinite": "un",
            "singular": "flusso",
            "plural": "flussi"
        }
    }
]

# Write to JSON file
output_file = "/Users/willdiggle/claude-routines/bilinguist-brief/scripts/output/generated_oldonly/it/batch_010.json"
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)

print(f"Generated {len(entries)} entries in {output_file}")
