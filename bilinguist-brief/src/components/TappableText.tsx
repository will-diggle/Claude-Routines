import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface Token {
  text: string;
  isWord: boolean;
  index: number;       // sequential index across ALL tokens (words + non-words)
  wordIndex: number;   // sequential index counting only word tokens (-1 for non-words)
  charIndex: number;   // offset of this token's first character in the source text
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
      charIndex: match.index,
    });
  }
  return tokens;
}

/**
 * Character ranges of spelled-out-number annotations in `text`, e.g. the
 * "(twenty)" span in "20 (twenty)" — a digit run followed by a parenthetical
 * of letters/spaces/hyphens. Used to render that span in italics so it reads
 * as a gloss on the numeral rather than part of the sentence. Deliberately
 * anchored to a preceding digit so ordinary parenthetical asides elsewhere
 * in an article (unrelated to this feature) are never italicised.
 */
function findAnnotationRanges(text: string): Array<[number, number]> {
  const regex = /\d[\d.,]*\s*(\([\p{L}\s-]+\))/gu;
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const parenStart = match.index + match[0].indexOf('(');
    ranges.push([parenStart, match.index + match[0].length]);
  }
  return ranges;
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

/**
 * Aligns two tokenisations of the same text that differ only by inserted
 * words — e.g. `reduced` is `original` with spelled-out-number annotations
 * like "(twenty)" stripped out — and returns a function mapping a word index
 * in `reduced` back to the corresponding word index in `original`. Needed
 * because tokenMap word positions (from the pipeline) are always indexed
 * against the bracketed text; rendering the plain variant must still resolve
 * taps to the right tokenMap entry.
 *
 * Assumes `reduced`'s words form an in-order subsequence of `original`'s
 * (true for body vs bodyAudio, which differ only by removed annotations) —
 * greedily advances through `original` until each `reduced` word is found,
 * treating anything skipped as a stripped annotation. Falls back to an
 * identity mapping for a word if the streams ever fail to realign, so a
 * malformed pair degrades to "mostly right" rather than throwing.
 */
export function buildPositionRemap(original: string, reduced: string): (reducedWordIndex: number) => number {
  const originalWords = tokenise(original).filter((t) => t.isWord);
  const reducedWords = tokenise(reduced).filter((t) => t.isWord);
  const map: number[] = [];
  let oi = 0;
  for (let ri = 0; ri < reducedWords.length; ri++) {
    const target = reducedWords[ri].text.toLowerCase();
    while (oi < originalWords.length && originalWords[oi].text.toLowerCase() !== target) {
      oi++;
    }
    map[ri] = oi < originalWords.length ? oi : ri;
    oi++;
  }
  return (reducedWordIndex: number) => map[reducedWordIndex] ?? reducedWordIndex;
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
   * When `text` isn't the pipeline's own tokenMap-aligned text (e.g. the
   * plain no-brackets variant), this maps each word's LOCAL index in `text`
   * straight to its article-global tokenMap position — see
   * buildPositionRemap. Takes priority over wordPositionOffset when set.
   */
  remapPosition?: (localWordIndex: number) => number;
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
  remapPosition,
  onWordPress,
}: Props) {
  const { colors } = useTheme();
  const tokens = useMemo(() => tokenise(text), [text]);
  // Only non-empty for text that actually contains "N (spelled out)" —
  // everyday parenthetical asides never match, so this is a no-op cost for
  // the vast majority of paragraphs.
  const annotationRanges = useMemo(() => findAnnotationRanges(text), [text]);
  const isAnnotation = (charIndex: number) =>
    annotationRanges.some(([start, end]) => charIndex >= start && charIndex < end);

  return (
    <Text style={style}>
      {tokens.map((token) => {
        const annotated = annotationRanges.length > 0 && isAnnotation(token.charIndex);

        // Non-word runs (spaces, punctuation) never get a press handler or their
        // own style, so they don't need a nested Text element — just the raw
        // string. A long paragraph can have 100+ of these; wrapping every one of
        // them roughly doubles the nested Text count for no visual difference,
        // and iOS silently drops trailing content once that count gets large.
        // The exception is the "(...)" punctuation of a number annotation,
        // which needs its own italic styling to match the word inside it.
        if (!token.isWord) {
          return annotated
            ? <Text key={token.index} style={styles.annotation}>{token.text}</Text>
            : token.text;
        }

        const globalPos = remapPosition ? remapPosition(token.wordIndex) : token.wordIndex + wordPositionOffset;

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
              annotated && styles.annotation,
              isActive && { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 5, overflow: 'hidden', borderBottomColor: colors.accentGold, borderBottomWidth: 2 },
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
  annotation: {
    fontStyle: 'italic',
  },
});
