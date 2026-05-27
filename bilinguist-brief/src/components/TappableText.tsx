import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface Token {
  text: string;
  isWord: boolean;
  index: number;
}

// Tokenise into words (incl. accented chars + apostrophe contractions) and non-words
function tokenise(text: string): Token[] {
  const regex = /([A-Za-zÀ-ÿÄÖÜäöüßœæ]+(?:'[A-Za-zÀ-ÿ]+)?)|([^A-Za-zÀ-ÿÄÖÜäöüßœæ]+)/g;
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      isWord: !!match[1],
      index: index++,
    });
  }
  return tokens;
}

export function findContainingSentence(text: string, word: string): string {
  const sentences = text.split(/(?<=[.!?»])\s+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(word.toLowerCase()));
  return hit ?? text.slice(0, 300);
}

interface Props {
  text: string;
  style?: any;
  activeWord?: string | null;
  onWordPress: (word: string, sentence: string) => void;
}

export function TappableText({ text, style, activeWord, onWordPress }: Props) {
  const { colors } = useTheme();
  const tokens = useMemo(() => tokenise(text), [text]);

  return (
    <Text style={style}>
      {tokens.map((token) => {
        if (!token.isWord) {
          return <Text key={token.index}>{token.text}</Text>;
        }

        const isActive = token.text.toLowerCase() === activeWord?.toLowerCase();

        return (
          <Text
            key={token.index}
            onPress={() => onWordPress(token.text, findContainingSentence(text, token.text))}
            style={[
              styles.word,
              isActive
                ? { borderBottomColor: colors.accentGold, borderBottomWidth: 2 }
                : { borderBottomColor: colors.accentGold + '66', borderBottomWidth: 1 },
            ]}
          >
            {token.text}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  word: {
    // borderBottomWidth set per-word in the inline style above
  },
});
