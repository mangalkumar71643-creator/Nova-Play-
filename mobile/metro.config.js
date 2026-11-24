// Metro (the bundler) with one change: the app loads a small copy of the MaterialCommunityIcons font (only the icons the app uses,
// made by scripts/fonts/subset.py) instead of the full one from @expo/vector-icons, which is 1.3 MB.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const ICON_FONT = path.resolve(__dirname, 'assets/fonts/MaterialCommunityIcons.subset.ttf');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/(^|\/)MaterialCommunityIcons\.ttf$/.test(moduleName)) {
    return { type: 'sourceFile', filePath: ICON_FONT };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
