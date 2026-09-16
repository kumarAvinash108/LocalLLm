import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { useModel } from '../context/ModelContext';

export function ModelBanner({ onOpenModels }: { onOpenModels: () => void }) {
  const { status, activeModel, error, loadProgress } = useModel();

  if (status === 'ready' && activeModel) return null;

  const message =
    status === 'loading'
      ? `Loading ${activeModel?.name ?? 'model'}… ${Math.round(loadProgress)}%`
      : status === 'downloading'
        ? 'Downloading model…'
        : error ?? 'No model loaded — download a GGUF to start chatting offline.';

  return (
    <TouchableOpacity style={styles.banner} onPress={onOpenModels} activeOpacity={0.8}>
      <Ionicons
        name={status === 'ready' ? 'checkmark-circle' : 'cloud-download-outline'}
        size={18}
        color={Colors.dark.warning}
      />
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
      <Text style={styles.cta}>Models</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  cta: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.primary,
  },
});
