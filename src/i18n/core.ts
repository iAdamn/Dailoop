import { v070AccountMessages } from './v070AccountMessages';
import { v070ReminderMessages } from './v070ReminderMessages';
import { v070PresentationMessages } from './v070PresentationMessages';
import { mainMessages } from './mainMessages';
import { planningMessages } from './planningMessages';
import { outputMessages } from './outputMessages';
import { applicationMessages } from './applicationMessages';
import { syncMessages } from './syncMessages';

export type AppLanguage = 'es' | 'en' | 'pt';
export type MessageParams = Readonly<Record<string, string | number>>;
export type MessageCatalog = Readonly<Record<string, { en: string; pt: string }>>;
export const languageLocales: Record<AppLanguage, string> = { es: 'es-CO', en: 'en-US', pt: 'pt-BR' };
export const languageNames: Record<AppLanguage, string> = { es: 'Español', en: 'English', pt: 'Português' };
export function isAppLanguage(value: unknown): value is AppLanguage { return value === 'es' || value === 'en' || value === 'pt'; }
export const messages: MessageCatalog = { ...mainMessages, ...planningMessages, ...outputMessages, ...applicationMessages, ...syncMessages, ...v070PresentationMessages, ...v070AccountMessages, ...v070ReminderMessages };
/** Only explicitly marked application messages enter this function. User content is inert. */
export function translate(language: AppLanguage, source: string, params: MessageParams = {}): string {
  const template = language === 'es' ? source : messages[source]?.[language] ?? source;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
