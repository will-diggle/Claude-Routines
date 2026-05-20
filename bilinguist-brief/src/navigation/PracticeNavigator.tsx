import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PracticeScreen } from '../screens/PracticeScreen';
import { FlashcardsScreen } from '../screens/FlashcardsScreen';
import { MultipleChoiceScreen } from '../screens/MultipleChoiceScreen';
import { FillBlankScreen } from '../screens/FillBlankScreen';
import { TranslationScreen } from '../screens/TranslationScreen';

export type PracticeStackParamList = {
  PracticeHome: undefined;
  Flashcards: undefined;
  MultipleChoice: undefined;
  FillBlank: undefined;
  Translation: undefined;
};

const Stack = createNativeStackNavigator<PracticeStackParamList>();

export function PracticeNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="PracticeHome" component={PracticeScreen} />
      <Stack.Screen name="Flashcards" component={FlashcardsScreen} />
      <Stack.Screen name="MultipleChoice" component={MultipleChoiceScreen} />
      <Stack.Screen name="FillBlank" component={FillBlankScreen} />
      <Stack.Screen name="Translation" component={TranslationScreen} />
    </Stack.Navigator>
  );
}
