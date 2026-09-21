import React, { useRef, useEffect, useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { Screen } from '../components/Screen';
import { useChat } from '../context/ChatContext';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { EmptyState } from '../components/EmptyState';
import { ModelBanner } from '../components/ModelBanner';
import { Colors } from '../theme/colors';
import { Message } from '../types';

/**
 * Tracks the keyboard height frame-by-frame (shared value, UI thread).
 * Used to push the chat input exactly above the keyboard — pixel-exact on
 * both platforms, independent of windowSoftInputMode / behavior quirks.
 */
function useKeyboardHeight() {
  const height = useSharedValue(0);
  useKeyboardHandler(
    {
      onMove: (event) => {
        'worklet';
        height.value = Math.max(event.height, 0);
      },
    },
    [],
  );
  return height;
}

export function ChatScreen({ onOpenModels }: { onOpenModels?: () => void }) {
  const {
    activeConversation,
    sendMessage,
    stopGenerating,
    isGenerating,
  } = useChat();
  const flatListRef = useRef<FlatList>(null);
  const keyboardHeight = useKeyboardHeight();
  // Only auto-scroll while the user is near the bottom: scrolling on every
  // token flush (plus an animated scroll each time) keeps the UI thread
  // and GPU busy for the whole answer. Throttled to ~3/sec.
  const nearBottomRef = useRef(true);
  const lastAutoScrollRef = useRef(0);

  const scrollToEndIfNeeded = useCallback((animated: boolean) => {
    if (!nearBottomRef.current) return;
    const now = Date.now();
    if (now - lastAutoScrollRef.current < 300) return;
    lastAutoScrollRef.current = now;
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    nearBottomRef.current =
      contentSize.height - (layoutMeasurement.height + contentOffset.y) < 120;
  }, []);

  // Spacer that grows/shrinks in sync with the keyboard animation,
  // plus a small breathing gap so the input never touches the keyboard.
  const spacerStyle = useAnimatedStyle(() => {
    return {
      height: Math.abs(keyboardHeight.value) + (keyboardHeight.value > 0 ? 4 : 0),
    };
  }, []);

  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      const t = setTimeout(() => {
        scrollToEndIfNeeded(true);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [messages.length, messages[messages.length - 1]?.content, scrollToEndIfNeeded]);

  const handleSend = (text: string) => {
    sendMessage(text);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => (
      <ChatMessage message={item} isLast={index === messages.length - 1} />
    ),
    [messages.length],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const handleContentSizeChange = useCallback(() => {
    // Non-animated during streaming: cheaper than restarting an animation
    // on every flush; the periodic effect scroll above stays animated.
    scrollToEndIfNeeded(false);
  }, [scrollToEndIfNeeded]);

  return (
    <Screen style={styles.container} edges={['bottom']}>
      <ModelBanner onOpenModels={onOpenModels ?? (() => {})} />
      <View style={styles.content}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            // Render fewer off-screen rows: less layout/GPU work per token.
            removeClippedSubviews
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            updateCellsBatchingPeriod={100}
            scrollEventThrottle={100}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
          />
        )}
        <ChatInput onSend={handleSend} isGenerating={isGenerating} onStop={stopGenerating} />
        <Animated.View style={spacerStyle} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
  },
  messageList: {
    paddingTop: 8,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
