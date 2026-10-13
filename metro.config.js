const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Native tooling and test output are huge, frequently changing trees, never JS
// inputs. Do not let Gradle/SDK writes invalidate the development graph.
const separator = '[\\\\/]';
const projectPattern = __dirname.split(/[\\/]/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(separator);
const generatedTrees = new RegExp(`^${projectPattern}${separator}(?:output|dist|android|ios)${separator}`);
const previousBlockList = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(previousBlockList) ? previousBlockList : previousBlockList ? [previousBlockList] : []), generatedTrees];
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
