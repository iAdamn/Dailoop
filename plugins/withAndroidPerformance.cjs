const { withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const marker = '// Dailoop adaptive refresh preference';
const focusOverride = `  ${marker}
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    val panel = window.decorView.display ?: return
    val mode = panel.mode
    val rates = panel.supportedModes
      .filter { it.physicalWidth == mode.physicalWidth && it.physicalHeight == mode.physicalHeight }
      .map { it.refreshRate }
    // Older Android requires an advertised rate: 60/90/144 must choose 90,
    // rather than reject a manufactured 120. Zero leaves the system in control.
    val desired = if (!hasFocus) 0f else if (android.os.Build.VERSION.SDK_INT >= 34) {
      (rates.maxOrNull() ?: mode.refreshRate).coerceAtMost(120f)
    } else {
      rates.filter { it <= 120f }.maxOrNull() ?: 0f
    }
    window.attributes = window.attributes.apply { preferredRefreshRate = desired }
    if (android.os.Build.VERSION.SDK_INT >= 35) {
      window.decorView.setRequestedFrameRate(desired)
    }
  }
  // End Dailoop adaptive refresh preference

`;

function applyRefreshPreference(source) {
  if (source.includes(marker)) {
    // Refresh our bounded generated method on incremental prebuilds too.
    const generated = /  \/\/ Dailoop adaptive refresh preference\r?\n  override fun onWindowFocusChanged\(hasFocus: Boolean\) \{[\s\S]*?\r?\n  \}\r?\n(?:  \/\/ End Dailoop adaptive refresh preference\r?\n)?(?:\r?\n)?/;
    if (!generated.test(source)) throw new Error('Adaptive refresh block changed; review before replacing it.');
    return source.replace(generated, focusOverride);
  }
  const anchor = '  override fun getMainComponentName(): String = "main"';
  if (!source.includes(anchor) || source.includes('override fun onWindowFocusChanged(')) {
    throw new Error('MainActivity template changed; review adaptive refresh integration.');
  }
  return source.replace(anchor, focusOverride + anchor);
}

module.exports = function withAndroidPerformance(config) {
  config = withAndroidManifest(config, result => {
    const app = result.modResults.manifest.application[0];
    app.$['android:hardwareAccelerated'] = 'true';
    const main = app.activity.find(activity => activity.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('Dailoop MainActivity missing from manifest.');
    main.$['android:hardwareAccelerated'] = 'true';
    return result;
  });
  return withMainActivity(config, result => {
    if (result.modResults.language !== 'kt') throw new Error('Adaptive refresh requires the reviewed Kotlin template.');
    result.modResults.contents = applyRefreshPreference(result.modResults.contents);
    return result;
  });
};
module.exports.applyRefreshPreference = applyRefreshPreference;
