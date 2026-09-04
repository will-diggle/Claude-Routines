import { Audio } from 'expo-av';

// Lazy-require expo-speech — the native module may not be present in all
// build environments. Static import would throw synchronously at module load
// and prevent registerRootComponent from ever being called.
let _speech: typeof import('expo-speech') | null = null;
function getSpeech() {
  if (_speech !== undefined) return _speech;
  try { _speech = require('expo-speech'); } catch { _speech = null; }
  return _speech;
}
import { useAudioStore } from '../store/useAudioStore';
import type { LanguageCode } from '../store/useSettingsStore';

const WORKER_URL = process.env.EXPO_PUBLIC_DATA_URL ?? 'https://bilinguist-brief.williamdiggz.workers.dev';

const LANG_LOCALE: Record<string, string> = {
  fr: 'fr-FR', de: 'de-DE', sv: 'sv-SE', en: 'en-GB',
  it: 'it-IT', es: 'es-ES', tr: 'tr-TR',
};

async function speakDemo(text: string, language: LanguageCode, trackingKey: string) {
  const { setLoading, setPlaying, setIdle } = useAudioStore.getState();
  setLoading(trackingKey);
  setPlaying();
  // Configure AVAudioSession BEFORE speaking — changing the category while the
  // synthesiser is running triggers a system interruption that fires onStopped.
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
  } catch { /* ignore — speech will still play, just may respect the silent switch */ }
  getSpeech()?.speak(text, {
    language: LANG_LOCALE[language] ?? 'en-GB',
    rate: 0.88,
    onDone:    setIdle,
    onStopped: setIdle,
    onError:   setIdle,
  });
}

// ─── Module-level sound instance ─────────────────────────────────────────────
// Kept outside Zustand so it's never serialised. The store only holds the
// boolean playing/loading flags that drive the UI. Non-null exactly when a
// real streamed file (playArticleAudio) is the active playback mechanism,
// as opposed to on-device speech (speakDemo) — pause/resume/stop below branch
// on this rather than a global mode flag, since both mechanisms can be reached
// from different screens and need to be stopped/paused correctly regardless
// of which one is actually active.
let _sound: Audio.Sound | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Speak `text` aloud on-device. Used where there's no pre-generated audio file
 * to stream (see playArticleAudio for that case).
 */
export async function playAudioHeadline(
  text: string,
  language: LanguageCode,
  trackingKey?: string,
): Promise<void> {
  speakDemo(text, language, trackingKey ?? text);
}

/**
 * Pause currently playing audio (keeps it loaded for resumption).
 */
export async function pauseAudio(): Promise<void> {
  if (_sound) {
    try { await _sound.pauseAsync(); } catch { /* ignore */ }
  } else {
    getSpeech()?.stop();
  }
  useAudioStore.getState().setIdle();
}

/**
 * Resume paused audio. On-device speech has no true pause/resume (expo-speech
 * only supports stop), so this only does anything when a real sound is loaded.
 */
export async function resumeAudio(): Promise<void> {
  if (!_sound) return;
  try {
    await _sound.playAsync();
    useAudioStore.getState().setPlaying();
  } catch { /* ignore */ }
}

/**
 * Stream and play pre-generated article audio from the Worker's R2-backed
 * /audio/{key} route. `audioKey` comes straight off the article object in the
 * bundle (set by the pipeline when it generates the file) — the caller should
 * only invoke this when that key is actually present.
 */
export async function playArticleAudio(
  language: LanguageCode,
  trackingKey: string,
  audioKey: string,
): Promise<void> {
  const { setLoading, setPlaying, setIdle } = useAudioStore.getState();

  if (_sound) {
    try {
      await _sound.stopAsync();
      await _sound.unloadAsync();
    } catch { /* ignore */ }
    _sound = null;
  }
  getSpeech()?.stop();

  setLoading(trackingKey);

  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });

    const { sound } = await Audio.Sound.createAsync(
      { uri: `${WORKER_URL}/audio/${audioKey}` },
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

/** Stop and fully release the current sound. */
export async function stopAudio(): Promise<void> {
  if (_sound) {
    try {
      await _sound.stopAsync();
      await _sound.unloadAsync();
    } catch { /* ignore */ }
    _sound = null;
  } else {
    getSpeech()?.stop();
  }
  useAudioStore.getState().setIdle();
}
