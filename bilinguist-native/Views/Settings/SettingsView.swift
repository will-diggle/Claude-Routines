import SwiftUI

struct SettingsView: View {
  @Environment(AppStore.self) var store

  var body: some View {
    NavigationStack {
      List {
        // ── Languages ──────────────────────────────────────────────────────
        Section {
          ForEach(store.languages) { lang in
            LanguageRow(lang: lang)
          }
          .onMove { store.moveLanguage(from: $0, to: $1) }
        } header: {
          Text("Language Preferences")
            .font(.headline)
            .foregroundStyle(.primary)
            .textCase(nil)
        } footer: {
          Text("Toggle languages on to include them in your briefing. Drag to reorder.")
            .font(.caption)
        }

        // ── Topics ─────────────────────────────────────────────────────────
        Section("Topics") {
          ForEach(store.topics) { topic in
            HStack {
              Text(topic.label)
              Spacer()
              Toggle("", isOn: Binding(
                get:  { topic.active },
                set:  { _ in store.toggleTopic(topic.id) }
              ))
              .labelsHidden()
            }
          }
        }
      }
      .navigationTitle("Preferences")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { EditButton() }
      // Bottom padding so last row isn't behind pills
      .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 90) }
    }
  }
}

// ── Per-language row ──────────────────────────────────────────────────────────

struct LanguageRow: View {
  @Environment(AppStore.self) var store
  let lang: LanguagePreference

  private let lengthLabels: [String: [String]] = [
    "fr":["Concis","Long"], "de":["Kurz","Lang"], "sv":["Kort","Lång"],
    "en":["Concise","Long"], "it":["Conciso","Lungo"], "es":["Conciso","Extenso"],
    "tr":["Kısa","Uzun"], "hu":["Rövid","Hosszú"], "ar":["موجز","طويل"],
  ]

  var body: some View {
    VStack(spacing: 0) {
      // Main row
      HStack(spacing: 12) {
        Image(systemName: "line.3.horizontal")
          .foregroundStyle(.secondary)

        Text(lang.flag).font(.system(size: 26))

        Text(lang.nativeName)
          .font(.system(size: 17))

        Spacer()

        Toggle("", isOn: Binding(
          get:  { lang.active },
          set:  { _ in store.toggleLanguage(lang.code) }
        ))
        .labelsHidden()
      }
      .padding(.vertical, 4)

      // Expanded controls — only when active
      if lang.active {
        Divider().padding(.leading, 48)

        // Length picker
        HStack {
          Text("Length")
            .font(.subheadline)
            .foregroundStyle(.secondary)
          Spacer()
          let labels = lengthLabels[lang.code] ?? ["Short", "Long"]
          Picker("", selection: Binding(
            get: { lang.readLength },
            set: { store.setReadLength($0, for: lang.code) }
          )) {
            Text(labels[0]).tag(ReadLength.short)
            Text(labels[1]).tag(ReadLength.longer)
          }
          .pickerStyle(.segmented)
          .frame(maxWidth: 180)
        }
        .padding(.vertical, 8)
        .padding(.leading, 48)

        Divider().padding(.leading, 48)

        // Level picker
        NavigationLink {
          LevelPickerView(lang: lang)
        } label: {
          HStack {
            Text("Level")
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .padding(.leading, 48)
            Spacer()
            Text(lang.level)
              .font(.subheadline.bold())
          }
          .padding(.vertical, 8)
        }
      }
    }
  }
}

// ── Level picker ──────────────────────────────────────────────────────────────

struct LevelPickerView: View {
  @Environment(AppStore.self) var store
  @Environment(\.dismiss) var dismiss
  let lang: LanguagePreference

  var levels: [String] { levelsByLang[lang.code] ?? ["A1","A2","B1","B2","C1","C2","Native"] }

  var body: some View {
    List(levels, id: \.self) { level in
      HStack {
        Text(level).font(.system(size: 17))
        Spacer()
        if lang.level == level {
          Image(systemName: "checkmark").foregroundStyle(.blue)
        }
      }
      .contentShape(Rectangle())
      .onTapGesture {
        store.setLevel(level, for: lang.code)
        dismiss()
      }
    }
    .navigationTitle("\(lang.nativeName) — Level")
    .navigationBarTitleDisplayMode(.inline)
  }
}
