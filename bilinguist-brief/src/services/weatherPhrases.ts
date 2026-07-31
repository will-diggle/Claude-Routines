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

// ── Weather rich headline ─────────────────────────────────────────────────────
// Assembled from pre-made template parts + live weather data.  No AI involved.
//
// Output example (en, morning, weekday):
//   "Good morning! Today in London, expect light rain with highs of 14°C and
//    lows of 9°C. Have a lovely day!"

type TOD = 'morning' | 'afternoon' | 'evening';

function todForHour(h: number): TOD {
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function isWeekend(): boolean {
  const d = new Date().getDay(); // 0=Sun … 6=Sat
  return d === 0 || d === 6 || (d === 5 && new Date().getHours() >= 18);
}

type Tier = 'basic' | 'mid' | 'advanced';

function levelToTier(level: string): Tier {
  if (level === 'A1' || level === 'A2') return 'basic';
  if (level === 'B1' || level === 'B2') return 'mid';
  return 'advanced';
}

// ─── Number → words (0–120 + negatives for temperatures) ─────────────────────

function _en(n: number): string {
  const o = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
              'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const t = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  if (n <= 19) return o[n];
  if (n === 100) return 'one hundred';
  const [td, u] = [Math.floor(n / 10), n % 10];
  return u === 0 ? t[td] : `${t[td]}-${o[u]}`;
}
function _fr(n: number): string {
  const o = ['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix',
              'onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  if (n <= 19) return o[n];
  if (n === 100) return 'cent';
  if (n <= 69) { const [td,u]=[Math.floor(n/10),n%10]; const b=['','','vingt','trente','quarante','cinquante','soixante'][td]; return u===0?b:u===1?`${b} et un`:`${b}-${o[u]}`; }
  if (n <= 79) { const sub=n-60; return sub===11?'soixante et onze':`soixante-${o[sub]}`; }
  if (n <= 89) { const u=n-80; return u===0?'quatre-vingts':`quatre-vingt-${o[u]}`; }
  return `quatre-vingt-${o[n-80]}`;
}
function _de(n: number): string {
  const o = ['null','ein','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn',
              'elf','zwölf','dreizehn','vierzehn','fünfzehn','sechzehn','siebzehn','achtzehn','neunzehn'];
  const t = ['','','zwanzig','dreißig','vierzig','fünfzig','sechzig','siebzig','achtzig','neunzig'];
  if (n === 0) return 'null';
  if (n <= 19) return o[n];
  if (n === 100) return 'hundert';
  const [td,u]=[Math.floor(n/10),n%10];
  return u===0?t[td]:`${o[u]}und${t[td]}`;
}
function _es(n: number): string {
  const sp: Record<number,string> = {0:'cero',1:'uno',2:'dos',3:'tres',4:'cuatro',5:'cinco',6:'seis',7:'siete',8:'ocho',9:'nueve',
    10:'diez',11:'once',12:'doce',13:'trece',14:'catorce',15:'quince',
    16:'dieciséis',17:'diecisiete',18:'dieciocho',19:'diecinueve',
    20:'veinte',21:'veintiuno',22:'veintidós',23:'veintitrés',24:'veinticuatro',
    25:'veinticinco',26:'veintiséis',27:'veintisiete',28:'veintiocho',29:'veintinueve',100:'cien'};
  if (sp[n]!==undefined) return sp[n];
  const o=['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
  const t=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const [td,u]=[Math.floor(n/10),n%10];
  return u===0?t[td]:`${t[td]} y ${o[u]}`;
}
function _it(n: number): string {
  const sp: Record<number,string> = {0:'zero',1:'uno',2:'due',3:'tre',4:'quattro',5:'cinque',6:'sei',7:'sette',8:'otto',9:'nove',
    10:'dieci',11:'undici',12:'dodici',13:'tredici',14:'quattordici',15:'quindici',
    16:'sedici',17:'diciassette',18:'diciotto',19:'diciannove',
    20:'venti',21:'ventuno',22:'ventidue',23:'ventitre',24:'ventiquattro',
    25:'venticinque',26:'ventisei',27:'ventisette',28:'ventotto',29:'ventinove',
    30:'trenta',40:'quaranta',50:'cinquanta',60:'sessanta',70:'settanta',80:'ottanta',90:'novanta',100:'cento'};
  if (sp[n]!==undefined) return sp[n];
  const o=['','uno','due','tre','quattro','cinque','sei','sette','otto','nove'];
  const t10=Math.floor(n/10)*10; const u=n%10;
  let base=sp[t10]!;
  if (u===1||u===8) base=base.replace(/[aeiou]$/,'');
  return `${base}${o[u]}`;
}
function _sv(n: number): string {
  const o=['noll','ett','två','tre','fyra','fem','sex','sju','åtta','nio','tio',
           'elva','tolv','tretton','fjorton','femton','sexton','sjutton','arton','nitton'];
  const t=['','','tjugo','trettio','fyrtio','femtio','sextio','sjuttio','åttio','nittio'];
  if (n<=19) return o[n];
  if (n===100) return 'hundra';
  const [td,u]=[Math.floor(n/10),n%10];
  return u===0?t[td]:`${t[td]}${o[u]}`;
}
function _tr(n: number): string {
  const o=['sıfır','bir','iki','üç','dört','beş','altı','yedi','sekiz','dokuz','on',
           'on bir','on iki','on üç','on dört','on beş','on altı','on yedi','on sekiz','on dokuz'];
  const t=['','','yirmi','otuz','kırk','elli','altmış','yetmiş','seksen','doksan'];
  if (n<=19) return o[n];
  if (n===100) return 'yüz';
  const [td,u]=[Math.floor(n/10),n%10];
  return u===0?t[td]:`${t[td]} ${o[u]}`;
}
function _hu(n: number): string {
  const o=['nulla','egy','kettő','három','négy','öt','hat','hét','nyolc','kilenc','tíz',
           'tizenegy','tizenkettő','tizenhárom','tizennégy','tizenöt','tizenhat',
           'tizenhét','tizennyolc','tizenkilenc'];
  const t=['','','húsz','harminc','negyven','ötven','hatvan','hetven','nyolcvan','kilencven'];
  if (n<=19) return o[n];
  if (n===100) return 'száz';
  const [td,u]=[Math.floor(n/10),n%10];
  if (td===2&&u>0) return `huszon${o[u]}`;
  return u===0?t[td]:`${t[td]}${o[u]}`;
}
function _ar(n: number): string {
  const sp: Record<number,string> = {0:'صفر',1:'واحد',2:'اثنان',3:'ثلاثة',4:'أربعة',5:'خمسة',6:'ستة',7:'سبعة',8:'ثمانية',9:'تسعة',
    10:'عشرة',11:'أحد عشر',12:'اثنا عشر',13:'ثلاثة عشر',14:'أربعة عشر',15:'خمسة عشر',
    16:'ستة عشر',17:'سبعة عشر',18:'ثمانية عشر',19:'تسعة عشر',
    20:'عشرون',30:'ثلاثون',40:'أربعون',50:'خمسون',60:'ستون',70:'سبعون',80:'ثمانون',90:'تسعون',100:'مئة'};
  if (sp[n]!==undefined) return sp[n];
  const oa: Record<number,string>={1:'واحد',2:'اثنان',3:'ثلاثة',4:'أربعة',5:'خمسة',6:'ستة',7:'سبعة',8:'ثمانية',9:'تسعة'};
  const ta: Record<number,string>={20:'عشرون',30:'ثلاثون',40:'أربعون',50:'خمسون',60:'ستون',70:'سبعون',80:'ثمانون',90:'تسعون'};
  const [t10,u]=[Math.floor(n/10)*10,n%10];
  return `${oa[u]} و${ta[t10]}`;
}

const _NUM: Partial<Record<LanguageCode,(n:number)=>string>> = {
  en:_en,fr:_fr,de:_de,es:_es,it:_it,sv:_sv,tr:_tr,hu:_hu,ar:_ar,
};
const _NEG: Partial<Record<LanguageCode,string>> = {
  en:'minus',fr:'moins',de:'minus',es:'menos',it:'meno',sv:'minus',tr:'eksi',hu:'mínusz',ar:'ناقص',
};

function numToWords(n: number, lang: LanguageCode): string {
  const fn = _NUM[lang] ?? _en;
  const abs = Math.round(Math.abs(n));
  const word = fn(abs);
  return n < 0 ? `${_NEG[lang] ?? 'minus'} ${word}` : word;
}

// Main sentence — {greeting}, {city}, {description}, {high} (words), {low} (words)
const MAIN_TPL: Partial<Record<LanguageCode, Record<Tier, string>>> = {
  en: {
    basic:    "{greeting}. In {city}, the weather today is {description}. It will be {high} degrees at most and {low} degrees at least.",
    mid:      "{greeting}, today in {city}, expect {description} with highs of {high} degrees and lows of {low} degrees.",
    advanced: "{greeting} — {city} is set for {description} today, with temperatures peaking at {high} degrees and dipping to {low} degrees.",
  },
  fr: {
    basic:    "{greeting}. À {city} aujourd'hui : {description}. Maximum {high} degrés, minimum {low} degrés.",
    mid:      "{greeting}, aujourd'hui à {city}, prévoyez {description} avec des maximales de {high} degrés et des minimales de {low} degrés.",
    advanced: "{greeting} — {city} s'apprête à connaître {description} ce jour, avec des températures culminant à {high} degrés et descendant jusqu'à {low} degrés.",
  },
  de: {
    basic:    "{greeting}. In {city} heute: {description}. Höchstens {high} Grad, mindestens {low} Grad.",
    mid:      "{greeting}, heute in {city} gibt es {description} mit Höchstwerten von {high} Grad und Tiefstwerten von {low} Grad.",
    advanced: "{greeting} — {city} erwartet heute {description}, mit Temperaturen, die bis auf {high} Grad steigen und auf {low} Grad sinken können.",
  },
  sv: {
    basic:    "{greeting}. I {city} idag: {description}. Max {high} grader, min {low} grader.",
    mid:      "{greeting}, idag i {city} väntas {description} med max {high} grader och min {low} grader.",
    advanced: "{greeting} — {city} förväntas uppleva {description} idag, med temperaturer som når upp till {high} grader och sjunker till {low} grader.",
  },
  it: {
    basic:    "{greeting}. A {city} oggi: {description}. Massima {high} gradi, minima {low} gradi.",
    mid:      "{greeting}, oggi a {city} il tempo sarà {description} con massime di {high} gradi e minime di {low} gradi.",
    advanced: "{greeting} — {city} si prepara a una giornata di {description}, con temperature che raggiungeranno i {high} gradi e scenderanno fino a {low} gradi.",
  },
  es: {
    basic:    "{greeting}. En {city} hoy: {description}. Máxima {high} grados, mínima {low} grados.",
    mid:      "{greeting}, hoy en {city} se esperan {description} con máximas de {high} grados y mínimas de {low} grados.",
    advanced: "{greeting} — {city} se prepara para {description} hoy, con temperaturas que alcanzarán los {high} grados y descenderán hasta los {low} grados.",
  },
  tr: {
    basic:    "{greeting}. Bugün {city}'de hava: {description}. En yüksek {high} derece, en düşük {low} derece.",
    mid:      "{greeting}, bugün {city}'de {description} bekleniyor, en yüksek {high} derece, en düşük {low} derece.",
    advanced: "{greeting} — {city} bugün {description} yaşayacak; sıcaklıklar {high} dereceye ulaşacak ve {low} dereceye kadar düşecek.",
  },
  hu: {
    basic:    "{greeting}. {city}ban ma: {description}. Maximum {high} fok, minimum {low} fok.",
    mid:      "{greeting}, ma {city}ban {description} várható, maximum {high} fok, minimum {low} fok.",
    advanced: "{greeting} — {city} ma {description} időjárást tapasztal, a hőmérséklet {high} fokig emelkedik és {low} fokra süllyed.",
  },
  ar: {
    basic:    "{greeting}. الطقس في {city} اليوم: {description}. الأعلى {high} درجة، الأدنى {low} درجة.",
    mid:      "{greeting}, اليوم في {city} من المتوقع {description} مع درجات عليا {high} درجة ودنيا {low} درجة.",
    advanced: "{greeting} — تستعد {city} اليوم لـ{description}، مع درجات حرارة تصل إلى {high} درجة وتنخفض إلى {low} درجة.",
  },
};

// Rain/wind addendum — {rain} (word for %), {wind} (word for km/h)
const EXTRA_TPL: Partial<Record<LanguageCode, Record<Tier, string>>> = {
  en: {
    basic:    "There is a {rain} per cent chance of rain. Winds are {wind} kilometres per hour.",
    mid:      "There is a {rain} per cent chance of rain with winds of {wind} kilometres per hour.",
    advanced: "Precipitation probability stands at {rain} per cent, with winds reaching {wind} kilometres per hour.",
  },
  fr: {
    basic:    "Il y a {rain} pour cent de risque de pluie. Vent : {wind} kilomètres par heure.",
    mid:      "Risque de pluie de {rain} pour cent, avec des vents de {wind} kilomètres par heure.",
    advanced: "La probabilité de précipitations s'élève à {rain} pour cent, avec des vents atteignant {wind} kilomètres par heure.",
  },
  de: {
    basic:    "Es gibt {rain} Prozent Regenrisiko. Wind: {wind} Kilometer pro Stunde.",
    mid:      "Es besteht ein {rain}-prozentiges Regenrisiko bei Winden von {wind} Kilometer pro Stunde.",
    advanced: "Die Niederschlagswahrscheinlichkeit liegt bei {rain} Prozent, mit Windgeschwindigkeiten von bis zu {wind} Kilometer pro Stunde.",
  },
  sv: {
    basic:    "Det är {rain} procent chans för regn. Vind: {wind} kilometer i timmen.",
    mid:      "Det finns {rain} procent chans för regn och vindar på {wind} kilometer i timmen.",
    advanced: "Nederbördssannolikheten uppgår till {rain} procent, med vindar som når {wind} kilometer i timmen.",
  },
  it: {
    basic:    "C'è il {rain} per cento di probabilità di pioggia. Vento: {wind} chilometri all'ora.",
    mid:      "C'è il {rain} per cento di probabilità di pioggia con venti di {wind} chilometri all'ora.",
    advanced: "La probabilità di precipitazioni è del {rain} per cento, con venti che raggiungono i {wind} chilometri all'ora.",
  },
  es: {
    basic:    "Hay un {rain} por ciento de probabilidad de lluvia. Viento: {wind} kilómetros por hora.",
    mid:      "Hay un {rain} por ciento de probabilidad de lluvia con vientos de {wind} kilómetros por hora.",
    advanced: "La probabilidad de precipitaciones es del {rain} por ciento, con vientos que alcanzan los {wind} kilómetros por hora.",
  },
  tr: {
    basic:    "Yağmur ihtimali yüzde {rain}. Rüzgar: {wind} kilometre saat.",
    mid:      "Yüzde {rain} yağmur ihtimali ve {wind} kilometre saat rüzgar bekleniyor.",
    advanced: "Yağış olasılığı yüzde {rain} olup rüzgar hızı {wind} kilometre saate ulaşabilir.",
  },
  hu: {
    basic:    "{rain} százalék az esővalószínűség. Szél: {wind} kilométer per óra.",
    mid:      "{rain} százalék az esővalószínűség és {wind} kilométer per óra a szélsebesség.",
    advanced: "A csapadék valószínűsége {rain} százalék, a szél elérheti a {wind} kilométer per óra sebességet.",
  },
  ar: {
    basic:    "احتمال المطر {rain} بالمئة. الرياح: {wind} كيلومتراً في الساعة.",
    mid:      "احتمال هطول المطر {rain} بالمئة مع رياح بسرعة {wind} كيلومتراً في الساعة.",
    advanced: "تبلغ احتمالية التساقط {rain} بالمئة، مع رياح تصل إلى {wind} كيلومتراً في الساعة.",
  },
};

// Farewell phrase — vocabulary scales with level
const FAREWELL_TPL: Partial<Record<LanguageCode, Record<Tier, string>>> = {
  en: { basic: "Have a good {f}.", mid: "Have a lovely {f}.", advanced: "Wishing you a wonderful {f}." },
  fr: { basic: "Bonne {f}.", mid: "Passez un beau {f}.", advanced: "Passez une excellente {f}." },
  de: { basic: "Schönen {f}.", mid: "Genießen Sie den {f}.", advanced: "Ich wünsche Ihnen einen wunderbaren {f}." },
  sv: { basic: "Trevlig {f}.", mid: "Ha en fin {f}.", advanced: "Ha en fantastisk {f}." },
  it: { basic: "Buona {f}.", mid: "Buon {f}.", advanced: "Le auguro una splendida {f}." },
  es: { basic: "Buen {f}.", mid: "Que tengas un buen {f}.", advanced: "Espero que disfrutes de un magnífico {f}." },
  tr: { basic: "İyi {f}.", mid: "İyi {f}.", advanced: "Güzel bir {f} geçirmenizi dilerim." },
  hu: { basic: "Szép {f}.", mid: "Szép {f} kívánunk.", advanced: "Kellemes {f}t kívánunk." },
  ar: { basic: "أتمنى لك {f} سعيداً.", mid: "أتمنى لك {f} رائعاً.", advanced: "أتمنى لك قضاء {f} استثنائي." },
};

// Farewell nouns per language × slot (day / evening / weekend)
const FAREWELL_NOUNS: Record<'day' | 'evening' | 'weekend', Partial<Record<LanguageCode, string>>> = {
  day:     { en:'day',     fr:'journée',         de:'Tag',          sv:'dag',   it:'giornata',        es:'día',            tr:'günler',    hu:'napot',    ar:'يوماً سعيداً' },
  evening: { en:'evening', fr:'soirée',          de:'Abend',        sv:'kväll', it:'serata',          es:'tarde',          tr:'akşamlar',  hu:'estét',    ar:'مساءً جميلاً' },
  weekend: { en:'weekend', fr:'week-end',        de:'Wochenende',   sv:'helg',  it:'fine settimana',  es:'fin de semana',  tr:'hafta sonu',hu:'hétvégét', ar:'نهاية أسبوع رائعة' },
};

function farewellNoun(language: LanguageCode, tod: TOD): string {
  const slot = isWeekend() ? 'weekend' : tod === 'evening' ? 'evening' : 'day';
  return FAREWELL_NOUNS[slot][language] ?? FAREWELL_NOUNS[slot].en!;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), tpl);
}

// "Currently X degrees" sentence, inserted after the main forecast sentence
const CURRENT_TPL: Partial<Record<LanguageCode, string>> = {
  en: "It is currently {current}°C.",
  fr: "Il fait actuellement {current}°C.",
  de: "Aktuell sind es {current} Grad.",
  sv: "Det är för närvarande {current}°C.",
  it: "Attualmente sono {current}°C.",
  es: "Actualmente son {current}°C.",
  tr: "Şu an hava {current}°C.",
  hu: "Jelenleg {current} fok van.",
  ar: "درجة الحرارة الحالية {current}°م.",
};

// Rich phrase (learning text) — vocabulary complexity adapts to the user's level
export function getWeatherRichPhrase(
  city: string,
  description: string,
  greeting: string,
  highTemp: number,
  lowTemp: number,
  rainChance: number,
  windKph: number,
  language: LanguageCode,
  level: string,
  currentTemp?: number,
): string {
  const tier = levelToTier(level);
  const tod = todForHour(new Date().getHours());
  const langTpl = MAIN_TPL[language] ?? MAIN_TPL.en!;
  const main = fill(langTpl[tier], { greeting, city, description, high: numToWords(Math.round(highTemp), language), low: numToWords(Math.round(lowTemp), language) });
  const extraTpl = EXTRA_TPL[language] ?? EXTRA_TPL.en!;
  const extra = fill(extraTpl[tier], { rain: numToWords(Math.round(rainChance), language), wind: numToWords(Math.round(windKph), language) });
  const fwTpl = FAREWELL_TPL[language] ?? FAREWELL_TPL.en!;
  const fw = fill(fwTpl[tier], { f: farewellNoun(language, tod) });
  const currentLine = currentTemp !== undefined && CURRENT_TPL[language]
    ? fill(CURRENT_TPL[language]!, { current: String(Math.round(currentTemp)) })
    : '';
  return [main, currentLine, extra, fw].filter(Boolean).join(' ');
}

// Simple headline — "Today [city] will be [temp]°C with [description]."
const HEADLINE_TEMPLATE: Partial<Record<LanguageCode, string>> = {
  en: 'Today {city} will be {temp}°C with {description}.',
  fr: "Aujourd'hui à {city}, {temp}°C avec {description}.",
  de: 'Heute in {city}: {temp}°C mit {description}.',
  sv: 'Idag i {city}: {temp}°C med {description}.',
  it: 'Oggi a {city}, {temp}°C con {description}.',
  es: 'Hoy en {city}, {temp}°C con {description}.',
  tr: 'Bugün {city}\'de {description} ile {temp}°C olacak.',
  hu: 'Ma {city}ban {temp}°C lesz, {description}.',
  ar: 'اليوم في {city}: {temp}°C مع {description}.',
};

export function getWeatherHeadline(city: string, temp: number, description: string, language: LanguageCode): string {
  const tpl = HEADLINE_TEMPLATE[language] ?? HEADLINE_TEMPLATE.en!;
  return tpl.replace('{city}', city).replace('{temp}', String(temp)).replace('{description}', description);
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
