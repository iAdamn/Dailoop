import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { FeedbackKind } from './feedback';
import { feedbackSounds } from './feedbackSounds';

export function useFeedbackDriver() {
  const players = useRef<Partial<Record<FeedbackKind, AudioPlayer>>>({});
  const ready = useRef(false);
  const playbackRequest = useRef(0);
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
    // On Android this flag also follows the ringtone switch. Cues use media volume,
    // so a phone in vibration mode must not disable them; keep iOS behavior intact.
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: Platform.OS === 'android', shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers' }).then(() => { if (mounted) ready.current = true; }).catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        playbackRequest.current += 1;
        Object.values(sounds).forEach(sound => sound.pause());
      }
    });
    return () => {
      playbackRequest.current += 1;
      mounted = false; ready.current = false; players.current = {}; subscription.remove();
      Object.values(sounds).forEach(sound => sound.remove());
    };
  }, []);
  return useCallback((kind: FeedbackKind) => {
    if (AppState.currentState !== 'active') return;
    const request = ++playbackRequest.current;
    const vibration = Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(kind === 'action' ? Haptics.AndroidHaptics.Virtual_Key : Haptics.AndroidHaptics.Segment_Frequent_Tick)
      : Haptics.impactAsync(kind === 'action' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft);
    void vibration.catch(() => undefined);
    const sound = players.current[kind];
    // Expo Audio 57's Android isLoaded getter becomes false at STATE_ENDED.
    // The status correctly keeps an ended source loaded, so it can be rewound.
    if (!ready.current || !sound?.currentStatus.isLoaded) return;
    Object.values(players.current).forEach(other => { if (other !== sound) other.pause(); });
    // Native seeks resolve asynchronously. Never replay an old cue after a newer
    // interaction or after leaving and returning to the app.
    void sound.seekTo(0).then(() => {
      if (request === playbackRequest.current && ready.current && players.current[kind] === sound && AppState.currentState === 'active') sound.play();
    }).catch(() => undefined);
  }, []);
}
