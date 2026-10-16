const pendingKey = 'dailoop.google.oauth.v1';
type Credential = { kind: 'access_token'; token: string };
type BrowserCallback = Pick<Window, 'location' | 'history' | 'sessionStorage'>;

/** Capture synchronously, before app routing can normalize an unfamiliar fragment. */
export function captureGoogleCallback(browser: BrowserCallback, now = Date.now()): Credential | null {
  const parameters = new URLSearchParams(browser.location.hash.slice(1));
  if (!parameters.has('access_token') && !parameters.has('error')) return null;
  browser.history.replaceState(null, '', browser.location.pathname + browser.location.search + '#tab=settings');
  const raw = browser.sessionStorage.getItem(pendingKey); browser.sessionStorage.removeItem(pendingKey);
  let pending: { state?: string; createdAt?: number };
  try { pending = JSON.parse(raw || '{}'); } catch { throw new Error('La sesión de Google caducó. Vuelve a conectar.'); }
  if (!pending.state || pending.state !== parameters.get('state') || typeof pending.createdAt !== 'number'
    || !Number.isFinite(pending.createdAt) || now - pending.createdAt > 10 * 60_000 || pending.createdAt > now) {
    throw new Error('La sesión de Google caducó. Vuelve a conectar.');
  }
  if (parameters.get('error') === 'access_denied') return null;
  const token = parameters.get('access_token');
  if (parameters.has('error') || !token || token.length > 8192) throw new Error('No se pudo conectar con Google.');
  return { kind: 'access_token', token };
}

let captured: Credential | Error | null = null;
if (typeof window !== 'undefined') {
  try { captured = captureGoogleCallback(window); }
  catch (error) { captured = error instanceof Error ? error : new Error('No se pudo conectar con Google.'); }
}
export async function takeGoogleCallback(): Promise<Credential | null> {
  const value = captured; captured = null;
  if (value instanceof Error) throw value;
  return value;
}
