const { withXcodeProject } = require('@expo/config-plugins');

module.exports = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      if (buildConfigs[key].buildSettings) {
        buildConfigs[key].buildSettings.USE_HERMES = false;
        // Newer Xcode (26+) uses stricter libc++ headers that no longer
        // transitively include <utility>. Force-include it so std::move
        // is available in all C++ translation units.
        buildConfigs[key].buildSettings.OTHER_CPLUSPLUSFLAGS =
          '"$(inherited) -include utility"';
      }
    }
    return config;
  });
