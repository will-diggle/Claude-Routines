import SwiftUI

struct RootView: View {
  @State private var activeTab: AppTab = .briefing
  @Environment(AppStore.self) var store

  var body: some View {
    ZStack(alignment: .bottom) {

      // ── Screen content ────────────────────────────────────────────────────
      Group {
        switch activeTab {
        case .briefing:    BriefingView()
        case .preferences: SettingsView()
        case .practice:    PracticeView()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)

      // ── Glass pill bar — floats above content ─────────────────────────────
      GlassPillBar(
        activeTab:       $activeTab,
        activeLanguages: store.activeLanguages
      )
      .ignoresSafeArea(edges: .bottom)
    }
    .ignoresSafeArea(edges: .bottom)
  }
}
