import React, { useRef, useEffect } from 'react';
import { FlatList, StyleSheet, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Screen } from '../components/Screen';
import { useChat } from '../context/ChatContext';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { EmptyState } from '../components/EmptyState';
import { ModelBanner } from '../components/ModelBanner';
import { Colors } from '../theme/colors';
import { Message } from '../types';

export function ChatScreen({ onOpenModels }: { onOpenModels?: () => void }) {
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
    sendMessage(text);
  };

  const renderItem = ({ item, index }: { item: Message; index: number }) => (
    <ChatMessage message={item} isLast={index === messages.length - 1} />
  );

  const keyExtractor = (item: Message) => item.id;

  return (
    <Screen style={styles.container} edges={['bottom']}>
      <ModelBanner onOpenModels={onOpenModels ?? (() => {})} />
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        {messages.length === 0 ? (
          <>
            <EmptyState />
            <ChatInput onSend={handleSend} isGenerating={isGenerating} onStop={stopGenerating} />
          </>
        ) : (
          <>
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
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  avoider: {
    flex: 1,
  },
  messageList: {
    paddingTop: 8,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
