import { createContext, useContext } from 'react';

export type FeedbackKind = 'selection' | 'action';
export interface FeedbackChannels { haptics: boolean; sound: boolean }
export interface FeedbackOptions {
  /** A discrete tab boundary crossed while dragging, rather than a repeated tap. */
  boundary?: boolean;
}
export type InteractionFeedback = (kind: FeedbackKind, options?: FeedbackOptions) => void;
export const FeedbackContext = createContext<InteractionFeedback>(() => undefined);
export const useInteractionFeedback = () => useContext(FeedbackContext);
