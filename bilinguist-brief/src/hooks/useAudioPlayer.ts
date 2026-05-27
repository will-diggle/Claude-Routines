import { useEffect, useRef, useState, useCallback } from 'react';
import { Audio } from 'expo-av';

type PlayerState = 'idle' | 'loading' | 'playing' | 'error';

interface AudioPlayerHook {
  state: PlayerState;
  play: (audioUri: string) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Manages an expo-av Sound instance for one-shot word pronunciation.
 *
 * Usage:
 *   const { state, play, stop } = useAudioPlayer();
 *   await play(audioUri);   // plays immediately, cleans up after
 */
export function useAudioPlayer(): AudioPlayerHook {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [state, setState] = useState<PlayerState>('idle');

  // Ensure audio routes correctly on iOS (speaker, not earpiece)
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    }).catch(() => {});

    return () => {
      // Unload sound on unmount
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setState('idle');
  }, []);

  const play = useCallback(async (audioUri: string) => {
    // Stop any currently playing audio first
    await stop();

    setState('loading');
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setState('playing');

      // Clean up once playback finishes naturally
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          setState('idle');
        }
      });
    } catch {
      setState('error');
    }
  }, [stop]);

  return { state, play, stop };
}
