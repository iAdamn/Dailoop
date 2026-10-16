import { type AppLanguage, languageLocales } from '../i18n/core';
import { graphemeLength } from '../domain/validation';

export const emojiCategories = [
  { name: 'Caras y emociones', icon: '😀' }, { name: 'Personas y gestos', icon: '👋' },
  { name: 'Tonos y cabello', icon: '🧩' }, { name: 'Animales y naturaleza', icon: '🌿' },
  { name: 'Comida y bebida', icon: '🍋' }, { name: 'Viajes y lugares', icon: '🌍' },
  { name: 'Actividades', icon: '⚽' }, { name: 'Objetos', icon: '💡' },
  { name: 'Símbolos', icon: '❤️' }, { name: 'Banderas', icon: '🏳️' },
] as const;
export interface EmojiChoice { emoji: string; name: string; search: string; category: number }
const choices: Partial<Record<AppLanguage, EmojiChoice[]>> = {};
export const normalizeEmojiSearch = (text: string, language: AppLanguage = 'es') => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(languageLocales[language]).trim();

/** Delay parsing/indexing until the picker is opened; keep tab startup light. */
export function getEmojiChoices(language: AppLanguage = 'es'): EmojiChoice[] {
  if (!choices[language]) {
    const catalog = require('./data/emojis.json') as { entries: [string, string, string, number][] };
    // Text-only CLDR annotations load with the picker, never during tab startup.
    const localized = language === 'es' ? undefined : (require('./data/emoji-locales.json') as Record<'en' | 'pt', Record<string, [string, string]>>)[language];
    choices[language] = catalog.entries.map(([emoji, spanishName, spanishWords, category]) => {
      const [name, words] = localized?.[emoji.replace(/\uFE0F/g, '')] ?? [spanishName, spanishWords];
      return { emoji, name, category, search: normalizeEmojiSearch(`${emoji} ${name} ${words}`, language) };
    });
  }
  return choices[language]!;
}
export function findEmojis(query: string, category: number, language: AppLanguage = 'es'): EmojiChoice[] {
  const terms = normalizeEmojiSearch(query, language).split(/\s+/).filter(Boolean);
  return getEmojiChoices(language).filter(choice => terms.length ? terms.every(term => choice.search.includes(term)) : category < 0 || choice.category === category);
}
export function isSingleEmoji(value: string): boolean {
  const emoji = value.trim();
  return !!emoji && graphemeLength(emoji) === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[0-9#*]\uFE0F?\u20E3/u.test(emoji);
}
