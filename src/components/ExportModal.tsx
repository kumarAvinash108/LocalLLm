import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../theme/colors';
import { Conversation } from '../types';
import {
  ExportFormat,
  exportConversationFile,
  shareConversationText,
  conversationToJson,
} from '../services/chatExport';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface ExportModalProps {
  visible: boolean;
  conversation: Conversation | null;
  allConversations?: Conversation[];
  onClose: () => void;
}

export function ExportModal({
  visible,
  conversation,
  allConversations = [],
  onClose,
}: ExportModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  if (!conversation) return null;

  const handleShareText = async () => {
    setLoading(true);
    try {
      await shareConversationText(conversation, true);
      onClose();
    } catch (e) {
      Alert.alert(t('export.errorTitle', 'Export failed'), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportFile = async (format: ExportFormat) => {
    setLoading(true);
    try {
      await exportConversationFile(conversation, format);
      onClose();
    } catch (e) {
      Alert.alert(t('export.errorTitle', 'Export failed'), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackupAll = async () => {
    if (!allConversations.length) return;
    setLoading(true);
    try {
      const json = conversationToJson(allConversations);
      const timestamp = new Date().toISOString().slice(0, 10);
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const fileUri = `${baseDir}localllm-all-chats-backup-${timestamp}.json`;

      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Backup All Chats (JSON)',
          UTI: 'public.json',
        });
      }
      onClose();
    } catch (e) {
      Alert.alert(t('export.errorTitle', 'Backup failed'), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.content}>
              <View style={styles.header}>
                <View style={styles.titleContainer}>
                  <Ionicons name="share-outline" size={20} color={Colors.dark.primary} />
                  <Text style={styles.title}>{t('export.title', 'Export Chat')}</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.subtitle} numberOfLines={1}>
                {conversation.title}
              </Text>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.dark.primary} />
                  <Text style={styles.loadingText}>
                    {t('export.preparing', 'Preparing export…')}
                  </Text>
                </View>
              ) : (
                <View style={styles.optionsList}>
                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={handleShareText}
                    activeOpacity={0.7}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="share-social-outline" size={20} color={Colors.dark.primary} />
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={styles.optionTitle}>
                        {t('export.shareText', 'Share Formatted Text')}
                      </Text>
                      <Text style={styles.optionDesc}>
                        {t('export.shareTextDesc', 'Send markdown directly to apps or clipboard')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => handleExportFile('markdown')}
                    activeOpacity={0.7}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="document-text-outline" size={20} color="#38BDF8" />
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={styles.optionTitle}>
                        {t('export.exportMarkdown', 'Export Markdown (.md)')}
                      </Text>
                      <Text style={styles.optionDesc}>
                        {t('export.exportMarkdownDesc', 'Save or share formatted .md file')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => handleExportFile('text')}
                    activeOpacity={0.7}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="document-outline" size={20} color="#FBBF24" />
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={styles.optionTitle}>
                        {t('export.exportPlainText', 'Export Plain Text (.txt)')}
                      </Text>
                      <Text style={styles.optionDesc}>
                        {t('export.exportPlainTextDesc', 'Raw text file compatible with any editor')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => handleExportFile('json')}
                    activeOpacity={0.7}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="code-slash-outline" size={20} color="#A78BFA" />
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={styles.optionTitle}>
                        {t('export.exportJson', 'Export JSON Backup (.json)')}
                      </Text>
                      <Text style={styles.optionDesc}>
                        {t('export.exportJsonDesc', 'Full chat backup that can be re-imported')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {allConversations.length > 1 && (
                    <TouchableOpacity
                      style={[styles.optionItem, styles.backupItem]}
                      onPress={handleBackupAll}
                      activeOpacity={0.7}>
                      <View style={styles.iconCircle}>
                        <Ionicons name="archive-outline" size={20} color="#34D399" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <Text style={styles.optionTitle}>
                          {t('export.backupAll', 'Backup All Chats (JSON)')}
                        </Text>
                        <Text style={styles.optionDesc}>
                          {t('export.backupAllDesc', `Export all ${allConversations.length} conversations`)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.dark.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  optionsList: {
    gap: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.borderLight,
  },
  backupItem: {
    borderColor: '#065F46',
    marginTop: 4,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.dark.surfaceHover,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
  },
});
