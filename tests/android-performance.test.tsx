jest.mock('expo/config-plugins', () => ({ withAndroidManifest: jest.fn(), withMainActivity: jest.fn() }));

const { applyRefreshPreference } = jest.requireActual('../plugins/withAndroidPerformance.cjs') as { applyRefreshPreference(source: string): string };
const template = 'class MainActivity {\n  override fun getMainComponentName(): String = "main"\n  fun unrelated() = "preserved"\n}\n';

test('incremental prebuild refreshes its generated method without duplication or losing other methods', () => {
  const current = applyRefreshPreference(template);
  expect(applyRefreshPreference(current)).toBe(current);
  const stale = current.replace('coerceAtMost(120f)', 'coerceAtMost(60f)');
  expect(applyRefreshPreference(stale)).toBe(current);
  const oldWithoutEndMarker = stale.replace('  // End Dailoop adaptive refresh preference\n', '');
  expect(applyRefreshPreference(oldWithoutEndMarker)).toBe(current);
  expect(current.match(/override fun onWindowFocusChanged/g)).toHaveLength(1);
  expect(current).toContain('fun unrelated() = "preserved"');
});

test('unrecognized or conflicting native templates stop without silently overwriting code', () => {
  expect(() => applyRefreshPreference('class Changed {}')).toThrow('template changed');
  expect(() => applyRefreshPreference(template.replace('class MainActivity {', 'class MainActivity {\n  override fun onWindowFocusChanged(value: Boolean) {}'))).toThrow('template changed');
  expect(() => applyRefreshPreference('// Dailoop adaptive refresh preference\nunknown')).toThrow('block changed');
});
