import Foundation
import Observation

@Observable
final class AppStore {

  // ── Languages ──────────────────────────────────────────────────────────────
  var languages: [LanguagePreference] = AppStore.loadLanguages()

  var activeLanguages: [LanguagePreference] { languages.filter(\.active) }

  func toggleLanguage(_ code: String) {
    guard let i = languages.firstIndex(where: { $0.code == code }) else { return }
    languages[i].active.toggle()
    saveLanguages()
  }

  func setLevel(_ level: String, for code: String) {
    guard let i = languages.firstIndex(where: { $0.code == code }) else { return }
    languages[i].level = level
    saveLanguages()
  }

  func setReadLength(_ length: ReadLength, for code: String) {
    guard let i = languages.firstIndex(where: { $0.code == code }) else { return }
    languages[i].readLength = length
    saveLanguages()
  }

  func moveLanguage(from source: IndexSet, to destination: Int) {
    languages.move(fromOffsets: source, toOffset: destination)
    saveLanguages()
  }

  // ── Topics ─────────────────────────────────────────────────────────────────
  var topics: [Topic] = AppStore.loadTopics()

  func toggleTopic(_ id: String) {
    guard let i = topics.firstIndex(where: { $0.id == id }) else { return }
    topics[i].active.toggle()
    saveTopics()
  }

  // ── Daily briefing ─────────────────────────────────────────────────────────
  var bundle:        DailyBundle? = nil
  var isLoading:     Bool         = false
  var loadError:     String?      = nil

  func fetchBriefing() async {
    guard !isLoading else { return }
    isLoading = true
    loadError = nil
    do {
      let b = try await BriefingService.fetchBundle()
      await MainActor.run { bundle = b; isLoading = false }
    } catch {
      await MainActor.run {
        loadError = errorMessage(error)
        isLoading = false
      }
    }
  }

  func briefing(for lang: LanguagePreference) -> GeneratedBriefing? {
    bundle?.briefings[lang.code]?[lang.level]?[lang.readLength.rawValue]
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  private static func loadLanguages() -> [LanguagePreference] {
    guard let data = UserDefaults.standard.data(forKey: "languages"),
          let saved = try? JSONDecoder().decode([LanguagePreference].self, from: data)
    else { return allLanguages }

    // Merge saved prefs with the canonical list (handles new languages added later)
    return allLanguages.map { lang in
      saved.first(where: { $0.code == lang.code }) ?? lang
    }
  }

  private func saveLanguages() {
    try? UserDefaults.standard.set(JSONEncoder().encode(languages), forKey: "languages")
  }

  private static func loadTopics() -> [Topic] {
    guard let saved = UserDefaults.standard.stringArray(forKey: "activeTopics") else {
      return defaultTopics
    }
    return defaultTopics.map { t in
      var copy = t; copy.active = saved.contains(t.id); return copy
    }
  }

  private func saveTopics() {
    UserDefaults.standard.set(topics.filter(\.active).map(\.id), forKey: "activeTopics")
  }
}

private func errorMessage(_ error: Error) -> String {
  switch error {
  case BriefingServiceError.notPublished: return "Today's briefing isn't ready yet — check back after 06:30."
  case BriefingServiceError.network:      return "Can't reach the server. Check your connection."
  case BriefingServiceError.http(let s): return "Server error (HTTP \(s))."
  default:                               return "Something went wrong. Pull to refresh."
  }
}
