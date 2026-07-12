const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Disable Hermes in the main Xcode project build settings
function withDisableHermes(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      if (buildConfigs[key].buildSettings) {
        buildConfigs[key].buildSettings.USE_HERMES = false;
      }
    }
    return config;
  });
}

// Inject a post_install hook into the generated Podfile so that all Pod
// targets also get -include utility. Newer Xcode (26+) libc++ no longer
// transitively includes <utility>, so std::move fails in pods that omit it.
function withCppUtilityFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const hook = `
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |build_config|
      flags = build_config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
      unless flags.include?('-include utility')
        build_config.build_settings['OTHER_CPLUSPLUSFLAGS'] = flags + ' -include utility'
      end
    end
  end
end
`;

      if (!podfile.includes('-include utility')) {
        podfile = podfile + hook;
        fs.writeFileSync(podfilePath, podfile);
      }
      return config;
    },
  ]);
}

module.exports = (config) => withCppUtilityFix(withDisableHermes(config));
