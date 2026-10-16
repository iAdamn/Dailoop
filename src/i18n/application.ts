import { translate, type AppLanguage } from './core';
import { localizeError } from './errors';

const prefixes = ['No se pudieron leer tus preferencias. ', 'No se guardó la distribución. ', 'No se guardó el tipo de lista. ', 'No se guardó el idioma. ', 'No se importó ningún dato. '] as const;
/** Localize our wrappers; preserve provider details and never run on user content. */
export function localizeApplicationMessage(language: AppLanguage, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (language === 'es') return message;
  for (const prefix of prefixes) if (message.startsWith(prefix)) return translate(language, prefix.trimEnd()) + ' ' + localizeError(language, message.slice(prefix.length));
  const translated = translate(language, message);
  return translated !== message ? translated : localizeError(language, message);
}
