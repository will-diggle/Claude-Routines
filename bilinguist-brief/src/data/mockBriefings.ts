import type { GeneratedBriefing, BriefingArticle, BriefingTeaser } from '../services/anthropic';
import type { LanguageCode, LanguageLevel, BriefingLength } from '../store/useSettingsStore';

type LevelBucket = 'A1' | 'B1' | 'C1';

function getLevelBucket(level: LanguageLevel): LevelBucket {
  if (level === 'A1' || level === 'A2') return 'A1';
  if (level === 'B1' || level === 'B2') return 'B1';
  return 'C1';
}

function getArticleCount(length: BriefingLength): number {
  if (length === 'short') return 2;
  if (length === 'standard') return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// Mock articles — 5 languages × 3 level buckets × 5 articles
// Topics cycle: World News → Good News → Sport → Politics → World News
// ---------------------------------------------------------------------------

const ARTICLES: Record<LanguageCode, Record<LevelBucket, BriefingArticle[]>> = {

  // ── FRENCH ──────────────────────────────────────────────────────────────
  fr: {
    A1: [
      {
        genre: 'World News',
        headline: 'Les chefs du monde se réunissent pour le climat',
        body: 'Les dirigeants de nombreux pays se retrouvent à Paris. Ils parlent du changement climatique. Le climat change partout sur la planète. Ils veulent trouver des solutions pour aider la Terre.',
      },
      {
        genre: 'Good News',
        headline: 'Les médecins trouvent un nouveau médicament',
        body: 'Des médecins en France ont trouvé un nouveau médicament. Ce médicament peut aider beaucoup de personnes malades. Les scientifiques sont très contents. C\'est une très bonne nouvelle pour le monde.',
      },
      {
        genre: 'Sport',
        headline: 'La France gagne le match de football',
        body: 'L\'équipe de France a gagné hier soir. Le score final est deux à un contre l\'Espagne. Les joueurs sont très contents après le match. Les supporters chantent dans les rues de Paris.',
      },
      {
        genre: 'Politics',
        headline: 'Le gouvernement parle des impôts',
        body: 'Le premier ministre parle à la télévision aujourd\'hui. Il dit que les impôts vont changer l\'année prochaine. Il veut aider les familles avec peu d\'argent. Beaucoup de Français écoutent son discours.',
      },
      {
        genre: 'World News',
        headline: 'Une grande tempête frappe le sud de l\'Europe',
        body: 'Il y a une grande tempête en Italie et en Espagne aujourd\'hui. Les vents sont très forts. Beaucoup de personnes doivent quitter leur maison. Les équipes de secours travaillent beaucoup pour aider.',
      },
    ],

    B1: [
      {
        genre: 'World News',
        headline: 'Sommet climatique : les grandes puissances s\'engagent à agir',
        body: 'À Paris, les représentants de quarante pays ont signé hier un accord pour réduire les émissions de carbone d\'ici 2035. La conférence, qui a duré trois jours, a abouti à des engagements concrets sur les énergies renouvelables. Les pays en développement recevront une aide financière pour accélérer leur transition. Cependant, plusieurs ONG estiment que ces mesures restent insuffisantes face à l\'urgence climatique.',
      },
      {
        genre: 'Good News',
        headline: 'Une équipe française développe un vaccin très efficace contre la dengue',
        body: 'Des chercheurs de l\'Institut Pasteur ont annoncé hier des résultats encourageants dans la lutte contre la dengue. Leur nouveau vaccin s\'est révélé efficace à 87 % lors des essais cliniques menés dans quatre pays. Cette avancée pourrait protéger des millions de personnes vivant dans des zones tropicales. Les autorités de santé espèrent une approbation officielle d\'ici deux ans.',
      },
      {
        genre: 'Sport',
        headline: 'Tennis : grand succès français à Roland-Garros',
        body: 'Un joueur français a remporté une victoire spectaculaire lors du troisième tour de Roland-Garros hier après-midi. Après plus de trois heures de jeu, il a battu son adversaire espagnol en cinq sets. Le public parisien lui a réservé un accueil chaleureux sous le soleil de juin. Il affrontera demain un adversaire britannique en huitième de finale.',
      },
      {
        genre: 'Politics',
        headline: 'Le Parlement européen vote sur la réforme des règles d\'asile',
        body: 'Les députés européens ont adopté hier une nouvelle directive sur la gestion des demandes d\'asile. Ce texte modifie les procédures aux frontières extérieures de l\'Union européenne. La France et l\'Allemagne ont voté en faveur du texte, tandis que la Hongrie s\'y est opposée. Les défenseurs des droits humains s\'inquiètent de l\'impact sur les personnes les plus vulnérables.',
      },
      {
        genre: 'World News',
        headline: 'Les États-Unis annoncent de nouvelles sanctions contre la Chine',
        body: 'Washington a annoncé de nouvelles sanctions commerciales contre la Chine, ciblant principalement le secteur des semi-conducteurs. Pékin a immédiatement répondu en convoquant l\'ambassadeur américain au ministère des Affaires étrangères. Les marchés financiers mondiaux ont réagi nerveusement à cette nouvelle. Cette escalade intervient dans un contexte de compétition technologique croissante entre les deux grandes puissances.',
      },
    ],

    C1: [
      {
        genre: 'World News',
        headline: 'L\'accord de Paris revisité : entre ambition affichée et réalisme budgétaire',
        body: 'À l\'issue d\'un sommet marathon dont les négociations se sont prolongées jusqu\'au petit matin, les quarante nations représentées ont finalement paraphé une déclaration commune sur la neutralité carbone qui suscite autant d\'espoir que de scepticisme. Si les délégations occidentales saluent unanimement l\'ambition du texte, les économistes font valoir que les objectifs de réduction fixés impliqueraient une reconversion des filières énergétiques d\'une ampleur sans précédent dans l\'histoire industrielle moderne. Greenpeace dénonce quant à elle une « énième gesticulation diplomatique », faute de mécanismes de sanction contraignants capables de garantir le respect des engagements.',
      },
      {
        genre: 'Good News',
        headline: 'L\'Institut Pasteur franchit un cap décisif dans la lutte mondiale contre la dengue',
        body: 'Publiés ce matin dans The Lancet, les résultats définitifs de la phase III confirment un taux d\'efficacité de 91 % pour le vaccin recombinant anti-dengue de l\'Institut Pasteur sur une cohorte de douze mille volontaires recrutés en Amérique latine et en Asie du Sud-Est. Un résultat qui excède largement les seuils habituels d\'homologation. L\'Agence européenne des médicaments a d\'ores et déjà annoncé l\'ouverture d\'une procédure d\'évaluation accélérée, susceptible d\'aboutir à une autorisation de mise sur le marché d\'ici dix-huit mois — un calendrier ambitieux que les experts en santé publique jugent néanmoins réaliste.',
      },
      {
        genre: 'Sport',
        headline: 'Roland-Garros : une démonstration technique qui ravive le débat sur la génération dorée du tennis français',
        body: 'On ne savait plus si l\'on assistait à un match de tennis ou à un cours magistral de tactique sur terre battue. La victoire en cinq sets décrochée hier en huitième de finale, au terme de trois heures quarante minutes d\'un duel d\'une intensité rare, a suscité une vague d\'enthousiasme que la Porte d\'Auteuil n\'avait pas connue depuis les grandes heures de Noah. La qualité du jeu produit, combinée à une gestion mentale remarquable dans les moments de tension, a relancé le débat sur l\'avenir du tennis français à l\'horizon des prochains Jeux olympiques.',
      },
      {
        genre: 'Politics',
        headline: 'La directive asile divise profondément l\'Union : entre souveraineté nationale et solidarité européenne',
        body: 'Adoptée à une majorité relative de 312 voix contre 274, la nouvelle directive sur les procédures d\'asile aux frontières extérieures de l\'Union représente une inflexion majeure de la politique migratoire européenne, dont les effets concrets restent pourtant difficiles à anticiper. Le texte instaure des zones de traitement accéléré que ses détracteurs assimilent à une forme de rétention déguisée, potentiellement contraire aux engagements de la Convention de Genève. À l\'opposé, les gouvernements d\'Europe centrale y voient le rétablissement d\'une maîtrise des frontières jugée indispensable à la cohésion politique de l\'Union.',
      },
      {
        genre: 'World News',
        headline: 'Guerre économique sino-américaine : l\'ère du découplage technologique ?',
        body: 'L\'extension des restrictions américaines à l\'exportation de puces avancées à une vingtaine d\'entreprises chinoises supplémentaires marque une nouvelle étape dans la rivalité technologique entre les deux premières économies mondiales, dont l\'issue déterminera en grande partie la géographie industrielle du siècle. La réaction de Pékin, inhabituellement tranchante dans la forme, laisse entrevoir l\'adoption de contre-mesures ciblant les matières premières critiques — un domaine où la Chine conserve une position dominante. Plusieurs analystes de premier plan évoquent désormais ouvertement le scénario d\'un découplage technologique complet, aux répercussions que le FMI chiffre à plus d\'un point de PIB mondial sur la prochaine décennie.',
      },
    ],
  },

  // ── GERMAN ──────────────────────────────────────────────────────────────
  de: {
    A1: [
      {
        genre: 'World News',
        headline: 'Viele Länder treffen sich für das Klima',
        body: 'Die Chefs von vielen Ländern kommen nach Paris. Sie sprechen über das Klima. Das Klima auf der Erde wird wärmer. Die Menschen suchen Lösungen für dieses Problem.',
      },
      {
        genre: 'Good News',
        headline: 'Ärzte finden ein neues Medikament',
        body: 'Ärzte in Deutschland haben ein neues Medikament gefunden. Das Medikament kann kranken Menschen helfen. Das ist sehr gut für alle Menschen auf der Welt. Die Forscher sind sehr glücklich.',
      },
      {
        genre: 'Sport',
        headline: 'Deutschland gewinnt das Fußballspiel',
        body: 'Die deutsche Fußballmannschaft hat gestern gewonnen. Das Ergebnis ist zwei zu null gegen England. Die Spieler und die Fans sind sehr glücklich. Sie feiern heute in den Straßen.',
      },
      {
        genre: 'Politics',
        headline: 'Der Bundestag spricht über neue Gesetze',
        body: 'Die Politiker im Bundestag haben heute eine wichtige Debatte. Sie sprechen über neue Steuergesetze. Viele Deutsche schauen die Diskussion im Fernsehen. Die Entscheidung kommt nächste Woche.',
      },
      {
        genre: 'World News',
        headline: 'Ein Erdbeben trifft die Türkei',
        body: 'In der Türkei gibt es heute ein starkes Erdbeben. Viele Häuser sind kaputt. Die Menschen brauchen Hilfe und Wasser. Viele Länder schicken Hilfe in die Türkei.',
      },
    ],

    B1: [
      {
        genre: 'World News',
        headline: 'Klimagipfel in Paris: Industriestaaten einigen sich auf ambitionierte Ziele',
        body: 'Beim internationalen Klimagipfel in Paris haben sich vierzig Staaten auf verbindliche CO₂-Reduktionsziele geeinigt. Die Vereinbarung sieht vor, die Emissionen bis 2035 um dreißig Prozent zu senken. Entwicklungsländer sollen finanzielle Unterstützung erhalten, um den Übergang zu erneuerbaren Energien zu beschleunigen. Umweltverbände begrüßen den Schritt, kritisieren jedoch das Fehlen verbindlicher Sanktionsmechanismen.',
      },
      {
        genre: 'Good News',
        headline: 'Berliner Forscher entwickeln Impfstoff gegen gefährliche Tropenkrankheit',
        body: 'Wissenschaftler der Charité Berlin haben einen vielversprechenden Impfstoff gegen Dengue-Fieber entwickelt. In klinischen Studien mit fünftausend Teilnehmern zeigte das Mittel eine Wirksamkeit von 85 Prozent. Die Forscher hoffen auf eine offizielle Zulassung durch die europäische Arzneimittelbehörde in den nächsten zwei Jahren. Der Impfstoff könnte Millionen von Menschen in tropischen Regionen schützen.',
      },
      {
        genre: 'Sport',
        headline: 'Bundesliga: Bayern München stellt neuen Rekord auf',
        body: 'Bayern München hat gestern Abend mit einem 4:0-Sieg gegen Borussia Dortmund einen neuen Bundesliga-Rekord aufgestellt. Es war der siebte Sieg in Folge in dieser Saison. Der Trainer lobte besonders die Defensivleistung seiner Mannschaft nach dem Spiel. Die Münchner führen die Tabelle nun mit acht Punkten Vorsprung an.',
      },
      {
        genre: 'Politics',
        headline: 'Bundesregierung beschließt Entlastungspaket für Familien und Geringverdiener',
        body: 'Das Kabinett hat gestern ein Entlastungspaket im Umfang von zwölf Milliarden Euro für Familien und Geringverdiener beschlossen. Das Paket umfasst Steuererleichterungen, eine Erhöhung des Kindergeldes und günstigere Kita-Beiträge. Die Maßnahmen sollen zum Jahresbeginn in Kraft treten. Die Opposition kritisiert die Finanzierung als nicht ausreichend durchdacht.',
      },
      {
        genre: 'World News',
        headline: 'USA verhängen neue Handelsschranken gegen China',
        body: 'Die Vereinigten Staaten haben neue Handelssanktionen gegen China angekündigt, die vor allem den Technologiesektor und die Halbleiterindustrie betreffen. Peking reagierte unverzüglich und bestellte den amerikanischen Botschafter ins Außenministerium ein. Analysten warnen vor negativen Auswirkungen auf die globalen Lieferketten. Die Spannungen zwischen den beiden größten Volkswirtschaften der Welt nehmen damit weiter zu.',
      },
    ],

    C1: [
      {
        genre: 'World News',
        headline: 'Pariser Klimagipfel: Historischer Durchbruch oder diplomatische Formelkompromisse?',
        body: 'Nach zähen Verhandlungen, die sich bis in die frühen Morgenstunden hinzogen, unterzeichneten die Vertreter von vierzig Staaten eine gemeinsame Abschlusserklärung zur Klimaneutralität, die ihre Initiatoren als historischen Wendepunkt feiern. Kritischen Beobachtern entgeht indessen nicht, dass das Abkommen über keinerlei verbindliche Sanktionsmechanismen verfügt: Die angestrebten Emissionsreduktionen würden eine Umgestaltung des globalen Energiesystems erfordern, für die kein Unterzeichnerstaat bislang eine belastbare Finanzierungsplanung vorgelegt hat. Greenpeace sprach von einer „weiteren Runde performativer Klimadiplomatie".',
      },
      {
        genre: 'Good News',
        headline: 'Charité-Forscher erzielen Durchbruch bei Dengue-Impfstoff',
        body: 'In einer heute im Fachjournal The Lancet veröffentlichten Studie berichten Wissenschaftler der Charité Berlin von einer Schutzwirksamkeit von 91 Prozent ihres rekombinanten Dengue-Impfstoffs in der abschließenden Phase-III-Prüfung mit zwölftausend Probanden aus Lateinamerika und Südostasien — ein Ergebnis, das die einschlägigen Zulassungshürden deutlich übersteigt. Die Europäische Arzneimittelagentur hat bereits eine beschleunigte Bewertung eingeleitet, die nach Einschätzung von Tropenmedizinern innerhalb von achtzehn Monaten in einer Marktzulassung münden könnte.',
      },
      {
        genre: 'Sport',
        headline: 'Bayerns Rekordserie entfacht Grundsatzdebatte über die Wettbewerbsfähigkeit der Bundesliga',
        body: 'Mit dem siebten Sieg in Folge hat Bayern München nicht allein einen neuen Bundesliga-Rekord aufgestellt, sondern auch eine strukturelle Debatte über die Konzentration wirtschaftlicher Macht im deutschen Fußball neu entfacht. Das 4:0 gegen Borussia Dortmund war weniger ein Kräftemessen auf Augenhöhe als eine Demonstration überlegener Spielkontrolle. Kritiker fordern eine Reform der Einnahmeverteilung in der Liga, um die wachsende Kluft zwischen den Münchner Platzhirschen und dem Rest der Bundesliga nicht weiter anwachsen zu lassen.',
      },
      {
        genre: 'Politics',
        headline: 'Das Zwölf-Milliarden-Paket: sozialpolitischer Meilenstein oder fiskalischer Aktionismus?',
        body: 'Das vom Bundeskabinett verabschiedete Entlastungspaket im Umfang von zwölf Milliarden Euro stellt den bislang umfangreichsten haushaltspolitischen Eingriff der laufenden Legislaturperiode dar und spiegelt den Versuch wider, sozialen Ausgleich und fiskalische Glaubwürdigkeit in Einklang zu bringen. Während Sozialverbände die Anhebung des Kindergeldes und die Begrenzung der Kita-Gebühren als überfällige Korrekturen begrüßen, mahnen Wirtschaftsweise zur Vorsicht bei der Finanzierung über Haushaltsspielräume, die bei näherer Betrachtung äußerst begrenzt erscheinen. Verfassungsrechtler prüfen zudem die Vereinbarkeit einzelner Finanzierungsmodalitäten mit der grundgesetzlichen Schuldenbremse.',
      },
      {
        genre: 'World News',
        headline: 'Technologischer Systemwettbewerb: Washington verschärft Chipexportrestriktionen gegen Peking',
        body: 'Die Ausweitung der amerikanischen Exportbeschränkungen auf zwanzig weitere chinesische Halbleiterunternehmen markiert eine qualitativ neue Eskalationsstufe im technologischen Systemwettbewerb zwischen Washington und Peking, dessen Ausgang die industriellen Kräfteverhältnisse des 21. Jahrhunderts maßgeblich mitbestimmen dürfte. Die chinesische Reaktion fiel ungewöhnlich scharf in Ton und Substanz aus: Außenminister Wang Yi warnte unverhohlen vor „entschlossenen und proportionalen Gegenmaßnahmen" — ein Wortlaut, den Analysten als Anspielung auf die chinesische Dominanz im Bereich der Seltenen Erden deuten. Ökonomen des Brookings Institution sehen die Gefahr eines vollständigen Entkopplungsprozesses, der nach FMI-Schätzungen das Welt-BIP um mehr als einen Prozentpunkt reduzieren würde.',
      },
    ],
  },

  // ── SPANISH ─────────────────────────────────────────────────────────────
  es: {
    A1: [
      {
        genre: 'World News',
        headline: 'Los líderes del mundo hablan sobre el clima',
        body: 'Muchos países se reúnen esta semana en París. Hablan del cambio climático. El planeta necesita ayuda ahora. Los líderes quieren encontrar soluciones para todos.',
      },
      {
        genre: 'Good News',
        headline: 'Los médicos encuentran una nueva medicina',
        body: 'Unos médicos en España han encontrado una nueva medicina. Esta medicina puede ayudar a muchas personas enfermas. Es una noticia muy buena para el mundo. Los científicos están muy contentos.',
      },
      {
        genre: 'Sport',
        headline: 'España gana el partido de fútbol',
        body: 'El equipo de España ganó anoche el partido. El resultado final es tres a uno. Los jugadores celebran con sus familias. Los aficionados cantan en todas las ciudades de España.',
      },
      {
        genre: 'Politics',
        headline: 'El gobierno habla de los impuestos nuevos',
        body: 'El presidente habla hoy en la televisión. Habla de nuevos impuestos para el año próximo. Muchos españoles escuchan su discurso en casa. Los cambios empiezan en enero.',
      },
      {
        genre: 'World News',
        headline: 'Un terremoto grande golpea Turquía',
        body: 'Hay un terremoto muy fuerte en Turquía hoy. Muchas casas están destruidas. Las personas necesitan agua y comida. Muchos países envían ayuda urgente a Turquía.',
      },
    ],

    B1: [
      {
        genre: 'World News',
        headline: 'Cumbre climática: cuarenta países se comprometen a reducir emisiones',
        body: 'En París, los representantes de cuarenta naciones firmaron ayer un acuerdo para reducir las emisiones de carbono antes de 2035. Los debates, que duraron tres días, concluyeron con compromisos concretos sobre energías renovables. Los países en vías de desarrollo recibirán apoyo financiero para acelerar su transición energética. Sin embargo, varios grupos ecologistas afirman que las medidas siguen siendo insuficientes.',
      },
      {
        genre: 'Good News',
        headline: 'Investigadores del CSIC logran avance clave contra el dengue',
        body: 'Un equipo del Consejo Superior de Investigaciones Científicas ha presentado resultados prometedores de su nuevo candidato a vacuna contra la fiebre del dengue. En los ensayos clínicos, el producto mostró una eficacia del 84 % en cinco mil participantes de cuatro países. El hallazgo podría beneficiar a millones de personas en regiones tropicales. Los investigadores esperan la aprobación regulatoria en un plazo de dos años.',
      },
      {
        genre: 'Sport',
        headline: 'La Roja golea a Francia en el estadio Bernabéu',
        body: 'La selección española derrotó ayer a Francia por tres goles a cero en un partido de clasificación para la Eurocopa. Los tres tantos llegaron en la segunda mitad, ante una multitud entregada en el estadio madrileño. El seleccionador destacó la solidez defensiva y la eficacia del ataque durante la rueda de prensa posterior. España lidera ahora su grupo con ocho puntos.',
      },
      {
        genre: 'Politics',
        headline: 'El Congreso inicia el debate sobre la reforma del sistema de pensiones',
        body: 'El Parlamento español comenzó ayer un largo debate sobre la reforma del sistema de pensiones, que afectaría a más de diez millones de jubilados. El Gobierno propone vincular las pensiones al índice de precios al consumo para proteger el poder adquisitivo. Los sindicatos apoyan la medida, mientras que la patronal pide más diálogo antes de cualquier decisión.',
      },
      {
        genre: 'World News',
        headline: 'Tensión creciente entre Estados Unidos y China por el comercio tecnológico',
        body: 'Washington ha anunciado nuevas sanciones comerciales contra Pekín que afectan principalmente al sector de los semiconductores y la inteligencia artificial. China respondió convocando al embajador estadounidense y advirtiendo de posibles contramedidas. Los analistas temen que la escalada perjudique a las cadenas de suministro mundiales. Los mercados financieros reaccionaron con caídas en Asia y Europa.',
      },
    ],

    C1: [
      {
        genre: 'World News',
        headline: 'La cumbre climática de París: ¿inflexión histórica o declaración de intenciones sin anclaje presupuestario?',
        body: 'Tras unas negociaciones que se extendieron hasta el alba, los cuarenta países signatarios del acuerdo de París sobre neutralidad carbónica presentaron el texto como un hito generacional en la gobernanza climática global. El escepticismo, no obstante, brota con igual fuerza: la ausencia de mecanismos de cumplimiento vinculantes pone en entredicho la solidez de los compromisos adquiridos, cuya implementación efectiva exigiría una reconversión del aparato energético mundial a un ritmo y escala sin precedentes en la historia industrial. Greenpeace calificó el acuerdo de «nueva ronda de diplomacia performativa carente de consecuencias».',
      },
      {
        genre: 'Good News',
        headline: 'El CSIC publica resultados «excepcionales» de su vacuna recombinante anti-dengue',
        body: 'La publicación hoy en Nature Medicine de los datos definitivos de fase III sitúa la eficacia protectora de la vacuna del CSIC en el 91 % sobre una cohorte de doce mil voluntarios reclutados en América Latina y el Sudeste Asiático, un resultado que supera con amplitud los umbrales estándar de aprobación regulatoria. La OMS ha anunciado la apertura de un procedimiento de precalificación acelerada que, de culminar favorablemente, permitiría el despliegue del preparado en los países endémicos antes de que concluya la presente década.',
      },
      {
        genre: 'Sport',
        headline: 'La Roja exhibe su poderío táctico: el 3-0 ante Francia va mucho más allá del marcador',
        body: 'El contundente resultado ante Francia en el Bernabéu certifica la consolidación de un modelo de juego que el seleccionador ha ido perfilando con notable paciencia y método a lo largo de los últimos dos años. Lo verdaderamente revelador no fue la diferencia de goles, sino la superioridad táctica con que España controló todas las fases del partido: presión alta sostenida, transiciones rápidas y una compactación defensiva que anuló completamente la creatividad del mediocampo rival. La candidatura española a las próximas competiciones europeas adquiere de este modo una proyección de primer orden.',
      },
      {
        genre: 'Politics',
        headline: 'La reforma de las pensiones abre una grieta de fondo en la coalición gobernante',
        body: 'El inicio del debate parlamentario sobre la reforma del sistema de pensiones ha puesto al descubierto tensiones latentes en el seno de la coalición gobernante, cuyas facciones discrepan tanto sobre el ritmo como sobre el alcance de los cambios previstos. La propuesta de indexación plena al IPC, bien acogida por los sindicatos, choca con las reticencias de Bruselas, que advierte del riesgo que entraña para la sostenibilidad fiscal a largo plazo. El margen de maniobra del Ejecutivo se estrecha adicionalmente por la oposición frontal de los grupos parlamentarios de la derecha.',
      },
      {
        genre: 'World News',
        headline: 'La guerra de los chips: las nuevas restricciones estadounidenses reconfiguran el tablero tecnológico mundial',
        body: 'La decisión de Washington de ampliar las restricciones a la exportación de semiconductores avanzados a veinte empresas chinas adicionales eleva la rivalidad tecnológica entre las dos primeras potencias a un terreno de consecuencias difícilmente reversibles. Pekín respondió con una dureza inusitada, y el portavoz del Ministerio de Asuntos Exteriores advirtió de «represalias enérgicas y proporcionales» sin precisar su contenido, lo que los analistas interpretan como una alusión velada al control chino sobre las materias primas críticas. El FMI cifra el coste de un desacoplamiento tecnológico completo en más de un punto porcentual del PIB mundial en el horizonte de una década.',
      },
    ],
  },

  // ── ITALIAN ─────────────────────────────────────────────────────────────
  it: {
    A1: [
      {
        genre: 'World News',
        headline: 'I leader del mondo si incontrano per il clima',
        body: 'Molti capi di stato vanno a Parigi questa settimana. Parlano del cambiamento climatico. Il pianeta ha bisogno di aiuto adesso. I leader cercano soluzioni insieme.',
      },
      {
        genre: 'Good News',
        headline: 'I medici trovano una nuova medicina importante',
        body: 'Dei medici in Italia hanno trovato una nuova medicina. Questa medicina può aiutare molte persone malate. È una notizia molto buona per tutti. I ricercatori sono molto contenti.',
      },
      {
        genre: 'Sport',
        headline: 'L\'Italia vince il campionato di calcio',
        body: 'La squadra italiana ha vinto ieri sera la partita. Il risultato finale è due a uno contro la Francia. I giocatori festeggiano con i tifosi. È una serata molto felice per tutta l\'Italia.',
      },
      {
        genre: 'Politics',
        headline: 'Il governo parla di nuove tasse',
        body: 'Il presidente del Consiglio parla in televisione oggi. Parla di nuove tasse per il prossimo anno. Molti italiani guardano il suo discorso in televisione. Le nuove regole iniziano a gennaio.',
      },
      {
        genre: 'World News',
        headline: 'Un terremoto colpisce la Turchia',
        body: 'C\'è un forte terremoto in Turchia questa mattina. Molte case sono distrutte. Le persone hanno bisogno di acqua e cibo. L\'Italia e altri paesi mandano aiuti urgenti.',
      },
    ],

    B1: [
      {
        genre: 'World News',
        headline: 'Vertice sul clima: quaranta nazioni firmano un accordo per ridurre le emissioni',
        body: 'A Parigi, i rappresentanti di quaranta paesi hanno firmato ieri un accordo per ridurre le emissioni di carbonio entro il 2035. I negoziati, durati tre giorni, si sono conclusi con impegni concreti sulle energie rinnovabili. I paesi in via di sviluppo riceveranno sostegno finanziario per accelerare la loro transizione. Tuttavia, diverse organizzazioni ambientaliste ritengono che le misure siano ancora insufficienti.',
      },
      {
        genre: 'Good News',
        headline: 'Ricercatori dell\'Università di Bologna sviluppano vaccino contro la dengue',
        body: 'Un gruppo di ricercatori dell\'Università di Bologna ha annunciato risultati molto promettenti nello sviluppo di un vaccino contro la febbre dengue. Il vaccino ha mostrato un\'efficacia dell\'86 % nei test clinici condotti su cinquemila partecipanti. La scoperta potrebbe proteggere milioni di persone nelle regioni tropicali del mondo. Gli scienziati sperano di ottenere l\'approvazione ufficiale nei prossimi due anni.',
      },
      {
        genre: 'Sport',
        headline: 'Serie A: il Milan conquista il derby contro l\'Inter',
        body: 'Il Milan ha battuto l\'Inter per due a uno nel derby della Madonnina giocato ieri sera a San Siro. I gol sono arrivati entrambi nella ripresa, davanti a settantamila tifosi. L\'allenatore rossonero ha elogiato la prestazione corale della squadra durante la conferenza stampa. Il Milan sale ora al secondo posto in classifica.',
      },
      {
        genre: 'Politics',
        headline: 'La Camera avvia il dibattito sulla riforma fiscale del governo',
        body: 'La Camera dei deputati ha avviato ieri il dibattito sulla riforma fiscale proposta dal governo. Il provvedimento prevede una riduzione delle aliquote IRPEF per i redditi medio-bassi e nuove agevolazioni per le famiglie. Le opposizioni chiedono maggiori garanzie per i lavoratori autonomi e pensionati. Il voto finale è atteso entro la fine del mese.',
      },
      {
        genre: 'World News',
        headline: 'Tensioni commerciali crescenti tra Stati Uniti e Cina',
        body: 'Washington ha annunciato nuove sanzioni commerciali nei confronti della Cina, che colpiscono principalmente il settore dei semiconduttori e della tecnologia avanzata. Pechino ha risposto convocando l\'ambasciatore americano al Ministero degli Esteri. Gli analisti temono un impatto negativo sulle catene di approvvigionamento globali. I mercati finanziari hanno reagito con cali generalizzati in Asia.',
      },
    ],

    C1: [
      {
        genre: 'World News',
        headline: 'L\'accordo di Parigi sul clima: svolta storica o illusione diplomatica priva di vincoli?',
        body: 'Dopo trattative estenuanti protrattesi fino all\'alba, i quaranta paesi partecipanti al vertice climatico di Parigi hanno siglato una dichiarazione congiunta sulla neutralità carbonica che i suoi promotori definiscono di portata storica. L\'assenza di meccanismi sanzionatori vincolanti alimenta tuttavia seri interrogativi sull\'effettiva implementazione degli impegni: raggiungere gli obiettivi di riduzione stabiliti imporrebbe una riconversione del sistema energetico mondiale a un ritmo e a un\'ampiezza senza precedenti nella storia industriale. Greenpeace ha definito il testo «l\'ennesima operazione di diplomazia performativa».',
      },
      {
        genre: 'Good News',
        headline: 'Bologna: il vaccino anti-dengue supera la fase III con risultati straordinari',
        body: 'Il team di ricerca dell\'Università di Bologna pubblica oggi su The Lancet i dati conclusivi della sperimentazione di fase III del proprio vaccino ricombinante contro la dengue, con un\'efficacia protettiva del 91 % su una coorte di dodicimila volontari reclutati in America Latina e nel Sud-Est asiatico — un risultato che supera ampiamente le soglie standard di approvazione regolatoria. L\'OMS ha già avviato la procedura di prequalificazione accelerata, aprendo la prospettiva concreta di un\'autorizzazione all\'immissione in commercio entro diciotto mesi.',
      },
      {
        genre: 'Sport',
        headline: 'Il derby di Milano rilancia il Milan nella corsa al titolo e riapre i grandi dibattiti tattici',
        body: 'Più che un semplice derby, quello andato in scena ieri sera a San Siro ha assunto i contorni di uno spartiacque nella lotta per lo scudetto: il Milan, con un convincente 2-1 sull\'Inter, accorcia le distanze dalla vetta e manda un segnale inequivocabile alla concorrenza. La prestazione individuale e collettiva della squadra rossonera ha innescato un vivace dibattito tra gli addetti ai lavori sul modello di gioco che il tecnico ha saputo costruire e consolidare nel corso di una stagione caratterizzata da ostacoli significativi.',
      },
      {
        genre: 'Politics',
        headline: 'La riforma fiscale alla Camera: tra imperativo redistributivo e vincoli di bilancio',
        body: 'L\'avvio del dibattito parlamentare sulla riforma dell\'IRPEF mette a nudo le contraddizioni di una maggioranza che stenta a trovare una sintesi coerente tra istanze redistributive e rigore di bilancio. Il taglio delle aliquote per i redditi medio-bassi, presentato dal governo come misura a favore dei ceti produttivi, è contestato dall\'opposizione che denuncia la mancata copertura degli oneri previsti. Il Senato dovrà esprimersi entro sessanta giorni, in un clima politico segnato dalla prossimità delle scadenze elettorali.',
      },
      {
        genre: 'World News',
        headline: 'La guerra dei chip: le restrizioni americane segnano una svolta nel confronto tecnologico con Pechino',
        body: 'L\'estensione delle restrizioni statunitensi all\'export di semiconduttori avanzati a venti nuove aziende cinesi sancisce un\'ulteriore e significativa escalation nella competizione tecnologica tra le due prime potenze mondiali, i cui esiti ridisegneranno la mappa industriale del XXI secolo. La risposta di Pechino, insolitamente dura nella forma e nella sostanza, prefigura l\'adozione di contromisure nel settore delle materie prime critiche, in cui la Cina mantiene una posizione dominante e difficilmente scalfibile. Il FMI avverte che un processo di disaccoppiamento tecnologico completo ridurrebbe il PIL mondiale di oltre un punto percentuale nel corso del prossimo decennio.',
      },
    ],
  },

  // ── ENGLISH ─────────────────────────────────────────────────────────────
  en: {
    A1: [
      {
        genre: 'World News',
        headline: 'World leaders meet in Paris to talk about the climate',
        body: 'Many countries come together in Paris this week. They talk about climate change. The planet needs help right now. The leaders want to find solutions for everyone.',
      },
      {
        genre: 'Good News',
        headline: 'Doctors find a new medicine that can help many people',
        body: 'Doctors in the UK have found a new medicine. This medicine can help sick people get better. It is very good news for the whole world. The scientists are very happy about this.',
      },
      {
        genre: 'Sport',
        headline: 'England wins the big football match',
        body: 'The England team won last night. The final score is two to one against Germany. The players are very happy after the game. The fans celebrate in the streets of London.',
      },
      {
        genre: 'Politics',
        headline: 'The Prime Minister talks about new tax plans',
        body: 'The Prime Minister speaks on television today. He talks about new taxes for next year. Many British people watch his speech at home. The changes will start in January.',
      },
      {
        genre: 'World News',
        headline: 'A big earthquake hits Turkey',
        body: 'There is a strong earthquake in Turkey today. Many houses are damaged or destroyed. People need water, food and shelter. Many countries are sending help to Turkey quickly.',
      },
    ],

    B1: [
      {
        genre: 'World News',
        headline: 'Climate summit: forty nations commit to cutting emissions by 2035',
        body: 'At the international climate summit in Paris, forty countries have signed a landmark agreement to reduce carbon emissions by thirty per cent before 2035. The three-day negotiations concluded with concrete commitments on renewable energy investment. Developing nations will receive financial support to speed up their energy transition. However, several environmental groups argue that the pledges still fall short of what the science demands.',
      },
      {
        genre: 'Good News',
        headline: 'British scientists develop highly effective dengue fever vaccine',
        body: 'Researchers at the Wellcome Sanger Institute have announced promising results in the fight against dengue fever. Their experimental vaccine proved 86% effective in trials involving five thousand volunteers across four countries. The breakthrough could protect millions of people in tropical regions who currently have no reliable protection against the disease. Scientists hope to gain regulatory approval within two years.',
      },
      {
        genre: 'Sport',
        headline: 'Premier League: Arsenal extend title lead with dominant Chelsea victory',
        body: 'Arsenal secured a comfortable 3-1 victory over Chelsea at the Emirates Stadium last night, extending their lead at the top of the Premier League to five points. Two goals from Bukayo Saka and one from Gabriel Martinelli sealed the points in front of a full house. Manager Mikel Arteta praised his side\'s composure and tactical discipline after the final whistle. Arsenal next face Manchester City on Sunday.',
      },
      {
        genre: 'Politics',
        headline: 'Parliament debates sweeping reform of England\'s planning system',
        body: 'MPs began debating a major overhaul of England\'s planning rules yesterday, which would fast-track approval for thousands of new homes in areas of high demand. The government says the changes are essential to tackle the housing crisis affecting millions of young people. Critics argue that the reforms give property developers too much power at the expense of local communities and green spaces.',
      },
      {
        genre: 'World News',
        headline: 'US-China trade tensions escalate over semiconductor exports',
        body: 'The United States has announced new trade restrictions against China targeting the semiconductor and advanced technology sectors. Beijing responded swiftly, summoning the American ambassador and warning of retaliatory measures. Analysts fear the dispute could disrupt global supply chains and weigh on world economic growth. Stock markets in Asia and Europe fell sharply following the announcement.',
      },
    ],

    C1: [
      {
        genre: 'World News',
        headline: 'The Paris climate accord: a generational breakthrough or another exercise in diplomatic theatre?',
        body: 'After marathon negotiations that stretched into the early hours, forty nations signed a joint declaration on carbon neutrality that its architects are billing as a once-in-a-generation advance in global climate governance. The sceptics have a point, however: the accord lacks any binding enforcement mechanism, and the emissions reductions it envisions would require an energy transition of a scale and speed that no signatory government has yet backed with credible fiscal commitments. Environmental groups, predictably split on the outcome, range from cautious optimism to outright denunciation of what Greenpeace called "another round of performative diplomacy with no consequences".',
      },
      {
        genre: 'Good News',
        headline: 'Sanger Institute dengue vaccine achieves landmark phase III results',
        body: 'A paper published today in The Lancet reports a 91% protective efficacy for the Wellcome Sanger Institute\'s recombinant dengue vaccine in a phase III trial spanning twelve thousand participants across Latin America and South-East Asia — a result that comfortably clears the regulatory bar. The WHO has announced it will initiate an expedited prequalification process, which could see the vaccine deployed in endemic countries within eighteen months. Tropical medicine specialists are already describing the findings as the most significant advance in vector-borne disease prevention in a generation.',
      },
      {
        genre: 'Sport',
        headline: 'Arsenal\'s title credentials are now beyond serious doubt after Chelsea dismantled',
        body: 'If there were any lingering doubts about Arsenal\'s credentials as genuine title contenders, last night\'s 3-1 evisceration of Chelsea ought to have resolved them comprehensively. Arteta\'s side did not merely win; they imposed themselves tactically, physically and psychologically on a Chelsea team that has spent extravagantly and continues to look rudderless. Saka\'s brace, exhibiting the composure under pressure that has become his hallmark this season, prompted the inevitable debate among post-match pundits about whether he has now displaced Marcus Rashford as England\'s most dangerous attacking asset.',
      },
      {
        genre: 'Politics',
        headline: 'Planning reform: bold liberalisation or the systematic dismantling of community oversight?',
        body: 'The planning reform bill that began its Commons passage yesterday has managed the unusual feat of uniting the house-building industry, certain Nimby-aligned backbenchers and a broad coalition of environmental groups — albeit in entirely contradictory positions. The government insists that stripping away layers of local discretionary power is the only credible response to a housing crisis that has rendered homeownership a statistical improbability for the under-forties. Its opponents contend, with some force, that the bill effectively transfers sovereign planning decisions from elected councils to a developer class whose interests are structurally misaligned with those of the communities they build in.',
      },
      {
        genre: 'World News',
        headline: 'The semiconductor war: Washington\'s latest export curbs reshape the global technology landscape',
        body: 'The administration\'s decision to extend export restrictions on advanced chips to a further twenty Chinese entities has pushed the technology cold war between Washington and Beijing into territory whose consequences may prove difficult to reverse. Beijing\'s response was notably sharper in register than previous protestations, with the foreign ministry for the first time explicitly linking potential counter-measures to Chinese dominance in critical rare earth minerals — a domain where the asymmetry of leverage is decidedly not in Washington\'s favour. Analysts at Brookings warn that sustained escalation risks triggering precisely the full technological decoupling that both sides have until now professed to wish to avoid, a scenario the IMF estimates could carve more than a percentage point from global GDP over the coming decade.',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getMockBriefing(
  language: LanguageCode,
  level: LanguageLevel,
  length: BriefingLength,
  isFreeUser: boolean = false
): GeneratedBriefing {
  const bucket = getLevelBucket(level);
  const allArticles = ARTICLES[language]?.[bucket] ?? ARTICLES.en.B1;
  const count = getArticleCount(length);

  if (isFreeUser) {
    const featured = allArticles[0];
    const teasers: BriefingTeaser[] = allArticles.slice(1).map((a) => ({
      genre: a.genre,
      headline: a.headline,
      teaser: a.body.slice(0, 130) + '…',
    }));
    return {
      language,
      level,
      articles: [featured],
      teasers,
      isFree: true,
      date: new Date().toISOString().split('T')[0],
      generatedAt: Date.now(),
    };
  }

  return {
    language,
    level,
    articles: allArticles.slice(0, count),
    date: new Date().toISOString().split('T')[0],
    generatedAt: Date.now(),
  };
}
