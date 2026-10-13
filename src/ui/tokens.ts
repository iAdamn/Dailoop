import type { Theme } from '../domain/types';

export const palette = {
  violet: '#6F5BFF', lilac: '#9A7CFF', lavender: '#DCCFFF',
  sky: '#8FD8FF', base: '#F7F7FC', ink: '#23263A',
} as const;

/** Every translucent surface is derived from one of the six original brand colors. */
export function alpha(color: string, opacity: number) {
  return `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}`;
}

export function themeColors(setting: Theme, systemDark: boolean) {
  const dark = setting === 'dark' || (setting === 'system' && systemDark);
  return {
    dark, background: dark ? palette.ink : palette.base,
    text: dark ? palette.base : palette.ink,
    muted: dark ? palette.lavender : palette.ink,
    panel: dark ? palette.ink : palette.base,
    border: dark ? palette.lilac : palette.lavender,
    input: dark ? palette.lavender : palette.base,
    button: dark ? palette.lavender : palette.ink,
    buttonText: dark ? palette.ink : palette.base,
    surfaceEdge: dark ? alpha(palette.lavender, 0.3) : alpha(palette.lilac, 0.28),
    surfaceShadow: dark ? alpha(palette.ink, 0.32) : alpha(palette.ink, 0.08),
  };
}
export type UIColors = ReturnType<typeof themeColors>;
