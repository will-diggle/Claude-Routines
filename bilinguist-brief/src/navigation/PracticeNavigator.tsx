import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PracticeScreen } from '../screens/PracticeScreen';
import { FlashcardsScreen } from '../screens/FlashcardsScreen';
import { MultipleChoiceScreen } from '../screens/MultipleChoiceScreen';
import { FillBlankScreen } from '../screens/FillBlankScreen';
import { TranslationScreen } from '../screens/TranslationScreen';
import { WordBankListScreen } from '../screens/WordBankListScreen';
import type { LanguageCode } from '../store/useSettingsStore';
import type { Pile } from '../store/useWordBankStore';

export type PracticeStackParamList = {
  PracticeHome: undefined;
  WordBankList: { pile?: Pile | 'all'; language?: LanguageCode | 'all' };
  Flashcards: { language?: LanguageCode | 'all' };
  MultipleChoice: { language?: LanguageCode | 'all' };
  FillBlank: { language?: LanguageCode | 'all' };
  Translation: { language?: LanguageCode | 'all' };
};

const Stack = createNativeStackNavigator<PracticeStackParamList>();

export function PracticeNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="PracticeHome" component={PracticeScreen} />
      <Stack.Screen name="WordBankList" component={WordBankListScreen} />
      <Stack.Screen name="Flashcards" component={FlashcardsScreen} />
      <Stack.Screen name="MultipleChoice" component={MultipleChoiceScreen} />
      <Stack.Screen name="FillBlank" component={FillBlankScreen} />
      <Stack.Screen name="Translation" component={TranslationScreen} />
    </Stack.Navigator>
  );
}
