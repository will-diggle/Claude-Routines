import SwiftUI

// ── Tab model ─────────────────────────────────────────────────────────────────

enum AppTab: String, CaseIterable {
  case preferences, briefing, practice

  var title:     String { rawValue.capitalized }
  var icon:      String {
    switch self {
    case .preferences: return "slider.horizontal.3"
    case .briefing:    return "newspaper.fill"
    case .practice:    return "graduationcap.fill"
    }
  }
  var iconOff: String {
    switch self {
    case .preferences: return "slider.horizontal.3"
    case .briefing:    return "newspaper"
    case .practice:    return "graduationcap"
    }
  }
}

// ── Flag circle — matches FlagCircle.tsx design ───────────────────────────────

private let flagColors: [String: Color] = [
  "fr": Color(red:0,    green:0.137, blue:0.584),
  "de": Color(red:1,    green:0.808, blue:0),
  "sv": Color(red:0,    green:0.416, blue:0.655),
  "en": Color(red:0.812,green:0.078, blue:0.169),
  "it": Color(red:0,    green:0.573, blue:0.275),
  "es": Color(red:0.667,green:0.082, blue:0.106),
  "tr": Color(red:0.890,green:0.039, blue:0.090),
  "hu": Color(red:0.263,green:0.435, blue:0.302),
  "ar": Color(red:0,    green:0.424, blue:0.208),
]

struct FlagCircle: View {
  let lang: LanguagePreference
  private let size: CGFloat = 36

  var body: some View {
    ZStack {
      Circle()
        .fill(flagColors[lang.code] ?? .gray)
        .frame(width: size, height: size)
      Text(lang.flag)
        .font(.system(size: 20))
      Circle()
        .strokeBorder(Color.white.opacity(0.25), lineWidth: 1.5)
        .frame(width: size, height: size)
    }
  }
}

// ── Left pill — language flags ─────────────────────────────────────────────────

private struct LeftPill: View {
  let languages: [LanguagePreference]

  var body: some View {
    HStack(spacing: 6) {
      ForEach(languages.prefix(5)) { lang in
        FlagCircle(lang: lang)
      }
      if languages.isEmpty {
        Image(systemName: "globe")
          .font(.system(size: 20, weight: .medium))
          .foregroundStyle(.secondary)
          .frame(width: 36, height: 36)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 9)
    .frame(height: 54)
  }
}

// ── Right pill — navigation tabs ───────────────────────────────────────────────

private struct RightPill: View {
  @Binding var activeTab: AppTab

  var body: some View {
    HStack(spacing: 0) {
      ForEach(AppTab.allCases, id: \.self) { tab in
        Button {
          let generator = UIImpactFeedbackGenerator(style: .light)
          generator.impactOccurred()
          activeTab = tab
        } label: {
          Image(systemName: activeTab == tab ? tab.icon : tab.iconOff)
            .font(.system(size: 18, weight: .medium))
            .foregroundStyle(activeTab == tab ? Color.primary : Color.secondary)
            .frame(width: 54, height: 54)
        }
        .buttonStyle(.plain)
      }
    }
    .frame(height: 54)
  }
}

// ── UIGlassEffect bridge — guaranteed to work on iOS 26 ───────────────────────

private struct GlassBackground: UIViewRepresentable {
  func makeUIView(context: Context) -> UIVisualEffectView {
    if #available(iOS 26.0, *) {
      let effect = UIGlassEffect()
      effect.isInteractive = true
      return UIVisualEffectView(effect: effect)
    } else {
      return UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
    }
  }
  func updateUIView(_ uiView: UIVisualEffectView, context: Context) {}
}

// ── Glass pill bar — the main component ───────────────────────────────────────

struct GlassPillBar: View {
  @Binding var activeTab: AppTab
  let activeLanguages: [LanguagePreference]

  var body: some View {
    HStack(alignment: .bottom, spacing: 12) {
      // Left pill
      glassWrapped {
        LeftPill(languages: activeLanguages)
      }

      Spacer()

      // Right pill
      glassWrapped {
        RightPill(activeTab: $activeTab)
      }
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 16)
  }

  @ViewBuilder
  private func glassWrapped<C: View>(@ViewBuilder _ content: () -> C) -> some View {
    content()
      .background {
        GlassBackground()
          .clipShape(.capsule)
      }
      .clipShape(.capsule)
      .shadow(color: .black.opacity(0.18), radius: 20, y: 6)
  }
}
