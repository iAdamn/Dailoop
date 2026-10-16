export interface CloudConfig { projectId: string; apiKey: string; googleWebClientId: string }
/** Client identifiers are public. Never place service-account/admin secrets here. */
export function cloudConfig(): CloudConfig | null {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || !apiKey || !/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey)
    || !googleWebClientId || !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(googleWebClientId)) return null;
  return { projectId, apiKey, googleWebClientId };
}
