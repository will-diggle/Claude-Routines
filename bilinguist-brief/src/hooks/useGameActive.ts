import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useNavPillStore } from '../store/useNavPillStore';

export function useGameActive() {
  const setGameActive = useNavPillStore((s) => s.setGameActive);
  useFocusEffect(useCallback(() => {
    setGameActive(true);
    return () => setGameActive(false);
  }, [setGameActive]));
}
