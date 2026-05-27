import { Audio } from 'expo-av';
import { synthesizeWord } from './elevenlabs';
import { useAudioStore } from '../store/useAudioStore';
import type { LanguageCode } from '../store/useSettingsStore';

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

/** Stop and fully release the current sound. */
export async function stopAudio(): Promise<void> {
  if (!_sound) return;
  try {
    await _sound.stopAsync();
    await _sound.unloadAsync();
  } catch { /* ignore */ }
  _sound = null;
  useAudioStore.getState().setIdle();
}
