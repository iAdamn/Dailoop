import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Button, Field, Label, ModalFrame, useColors, webFocusRing } from './components';
import { emojiCategories, findEmojis, isSingleEmoji, type EmojiChoice } from './emojiCatalog';
import { MotionPressable } from './motion';
import { alpha, palette } from './tokens';

export function EmojiPicker({ value, onSelect, onClose }: { value: string; onSelect(emoji: string): void; onClose(): void }) {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState(0);
  const [width, setWidth] = useState(0);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState(value);
  const list = useRef<FlatList<EmojiChoice>>(null);
  const results = useMemo(() => findEmojis(deferredQuery, category), [deferredQuery, category]);
  const columns = Math.max(1, Math.floor((width + 4) / 52));
  const choose = (emoji: string) => { Keyboard.dismiss(); onSelect(emoji); };
  const search = (text: string) => { setQuery(text); list.current?.scrollToOffset({ offset: 0, animated: false }); };
  const chooseCategory = (next: number) => { Keyboard.dismiss(); search(''); setCategory(next); };

  return <ModalFrame title="Elige un emoji" onClose={onClose} scrollable={manual}>
    {({ closeWith }) => <>
    <View style={{ height: manual ? undefined : Math.min(height * 0.66, 540), flexShrink: 1, minHeight: 0, gap: 12 }}>
      {manual ? <>
        <Field label="Escribe o pega un emoji" value={typed} onChangeText={setTyped} autoFocus autoCorrect={false} autoCapitalize="none" maxLength={64} />
        <Label small>Puedes elegirlo con el teclado de tu dispositivo.</Label>
        <Button feedback="selection" disabled={!isSingleEmoji(typed)} onPress={() => closeWith(() => choose(typed.trim()))}>Usar este emoji</Button>
        <Button compact subtle onPress={() => { Keyboard.dismiss(); setManual(false); }}>Ver catálogo de emojis</Button>
      </> : <>
        <Field label="Buscar emoji" value={query} onChangeText={search} placeholder="Caras, deporte, café…" autoCapitalize="none" autoCorrect={false} maxLength={80} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Label small strong>{query.trim() ? 'Resultados' : category < 0 ? 'Todos los emojis' : emojiCategories[category].name}</Label>
          <Label small>{results.length}</Label>
        </View>
        <View testID="emoji-grid" style={{ flex: 1, minHeight: 48 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
          {width > 0 && <FlatList key={columns} ref={list} data={results} numColumns={columns} keyExtractor={item => item.emoji}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5}
            getItemLayout={(_data, index) => ({ length: 52, offset: 52 * index, index })}
            columnWrapperStyle={columns > 1 ? { gap: 4 } : undefined} ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
            ListEmptyComponent={<Label small>No encontramos ese emoji. Prueba otra palabra o usa tu teclado.</Label>}
            renderItem={({ item }) => <MotionPressable accessibilityRole="button" accessibilityLabel={`Elegir ${item.emoji}, ${item.name}`}
              accessibilityState={{ selected: value === item.emoji }} onPress={() => closeWith(() => choose(item.emoji))}
              style={({ focused }: { pressed: boolean; focused?: boolean }) => ({ width: (width - (columns - 1) * 4) / columns, height: 48, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center', backgroundColor: value === item.emoji ? alpha(palette.lavender, colors.dark ? 0.18 : 0.5) : 'transparent',
                borderWidth: 1, borderColor: value === item.emoji ? colors.border : 'transparent', ...webFocusRing(focused) })}>
              <Text accessible={false} style={{ fontSize: 29, lineHeight: 39 }}>{item.emoji}</Text>
            </MotionPressable>} />}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 4 }} keyboardShouldPersistTaps="handled">
          {[{ name: 'Todos los emojis', icon: '✧' }, ...emojiCategories].map((item, index) => <MotionPressable key={item.name}
            accessibilityRole="button" accessibilityLabel={`Categoría: ${item.name}`} accessibilityState={{ selected: category === index - 1 && !query.trim() }}
            onPress={() => chooseCategory(index - 1)} style={({ focused }: { pressed: boolean; focused?: boolean }) => ({ width: 48, height: 48, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center', backgroundColor: category === index - 1 && !query.trim() ? alpha(palette.lavender, colors.dark ? 0.2 : 0.5) : 'transparent', ...webFocusRing(focused) })}>
            <Text accessible={false} style={{ fontSize: 23 }}>{item.icon}</Text>
          </MotionPressable>)}
        </ScrollView>
        <Button compact subtle onPress={() => setManual(true)}>Usar mi teclado</Button>
      </>}
    </View>
    </>}
  </ModalFrame>;
}
