import type { LanguageCode } from '../store/useSettingsStore';
import { consumeAudioPlay, getMonthlyAudioUsage } from './apiUsage';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ?? '';

/**
 * eleven_multilingual_v2 supports FR, DE, SV, EN natively.
 * Switch to 'eleven_turbo_v2_5' for faster/cheaper if latency is an issue.
 */
const MODEL_ID = 'eleven_multilingual_v2';

/**
 * Default voice: "Charlotte" — calm, clear, works well across European languages.
 * Voice ID can be overridden per-language via env vars:
 *   EXPO_PUBLIC_ELEVENLABS_VOICE_FR, _DE, _SV, _EN, _IT, _ES
 * To find voice IDs: https://elevenlabs.io/docs/voices/voice-library
 */
const DEFAULT_VOICE_ID = process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_DEFAULT ?? 'XB0fDUnXU5powFXDhCwa';

const LANG_VOICE: Partial<Record<LanguageCode, string>> = {
  fr: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_FR ?? DEFAULT_VOICE_ID,
  de: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_DE ?? DEFAULT_VOICE_ID,
  sv: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_SV ?? DEFAULT_VOICE_ID,
  en: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_EN ?? DEFAULT_VOICE_ID,
  it: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_IT ?? DEFAULT_VOICE_ID,
  es: process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ES ?? DEFAULT_VOICE_ID,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type SynthesisResult =
  | { ok: true;  audioUri: string }   // base64 data URI — pass directly to expo-av
  | { ok: false; reason: 'no_key' | 'cap_reached' | 'api_error' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts an ArrayBuffer to a base64 string suitable for a data URI.
 * React Native does not have FileReader, so we do this manually.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Process in chunks to avoid stack overflow on large buffers
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Synthesise a single word (or short phrase) using ElevenLabs TTS.
 *
 * Flow:
 *   1. Check monthly audio cap — bail early if exhausted.
 *   2. POST to ElevenLabs /text-to-speech/{voice_id}.
 *   3. Convert binary response → base64 data URI.
 *   4. Count the play against the monthly cap.
 *   5. Return the URI for playback via expo-av.
 *
 * @param word     The word or short phrase to pronounce.
 * @param language The source language code (fr | de | sv | en).
 */
export async function synthesizeWord(
  word: string,
  language: LanguageCode,
): Promise<SynthesisResult> {
  if (!API_KEY) return { ok: false, reason: 'no_key' };

  // Check cap before making the API call
  const usage = await getMonthlyAudioUsage();
  if (usage.remaining <= 0) return { ok: false, reason: 'cap_reached' };

  const voiceId = LANG_VOICE[language] ?? DEFAULT_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: word,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      console.warn('[ElevenLabs] API error:', response.status, await response.text());
      return { ok: false, reason: 'api_error' };
    }

    const buffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const audioUri = `data:audio/mpeg;base64,${base64}`;

    // Count the play only after a successful API call
    await consumeAudioPlay();

    return { ok: true, audioUri };
  } catch (error) {
    console.warn('[ElevenLabs] Network error:', error);
    return { ok: false, reason: 'api_error' };
  }
}

/**
 * Re-export usage check for use in UI components.
 */
export { getMonthlyAudioUsage };
