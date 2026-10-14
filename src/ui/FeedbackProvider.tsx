import React, { useCallback, useRef } from 'react';
import { FeedbackContext, type FeedbackKind } from './feedback';
import { useFeedbackDriver } from './feedbackDriver';

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useFeedbackDriver();
  const last = useRef(-Infinity);
  const feedback = useCallback((kind: FeedbackKind) => {
    const now = performance.now();
    if (now - last.current < 75) return;
    last.current = now;
    // Device capabilities must never hold up or cancel the user's action.
    try { dispatch(kind); } catch { /* optional sensory feedback */ }
  }, [dispatch]);
  return <FeedbackContext.Provider value={feedback}>{children}</FeedbackContext.Provider>;
}
