import React, { useRef, useEffect } from 'react';
import { FlatList, StyleSheet, Keyboard } from 'react-native';
import { Screen } from '../components/Screen';
import { useChat } from '../context/ChatContext';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { EmptyState } from '../components/EmptyState';
import { Colors } from '../theme/colors';
import { Message } from '../types';

export function ChatScreen() {
  const {
    activeConversation,
    sendMessage,
    stopGenerating,
    isGenerating,
  } = useChat();
  const flatListRef = useRef<FlatList>(null);

  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSend = (text: string) => {
    Keyboard.dismiss();
    sendMessage(text);
  };

  const renderItem = ({ item, index }: { item: Message; index: number }) => (
    <ChatMessage message={item} isLast={index === messages.length - 1} />
  );

  const keyExtractor = (item: Message) => item.id;

  if (messages.length === 0) {
    return (
      <Screen style={styles.container} edges={['bottom']}>
        <EmptyState />
        <ChatInput onSend={handleSend} isGenerating={isGenerating} onStop={stopGenerating} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container} edges={['bottom']}>
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
      <ChatInput onSend={handleSend} isGenerating={isGenerating} onStop={stopGenerating} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  messageList: {
    paddingTop: 8,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
