import React, { createContext, useContext, useMemo } from 'react';
import { languageLocales, translate, type AppLanguage, type MessageParams } from './core';

export interface LanguageContextValue {
  language: AppLanguage;
  locale: string;
  t(source: string, params?: MessageParams): string;
  setLanguage(language: AppLanguage): Promise<void>;
  languageBusy: boolean;
}
const LanguageContext = createContext<LanguageContextValue>({ language: 'es', locale: languageLocales.es,
  t: (source, params) => translate('es', source, params), setLanguage: async () => undefined, languageBusy: false });
export function LanguageProvider({ language, onLanguageChange, busy = false, children }: {
  language: AppLanguage; onLanguageChange(language: AppLanguage): Promise<void>; busy?: boolean; children: React.ReactNode;
}) {
  const value = useMemo<LanguageContextValue>(() => ({ language, locale: languageLocales[language],
    t: (source, params) => translate(language, source, params), setLanguage: onLanguageChange, languageBusy: busy,
  }), [language, onLanguageChange, busy]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useI18n(): LanguageContextValue { return useContext(LanguageContext); }
