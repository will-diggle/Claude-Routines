const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');
      const hook = `
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
    end
  end
`;
      const marker = 'post_install do |installer|';
      const idx = podfile.indexOf(marker);
      if (idx !== -1) {
        podfile = podfile.slice(0, idx + marker.length) + hook + podfile.slice(idx + marker.length);
        fs.writeFileSync(podfilePath, podfile);
      }
      return config;
    },
  ]);
