import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { synthesizeWord } from './elevenlabs';
import { useAudioStore } from '../store/useAudioStore';
import type { LanguageCode } from '../store/useSettingsStore';

// Flip to false when ElevenLabs credits are live
const DEMO_MODE = true;

const WORKER_URL = process.env.EXPO_PUBLIC_DATA_URL ?? 'https://bilinguist-brief.williamdiggz.workers.dev';

const LANG_LOCALE: Record<string, string> = {
  fr: 'fr-FR', de: 'de-DE', sv: 'sv-SE', en: 'en-GB',
  it: 'it-IT', es: 'es-ES', tr: 'tr-TR',
};

function speakDemo(text: string, language: LanguageCode, trackingKey: string) {
  const { setPlaying, setIdle } = useAudioStore.getState();
  setPlaying();
  Speech.speak(text, {
    language: LANG_LOCALE[language] ?? 'en-GB',
    rate: 0.88,
    onDone:    setIdle,
    onStopped: setIdle,
    onError:   setIdle,
  });
}

// ─── Module-level sound instance ─────────────────────────────────────────────
// Kept outside Zustand so it's never serialised. The store only holds the
// boolean playing/loading flags that drive the UI.

let _sound: Audio.Sound | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synthesise `text` via ElevenLabs and begin playback.
 * Stops any currently playing audio first.
 */
export async function playAudioHeadline(
  text: string,
  language: LanguageCode,
  trackingKey?: string,
): Promise<void> {
  if (DEMO_MODE) { speakDemo(text, language, trackingKey ?? text); return; }

  const { setLoading, setPlaying, setIdle } = useAudioStore.getState();

  // Stop and release any existing sound
  if (_sound) {
    try {
      await _sound.stopAsync();
      await _sound.unloadAsync();
    } catch { /* ignore */ }
    _sound = null;
  }

  // Use trackingKey (e.g. headline) so per-article UI state stays in sync
  // even when `text` is the full article body.
  setLoading(trackingKey ?? text);

  const result = await synthesizeWord(text, language);
  if (!result.ok) {
    setIdle();
    return;
  }

  try {
    // Allow audio on silent mode (iOS)
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: result.audioUri },
      { shouldPlay: true },
    );
    _sound = sound;
    setPlaying();

    sound.setOnPlaybackStatusUpdate((s) => {
      if (s.isLoaded && s.didJustFinish) {
        setIdle();
        _sound = null;
      }
    });
  } catch {
    setIdle();
  }
}

/**
 * Pause currently playing audio (keeps it loaded for resumption).
 */
export async function pauseAudio(): Promise<void> {
  if (DEMO_MODE) { Speech.stop(); useAudioStore.getState().setIdle(); return; }
  if (!_sound) return;
  try {
    await _sound.pauseAsync();
  } catch { /* ignore */ }
  useAudioStore.getState().setIdle();
}

/**
 * Resume paused audio.
 */
export async function resumeAudio(): Promise<void> {
  if (!_sound) return;
  try {
    await _sound.playAsync();
    useAudioStore.getState().setPlaying();
  } catch { /* ignore */ }
}

/**
 * Fetch/cache article audio via the Worker (R2-backed) and play it.
 * First caller synthesises via ElevenLabs and caches; subsequent callers stream from R2.
 */
export async function playArticleAudio(
  text: string,
  language: LanguageCode,
  trackingKey: string,
  audioKey: string,
): Promise<void> {
  if (DEMO_MODE) { speakDemo(text, language, trackingKey); return; }

  const { setLoading, setPlaying, setIdle } = useAudioStore.getState();

  if (_sound) {
    try {
      await _sound.stopAsync();
      await _sound.unloadAsync();
    } catch { /* ignore */ }
    _sound = null;
  }

  setLoading(trackingKey);

  try {
    const res = await fetch(`${WORKER_URL}/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: audioKey, text, lang: language }),
    });

    if (!res.ok) { setIdle(); return; }

    const data = await res.json() as { url?: string };
    if (!data.url) { setIdle(); return; }

    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });

    const { sound } = await Audio.Sound.createAsync({ uri: data.url }, { shouldPlay: true });
    _sound = sound;
    setPlaying();

    sound.setOnPlaybackStatusUpdate((s) => {
      if (s.isLoaded && s.didJustFinish) {
        setIdle();
        _sound = null;
      }
    });
  } catch {
    setIdle();
  }
}

/** Stop and fully release the current sound. */
export async function stopAudio(): Promise<void> {
  if (DEMO_MODE) { Speech.stop(); useAudioStore.getState().setIdle(); return; }
  if (!_sound) return;
  try {
    await _sound.stopAsync();
    await _sound.unloadAsync();
  } catch { /* ignore */ }
  _sound = null;
  useAudioStore.getState().setIdle();
}
