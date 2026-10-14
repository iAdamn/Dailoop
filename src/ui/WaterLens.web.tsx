import React, { forwardRef, useId, useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { useMotionDisabled } from './motion';
import type { WaterLensProps } from './WaterLens.types';

const FilterImage = forwardRef<SVGFEImageElement, React.SVGProps<SVGFEImageElement>>(function FilterImage(props, ref) {
  return <feImage {...props} ref={ref} />;
});
const MovingFilterImage = Animated.createAnimatedComponent(FilterImage);
const DISPLACEMENT = 28;

/** One small immutable vector field per size, moved by a uniform/attribute on
 * each contact frame. Red/green encode nonlinear horizontal/vertical bending. */
function displacementImage(width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(canvas.width, canvas.height);
  const halfX = width / 2, halfY = height / 2, radius = Math.min(21, halfY);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const dx = x + 0.5 - halfX, dy = y + 0.5 - halfY;
    const qx = Math.abs(dx) - halfX + radius, qy = Math.abs(dy) - halfY + radius;
    const edge = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
    const depth = Math.min(1, Math.max(0, -edge / 20));
    // Spread the meniscus across 10 dp: a narrow, strong bend folds the tiny
    // label's pixels and destroys legibility while crossing a capsule edge.
    const t = Math.min(1, depth / 0.5);
    const entering = t * t * (3 - 2 * t);
    const bend = entering * (0.045 + 0.07 * (1 - depth) ** 2);
    const offset = (y * canvas.width + x) * 4;
    image.data[offset] = Math.round(255 * (0.5 - dx * bend / DISPLACEMENT));
    image.data[offset + 1] = Math.round(255 * (0.5 - dy * bend / DISPLACEMENT));
    image.data[offset + 2] = 128;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function WaterLens({ children, position, width, height, style, ...props }: WaterLensProps) {
  const reduced = useMotionDisabled();
  const id = `water-${useId().replace(/[^\w-]/g, '')}`;
  const rowWidth = Math.max(1, width - 12), rowHeight = Math.max(1, height - 18);
  const cell = rowWidth / 4;
  const image = useMemo(() => {
    return typeof document !== 'undefined' && width > 12 && height > 18
      ? displacementImage(Math.max(1, cell - 2), rowHeight) : '';
  }, [width, height, cell, rowHeight]);
  const animatedProps = useAnimatedProps(() => ({ x: position.get() * cell + 1 }));
  const filterStyle = !reduced && image ? { filter: `url(#${id})` } as ViewStyle : undefined;
  return <View {...props} style={[{ flex: 1, flexDirection: 'row', gap: 2 }, style]}>
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs><filter id={id} x="0" y="0" width={rowWidth} height={rowHeight}
        filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feFlood floodColor="rgb(127.5,127.5,127.5)" result="neutral" />
        <MovingFilterImage href={image || undefined} x={1} y={0} width={Math.max(1, cell - 2)} height={rowHeight}
          preserveAspectRatio="none" animatedProps={animatedProps} result="meniscus" />
        <feComposite in="meniscus" in2="neutral" operator="over" result="vectors" />
        <feDisplacementMap in="SourceGraphic" in2="vectors" xChannelSelector="R" yChannelSelector="G" scale={DISPLACEMENT} />
      </filter></defs>
    </svg>
    <View testID="water-lens-web" style={[{ flex: 1, flexDirection: 'row', gap: 2, overflow: 'visible' }, filterStyle]}>{children}</View>
  </View>;
}
