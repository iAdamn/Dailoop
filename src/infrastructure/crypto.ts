import * as Crypto from 'expo-crypto';
export const uuid = () => Crypto.randomUUID();
export const digest = (text:string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
