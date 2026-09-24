import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types';
import { Colors } from '../theme/colors';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
}

function OcrNote({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const images = message.images ?? [];
  if (images.length === 0) return null;
  const withText = images.filter((i) => i.ocrState === 'done' && i.ocrText);
  const empty = images.filter((i) => i.ocrState === 'empty').length;
  const failed = images.filter((i) => i.ocrState === 'error' || i.ocrState === 'pending').length;
  return (
    <View style={styles.ocrBox}>
      <TouchableOpacity
        style={styles.ocrHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}>
        <Ionicons name="document-text-outline" size={13} color={Colors.dark.textSecondary} />
        <Text style={styles.ocrHeaderText}>
          {withText.length > 0
            ? `${withText.length} image(s) • OCR text included`
            : empty > 0 && failed === 0
              ? 'No readable text found in image(s)'
              : 'Image text unavailable (OCR needs a dev build)'}
        </Text>
        {withText.length > 0 && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.dark.textTertiary}
          />
        )}
      </TouchableOpacity>
      {expanded &&
        withText.map((img, idx) => (
          <Text key={img.id} style={styles.ocrText} selectable>
            {`Image ${idx + 1} text:\n${img.ocrText}`}
          </Text>
        ))}
    </View>
  );
}

// Memoized: every streaming token re-renders the chat list, and without
// memo every bubble (not just the streaming one) would re-render each
// time — wasted layout/GPU work that drains battery during generation.
export const ChatMessage = memo(function ChatMessage({ message, isLast }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const images = message.images ?? [];

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
        {images.length > 0 && (
          <View style={styles.imageGrid}>
            {images.map((img) => (
              <Image
                key={img.id}
                source={{ uri: img.uri }}
                style={styles.attachedImage}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
        {!!message.content && (
          <Text
            style={[styles.text, isUser ? styles.userText : styles.assistantText]}
            selectable>
            {message.content}
          </Text>
        )}
        {isUser && <OcrNote message={message} />}
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
});

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
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  attachedImage: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: Colors.dark.inputBackground,
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
  ocrBox: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 6,
  },
  ocrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ocrHeaderText: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  ocrText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.dark.textSecondary,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    padding: 8,
  },
});
