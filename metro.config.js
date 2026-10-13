const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // query-string 7 still requests the vulnerable CommonJS decoder. Keep its call contract
  // while bundling the upstream fixed implementation for both Web and Android.
  if (moduleName === 'decode-uri-component') return { type: 'sourceFile', filePath: require.resolve('./src/infrastructure/decode-uri.cjs') };
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  return middleware(req, res, next);
};
module.exports = config;
