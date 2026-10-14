import { useCallback, useEffect, useRef } from 'react';
import { Asset } from 'expo-asset';
import type { FeedbackKind } from './feedback';
import { feedbackSounds } from './feedbackSounds';

export function useFeedbackDriver() {
  const audio = useRef<Partial<Record<FeedbackKind, HTMLAudioElement>>>({});
  useEffect(() => {
    const sounds: Partial<Record<FeedbackKind, HTMLAudioElement>> = {};
    for (const kind of ['action', 'selection'] as const) {
      try {
        const sound = new Audio(Asset.fromModule(feedbackSounds[kind].source).uri);
        sound.preload = 'auto'; sound.volume = feedbackSounds[kind].volume;
        sounds[kind] = sound;
      } catch { /* Each sound is optional on unsupported browsers. */ }
    }
    audio.current = sounds;
    const stop = () => { if (document.hidden) Object.values(sounds).forEach(sound => sound.pause()); };
    document.addEventListener('visibilitychange', stop);
    return () => {
      document.removeEventListener('visibilitychange', stop); audio.current = {};
      Object.values(sounds).forEach(sound => { sound.pause(); sound.removeAttribute('src'); sound.load(); });
    };
  }, []);
  return useCallback((kind: FeedbackKind) => {
    if (document.hidden) return;
    try { navigator.vibrate?.(kind === 'action' ? 14 : 7); } catch { /* unsupported browser */ }
    const sound = audio.current[kind];
    if (!sound) return;
    Object.values(audio.current).forEach(other => { if (other !== sound) other.pause(); });
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
  }, []);
}
