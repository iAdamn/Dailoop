import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { FeedbackKind } from './feedback';
import { feedbackSounds } from './feedbackSounds';

export function useFeedbackDriver() {
  const players = useRef<Partial<Record<FeedbackKind, AudioPlayer>>>({});
  const ready = useRef(false);
  useEffect(() => {
    let mounted = true;
    const sounds: Partial<Record<FeedbackKind, AudioPlayer>> = {};
    for (const kind of ['action', 'selection'] as const) {
      try {
        const sound = createAudioPlayer(feedbackSounds[kind].source, { downloadFirst: true, keepAudioSessionActive: false });
        sound.volume = feedbackSounds[kind].volume;
        sounds[kind] = sound;
      } catch { /* Haptics and the other sound remain available if one cannot initialize. */ }
    }
    players.current = sounds;
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: false, shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers' }).then(() => { if (mounted) ready.current = true; }).catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') Object.values(sounds).forEach(sound => sound.pause()); });
    return () => {
      mounted = false; ready.current = false; players.current = {}; subscription.remove();
      Object.values(sounds).forEach(sound => sound.remove());
    };
  }, []);
  return useCallback((kind: FeedbackKind) => {
    if (AppState.currentState !== 'active') return;
    const vibration = Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(kind === 'action' ? Haptics.AndroidHaptics.Virtual_Key : Haptics.AndroidHaptics.Segment_Frequent_Tick)
      : Haptics.impactAsync(kind === 'action' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft);
    void vibration.catch(() => undefined);
    const sound = players.current[kind];
    if (!ready.current || !sound?.isLoaded) return;
    Object.values(players.current).forEach(other => { if (other !== sound) other.pause(); });
    void sound.seekTo(0).then(() => { if (ready.current && players.current[kind] === sound && AppState.currentState === 'active') sound.play(); }).catch(() => undefined);
  }, []);
}
