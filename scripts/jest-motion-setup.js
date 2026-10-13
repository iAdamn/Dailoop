// No UI/JSI thread exists in Jest. This synchronous adapter verifies control/form
// contracts only; frame timing, interruption and visuals require Web/Android evidence.
// The package's upstream mock imports its native Worklets initializer in this SDK.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const { useRef } = require('react');
  return {
    __esModule: true,
    default: { View },
    useSharedValue(initial) {
      const ref = useRef({ value: initial });
      return { get: () => ref.current.value, set: value => { ref.current.value = value; } };
    },
    useAnimatedStyle: callback => callback(),
    withTiming: (value, _options, complete) => { complete?.(true); return value; },
    withSpring: value => value,
    runOnJS: callback => callback,
  };
});
