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
      const ref = useRef(null);
      if (!ref.current) ref.current = { value: initial, get() { return this.value; }, set(value) { this.value = value; } };
      return ref.current;
    },
    useAnimatedStyle: callback => callback(),
    withTiming: (value, _options, complete) => { complete?.(true); return value; },
    withSpring: value => value,
    withSequence: (...animations) => animations.at(-1),
    Easing: require('react-native').Easing,
    cancelAnimation: () => undefined,
    runOnJS: callback => callback,
  };
});
