# Builds the German pages under public/de/ from the English originals, and
# adds the EN | DE switch to both. Re-runnable: it always reads the English
# pages as the source of truth, so layout changes propagate on a re-run.

import os, re, html

PUB = "/home/user/Claude-Routines/willdiggle/public"
DE = os.path.join(PUB, "de")
os.makedirs(DE, exist_ok=True)

PAGES = ["index", "about", "listen", "contact", "teaching"]

# English page -> (German title, German meta description)
META = {
  "index": ("Startseite | Will Diggle Tenor",
    "Der britische Tenor William Diggle ist Ensemblemitglied am Landestheater "
    "Niederbayern. Ausgebildet am Royal College of Music und an der Royal Academy "
    "of Music, gastierte er u. a. bei Opera Australia und The Grange Festival."),
  "about": ("Biografie | Will Diggle Tenor",
    "Biografie des britischen Tenors William Diggle, Ensemblemitglied am "
    "Landestheater Niederbayern."),
  "listen": ("Hören | Will Diggle Tenor",
    "Aufnahmen und Bilder des britischen Tenors William Diggle."),
  "contact": ("Kontakt | Will Diggle Tenor",
    "Nehmen Sie Kontakt mit dem britischen Tenor William Diggle auf – für "
    "Engagements, Konzerte und Anfragen."),
  "teaching": ("Unterricht | Will Diggle Tenor",
    "Gesangsunterricht bei Will Diggle, Leiter von The Studios. Über 10 Jahre "
    "Unterrichtserfahrung in klassischem Gesang, Oper, Pop, Musical und Jazz."),
}

NAV = [("/about", "About", "Über mich"),
       ("/listen", "Listen", "Hören"),
       ("/contact", "Contact", "Kontakt"),
       ("/teaching", "Teaching", "Unterricht")]

# Prose, longest first so no replacement is swallowed by a shorter one.
TEXT = [
 # ── About / home biography ──────────────────────────────────────────────
 ("""Originally from the United Kingdom, William trained at the Royal College of
        Music (Master&rsquo;s, 2017&ndash;2019) and the Royal Academy of Music
        (Bachelor&rsquo;s, 2013&ndash;2017), and is now based in Passau, Germany, where
        he is a member of the ensemble at Landestheater Niederbayern.""",
  """Der aus Gro&szlig;britannien stammende Tenor William Diggle studierte am Royal
        College of Music (Master, 2017&ndash;2019) und an der Royal Academy of Music
        (Bachelor, 2013&ndash;2017). Heute lebt er in Passau und ist Ensemblemitglied
        am Landestheater Niederbayern."""),

 ("""Other notable operatic engagements include Major Domo in <em>The Queen of
        Spades</em> (Tchaikovsky) with Garsington Opera, Alfred in <em>Die
        Fledermaus</em> (Strauss), Beppe in <em>Rita</em> (Donizetti), Neville in
        <em>The Waves</em> (Louis Mander) at the Oslo Opera Festival, the title role in
        Edward Lambert&rsquo;s <em>Buster&rsquo;s Trip</em> at the T&ecirc;te &agrave;
        T&ecirc;te Festival, and Vacuo in Lambert&rsquo;s <em>Masque of Vengeance</em>.
        William has also performed The Voice (<em>Trouble in Tahiti</em>, Bernstein) and
        Tony (<em>West Side Story</em>), and covered Don Ottavio (<em>Don Giovanni</em>,
        Mozart) for Hurn Court Opera, Macduff (<em>Macbeth</em>, Verdi) for Mid Wales
        Opera, as well as Spoletta (<em>Tosca</em>, Puccini) and Aeneas (<em>Dido &amp;
        Aeneas</em>, Purcell) for The Grange Festival.""",
  """Zu weiteren Opernengagements z&auml;hlen der Haushofmeister in <em>Pique Dame</em>
        (Tschaikowsky) bei der Garsington Opera, Alfred in <em>Die Fledermaus</em>
        (Strau&szlig;), Beppe in <em>Rita</em> (Donizetti), Neville in <em>The Waves</em>
        (Louis Mander) beim Oslo Opera Festival, die Titelpartie in Edward Lamberts
        <em>Buster&rsquo;s Trip</em> beim T&ecirc;te-&agrave;-T&ecirc;te-Festival sowie
        Vacuo in Lamberts <em>Masque of Vengeance</em>. Au&szlig;erdem sang er The Voice
        (<em>Trouble in Tahiti</em>, Bernstein) und Tony (<em>West Side Story</em>) und
        war als Cover f&uuml;r Don Ottavio (<em>Don Giovanni</em>, Mozart) an der Hurn
        Court Opera, Macduff (<em>Macbeth</em>, Verdi) bei Mid Wales Opera sowie Spoletta
        (<em>Tosca</em>, Puccini) und Aeneas (<em>Dido &amp; Aeneas</em>, Purcell) beim
        Grange Festival engagiert."""),

 ("""Internationally, William has appeared with Opera Australia at the Sydney
        Opera House in <em>Don Giovanni</em> and <em>La Traviata</em>, and with the New
        Generation Festival in Florence in <em>L&rsquo;elisir d&rsquo;amore</em> and
        <em>Don Giovanni</em>.""",
  """International gastierte William Diggle bei Opera Australia am Sydney Opera House
        in <em>Don Giovanni</em> und <em>La Traviata</em> sowie beim New Generation
        Festival in Florenz in <em>L&rsquo;elisir d&rsquo;amore</em> und
        <em>Don Giovanni</em>."""),

 ("""An experienced concert soloist, William has performed across the UK and
        internationally, including in Moscow and Italy.""",
  """Als erfahrener Konzertsolist trat er in ganz Gro&szlig;britannien und international
        auf, unter anderem in Moskau und in Italien."""),

 ("""In the 2025/26 season, William will perform roles in <em>Eine Nacht in
        Venedig</em> (Strauss), <em>Trial by Jury</em> (Gilbert &amp; Sullivan),
        <em>Gianni Schicchi</em> (Puccini), <em>Turandot</em> (Puccini),
        <em>Parsifal</em> (Wagner), and more.""",
  """In der Spielzeit 2025/26 singt William Diggle unter anderem Partien in
        <em>Eine Nacht in Venedig</em> (Strau&szlig;), <em>Trial by Jury</em>
        (Gilbert &amp; Sullivan), <em>Gianni Schicchi</em> (Puccini),
        <em>Turandot</em> (Puccini) und <em>Parsifal</em> (Wagner)."""),

 # ── Home panel ──────────────────────────────────────────────────────────
 ("""William Diggle is a British tenor based in Passau, Germany, where he is a
          member of the ensemble at Landestheater Niederbayern. William trained at the
          Royal College of Music (Master&rsquo;s, 2017&ndash;2019) and the Royal Academy
          of Music (Bachelor&rsquo;s, 2013&ndash;2017).""",
  """William Diggle ist ein britischer Tenor mit Sitz in Passau und Ensemblemitglied
          am Landestheater Niederbayern. Er studierte am Royal College of Music
          (Master, 2017&ndash;2019) und an der Royal Academy of Music
          (Bachelor, 2013&ndash;2017)."""),

 ("""In the 2025/26 season, William will perform roles in <em>Eine Nacht in
          Venedig</em> (Strauss), <em>Trial by Jury</em> (Gilbert &amp; Sullivan),
          <em>Gianni Schicchi</em> (Puccini), <em>Turandot</em> (Puccini),
          <em>Parsifal</em> (Wagner), and more.""",
  """In der Spielzeit 2025/26 singt er unter anderem Partien in <em>Eine Nacht in
          Venedig</em> (Strau&szlig;), <em>Trial by Jury</em> (Gilbert &amp; Sullivan),
          <em>Gianni Schicchi</em> (Puccini), <em>Turandot</em> (Puccini) und
          <em>Parsifal</em> (Wagner)."""),

 # ── Teaching ────────────────────────────────────────────────────────────
 ("""Outside of performing, Will is also director of
        <a href="https://www.studiosuk.com/" target="_blank" rel="noopener noreferrer">The Studios</a>
        and over 10 years of teaching experience, with his specialty being in Classical
        singing. Will also teaches a full range of styles including Operatic, Pop,
        Musical Theatre, and Jazz. His passion for teaching singing ranges from beginners
        to professional singers and every lesson is tailored to the student&rsquo;s needs
        and desires, helping them to unlock their full potential as a singer.""",
  """Neben seiner T&auml;tigkeit als S&auml;nger leitet Will auch
        <a href="https://www.studiosuk.com/" target="_blank" rel="noopener noreferrer">The Studios</a>
        und verf&uuml;gt &uuml;ber mehr als zehn Jahre Unterrichtserfahrung mit
        Schwerpunkt auf klassischem Gesang. Dar&uuml;ber hinaus unterrichtet er ein
        breites Spektrum an Stilen, darunter Oper, Pop, Musical und Jazz. Er
        unterrichtet vom Anf&auml;nger bis zum professionellen S&auml;nger, und jede
        Stunde wird auf die Bed&uuml;rfnisse und W&uuml;nsche der Schülerinnen und
        Sch&uuml;ler zugeschnitten, um ihr volles s&auml;ngerisches Potenzial zu
        entfalten."""),

 ("""Singing is an incredible skill, it is extremely fun and it also has so many
        other benefits, like mental well-being and self-confidence. Having singing
        lessons is the perfect place to sing to your heart&rsquo;s content in a non
        judgmental setting, where you can feel confident, enjoy what you hear and build
        on the voice that&rsquo;s already inside of you.""",
  """Singen ist eine wunderbare F&auml;higkeit: Es macht gro&szlig;e Freude und bringt
        viele weitere Vorteile mit sich, etwa f&uuml;r das seelische Wohlbefinden und das
        Selbstvertrauen. Der Gesangsunterricht ist der ideale Ort, um in einem
        wertfreien Rahmen nach Herzenslust zu singen, Sicherheit zu gewinnen, Freude an
        der eigenen Stimme zu haben und auf dem aufzubauen, was bereits in Ihnen steckt."""),
]

# Short strings: headings, labels, buttons.
SHORT = [
  ('<h1 class="display title-lg">Biography</h1>', '<h1 class="display title-lg">Biografie</h1>'),
  ('<h1 class="display title-xl">Teaching</h1>', '<h1 class="display title-xl">Unterricht</h1>'),
  ('<h2 class="teaching-sub">Singing Teacher</h2>', '<h2 class="teaching-sub">Gesangslehrer</h2>'),
  ('<h1 class="display title-band">Listen</h1>', '<h1 class="display title-band">Hören</h1>'),
  ('<span class="a">Get in to</span><span class="b">uch</span>',
   '<span class="a">Kontakt auf</span><span class="b">nehmen</span>'),
  ('<h2 class="display title-md" id="about-h">About</h2>',
   '<h2 class="display title-md" id="about-h">Über mich</h2>'),
  ('<h2 class="display title-md" id="contact-h">Get in touch</h2>',
   '<h2 class="display title-md" id="contact-h">Kontakt</h2>'),
  ('>More</a>', '>Mehr</a>'),
  ('>Download CV</a>', '>Lebenslauf (PDF)</a>'),
  ('>Book a Lesson</a>', '>Stunde buchen</a>'),
  ('<p class="teaching-cta">To learn more or to enquire</p>',
   '<p class="teaching-cta">Mehr erfahren oder anfragen</p>'),
  ('First Name <span', 'Vorname <span'),
  ('Last Name <span', 'Nachname <span'),
  ('>Email <span', '>E-Mail <span'),
  ('>Name <span', '>Name <span'),
  ('<label for="phone">Phone</label>', '<label for="phone">Telefon</label>'),
  ('Message <span', 'Nachricht <span'),
  ('>Submit</button>', '>Senden</button>'),
  ('<label>Website<input', '<label>Website<input'),
  ('Skip to main content', 'Zum Inhalt springen'),
  ('alt="Portrait of William Diggle"', 'alt="Porträt von William Diggle"'),
  ('alt="William Diggle in performance"', 'alt="William Diggle bei einem Auftritt"'),
  ('alt="William Diggle performing on stage"', 'alt="William Diggle auf der Bühne"'),
  ('alt="William Diggle on stage in Eine Nacht in Venedig"',
   'alt="William Diggle auf der Bühne in Eine Nacht in Venedig"'),
  ('alt="William Diggle on stage"', 'alt="William Diggle auf der Bühne"'),
  ('alt="William Diggle in costume"', 'alt="William Diggle in Kostüm"'),
  ('alt="William Diggle teaching"', 'alt="William Diggle beim Unterrichten"'),
  ('aria-label="Will Diggle — home"', 'aria-label="Will Diggle – Startseite"'),
  ('aria-label="Menu"', 'aria-label="Menü"'),
  ('WILL DIGGLE 2025 &copy; ALL RIGHTS RESERVED. WEB DESIGN BY AriosoWebs',
   'WILL DIGGLE 2025 &copy; ALLE RECHTE VORBEHALTEN. WEBDESIGN VON AriosoWebs'),
]


def switch(page, lang):
    """The EN | DE control. Each side links to its twin of the current page.

    The ?lang= parameter tells the Worker to remember the choice, so a manual
    pick always beats the country guess. The Worker strips it again."""
    en_href = ("/" if page == "index" else "/%s" % page) + "?lang=en"
    de_href = ("/de/" if page == "index" else "/de/%s" % page) + "?lang=de"
    def part(code, href, active, label):
        if active:
            return ('<span class="lang-current" aria-current="true">%s</span>' % code)
        return ('<a href="%s" hreflang="%s" lang="%s" aria-label="%s">%s</a>'
                % (href, code.lower(), code.lower(), label, code))
    return ('<div class="lang" role="group" aria-label="%s">%s<span class="lang-sep" aria-hidden="true">|</span>%s</div>'
            % ("Sprache / Language",
               part("EN", en_href, lang == "en", "English"),
               part("DE", de_href, lang == "de", "Deutsch")))


def alternates(page):
    en = "https://willdiggle.co.uk" + ("/" if page == "index" else "/%s" % page)
    de = "https://willdiggle.co.uk" + ("/de/" if page == "index" else "/de/%s" % page)
    return ('<link rel="alternate" hreflang="en" href="%s">\n'
            '<link rel="alternate" hreflang="de" href="%s">\n'
            '<link rel="alternate" hreflang="x-default" href="%s">' % (en, de, en))


def add_common(doc, page, lang):
    """Insert the switch and the hreflang links; drop any previous copies."""
    doc = re.sub(r'\s*<div class="lang".*?</div>', '', doc, flags=re.S)
    doc = re.sub(r'\s*<link rel="alternate"[^>]*>', '', doc)

    doc = doc.replace('<link rel="stylesheet" href="/styles.css">',
                      alternates(page) + '\n<link rel="stylesheet" href="/styles.css">')

    # Sits after the nav, before the Instagram icon.
    doc = doc.replace('    <a class="head-social"',
                      '    %s\n    <a class="head-social"' % switch(page, lang), 1)
    return doc


for page in PAGES:
    src = os.path.join(PUB, page + ".html")
    doc = open(src, encoding="utf-8").read()

    # ── English page: just gains the switch and the alternates ──────────
    open(src, "w", encoding="utf-8").write(add_common(doc, page, "en"))

    # ── German twin ─────────────────────────────────────────────────────
    de = doc
    for a, b in TEXT + SHORT:
        if a not in de and a in TEXT:
            continue
        de = de.replace(a, b)

    title, desc = META[page]
    de = re.sub(r"<title>.*?</title>", "<title>%s</title>" % title, de, flags=re.S)
    de = re.sub(r'<meta name="description" content="[^"]*">',
                '<meta name="description" content="%s">' % html.escape(desc, quote=True), de)
    de = re.sub(r'<meta property="og:title" content="[^"]*">',
                '<meta property="og:title" content="%s">' % title, de)
    de = re.sub(r'<meta property="og:description" content="[^"]*">',
                '<meta property="og:description" content="%s">' % html.escape(desc, quote=True), de)
    de = de.replace('<html lang="en">', '<html lang="de">')

    # Point every internal link at its German twin.
    de = de.replace('href="/"', 'href="/de/"')
    for href, en_label, de_label in NAV:
        de = de.replace('href="%s"' % href, 'href="/de%s"' % href)
        de = re.sub(r'(<a href="/de%s"[^>]*>)%s(</a>)' % (re.escape(href), en_label),
                    r"\1%s\2" % de_label, de)

    de = add_common(de, page, "de")
    open(os.path.join(DE, page + ".html"), "w", encoding="utf-8").write(de)

print("English pages updated:", ", ".join(p + ".html" for p in PAGES))
print("German pages written to public/de/:", ", ".join(sorted(os.listdir(DE))))
