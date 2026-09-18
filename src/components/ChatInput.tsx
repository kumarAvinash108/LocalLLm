import React, { useState, useRef } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  onStop?: () => void;
  isGenerating?: boolean;
}

export function ChatInput({ onSend, disabled, onStop, isGenerating }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message LocalLLM..."
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
              style={[
                styles.button,
                text.trim() ? styles.activeButton : styles.inactiveButton,
              ]}
              onPress={handleSend}
              disabled={!text.trim() || disabled}
              activeOpacity={0.7}>
              <Ionicons
                name="arrow-up"
                size={20}
                color={text.trim() ? '#fff' : Colors.dark.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={12} color={Colors.dark.textTertiary} />
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
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
    paddingHorizontal: 12,
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
    alignItems: 'center',
    paddingVertical: 6,
  },
});
