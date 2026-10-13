const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const excludes = domains.map(domain => `    <exclude domain="${domain}" path="."/>`).join('\n');

/** Recreated by prebuild: device data stays local; release never uses the public debug key. */
module.exports = function withAndroidRelease(config) {
  config = withAndroidManifest(config, result => {
    const application = result.modResults.manifest.application[0].$;
    Object.assign(application, {
      'android:allowBackup': 'false',
      'android:fullBackupContent': '@xml/dailoop_backup_rules',
      'android:dataExtractionRules': '@xml/dailoop_data_extraction_rules',
      'android:usesCleartextTraffic': 'false',
    });
    return result;
  });
  config = withDangerousMod(config, ['android', async result => {
    const directory = path.join(result.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'dailoop_backup_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${excludes}\n</full-backup-content>\n`);
    fs.writeFileSync(path.join(directory, 'dailoop_data_extraction_rules.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup disableIfNoEncryptionCapabilities="true">\n${excludes}\n  </cloud-backup>\n  <device-transfer>\n${excludes}\n  </device-transfer>\n</data-extraction-rules>\n`);
    return result;
  }]);
  config = withAppBuildGradle(config, result => {
    let source = result.modResults.contents;
    if (!source.includes('// Dailoop private release signing')) {
      const anchor = '    signingConfigs {';
      if (!source.includes(anchor)) throw new Error('Android signing template changed; review before generating a release.');
      source = source.replace(anchor, `${anchor}
        // Dailoop private release signing: injected only by the local build script.
        release {
            def releaseStore = System.getenv('DAILOOP_KEYSTORE_PATH')
            if (releaseStore != null) {
                storeFile file(releaseStore)
                storePassword System.getenv('DAILOOP_KEYSTORE_PASSWORD')
                keyAlias 'dailoop'
                keyPassword System.getenv('DAILOOP_KEYSTORE_PASSWORD')
            }
        }`);
      source = source.replace(/(buildTypes[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
      // The first release block is signingConfigs.release, so assert the build type has the expected config.
      if (!/buildTypes[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.release/.test(source)) throw new Error('Release signing assignment was not applied.');
    }
    result.modResults.contents = source;
    return result;
  });
  return withGradleProperties(config, result => {
    const values = {
      'org.gradle.jvmargs': '-Xmx3072m -XX:MaxMetaspaceSize=1024m',
      'org.gradle.workers.max': '2',
      'org.gradle.parallel': 'false',
      'reactNativeArchitectures': process.env.DAILOOP_BUILD_ARCHITECTURES || 'arm64-v8a',
      'android.enableMinifyInReleaseBuilds': process.env.DAILOOP_OPTIMIZE_RELEASE === '0' ? 'false' : 'true',
      'android.enableShrinkResourcesInReleaseBuilds': process.env.DAILOOP_OPTIMIZE_RELEASE === '0' ? 'false' : 'true',
      'EX_DEV_CLIENT_NETWORK_INSPECTOR': 'false',
      'android.enableBundleCompression': 'true',
    };
    result.modResults = result.modResults.filter(item => !(item.type === 'property' && item.key in values));
    for (const [key, value] of Object.entries(values)) result.modResults.push({ type: 'property', key, value });
    return result;
  });
};
