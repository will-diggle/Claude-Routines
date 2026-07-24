import type { LanguageCode } from '../store/useSettingsStore';

type WeatherGroup = 'clear' | 'partlyCloudy' | 'overcast' | 'rain' | 'snow' | 'storm';
type PhraseTier = 'beginner' | 'intermediate' | 'advanced';

// WMO code → phrase group
export function weatherGroup(code: number): WeatherGroup {
  if (code <= 1)                        return 'clear';
  if (code <= 3)                        return 'partlyCloudy';
  if (code <= 48)                       return 'overcast';
  if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 71 && code <= 86)         return 'snow';
  return 'storm';
}

// Level string → phrase complexity tier
export function phraseTier(level: string): PhraseTier {
  if (level === 'A1' || level === 'A2') return 'beginner';
  if (level === 'B1' || level === 'B2') return 'intermediate';
  return 'advanced';
}

const PHRASES: Record<LanguageCode, Record<WeatherGroup, Record<PhraseTier, string>>> = {
  en: {
    clear: {
      beginner:     'The sky is clear today.',
      intermediate: 'Today is a bright, sunny day with clear blue skies.',
      advanced:     'A cloudless sky promises a magnificent day with abundant sunshine.',
    },
    partlyCloudy: {
      beginner:     'It is partly cloudy today.',
      intermediate: 'There are some clouds today, but it should stay dry.',
      advanced:     'Partial cloud cover drifts across an otherwise pleasant day.',
    },
    overcast: {
      beginner:     'The sky is grey and cloudy.',
      intermediate: 'It is overcast today with low cloud and possible fog.',
      advanced:     'A heavy overcast shrouds the day in a dull, grey mantle.',
    },
    rain: {
      beginner:     'It is raining today.',
      intermediate: 'Expect rain throughout the day. Don\'t forget your umbrella.',
      advanced:     'Persistent rainfall sweeps across the region, bringing a thoroughly wet day.',
    },
    snow: {
      beginner:     'It is snowing today.',
      intermediate: 'Snow is falling today. Wrap up warm and take care on icy roads.',
      advanced:     'A blanket of snow descends, transforming the landscape into a silent, white world.',
    },
    storm: {
      beginner:     'There is a storm today.',
      intermediate: 'Thunderstorms are expected today. Stay indoors if you can.',
      advanced:     'Severe thunderstorms are forecast, with lightning and heavy downpours set to batter the region.',
    },
  },
  de: {
    clear: {
      beginner:     'Der Himmel ist heute klar.',
      intermediate: 'Heute ist ein strahlend sonniger Tag mit blauem Himmel.',
      advanced:     'Ein wolkenloser Himmel verspricht einen herrlichen Tag mit reichlich Sonnenschein.',
    },
    partlyCloudy: {
      beginner:     'Es ist heute teilweise bewölkt.',
      intermediate: 'Es gibt heute einige Wolken, aber es bleibt wahrscheinlich trocken.',
      advanced:     'Vereinzelte Wolken ziehen über einen sonst angenehmen Tag hinweg.',
    },
    overcast: {
      beginner:     'Der Himmel ist grau und bewölkt.',
      intermediate: 'Es ist heute bedeckt mit tiefen Wolken und möglichem Nebel.',
      advanced:     'Eine dichte Wolkendecke hüllt den Tag in ein trübes, graues Gewand.',
    },
    rain: {
      beginner:     'Es regnet heute.',
      intermediate: 'Den ganzen Tag ist Regen zu erwarten. Vergiss deinen Regenschirm nicht.',
      advanced:     'Anhaltender Regen zieht über die Region und bringt einen durch und durch nassen Tag.',
    },
    snow: {
      beginner:     'Es schneit heute.',
      intermediate: 'Heute fällt Schnee. Zieht euch warm an und fahrt vorsichtig auf glatten Straßen.',
      advanced:     'Eine Schneedecke senkt sich herab und verwandelt die Landschaft in eine stille, weiße Welt.',
    },
    storm: {
      beginner:     'Heute gibt es ein Gewitter.',
      intermediate: 'Heute sind Gewitter zu erwarten. Bleib nach Möglichkeit drinnen.',
      advanced:     'Schwere Gewitter sind angekündigt, mit Blitzen und heftigen Schauern, die die Region treffen werden.',
    },
  },
  fr: {
    clear: {
      beginner:     'Le ciel est dégagé aujourd\'hui.',
      intermediate: 'Aujourd\'hui est une journée ensoleillée avec un ciel bleu.',
      advanced:     'Un ciel sans nuages annonce une superbe journée baignée de soleil.',
    },
    partlyCloudy: {
      beginner:     'Il est partiellement nuageux aujourd\'hui.',
      intermediate: 'Il y a quelques nuages aujourd\'hui, mais il devrait rester sec.',
      advanced:     'Des nuages épars traversent un ciel par ailleurs agréable.',
    },
    overcast: {
      beginner:     'Le ciel est gris et nuageux.',
      intermediate: 'Le ciel est couvert aujourd\'hui avec de possibles brouillards.',
      advanced:     'Un épais couvert nuageux enveloppe la journée d\'un voile gris terne.',
    },
    rain: {
      beginner:     'Il pleut aujourd\'hui.',
      intermediate: 'Attendez-vous à de la pluie toute la journée. N\'oubliez pas votre parapluie.',
      advanced:     'Des pluies persistantes balaient la région, apportant une journée résolument humide.',
    },
    snow: {
      beginner:     'Il neige aujourd\'hui.',
      intermediate: 'Il neige aujourd\'hui. Couvrez-vous bien et faites attention sur les routes verglacées.',
      advanced:     'Un manteau de neige descend, transformant le paysage en un monde blanc et silencieux.',
    },
    storm: {
      beginner:     'Il y a de l\'orage aujourd\'hui.',
      intermediate: 'Des orages sont prévus aujourd\'hui. Restez à l\'intérieur si possible.',
      advanced:     'De violents orages sont annoncés, avec éclairs et fortes averses sur la région.',
    },
  },
  sv: {
    clear: {
      beginner:     'Himlen är klar idag.',
      intermediate: 'Idag är det en solig dag med en klar blå himmel.',
      advanced:     'En molnfri himmel lovar en underbar dag med gott om solsken.',
    },
    partlyCloudy: {
      beginner:     'Det är delvis molnigt idag.',
      intermediate: 'Det finns några moln idag men det bör förbli torrt.',
      advanced:     'Spridda moln driftar över en i övrigt behaglig dag.',
    },
    overcast: {
      beginner:     'Himlen är grå och molnig.',
      intermediate: 'Det är mulet idag med låga moln och eventulig dimma.',
      advanced:     'Ett tjockt molntäcke sveper in dagen i ett dystert, grått skimmer.',
    },
    rain: {
      beginner:     'Det regnar idag.',
      intermediate: 'Räkna med regn under hela dagen. Glöm inte ditt paraply.',
      advanced:     'Ihållande regn sveper över regionen och medför en genomvåt dag.',
    },
    snow: {
      beginner:     'Det snöar idag.',
      intermediate: 'Snö faller idag. Klä dig varmt och var försiktig på isiga vägar.',
      advanced:     'Ett snötäcke lägger sig ned och förvandlar landskapet till en tyst, vit värld.',
    },
    storm: {
      beginner:     'Det är oväder idag.',
      intermediate: 'Åskväder förväntas idag. Stanna inomhus om du kan.',
      advanced:     'Kraftiga oväder är prognosticerade med åska och kraftiga skyfall över regionen.',
    },
  },
  it: {
    clear: {
      beginner:     'Il cielo è sereno oggi.',
      intermediate: 'Oggi è una giornata soleggiata con cielo azzurro limpido.',
      advanced:     'Un cielo senza nuvole preannuncia una magnifica giornata ricca di sole.',
    },
    partlyCloudy: {
      beginner:     'È parzialmente nuvoloso oggi.',
      intermediate: 'Ci sono alcune nuvole oggi, ma dovrebbe restare asciutto.',
      advanced:     'Nuvole sparse percorrono un cielo altrimenti gradevole.',
    },
    overcast: {
      beginner:     'Il cielo è grigio e nuvoloso.',
      intermediate: 'Oggi è coperto con nuvole basse e possibile nebbia.',
      advanced:     'Un pesante cielo coperto avvolge la giornata in un cupo manto grigio.',
    },
    rain: {
      beginner:     'Oggi piove.',
      intermediate: 'Aspettatevi pioggia per tutto il giorno. Non dimenticare l\'ombrello.',
      advanced:     'Piogge persistenti si abbattono sulla regione portando una giornata decisamente bagnata.',
    },
    snow: {
      beginner:     'Oggi nevica.',
      intermediate: 'Oggi cade la neve. Copriti bene e fai attenzione sulle strade ghiacciate.',
      advanced:     'Un manto di neve scende trasformando il paesaggio in un mondo bianco e silenzioso.',
    },
    storm: {
      beginner:     'Oggi c\'è un temporale.',
      intermediate: 'Sono previsti temporali oggi. Resta al chiuso se puoi.',
      advanced:     'Forti temporali sono previsti con fulmini e rovesci intensi sulla regione.',
    },
  },
  es: {
    clear: {
      beginner:     'El cielo está despejado hoy.',
      intermediate: 'Hoy es un día soleado con cielo azul despejado.',
      advanced:     'Un cielo sin nubes promete un día magnífico con abundante sol.',
    },
    partlyCloudy: {
      beginner:     'Está parcialmente nublado hoy.',
      intermediate: 'Hay algunas nubes hoy, pero debería mantenerse seco.',
      advanced:     'Nubes dispersas cruzan un cielo por lo demás agradable.',
    },
    overcast: {
      beginner:     'El cielo está gris y nublado.',
      intermediate: 'Hoy el cielo está cubierto con nubes bajas y posible niebla.',
      advanced:     'Un espeso manto nuboso envuelve el día en una sombría capa gris.',
    },
    rain: {
      beginner:     'Hoy llueve.',
      intermediate: 'Se espera lluvia durante todo el día. No olvides el paraguas.',
      advanced:     'Lluvias persistentes barren la región trayendo un día completamente húmedo.',
    },
    snow: {
      beginner:     'Hoy nieva.',
      intermediate: 'Hoy cae nieve. Abrígate bien y ten cuidado en los caminos helados.',
      advanced:     'Un manto de nieve desciende transformando el paisaje en un mundo blanco y silencioso.',
    },
    storm: {
      beginner:     'Hoy hay tormenta.',
      intermediate: 'Se esperan tormentas hoy. Quédate en casa si puedes.',
      advanced:     'Se pronostican fuertes tormentas con rayos y lluvias torrenciales sobre la región.',
    },
  },
  tr: {
    clear: {
      beginner:     'Gökyüzü bugün açık.',
      intermediate: 'Bugün mavi gökyüzüyle güneşli bir gün.',
      advanced:     'Bulutsuz bir gökyüzü, bol güneşli muhteşem bir gün vaat ediyor.',
    },
    partlyCloudy: {
      beginner:     'Bugün parçalı bulutlu.',
      intermediate: 'Bugün bazı bulutlar var ama kuru kalması bekleniyor.',
      advanced:     'Dağınık bulutlar, keyifli bir günün gökyüzünü hafifçe kaplıyor.',
    },
    overcast: {
      beginner:     'Gökyüzü gri ve bulutlu.',
      intermediate: 'Bugün alçak bulutlar ve olası sis ile kapalı bir hava var.',
      advanced:     'Yoğun bir bulut örtüsü, günü kasvetli ve gri bir perde içine alıyor.',
    },
    rain: {
      beginner:     'Bugün yağmur yağıyor.',
      intermediate: 'Gün boyunca yağmur bekleniyor. Şemsiyeni unutma.',
      advanced:     'Sürekli yağmur bölgeyi süpürüyor ve tamamen ıslak bir gün getiriyor.',
    },
    snow: {
      beginner:     'Bugün kar yağıyor.',
      intermediate: 'Bugün kar yağıyor. Sıcak giyinin ve buzlu yollarda dikkatli olun.',
      advanced:     'Kar örtüsü iniyor ve manzarayı sessiz, beyaz bir dünyaya dönüştürüyor.',
    },
    storm: {
      beginner:     'Bugün fırtına var.',
      intermediate: 'Bugün gök gürültülü fırtına bekleniyor. Mümkünse içeride kal.',
      advanced:     'Şiddetli fırtınalar öngörülüyor; yıldırım ve şiddetli yağışlar bölgeyi dövecek.',
    },
  },
  hu: {
    clear: {
      beginner:     'Az ég ma tiszta.',
      intermediate: 'Ma napos nap van kék éggel.',
      advanced:     'A felhőtlen égbolt gyönyörű, napsütéses napot ígér.',
    },
    partlyCloudy: {
      beginner:     'Ma részben felhős.',
      intermediate: 'Néhány felhő van ma, de száraz maradhat az idő.',
      advanced:     'Szórványos felhők úsznak át egy egyébként kellemes napon.',
    },
    overcast: {
      beginner:     'Az ég szürke és felhős.',
      intermediate: 'Ma borult az ég, alacsony felhőkkel és esetleges köddel.',
      advanced:     'Sűrű felhőzet borul a napra, melankolikus szürke lepelként.',
    },
    rain: {
      beginner:     'Ma esik az eső.',
      intermediate: 'Egész nap esőre kell számítani. Ne felejtsd otthon az esernyődet.',
      advanced:     'Tartós eső söpör végig a régión, teljesen esős napot hozva.',
    },
    snow: {
      beginner:     'Ma havazik.',
      intermediate: 'Ma hó esik. Öltözz melegen és légy óvatos a jeges utakon.',
      advanced:     'Hótakaró ereszkedik le, és fehér, csendes világgá változtatja a tájat.',
    },
    storm: {
      beginner:     'Ma vihar van.',
      intermediate: 'Ma zivatarra kell számítani. Ha lehet, maradj bent.',
      advanced:     'Súlyos zivatarok várhatók, villámlással és heves esőzéssel a régió felett.',
    },
  },
  ar: {
    clear: {
      beginner:     'السماء صافية اليوم.',
      intermediate: 'اليوم يوم مشمس مع سماء زرقاء صافية.',
      advanced:     'سماء خالية من الغيوم تعد بيوم رائع مليء بأشعة الشمس.',
    },
    partlyCloudy: {
      beginner:     'الجو غائم جزئياً اليوم.',
      intermediate: 'هناك بعض الغيوم اليوم، لكن يبدو أنه سيبقى جافاً.',
      advanced:     'غيوم متفرقة تجتاز سماء يوم لطيف من جهات أخرى.',
    },
    overcast: {
      beginner:     'السماء رمادية وملبدة بالغيوم.',
      intermediate: 'الجو ملبد اليوم مع غيوم منخفضة وضباب محتمل.',
      advanced:     'غطاء سحابي كثيف يلف اليوم في رداء رمادي كئيب.',
    },
    rain: {
      beginner:     'تمطر اليوم.',
      intermediate: 'يُتوقع مطر طوال اليوم. لا تنسَ مظلتك.',
      advanced:     'أمطار غزيرة ومستمرة تجتاح المنطقة، مما يجلب يوماً ممطراً تماماً.',
    },
    snow: {
      beginner:     'يتساقط الثلج اليوم.',
      intermediate: 'يتساقط الثلج اليوم. ارتدِ ملابس دافئة وكن حذراً على الطرق الجليدية.',
      advanced:     'غطاء من الثلج ينحدر محولاً المشهد إلى عالم أبيض صامت.',
    },
    storm: {
      beginner:     'الجو عاصف اليوم.',
      intermediate: 'من المتوقع عواصف رعدية اليوم. ابقَ في المنزل إذا استطعت.',
      advanced:     'تُتوقع عواصف رعدية شديدة مع برق وأمطار غزيرة ستضرب المنطقة.',
    },
  },
};

export function getWeatherPhrase(
  code: number,
  language: LanguageCode,
  level: string,
): string {
  const group = weatherGroup(code);
  const tier  = phraseTier(level);
  return PHRASES[language]?.[group]?.[tier] ?? PHRASES.en[group][tier];
}

// Layer toggle labels translated per language
export const LAYER_LABELS: Partial<Record<LanguageCode, {
  precipitation: string;
  temperature:   string;
  wind:          string;
  clouds:        string;
}>> = {
  en: { precipitation: 'Precipitation', temperature: 'Temperature', wind: 'Wind',     clouds: 'Clouds'          },
  de: { precipitation: 'Niederschlag',  temperature: 'Temperatur',  wind: 'Wind',     clouds: 'Bewölkung'       },
  fr: { precipitation: 'Précipitations',temperature: 'Température', wind: 'Vent',     clouds: 'Nuages'          },
  sv: { precipitation: 'Nederbörd',     temperature: 'Temperatur',  wind: 'Vind',     clouds: 'Moln'            },
  it: { precipitation: 'Precipitazioni',temperature: 'Temperatura', wind: 'Vento',    clouds: 'Nuvole'          },
  es: { precipitation: 'Precipitación', temperature: 'Temperatura', wind: 'Viento',   clouds: 'Nubes'           },
  tr: { precipitation: 'Yağış',         temperature: 'Sıcaklık',   wind: 'Rüzgar',   clouds: 'Bulutlar'        },
  hu: { precipitation: 'Csapadék',      temperature: 'Hőmérséklet',wind: 'Szél',     clouds: 'Felhők'          },
  ar: { precipitation: 'هطول',          temperature: 'درجة الحرارة',wind: 'رياح',    clouds: 'سحب'             },
};
