const { withXcodeProject } = require('@expo/config-plugins');

module.exports = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      if (buildConfigs[key].buildSettings) {
        buildConfigs[key].buildSettings.USE_HERMES = false;
      }
    }
    return config;
  });
