import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types';
import { Colors } from '../theme/colors';
import { formatLabels } from '../services/imageRecognition';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
}

function VisionNote({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const images = message.images ?? [];
  if (images.length === 0) return null;
  const withText = images.filter((i) => i.ocrState === 'done' && i.ocrText);
  const withLabels = images.filter(
    (i) => i.labelState === 'done' && i.labels && i.labels.length > 0,
  );
  const emptyOcr = images.filter((i) => i.ocrState === 'empty').length;
  const emptyLabels = images.filter((i) => i.labelState === 'empty').length;
  const failed = images.filter(
    (i) =>
      (i.ocrState === 'error' || i.ocrState === 'pending') &&
      (i.labelState === 'error' || i.labelState === 'pending' || i.labelState === undefined),
  ).length;
  const hasAnalysis = withText.length > 0 || withLabels.length > 0;
  return (
    <View style={styles.ocrBox}>
      <TouchableOpacity
        style={styles.ocrHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}>
        <Ionicons name="scan-outline" size={13} color={Colors.dark.textSecondary} />
        <Text style={styles.ocrHeaderText}>
          {hasAnalysis
            ? `${withLabels.length > 0 ? `${withLabels.length} image(s) • objects recognized` : ''}${withLabels.length > 0 && withText.length > 0 ? ' + ' : ''}${withText.length > 0 ? 'OCR text included' : ''}`
            : emptyOcr > 0 && emptyLabels > 0 && failed === 0
              ? 'Nothing recognizable found in image(s)'
              : failed > 0
                ? 'Image analysis unavailable (vision needs a dev build)'
                : 'Image attached — analysis pending…'}
        </Text>
        {hasAnalysis && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.dark.textTertiary}
          />
        )}
      </TouchableOpacity>
      {expanded && (
        <>
          {withLabels.map((img, idx) => (
            <Text key={`${img.id}-labels`} style={styles.ocrText} selectable>
              {`Image ${idx + 1} objects:\n${formatLabels(img.labels ?? [])}`}
            </Text>
          ))}
          {withText.map((img, idx) => (
            <Text key={`${img.id}-ocr`} style={styles.ocrText} selectable>
              {`Image ${idx + 1} text:\n${img.ocrText}`}
            </Text>
          ))}
        </>
      )}
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
        {isUser && <VisionNote message={message} />}
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
