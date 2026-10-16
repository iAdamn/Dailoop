import React, { createRef, type RefObject } from 'react';
import { FlatList, Keyboard, Pressable, Text, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { KeyboardFlatList, useRevealInput } from '../src/ui/keyboard';

test('a virtualized header reveals its focused input above the native keyboard without a surrounding ScrollView', async () => {
  jest.useFakeTimers();
  const metrics = jest.spyOn(Keyboard, 'metrics').mockReturnValue({ screenX: 0, screenY: 400, width: 320, height: 300 });
  const list = createRef<FlatList<number>>();
  const input = { current: { isFocused: () => true, measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 420, 160, 54) } } as RefObject<TextInput>;
  function Header() {
    const reveal = useRevealInput();
    return <Pressable accessibilityRole="button" accessibilityLabel="Enfocar campo" onPress={() => reveal(input)}><Text>Campo</Text></Pressable>;
  }
  try {
    const view = await render(<KeyboardFlatList ref={list} data={[1]} ListHeaderComponent={<Header />} renderItem={({ item }) => <Text>{item}</Text>} />);
    const measure = jest.spyOn(list.current!, 'getNativeScrollRef').mockReturnValue({
      measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 320, 400),
    } as unknown as ReturnType<FlatList<number>['getNativeScrollRef']>);
    const scroll = jest.spyOn(list.current!, 'scrollToOffset').mockImplementation(() => undefined);
    await fireEvent.press(screen.getByRole('button', { name: 'Enfocar campo' }));
    await act(async () => { jest.advanceTimersByTime(20); });
    expect(scroll).toHaveBeenCalledWith({ offset: 90, animated: false });
    expect(measure).toHaveBeenCalled();
    await view.unmount();
  } finally {
    metrics.mockRestore();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});
