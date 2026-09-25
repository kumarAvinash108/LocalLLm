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
import appJson from '../../app.json';

const APP_VERSION = (appJson as { expo?: { version?: string } })?.expo?.version ?? '1.0.0';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी' },
];

const RESPONSE_OPTIONS = [
  { value: 256, labelKey: 'settings.responseShort' },
  { value: 512, labelKey: 'settings.responseBalanced' },
  { value: 1024, labelKey: 'settings.responseLong' },
];

const AUTO_UNLOAD_OPTIONS = [0, 2, 5, 10, 30];

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
    maxTokens: 512,
    batterySaver: false,
    autoUnloadMinutes: 10,
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
        <Text style={styles.sectionTitle}>{t('settings.battery')}</Text>
        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => updateSetting('batterySaver', !settings.batterySaver)}
          activeOpacity={0.7}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>{t('settings.batterySaver')}</Text>
            <Text style={styles.toggleHint}>{t('settings.batterySaverHint')}</Text>
          </View>
          <View style={[styles.toggleTrack, settings.batterySaver && styles.toggleTrackOn]}>
            <View style={[styles.toggleThumb, settings.batterySaver && styles.toggleThumbOn]} />
          </View>
        </TouchableOpacity>

        <Text style={styles.subLabel}>{t('settings.maxResponse')}</Text>
        <Text style={styles.toggleHint}>{t('settings.maxResponseHint')}</Text>
        <View style={styles.chipRow}>
          {RESPONSE_OPTIONS.map((opt) => {
            const active = settings.maxTokens === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => updateSetting('maxTokens', opt.value)}
                activeOpacity={0.7}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.subLabel}>{t('settings.autoUnload')}</Text>
        <Text style={styles.toggleHint}>{t('settings.autoUnloadHint')}</Text>
        <View style={styles.chipRow}>
          {AUTO_UNLOAD_OPTIONS.map((minutes) => {
            const active = (settings.autoUnloadMinutes ?? 10) === minutes;
            return (
              <TouchableOpacity
                key={minutes}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => updateSetting('autoUnloadMinutes', minutes)}
                activeOpacity={0.7}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {minutes === 0 ? t('settings.never') : `${minutes} min`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{t('settings.version')}</Text>
          <Text style={styles.aboutValue}>{APP_VERSION}</Text>
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
  },  aboutLabel: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  aboutValue: {
    fontSize: 15,
    color: Colors.dark.textTertiary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    color: Colors.dark.text,
  },
  toggleHint: {
    fontSize: 12,
    color: Colors.dark.textTertiary,
    marginTop: 2,
    lineHeight: 16,
  },
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleTrackOn: {
    backgroundColor: Colors.dark.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.textSecondary,
    marginTop: 16,
    marginBottom: 2,
    paddingHorizontal: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: Colors.dark.surfaceActive,
    borderColor: Colors.dark.primary,
  },
  chipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  chipTextActive: {
    color: Colors.dark.primary,
    fontWeight: '600',
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
