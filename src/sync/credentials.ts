import { takeGoogleCallback } from './oauthCallback';
const database = 'dailoop-cloud-credentials-v1';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('session');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo guardar la sesión de Google.'));
  });
}
async function vault(mode: IDBTransactionMode, value?: string | null): Promise<string | null> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('session', mode); const store = tx.objectStore('session');
      const request = mode === 'readonly' ? store.get('firebase') : value === null ? store.delete('firebase') : store.put(value, 'firebase');
      tx.oncomplete = () => resolve(mode === 'readonly' && typeof request.result === 'string' ? request.result : null);
      tx.onabort = tx.onerror = () => reject(new Error('No se pudo guardar la sesión de Google.'));
    });
  } finally { db.close(); }
}
export const credentialVault = { read: () => vault('readonly'), write: async (value: string) => { await vault('readwrite', value); }, clear: async () => { await vault('readwrite', null); } };
export function subscribeOnline(listener: () => void): () => void { window.addEventListener('online', listener); return () => window.removeEventListener('online', listener); }
const pendingKey = 'dailoop.google.oauth.v1';
/** Full-page redirect preserves COOP/COEP required by SQLite; no popup isolation workaround. */
export async function googleCredential(clientId: string): Promise<null> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(pendingKey, JSON.stringify({ state, createdAt: Date.now() }));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: location.origin + location.pathname,
    response_type: 'token', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
  location.assign(url.toString());
  return null;
}
export const pendingGoogleCredential = takeGoogleCallback;
