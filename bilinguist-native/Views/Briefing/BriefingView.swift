import SwiftUI

struct BriefingView: View {
  @Environment(AppStore.self) var store

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {

        // Masthead
        Text("Bilinguist Brief")
          .font(.custom("TimesNewRomanPS-BoldMT", size: 32))
          .padding(.top, 16)
          .padding(.bottom, 8)

        Divider()

        if store.isLoading {
          ProgressView()
            .padding(.top, 80)

        } else if let error = store.loadError {
          VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
              .font(.system(size: 40))
              .foregroundStyle(.secondary)
            Text(error)
              .multilineTextAlignment(.center)
              .foregroundStyle(.secondary)
            Button("Try Again") { Task { await store.fetchBriefing() } }
              .buttonStyle(.bordered)
          }
          .padding(.top, 80)
          .padding(.horizontal, 32)

        } else if store.activeLanguages.isEmpty {
          VStack(spacing: 12) {
            Image(systemName: "globe")
              .font(.system(size: 40))
              .foregroundStyle(.secondary)
            Text("Turn on a language in Preferences to see your briefing.")
              .multilineTextAlignment(.center)
              .foregroundStyle(.secondary)
          }
          .padding(.top, 80)
          .padding(.horizontal, 32)

        } else {
          ForEach(store.activeLanguages) { lang in
            if let briefing = store.briefing(for: lang) {
              LanguageSectionView(lang: lang, briefing: briefing)
              Divider().padding(.vertical, 8)
            }
          }
        }

        // Bottom padding so last article isn't hidden behind pills
        Color.clear.frame(height: 120)
      }
    }
    .refreshable { await store.fetchBriefing() }
    .task { if store.bundle == nil { await store.fetchBriefing() } }
  }
}

// ── Per-language section ──────────────────────────────────────────────────────

struct LanguageSectionView: View {
  let lang:     LanguagePreference
  let briefing: GeneratedBriefing

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Section header
      HStack(spacing: 8) {
        Text(lang.flag)
          .font(.system(size: 22))
        Text(lang.nativeName)
          .font(.headline)
        Spacer()
        Text(lang.level)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)

      Divider()

      ForEach(briefing.articles) { article in
        ArticleView(article: article, lang: lang)
        Divider().padding(.leading, 16)
      }
    }
  }
}

// ── Single article ────────────────────────────────────────────────────────────

struct ArticleView: View {
  let article: BriefingArticle
  let lang:    LanguagePreference

  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(article.headline)
        .font(.system(size: 17, weight: .semibold))
        .padding(.horizontal, 16)
        .padding(.top, 12)

      Text(article.body)
        .font(.system(size: 15))
        .lineSpacing(3)
        .lineLimit(expanded ? nil : 4)
        .padding(.horizontal, 16)

      if !expanded {
        Button("Read more") { withAnimation { expanded = true } }
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(.secondary)
          .padding(.horizontal, 16)
      }
    }
    .padding(.bottom, 12)
    .contentShape(Rectangle())
    .onTapGesture { withAnimation { expanded.toggle() } }
  }
}
