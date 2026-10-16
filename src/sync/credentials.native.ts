import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo-modules-core';
const key = 'dailoop.cloud.session.v1';
export const credentialVault = {
  read: () => SecureStore.getItemAsync(key),
  write: (value: string) => SecureStore.setItemAsync(key, value),
  clear: () => SecureStore.deleteItemAsync(key),
};
export function subscribeOnline(listener: () => void): () => void {
  const module = requireOptionalNativeModule<{ addListener(event: string, listener: () => void): { remove(): void } }>('DailoopAccounts');
  const subscription = module?.addListener('onNetworkAvailable', listener);
  return () => subscription?.remove();
}
export async function googleCredential(clientId: string): Promise<{ kind: 'id_token'; token: string } | null> {
  const module = requireOptionalNativeModule<{ signIn(clientId: string): Promise<string | null> }>('DailoopAccounts');
  if (!module) throw new Error('Esta compilación necesita el acceso de Google.');
  try {
    const token = await module.signIn(clientId);
    return token ? { kind: 'id_token', token } : null;
  } catch { throw new Error('No se pudo conectar con Google.'); }
}
export async function pendingGoogleCredential(): Promise<{ kind: 'access_token'; token: string } | null> { return null; }
