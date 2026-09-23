import Foundation

// ── Language ──────────────────────────────────────────────────────────────────

typealias LanguageCode = String

struct LanguagePreference: Identifiable, Codable, Equatable {
  var id: String { code }
  let code:       LanguageCode
  let name:       String
  let nativeName: String
  let flag:       String
  var level:      String
  var readLength: ReadLength
  var active:     Bool
}

enum ReadLength: String, Codable { case short, longer }

let allLanguages: [LanguagePreference] = [
  .init(code:"fr", name:"French",            nativeName:"Français",  flag:"🇫🇷", level:"B2",     readLength:.short,  active:false),
  .init(code:"de", name:"German",            nativeName:"Deutsch",   flag:"🇩🇪", level:"A2",     readLength:.short,  active:false),
  .init(code:"sv", name:"Swedish",           nativeName:"Svenska",   flag:"🇸🇪", level:"B2",     readLength:.short,  active:false),
  .init(code:"en", name:"English (British)", nativeName:"English",   flag:"🇬🇧", level:"B2",     readLength:.short,  active:true),
  .init(code:"it", name:"Italian",           nativeName:"Italiano",  flag:"🇮🇹", level:"A1",     readLength:.short,  active:false),
  .init(code:"es", name:"Spanish",           nativeName:"Español",   flag:"🇪🇸", level:"A2",     readLength:.short,  active:false),
  .init(code:"tr", name:"Turkish",           nativeName:"Türkçe",    flag:"🇹🇷", level:"A1",     readLength:.short,  active:false),
  .init(code:"hu", name:"Hungarian",         nativeName:"Magyar",    flag:"🇭🇺", level:"Native", readLength:.short,  active:false),
  .init(code:"ar", name:"Arabic",            nativeName:"العربية",   flag:"🇸🇦", level:"A1",     readLength:.short,  active:false),
]

let levelsByLang: [String: [String]] = [
  "en": ["A1","A2","B1","B2","C1","Native"],
  "fr": ["A1","A2","B1","B2","C1","Native"],
  "de": ["A1","A2","B1","B2","C1","Native"],
  "sv": ["B2","Native"],
  "it": ["A1","A2","B1","B2","C1","Native"],
  "es": ["A2"],
  "tr": ["A1"],
  "hu": ["Native"],
  "ar": ["A1","A2"],
]

// ── Briefing data ─────────────────────────────────────────────────────────────

struct BriefingArticle: Codable, Identifiable {
  var id: String { slug ?? headline }
  let genre:    String
  let slug:     String?
  let headline: String
  let body:     String
}

struct GeneratedBriefing: Codable {
  let articles:    [BriefingArticle]
  let date:        String
  let language:    String
  let level:       String
  let length:      String
  let generatedAt: Double
}

struct DailyBundle: Codable {
  let date:        String
  let generatedAt: Double
  // briefings[lang][level][length]
  let briefings: [String: [String: [String: GeneratedBriefing]]]
}

// ── Topics ────────────────────────────────────────────────────────────────────

struct Topic: Identifiable {
  let id:    String
  let label: String
  var active: Bool
}

let defaultTopics: [Topic] = [
  .init(id:"worldNews",  label:"World News",    active:true),
  .init(id:"business",   label:"Business",      active:true),
  .init(id:"politics",   label:"Politics",      active:true),
  .init(id:"europe",     label:"Europe",        active:true),
  .init(id:"scienceTech",label:"Science & Tech",active:true),
  .init(id:"artsCulture",label:"Arts & Culture",active:false),
  .init(id:"asia",       label:"Asia",          active:false),
  .init(id:"middleEast", label:"Middle East",   active:false),
  .init(id:"africa",     label:"Africa",        active:false),
  .init(id:"goodNews",   label:"Good News",     active:false),
]
