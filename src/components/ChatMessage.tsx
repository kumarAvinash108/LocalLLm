import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types';
import { Colors } from '../theme/colors';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
}

export function ChatMessage({ message, isLast }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  if (isAssistant && !message.content) {
    return (
      <View style={[styles.container, styles.assistantContainer]}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, styles.assistantAvatar]}>
            <Ionicons name="flash" size={14} color="#fff" />
          </View>
        </View>
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}>
      {isAssistant && (
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, styles.assistantAvatar]}>
            <Ionicons name="flash" size={14} color="#fff" />
          </View>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}>
        <Text
          style={[styles.text, isUser ? styles.userText : styles.assistantText]}
          selectable>
          {message.content}
        </Text>
      </View>
      {isUser && (
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, styles.userAvatar]}>
            <Ionicons name="person" size={14} color="#fff" />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginTop: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatar: {
    backgroundColor: '#555',
    marginLeft: 8,
  },
  assistantAvatar: {
    backgroundColor: Colors.dark.primary,
    marginRight: 8,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: Colors.dark.userMessage,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: Colors.dark.text,
  },
  assistantText: {
    color: Colors.dark.text,
  },
});
