import { createContext, useContext } from 'react';

export type FeedbackKind = 'selection' | 'action';
export type InteractionFeedback = (kind: FeedbackKind) => void;
export const FeedbackContext = createContext<InteractionFeedback>(() => undefined);
export const useInteractionFeedback = () => useContext(FeedbackContext);
