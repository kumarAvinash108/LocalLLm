import React, { useRef, useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
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
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSend = (text: string) => {
    sendMessage(text);
  };

  const renderItem = ({ item, index }: { item: Message; index: number }) => (
    <ChatMessage message={item} isLast={index === messages.length - 1} />
  );

  const keyExtractor = (item: Message) => item.id;

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
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
