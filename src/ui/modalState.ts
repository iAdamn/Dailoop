import { createContext, useContext } from 'react';

/** Dialog visibility is separate from mounting, so retained tabs keep drafts. */
export const ModalVisibilityContext = createContext(true);
/** Freeze a submitted snapshot until persistence finishes or fails. */
export const ModalInteractionContext = createContext(false);
export const useModalInteractionDisabled = () => useContext(ModalInteractionContext);
