import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { ImageAttachment } from '../types';
import {
  MAX_IMAGES_PER_MESSAGE,
  captureChatImage,
  pickChatImages,
  prepareImageAttachments,
} from '../services/chatImages';
import { isOcrAvailable } from '../services/ocr';
import { isImageRecognitionAvailable } from '../services/imageRecognition';

interface ChatInputProps {
  onSend: (text: string, images: ImageAttachment[]) => void;
  disabled?: boolean;
  onStop?: () => void;
  isGenerating?: boolean;
}

export function ChatInput({ onSend, disabled, onStop, isGenerating }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const canAttachMore = attachments.length < MAX_IMAGES_PER_MESSAGE && !attaching && !disabled;

  const handlePicked = async (picked: { uri: string; width?: number; height?: number }[]) => {
    if (picked.length === 0) return;
    const room = MAX_IMAGES_PER_MESSAGE - attachments.length;
    if (room <= 0) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      return;
    }
    setAttaching(true);
    try {
      const prepared = await prepareImageAttachments(picked.slice(0, room));
      setAttachments((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES_PER_MESSAGE));
    } catch (e) {
      Alert.alert('Could not attach images', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setAttaching(false);
    }
  };

  const handleAttachPress = () => {
    if (!canAttachMore) return;
    const visionAvailable = isOcrAvailable() || isImageRecognitionAvailable();
    if (!visionAvailable) {
      Alert.alert(
        'Vision needs a dev build',
        'Image analysis runs on-device and needs a custom dev build (Expo Go has no vision modules). You can still attach images, but text + object recognition may be unavailable.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Photo library',
            onPress: () => pickChatImages().then(handlePicked).catch((e) => Alert.alert('Could not open library', e instanceof Error ? e.message : 'Please try again.')),
          },
          {
            text: 'Camera',
            onPress: () => captureChatImage().then((p) => p && handlePicked([p])).catch((e) => Alert.alert('Could not open camera', e instanceof Error ? e.message : 'Please try again.')),
          },
        ],
      );
      return;
    }
    Alert.alert('Attach image', 'Text + objects are read on-device (offline) and sent to the model with your message.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Photo library',
        onPress: () => pickChatImages().then(handlePicked).catch((e) => Alert.alert('Could not open library', e instanceof Error ? e.message : 'Please try again.')),
      },
      {
        text: 'Camera',
        onPress: () => captureChatImage().then((p) => p && handlePicked([p])).catch((e) => Alert.alert('Could not open camera', e instanceof Error ? e.message : 'Please try again.')),
      },
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || disabled || attaching) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
    inputRef.current?.focus();
  };

  const sendable = (text.trim().length > 0 || attachments.length > 0) && !disabled && !attaching;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.container}>
        {attachments.length > 0 && (
          <View style={styles.previewStrip}>
            {attachments.map((a) => (
              <View key={a.id} style={styles.thumbWrap}>
                <Image source={{ uri: a.uri }} style={styles.thumb} />
                {a.ocrState === 'done' && (
                  <View style={styles.ocrBadge}>
                    <Ionicons name="document-text" size={10} color="#fff" />
                  </View>
                )}
                {a.ocrState === 'empty' && (
                  <View style={[styles.ocrBadge, styles.ocrEmpty]}>
                    <Text style={styles.ocrEmptyText}>No text</Text>
                  </View>
                )}
                {a.ocrState === 'error' && (
                  <View style={[styles.ocrBadge, styles.ocrError]}>
                    <Ionicons name="warning" size={10} color="#fff" />
                  </View>
                )}
                {a.labelState === 'done' && (
                  <View style={[styles.ocrBadge, styles.labelBadge]}>
                    <Ionicons name="pricetag" size={10} color="#fff" />
                  </View>
                )}
                {a.labelState === 'error' && a.ocrState !== 'error' && (
                  <View style={[styles.ocrBadge, styles.ocrError]}>
                    <Ionicons name="warning" size={10} color="#fff" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeAttachment(a.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={[styles.attachButton, !canAttachMore && styles.attachDisabled]}
            onPress={handleAttachPress}
            disabled={!canAttachMore || isGenerating}
            activeOpacity={0.7}
            accessibilityLabel="Attach image">
            {attaching ? (
              <ActivityIndicator size="small" color={Colors.dark.textSecondary} />
            ) : (
              <Ionicons
                name="image-outline"
                size={22}
                color={canAttachMore ? Colors.dark.textSecondary : Colors.dark.textTertiary}
              />
            )}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={
              attachments.length > 0 ? 'Ask about the image(s)...' : 'Message LocalLLM...'
            }
            placeholderTextColor={Colors.dark.textTertiary}
            multiline
            maxLength={8000}
            editable={!disabled}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          {isGenerating ? (
            <TouchableOpacity
              style={[styles.button, styles.stopButton]}
              onPress={onStop}
              activeOpacity={0.7}>
              <Ionicons name="stop" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, sendable ? styles.activeButton : styles.inactiveButton]}
              onPress={handleSend}
              disabled={!sendable}
              activeOpacity={0.7}>
              <Ionicons
                name="arrow-up"
                size={20}
                color={sendable ? '#fff' : Colors.dark.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={12} color={Colors.dark.textTertiary} />
          {attachments.length > 0 && (
            <Text style={styles.disclaimerText}>
              {attaching
                ? 'Analyzing image(s) on-device…'
                : `${attachments.length} image(s) • text + objects read offline`}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  container: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: Colors.dark.background,
  },
  previewStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.dark.inputBackground,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  ocrBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ocrEmpty: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  ocrEmptyText: {
    fontSize: 9,
    color: '#fff',
  },
  ocrError: {
    backgroundColor: 'rgba(180,40,40,0.85)',
  },
  labelBadge: {
    left: undefined,
    right: 4,
    backgroundColor: 'rgba(20,110,60,0.85)',
  },
  removeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 9,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachDisabled: {
    opacity: 0.4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 120,
    lineHeight: 20,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  activeButton: {
    backgroundColor: Colors.dark.primary,
  },
  inactiveButton: {
    backgroundColor: 'transparent',
  },
  stopButton: {
    backgroundColor: Colors.dark.danger,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.dark.textTertiary,
  },
});
