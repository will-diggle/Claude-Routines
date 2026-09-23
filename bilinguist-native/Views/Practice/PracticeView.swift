import SwiftUI

struct PracticeView: View {
  @Environment(AppStore.self) var store

  var body: some View {
    VStack(spacing: 24) {
      Image(systemName: "graduationcap.fill")
        .font(.system(size: 48))
        .foregroundStyle(.secondary)

      Text("Practice")
        .font(.title.bold())

      Text("Coming soon — practice games for your active languages will appear here.")
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 32)

      // Show active languages as a preview
      if !store.activeLanguages.isEmpty {
        VStack(spacing: 8) {
          ForEach(store.activeLanguages) { lang in
            HStack(spacing: 12) {
              Text(lang.flag).font(.system(size: 24))
              Text(lang.nativeName)
              Spacer()
              Text(lang.level)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 32)
          }
        }
      }
    }
    .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 90) }
  }
}
