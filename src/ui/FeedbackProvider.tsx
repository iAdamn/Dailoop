import React, { useCallback, useEffect, useRef, useState } from 'react';
import { presentationPreferences, sensoryPreferences, type SensoryPreferences } from '../infrastructure/preferences';
import { FeedbackContext, type FeedbackKind, type FeedbackOptions } from './feedback';
import { useFeedbackDriver } from './feedbackDriver';

export function FeedbackProvider({ children, preferences }: { children: React.ReactNode; preferences?: SensoryPreferences }) {
  const dispatch = useFeedbackDriver();
  const [saved, setSaved] = useState(() => sensoryPreferences(presentationPreferences.current()));
  useEffect(() => {
    if (preferences) return;
    const unsubscribe = presentationPreferences.subscribe(value => setSaved(sensoryPreferences(value)));
    // Reuse the singleton preference owner; never open the audited data database.
    void presentationPreferences.load().catch(() => undefined);
    return unsubscribe;
  }, [preferences]);
  const channels = preferences ?? saved;
  const last = useRef(-Infinity);
  const feedback = useCallback((kind: FeedbackKind, options?: FeedbackOptions) => {
    // Distinct drag boundaries can arrive together across the UI/JS bridge.
    // Each gets its tick without consuming the normal tap rate limit.
    if (kind !== 'selection' || !options?.boundary) {
      const now = performance.now();
      if (now - last.current < 75) return;
      last.current = now;
    }
    // Device capabilities must never hold up or cancel the user's action.
    try { dispatch(kind, { haptics: channels.haptics, sound: channels.sounds && (kind === 'selection' ? channels.navigationSounds : channels.confirmationSounds) }); } catch { /* optional sensory feedback */ }
  }, [dispatch, channels]);
  return <FeedbackContext.Provider value={feedback}>{children}</FeedbackContext.Provider>;
}
