import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore, LanguageLevel } from '../store/useSettingsStore';
import { useSubscriptionStore } from '../store/useSubscriptionStore';
import { useTheme } from '../hooks/useTheme';
import { scheduleBriefingNotification, schedulePracticeNotification } from '../services/notifications';
import {
  FontFamilies,
  FontSizes,
  BackgroundColors,
  Colors,
  Spacing,
  type BackgroundKey,
  type FontFamilyKey,
  type FontSizeKey,
} from '../theme';

const LEVELS: LanguageLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const C1_LABEL: Record<string, string> = {
  en: 'C1 / Native',
  fr: 'C1 / Natif',
  de: 'C1 / Muttersprachlich',
  es: 'C1 / Nativo',
  it: 'C1 / Madrelingua',
};
const BACKGROUNDS: { key: BackgroundKey; label: string; color: string }[] = [
  { key: 'white', label: 'White', color: Colors.white },
  { key: 'cream', label: 'Cream', color: Colors.cream },
  { key: 'softGrey', label: 'Soft Grey', color: Colors.softGrey },
  { key: 'night', label: 'Night', color: Colors.night },
];
const FONT_SIZES: FontSizeKey[] = ['small', 'medium', 'large', 'extraLarge'];
const ALL_TOPIC_ITEMS: { key: string; label: string }[] = [
  { key: 'worldNews', label: 'World News' },
  { key: 'goodNews', label: 'Good News' },
  { key: 'sport', label: 'Sport' },
  { key: 'politics', label: 'Politics' },
  { key: 'artsCulture', label: 'Arts & Culture' },
  { key: 'countryNews', label: 'Country News' },
  { key: 'scienceTech', label: 'Science & Technology' },
  { key: 'business', label: 'Business' },
];
const TOPIC_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ALL_TOPIC_ITEMS.map((t) => [t.key, t.label])
);
const DEV_CODE = 'BILDEV';

// --- Sub-components ---

function SectionHeader({ title, colors, fontFamily }: { title: string; colors: any; fontFamily: any }) {
  return (
    <View style={[sectionStyles.header, { borderBottomColor: colors.borderMid }]}>
      <Text style={[sectionStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
        {title}
      </Text>
    </View>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
  colors,
  fontFamily,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
  fontFamily: any;
}) {
  return (
    <View style={[segStyles.container, { borderColor: colors.borderMid, backgroundColor: colors.bg }]}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              segStyles.option,
              selected && { backgroundColor: colors.inkDark },
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderMid },
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Text
              style={[
                segStyles.label,
                { fontFamily: fontFamily.regular, color: selected ? '#FFF' : colors.inkMid },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TimeInput({
  value,
  onChange,
  onCommit,
  colors,
  fontFamily,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  colors: any;
  fontFamily: any;
}) {
  return (
    <TextInput
      style={[
        timeStyles.input,
        { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.card },
      ]}
      value={value}
      onChangeText={(text) => {
        const clean = text.replace(/[^0-9:]/g, '');
        onChange(clean);
      }}
      onEndEditing={onCommit}
      placeholder="HH:MM"
      placeholderTextColor={colors.inkFaint}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
    />
  );
}

function DisplayPreview({ colors, fontFamily, fontSize }: { colors: any; fontFamily: any; fontSize: any }) {
  return (
    <View style={[previewStyles.container, { backgroundColor: colors.bg, borderColor: colors.borderLight }]}>
      <Text style={[previewStyles.label, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
        PREVIEW
      </Text>
      <Text style={[previewStyles.headline, { color: colors.inkDark, fontFamily: fontFamily.bold, fontSize: fontSize.heading * 0.75 }]}>
        La politique étrangère en débat
      </Text>
      <Text style={[previewStyles.body, { color: colors.inkMid, fontFamily: fontFamily.regular, fontSize: fontSize.body * 0.85 }]}>
        Les dirigeants mondiaux se sont réunis à Genève pour discuter des nouvelles mesures climatiques dans un contexte de tensions géopolitiques croissantes.
      </Text>
    </View>
  );
}

// --- Main screen ---

export function SettingsScreen() {
  const { colors, fontFamily, fontSize } = useTheme();
  const store = useSettingsStore();
  const { setDev } = useSubscriptionStore();
  const [activeTab, setActiveTab] = useState<'reading' | 'display'>('reading');
  const [devModalVisible, setDevModalVisible] = useState(false);
  const [devCodeInput, setDevCodeInput] = useState('');
  const [levelModalLang, setLevelModalLang] = useState<string | null>(null);

  const activeCount = store.languages.filter((l) => l.active).length;

  function handleDevTap() {
    if (store.developerMode) {
      store.setDeveloperMode(false);
      setDev(false);
      return;
    }
    setDevCodeInput('');
    setDevModalVisible(true);
  }

  function handleDevCodeSubmit() {
    if (devCodeInput.trim().toUpperCase() === DEV_CODE) {
      store.setDeveloperMode(true);
      setDev(true);
      setDevModalVisible(false);
    } else {
      Alert.alert('Incorrect code', 'Please try again.');
      setDevCodeInput('');
    }
  }

  const topicItems = (store.topicOrder ?? ALL_TOPIC_ITEMS.map((t) => t.key)).map((key) => ({
    key: key as keyof typeof store.topics,
    label: TOPIC_LABEL_MAP[key] ?? key,
  }));

  const levelModal = store.languages.find((l) => l.code === levelModalLang);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Tab switcher ── */}
      <View style={[tabStyles.container, { borderBottomColor: colors.borderMid }]}>
        {(['reading', 'display'] as const).map((tab) => {
          const selected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[tabStyles.tab, selected && { borderBottomColor: colors.inkDark }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[tabStyles.label, { fontFamily: selected ? fontFamily.bold : fontFamily.regular, color: selected ? colors.inkDark : colors.inkFaint }]}>
                {tab === 'reading' ? 'Reading' : 'Display'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Reading tab ── */}
      {activeTab === 'reading' && (
        <>
      {/* ── Language Preferences ── */}
      <SectionHeader title="Language Preferences" colors={colors} fontFamily={fontFamily} />

      <Text style={[styles.helper, { color: colors.inkFaint, fontFamily: fontFamily.regular }]}>
        Select up to {3} active languages.
      </Text>

      {store.languages.map((lang, index) => {
        const canActivate = !lang.active && activeCount < 3;
        const isDisabled = !lang.active && !canActivate;

        return (
          <View key={lang.code}>
            <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.rowLabel, { color: isDisabled ? colors.inkFaint : colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
                {lang.nativeName}
              </Text>
              <View style={styles.reorderBtns}>
                <TouchableOpacity
                  onPress={() => store.reorderLanguages(index, index - 1)}
                  disabled={index === 0}
                  style={{ opacity: index === 0 ? 0.25 : 1 }}
                >
                  <Ionicons name="chevron-up" size={14} color={colors.inkMid} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => store.reorderLanguages(index, index + 1)}
                  disabled={index === store.languages.length - 1}
                  style={{ opacity: index === store.languages.length - 1 ? 0.25 : 1 }}
                >
                  <Ionicons name="chevron-down" size={14} color={colors.inkMid} />
                </TouchableOpacity>
              </View>
              <Switch
                value={lang.active}
                onValueChange={() => store.toggleLanguage(lang.code)}
                disabled={isDisabled}
                trackColor={{ false: colors.borderMid, true: Colors.accentGold }}
                thumbColor="#FFF"
              />
            </View>
            {lang.active && (
              <TouchableOpacity
                style={[styles.levelRow, { borderBottomColor: colors.borderLight, backgroundColor: colors.surface }]}
                onPress={() => setLevelModalLang(lang.code)}
              >
                <Text style={[styles.levelLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
                  Level
                </Text>
                <Text style={[styles.levelValue, { color: colors.accentGold, fontFamily: fontFamily.bold }]}>
                  {lang.level}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* ── Topics ── */}
      <SectionHeader title="Topics" colors={colors} fontFamily={fontFamily} />

      {topicItems.map((item, index) => (
        <View key={item.key} style={[styles.row, { borderBottomColor: colors.borderLight, borderBottomWidth: index < topicItems.length - 1 ? StyleSheet.hairlineWidth : 0 }]}>
          <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            {item.label}
          </Text>
          <View style={styles.reorderBtns}>
            <TouchableOpacity
              onPress={() => store.reorderTopics(index, index - 1)}
              disabled={index === 0}
              style={{ opacity: index === 0 ? 0.25 : 1 }}
            >
              <Ionicons name="chevron-up" size={14} color={colors.inkMid} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => store.reorderTopics(index, index + 1)}
              disabled={index === topicItems.length - 1}
              style={{ opacity: index === topicItems.length - 1 ? 0.25 : 1 }}
            >
              <Ionicons name="chevron-down" size={14} color={colors.inkMid} />
            </TouchableOpacity>
          </View>
          <Switch
            value={store.topics[item.key]}
            onValueChange={() => store.toggleTopic(item.key)}
            trackColor={{ false: colors.borderMid, true: Colors.accentGold }}
            thumbColor="#FFF"
          />
        </View>
      ))}

      {/* ── Briefing Preferences ── */}
      <SectionHeader title="Briefing Preferences" colors={colors} fontFamily={fontFamily} />

      <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Briefing Length</Text>
      <SegmentedControl
        options={[
          { label: 'Short (5m)', value: 'short' },
          { label: 'Standard (10m)', value: 'standard' },
          { label: 'Full (15m)', value: 'full' },
        ]}
        value={store.briefingLength}
        onChange={(v) => store.setBriefingLength(v as any)}
        colors={colors}
        fontFamily={fontFamily}
      />

      <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Languages per Briefing</Text>
      <SegmentedControl
        options={[
          { label: '1', value: '1' },
          { label: '2', value: '2' },
          { label: 'All', value: 'all' },
        ]}
        value={store.languagesPerBriefing}
        onChange={(v) => store.setLanguagesPerBriefing(v as any)}
        colors={colors}
        fontFamily={fontFamily}
      />

      <View style={[styles.row, { borderBottomColor: colors.borderLight, marginTop: Spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            Daily Briefing Time
          </Text>
          <Text style={[styles.rowSub, { color: colors.inkFaint }]}>When you'd like to be notified</Text>
        </View>
        <TimeInput
          value={store.briefingNotificationTime}
          onChange={store.setBriefingNotificationTime}
          onCommit={() => scheduleBriefingNotification(store.briefingNotificationTime)}
          colors={colors}
          fontFamily={fontFamily}
        />
      </View>

      <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: colors.inkDark, fontFamily: fontFamily.regular, fontSize: fontSize.body }]}>
            Daily Practice Reminder
          </Text>
          <Text style={[styles.rowSub, { color: colors.inkFaint }]}>When to practise your word bank</Text>
        </View>
        <TimeInput
          value={store.practiceNotificationTime}
          onChange={store.setPracticeNotificationTime}
          onCommit={() => schedulePracticeNotification(store.practiceNotificationTime)}
          colors={colors}
          fontFamily={fontFamily}
        />
      </View>

        </>
      )}

      {/* ── Display tab ── */}
      {activeTab === 'display' && (
        <>
      <SectionHeader title="Display" colors={colors} fontFamily={fontFamily} />

      <DisplayPreview colors={colors} fontFamily={fontFamily} fontSize={fontSize} />

      <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Background</Text>
      <View style={styles.backgroundRow}>
        {BACKGROUNDS.map((bg) => (
          <TouchableOpacity
            key={bg.key}
            style={[
              styles.bgSwatch,
              { backgroundColor: bg.color, borderColor: store.background === bg.key ? colors.accentGold : colors.borderMid },
              store.background === bg.key && styles.bgSwatchSelected,
            ]}
            onPress={() => store.setBackground(bg.key)}
          >
            <Text style={[styles.bgSwatchLabel, { color: bg.key === 'night' ? Colors.nightInkDark : Colors.inkMid }]}>
              {bg.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Font</Text>
      {(['georgia', 'playfair', 'ptserif'] as FontFamilyKey[]).map((key) => {
        const fam = FontFamilies[key];
        const selected = store.fontFamily === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.fontRow, { borderBottomColor: colors.borderLight }]}
            onPress={() => store.setFontFamily(key)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.fontSample, { fontFamily: fam.regular, color: colors.inkDark }]}>
                {fam.label}
              </Text>
              <Text style={[styles.fontPreview, { fontFamily: fam.italic, color: colors.inkLight }]}>
                The quick brown fox
              </Text>
            </View>
            {selected && <Ionicons name="checkmark-circle" size={22} color={colors.accentGold} />}
          </TouchableOpacity>
        );
      })}

      <Text style={[styles.fieldLabel, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Text Size</Text>
      <SegmentedControl
        options={FONT_SIZES.map((k) => ({ label: FontSizes[k].label, value: k }))}
        value={store.fontSize}
        onChange={(v) => store.setFontSize(v as FontSizeKey)}
        colors={colors}
        fontFamily={fontFamily}
      />

        </>
      )}

      {/* ── Developer ── */}
      <View style={styles.devSection}>
        <TouchableOpacity onPress={handleDevTap} style={styles.devTap}>
          <Text style={[styles.devText, { color: colors.inkFaint }]}>
            {store.developerMode ? 'Developer mode: ON — tap to disable' : '·  ·  ·'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Level picker modal */}
      <Modal
        visible={!!levelModalLang}
        transparent
        animationType="slide"
        onRequestClose={() => setLevelModalLang(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              {levelModal?.name} — Level
            </Text>
            {LEVELS.map((level) => (
              <TouchableOpacity
                key={level}
                style={[modalStyles.option, { borderBottomColor: colors.borderLight }]}
                onPress={() => {
                  if (levelModalLang) store.setLanguageLevel(levelModalLang as any, level);
                  setLevelModalLang(null);
                }}
              >
                <Text style={[modalStyles.optionText, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                  {level === 'C1' ? (C1_LABEL[levelModal?.code ?? 'en'] ?? 'C1 / Native') : level}
                </Text>
                {(levelModal?.level === level ||
                  (level === 'C1' && (levelModal?.level === 'C2' || levelModal?.level === 'Native'))) && (
                  <Ionicons name="checkmark" size={20} color={colors.inkDark} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={modalStyles.cancel} onPress={() => setLevelModalLang(null)}>
              <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dev code modal */}
      <Modal
        visible={devModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDevModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.codeSheet, { backgroundColor: colors.surface }]}>
            <Text style={[modalStyles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
              Developer Access
            </Text>
            <TextInput
              style={[
                modalStyles.codeInput,
                { color: colors.inkDark, borderColor: colors.borderMid, fontFamily: fontFamily.regular, backgroundColor: colors.bg },
              ]}
              value={devCodeInput}
              onChangeText={setDevCodeInput}
              placeholder="Enter code"
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="characters"
              autoFocus
              onSubmitEditing={handleDevCodeSubmit}
            />
            <TouchableOpacity
              style={[modalStyles.codeButton, { backgroundColor: colors.accentGold }]}
              onPress={handleDevCodeSubmit}
            >
              <Text style={modalStyles.codeButtonText}>Unlock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.cancel} onPress={() => setDevModalVisible(false)}>
              <Text style={[modalStyles.cancelText, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 60 },
  helper: { fontSize: 13, marginHorizontal: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  rowLabel: { flex: 1 },
  rowSub: { fontSize: 12, marginTop: 2 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md + 32 + Spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  levelLabel: { flex: 1, fontSize: 13 },
  levelValue: { fontSize: 14 },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  backgroundRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bgSwatch: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgSwatchSelected: { borderWidth: 2 },
  bgSwatchLabel: { fontSize: 10, fontWeight: '500' },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fontSample: { fontSize: 17 },
  fontPreview: { fontSize: 13, marginTop: 2 },
  reorderBtns: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    marginRight: Spacing.sm,
  },
  devSection: { marginTop: Spacing.xxl, alignItems: 'center', paddingBottom: Spacing.md },
  devTap: { padding: Spacing.md },
  devText: { fontSize: 13 },
});

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingBottom: 9,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  label: { fontSize: 14 },
});

const sectionStyles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 2,
    marginBottom: Spacing.xs,
  },
  title: { fontSize: 18, letterSpacing: 0.3 },
});

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  label: { fontSize: 13 },
});

const timeStyles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 15,
    width: 72,
    textAlign: 'center',
  },
});

const previewStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  headline: {
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  body: {
    lineHeight: 22,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  codeSheet: {
    margin: 32,
    borderRadius: 16,
    padding: Spacing.lg,
  },
  title: {
    fontSize: 18,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { flex: 1, fontSize: 16 },
  cancel: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  cancelText: { fontSize: 15 },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: Spacing.md,
  },
  codeButton: {
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  codeButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
