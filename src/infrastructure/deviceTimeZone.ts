/** Android may report zero-offset aliases (notably "GMT") that the packaged
 * formatter does not recognize. This chooses the initial device zone only;
 * it never rewrites a saved database's settings or historical entry zones. */
export function deviceTimeZone(value: unknown): string {
  const reported = typeof value === 'string' && value.trim() ? value.trim() : 'America/Bogota';
  const zone = /^(?:(?:Etc\/)?(?:UTC|GMT|UCT|Universal|Zulu|Greenwich)|(?:UTC|GMT)[+-]0{1,2}(?::?00)?)$/i.test(reported)
    ? 'UTC' : reported;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); return zone; }
  catch { return 'UTC'; }
}
