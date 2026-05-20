import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/useSettingsStore';
import { Colors, FontFamilies } from '../theme';
import { useTheme } from '../hooks/useTheme';

export function TopBar() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, fontFamily } = useTheme();
  const { languages, displayLanguage, setDisplayLanguage, activeLanguages } = useSettingsStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const active = activeLanguages();
  const currentLang = languages.find((l) => l.code === displayLanguage);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <View style={[styles.inner, { borderBottomColor: colors.borderMid }]}>
        {/* Profile button */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.navigate('Settings')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="person-circle-outline" size={28} color={colors.inkMid} />
        </TouchableOpacity>

        {/* App name */}
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.inkDark, fontFamily: fontFamily.bold }]}>
            Bilinguist Brief
          </Text>
          <Text style={[styles.subtitle, { color: colors.inkFaint }]}>
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Language dropdown */}
        {active.length > 1 ? (
          <TouchableOpacity
            style={[styles.langButton, { borderColor: colors.borderMid }]}
            onPress={() => setDropdownOpen(true)}
          >
            <Text style={[styles.langFlag]}>{currentLang?.flag ?? '🌐'}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.inkLight} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton}>
            <Text style={styles.langFlag}>{currentLang?.flag ?? '🌐'}</Text>
          </View>
        )}
      </View>

      {/* Language selection modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.dropdownTitle, { color: colors.inkLight, fontFamily: fontFamily.regular }]}>
              Display briefing in
            </Text>
            <FlatList
              data={active}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    item.code === displayLanguage && { backgroundColor: colors.borderLight },
                  ]}
                  onPress={() => {
                    setDisplayLanguage(item.code);
                    setDropdownOpen(false);
                  }}
                >
                  <Text style={styles.dropdownFlag}>{item.flag}</Text>
                  <Text style={[styles.dropdownLang, { color: colors.inkDark, fontFamily: fontFamily.regular }]}>
                    {item.name}
                  </Text>
                  {item.code === displayLanguage && (
                    <Ionicons name="checkmark" size={16} color={colors.accentGold} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    elevation: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 40,
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
    letterSpacing: 0.3,
  },
  langButton: {
    width: 40,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langFlag: {
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingRight: 16,
  },
  dropdown: {
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  dropdownTitle: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  dropdownFlag: {
    fontSize: 20,
  },
  dropdownLang: {
    fontSize: 15,
    flex: 1,
  },
});
