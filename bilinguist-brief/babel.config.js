module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated v4 split its worklet transform out into react-native-worklets —
    // react-native-reanimated/plugin no longer exists as of v4. Must be last.
    plugins: ['react-native-worklets/plugin'],
  };
};
