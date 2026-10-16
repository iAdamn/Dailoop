import type { CloudAccount } from './types';
import type { CloudConfig } from './config';

export interface AuthSession extends CloudAccount { idToken: string; refreshToken: string; expiresAt: number }
export interface CredentialVault { read(): Promise<string | null>; write(value: string): Promise<void>; clear(): Promise<void> }
export interface GoogleCredential { kind: 'access_token' | 'id_token'; token: string }
export class CloudAuthError extends Error { constructor(readonly code: 'network' | 'expired' | 'invalid' | 'storage') { super(code === 'network' ? 'No hay conexión. Tus datos siguen guardados aquí.' : code === 'storage' ? 'No se pudo guardar la sesión de Google.' : 'La sesión de Google caducó. Vuelve a conectar.'); } }
const MAX_LIFETIME_SECONDS = 86_400;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function session(value: unknown, now: number): AuthSession {
  if (!Number.isSafeInteger(now) || !record(value) || !exactKeys(value, ['uid', 'email', 'displayName', 'idToken', 'refreshToken', 'expiresAt'])) throw new CloudAuthError('invalid');
  const v = value as unknown as AuthSession;
  if (typeof v.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v.uid) || typeof v.email !== 'string' || v.email.length > 512
    || typeof v.displayName !== 'string' || v.displayName.length > 512 || typeof v.idToken !== 'string' || !v.idToken || v.idToken.length > 8192
    || typeof v.refreshToken !== 'string' || !v.refreshToken || v.refreshToken.length > 8192 || !Number.isSafeInteger(v.expiresAt)
    || v.expiresAt <= 0 || v.expiresAt > 8_640_000_000_000_000 || v.expiresAt > now + MAX_LIFETIME_SECONDS * 1000) throw new CloudAuthError('invalid');
  return v;
}
function expiry(value: unknown, now: number): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !/^[1-9][0-9]{0,4}$/.test(value))) throw new CloudAuthError('invalid');
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_LIFETIME_SECONDS || !Number.isSafeInteger(now)) throw new CloudAuthError('invalid');
  return now + seconds * 1000;
}
/** Firebase REST identity only: no analytics, remote assets or admin credentials. */
export class CloudAuth {
  private current: AuthSession | null = null;
  private refreshing: { epoch: number; uid: string; promise: Promise<string> } | null = null;
  private persistence: Promise<void> = Promise.resolve();
  private epoch = 0;
  constructor(private config: CloudConfig, private vault: CredentialVault, private fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init), private clock = Date.now) {}
  get account(): CloudAccount | null { return this.current ? { uid: this.current.uid, email: this.current.email, displayName: this.current.displayName } : null; }
  /** A logout clear is queued immediately, after any in-flight write and before later sign-ins. */
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.persistence.then(work);
    this.persistence = result.then(() => undefined, () => undefined);
    return result;
  }
  private async storage<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch { throw new CloudAuthError('storage'); }
  }
  private async save(value: AuthSession, epoch: number, expected?: AuthSession): Promise<void> {
    await this.queue(async () => {
      if (epoch !== this.epoch || (expected && this.current !== expected)) throw new CloudAuthError('expired');
      await this.storage(() => this.vault.write(JSON.stringify({ projectId: this.config.projectId, session: value })));
      if (epoch !== this.epoch || (expected && this.current !== expected)) throw new CloudAuthError('expired');
      this.current = value;
    });
  }
  async load(): Promise<void> {
    const epoch = this.epoch;
    await this.queue(async () => {
      if (epoch !== this.epoch) return;
      const raw = await this.storage(() => this.vault.read());
      if (epoch !== this.epoch || !raw) return;
      let value: AuthSession;
      try {
        if (raw.length > 32768) throw new CloudAuthError('invalid');
        const stored: unknown = JSON.parse(raw);
        if (!record(stored) || !exactKeys(stored, ['projectId', 'session']) || stored.projectId !== this.config.projectId) throw new CloudAuthError('invalid');
        value = session(stored.session, this.clock());
      } catch {
        // Still inside the persistence queue: a later successful sign-in writes after this clear.
        await this.storage(() => this.vault.clear());
        if (epoch === this.epoch) this.current = null;
        return;
      }
      if (epoch === this.epoch) this.current = value;
    });
  }
  private async request(url: string, body: string, contentType = 'application/json'): Promise<Record<string, unknown>> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new CloudAuthError('network')); }, 20_000); });
    try {
      return await Promise.race([(async () => {
        const response = await this.fetcher(url, { method: 'POST', headers: { 'Content-Type': contentType }, body, signal: abort.signal });
        if (!response.ok) throw new CloudAuthError(response.status >= 500 || response.status === 429 ? 'network' : 'expired');
        const text = await response.text(); if (text.length > 65536) throw new CloudAuthError('invalid');
        let result: unknown;
        try { result = JSON.parse(text); } catch { throw new CloudAuthError('invalid'); }
        if (!record(result)) throw new CloudAuthError('invalid');
        return result;
      })(), timeout]);
    } catch (error) { if (error instanceof CloudAuthError) throw error; throw new CloudAuthError('network'); }
    finally { clearTimeout(timer); }
  }
  async signIn(credential: GoogleCredential, expectedUid?: string, existingOnly = false): Promise<void> {
    if (!record(credential) || !exactKeys(credential, ['kind', 'token']) || (credential.kind !== 'id_token' && credential.kind !== 'access_token')
      || typeof credential.token !== 'string' || !credential.token || credential.token.length > 8192) throw new CloudAuthError('invalid');
    const epoch = ++this.epoch;
    this.refreshing = null;
    const result = await this.request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(this.config.apiKey)}`,
      JSON.stringify({ requestUri: `https://${this.config.projectId}.firebaseapp.com`, postBody: new URLSearchParams({ providerId: 'google.com', [credential.kind]: credential.token }).toString(), returnSecureToken: true, ...(existingOnly ? { autoCreate: false } : {}) }));
    const value = session({ uid: result.localId, email: result.email ?? '', displayName: result.displayName ?? '', idToken: result.idToken,
      refreshToken: result.refreshToken, expiresAt: expiry(result.expiresIn, this.clock()) }, this.clock());
    if (expectedUid && value.uid !== expectedUid) throw new CloudAuthError('invalid');
    await this.save(value, epoch);
  }
  /** Invoked only after the owned Firestore data has been purged and verified. */
  async deleteAccount(expectedUid: string): Promise<void> {
    if (this.current?.uid !== expectedUid) throw new CloudAuthError('invalid');
    const epoch = this.epoch;
    const idToken = await this.token();
    if (this.current?.uid !== expectedUid || epoch !== this.epoch) throw new CloudAuthError('invalid');
    await this.request(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(this.config.apiKey)}`, JSON.stringify({ idToken }));
    if (this.current?.uid === expectedUid && epoch === this.epoch) await this.signOut();
  }
  async token(): Promise<string> {
    if (!this.current) throw new CloudAuthError('expired');
    if (this.current.expiresAt - this.clock() > 60_000) return this.current.idToken;
    const previous = this.current; const epoch = this.epoch;
    if (this.refreshing?.epoch === epoch && this.refreshing.uid === previous.uid) return this.refreshing.promise;
    const work = async () => {
      const result = await this.request(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.config.apiKey)}`,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: previous.refreshToken }).toString(), 'application/x-www-form-urlencoded');
      const value = session({ ...previous, uid: result.user_id, idToken: result.id_token, refreshToken: result.refresh_token, expiresAt: expiry(result.expires_in, this.clock()) }, this.clock());
      if (value.uid !== previous.uid || epoch !== this.epoch) throw new CloudAuthError('expired');
      await this.save(value, epoch, previous);
      return value.idToken;
    };
    const refresh = { epoch, uid: previous.uid, promise: Promise.resolve('') };
    refresh.promise = work().finally(() => { if (this.refreshing === refresh) this.refreshing = null; });
    this.refreshing = refresh;
    return refresh.promise;
  }
  async signOut(): Promise<void> {
    ++this.epoch; this.current = null; this.refreshing = null;
    await this.queue(() => this.storage(() => this.vault.clear()));
  }
}
