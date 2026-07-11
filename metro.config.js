const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const megajsBrowserPath = path.resolve(__dirname, 'node_modules/megajs/dist/main.browser-es.mjs');
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'megajs') {
    return { filePath: megajsBrowserPath, type: 'sourceFile' };
  }
  if (platform !== 'web' && (
    moduleName === 'canvaskit-wasm'
    || moduleName.startsWith('canvaskit-wasm/')
    || moduleName.includes('LoadSkiaWeb')
  )) {
    return { type: 'empty' };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
