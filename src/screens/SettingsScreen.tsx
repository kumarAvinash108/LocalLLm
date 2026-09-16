import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/Screen';
import { Colors } from '../theme/colors';
import { Storage } from '../utils/storage';
import { Settings } from '../types';
import { useModel } from '../context/ModelContext';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी' },
];

interface SettingsScreenProps {
  navigation: any;
}

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const { activeModel, status } = useModel();
  const [settings, setSettings] = useState<Settings>({
    language: 'en',
    modelName: 'local-model',
    temperature: 0.7,
    maxTokens: 2048,
  });

  useEffect(() => {
    Storage.getSettings().then(setSettings);
  }, []);

  const updateSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await Storage.saveSettings(updated);
    if (key === 'language') {
      i18n.changeLanguage(value as string);
    }
  };

  const handleReset = () => {
    Alert.alert(
      t('settings.resetAll'),
      t('settings.resetConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            await Storage.clearAll();
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <Screen style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.option, settings.language === lang.code && styles.optionActive]}
            onPress={() => updateSetting('language', lang.code)}>
            <Text style={[styles.optionText, settings.language === lang.code && styles.optionTextActive]}>
              {lang.label}
            </Text>
            {settings.language === lang.code && (
              <Ionicons name="checkmark" size={18} color={Colors.dark.primary} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.model')}</Text>
        <TouchableOpacity
          style={styles.modelInfo}
          onPress={() => navigation.navigate('Models')}
          activeOpacity={0.7}>
          <Ionicons name="hardware-chip-outline" size={20} color={Colors.dark.textSecondary} />
          <View style={styles.modelTextWrap}>
            <Text style={styles.modelName} numberOfLines={1}>
              {activeModel?.name ?? settings.modelName}
            </Text>
            <Text style={styles.modelSub}>
              {status === 'ready' ? t('models.loaded') : t('models.manageHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textTertiary} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{t('settings.version')}</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <Ionicons name="trash-outline" size={18} color={Colors.dark.danger} />
        <Text style={styles.resetText}>{t('settings.resetAll')}</Text>
      </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  optionActive: {
    backgroundColor: Colors.dark.surfaceActive,
  },
  optionText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  optionTextActive: {
    color: Colors.dark.primary,
    fontWeight: '500',
  },
  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
    gap: 10,
  },
  modelName: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  modelTextWrap: {
    flex: 1,
  },
  modelSub: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
    marginTop: 2,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
  },
  aboutLabel: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  aboutValue: {
    fontSize: 15,
    color: Colors.dark.textTertiary,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.danger,
    gap: 8,
  },
  resetText: {
    fontSize: 15,
    color: Colors.dark.danger,
    fontWeight: '500',
  },
});
