import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface Token {
  text: string;
  isWord: boolean;
  index: number;       // sequential index across ALL tokens (words + non-words)
  wordIndex: number;   // sequential index counting only word tokens (-1 for non-words)
}

// Tokenise into words and non-words using the same Unicode letter regex as
// bilinguist_tokenise.py, so that wordIndex values align with the pipeline's
// token map positions.
function tokenise(text: string): Token[] {
  const regex = /(\p{L}+(?:'\p{L}+)?)|([^\p{L}]+)/gu;
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  let wordIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    const isWord = !!match[1];
    tokens.push({
      text:      match[0],
      isWord,
      index:     index++,
      wordIndex: isWord ? wordIndex++ : -1,
    });
  }
  return tokens;
}

/** Count word tokens in a string — used by BriefingArticle to compute offset. */
export function countWordTokens(text: string): number {
  const matches = text.match(/\p{L}+(?:'\p{L}+)?/gu);
  return matches?.length ?? 0;
}

/**
 * Scan `text` for the first token that matches `targetToken` (case-insensitive)
 * and return its article-global word position (wordIndex + wordPositionOffset).
 * Returns null if not found.
 */
export function findWordPosition(
  text: string,
  targetToken: string,
  wordPositionOffset: number,
): number | null {
  const lower = targetToken.toLowerCase();
  for (const token of tokenise(text)) {
    if (token.isWord && token.text.toLowerCase() === lower) {
      return token.wordIndex + wordPositionOffset;
    }
  }
  return null;
}

/**
 * Find the occurrence of `targetToken` in headline+body that is CLOSEST to
 * `nearPosition`. Needed for separable verb particles like "ein" or "an" which
 * may appear many times in an article as prepositions or articles — we want the
 * instance in the same sentence as the tapped verb, not the first in the file.
 */
export function findWordPositionNear(
  headline: string,
  body: string,
  targetToken: string,
  headlineWordCount: number,
  nearPosition: number,
): number | null {
  const lower = targetToken.toLowerCase();
  const candidates: number[] = [];

  for (const token of tokenise(headline)) {
    if (token.isWord && token.text.toLowerCase() === lower) {
      candidates.push(token.wordIndex);
    }
  }
  for (const token of tokenise(body)) {
    if (token.isWord && token.text.toLowerCase() === lower) {
      candidates.push(token.wordIndex + headlineWordCount);
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, pos) =>
    Math.abs(pos - nearPosition) < Math.abs(best - nearPosition) ? pos : best
  );
}

export function findContainingSentence(text: string, word: string): string {
  const sentences = text.split(/(?<=[.!?»])\s+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(word.toLowerCase()));
  return hit ?? text.slice(0, 300);
}

interface Props {
  text: string;
  style?: any;
  /** Deprecated single-word active state — still supported for legacy callers. */
  activeWord?: string | null;
  /**
   * Set of article-global word positions to highlight (multi-position support
   * for separable verbs, gendered article+noun pairs, etc.).
   * When provided, overrides `activeWord`.
   */
  activePositions?: Set<number>;
  /**
   * Offset added to each word's local wordIndex to produce the article-global
   * word position. Headline TappableText uses 0; body TappableText uses the
   * word count of the headline.
   */
  wordPositionOffset?: number;
  /**
   * Called when a word is tapped.
   * `wordPosition` is the article-global word position (wordIndex + offset).
   */
  onWordPress: (wordPosition: number, word: string, sentence: string) => void;
}

export function TappableText({
  text,
  style,
  activeWord,
  activePositions,
  wordPositionOffset = 0,
  onWordPress,
}: Props) {
  const { colors } = useTheme();
  const tokens = useMemo(() => tokenise(text), [text]);

  return (
    <Text style={style}>
      {tokens.map((token) => {
        if (!token.isWord) {
          return <Text key={token.index}>{token.text}</Text>;
        }

        const globalPos = token.wordIndex + wordPositionOffset;

        const isActive = activePositions
          ? activePositions.has(globalPos)
          : token.text.toLowerCase() === activeWord?.toLowerCase();

        return (
          <Text
            key={token.index}
            suppressHighlighting
            onPress={() => onWordPress(
              globalPos,
              token.text,
              findContainingSentence(text, token.text),
            )}
            style={[
              styles.word,
              isActive
                ? { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 5, overflow: 'hidden', borderBottomColor: colors.accentGold, borderBottomWidth: 2 }
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
