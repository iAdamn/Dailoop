import { graphemeLength } from '../domain/validation';

export const emojiCategories = [
  { name: 'Caras y emociones', icon: '😀' }, { name: 'Personas y gestos', icon: '👋' },
  { name: 'Tonos y cabello', icon: '🧩' }, { name: 'Animales y naturaleza', icon: '🌿' },
  { name: 'Comida y bebida', icon: '🍋' }, { name: 'Viajes y lugares', icon: '🌍' },
  { name: 'Actividades', icon: '⚽' }, { name: 'Objetos', icon: '💡' },
  { name: 'Símbolos', icon: '❤️' }, { name: 'Banderas', icon: '🏳️' },
] as const;
export interface EmojiChoice { emoji: string; name: string; search: string; category: number }
let choices: EmojiChoice[] | undefined;
export const normalizeEmojiSearch = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();

/** Delay parsing/indexing until the picker is opened; keep tab startup light. */
export function getEmojiChoices(): EmojiChoice[] {
  if (!choices) {
    const catalog = require('./data/emojis.json') as { entries: [string, string, string, number][] };
    choices = catalog.entries.map(([emoji, name, words, category]) => ({ emoji, name, category, search: normalizeEmojiSearch(`${emoji} ${name} ${words}`) }));
  }
  return choices;
}
export function findEmojis(query: string, category: number): EmojiChoice[] {
  const terms = normalizeEmojiSearch(query).split(/\s+/).filter(Boolean);
  return getEmojiChoices().filter(choice => terms.length ? terms.every(term => choice.search.includes(term)) : category < 0 || choice.category === category);
}
export function isSingleEmoji(value: string): boolean {
  const emoji = value.trim();
  return !!emoji && graphemeLength(emoji) === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[0-9#*]\uFE0F?\u20E3/u.test(emoji);
}
