import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Conversation } from '../types';
import { Colors } from '../theme/colors';

interface HistoryItemProps {
  conversation: Conversation;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
  onShare?: () => void;
}

export function HistoryItem({ conversation, isActive, onPress, onDelete, onShare }: HistoryItemProps) {
  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.activeContainer]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Ionicons
          name="chatbubble-outline"
          size={16}
          color={isActive ? Colors.dark.text : Colors.dark.textTertiary}
        />
      </View>
      <Text
        style={[styles.title, isActive && styles.activeTitle]}
        numberOfLines={1}
        ellipsizeMode="tail">
        {conversation.title}
      </Text>
      <View style={styles.actionButtons}>
        {onShare && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onShare}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Ionicons name="share-outline" size={14} color={Colors.dark.textTertiary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
          <Ionicons name="trash-outline" size={14} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  activeContainer: {
    backgroundColor: Colors.dark.sidebarItemActive,
  },
  iconContainer: {
    marginRight: 10,
    width: 20,
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  activeTitle: {
    color: Colors.dark.text,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 6,
  },
  actionButton: {
    opacity: 0.6,
  },
});
