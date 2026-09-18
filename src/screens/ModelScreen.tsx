import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Screen } from '../components/Screen';
import { Colors } from '../theme/colors';
import { useModel } from '../context/ModelContext';
import { ModelInfo } from '../types';
import { buildRepoUrl, listGgufFiles, looksLikeGgufFilename } from '../services/huggingface';

function formatMB(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`;
}

function ModelCard({
  model,
  downloaded,
  active,
  loading,
  downloading,
  progress,
  onDownload,
  onCancel,
  onLoad,
  onRemove,
}: {
  model: ModelInfo;
  downloaded: boolean;
  active: boolean;
  loading: boolean;
  downloading: boolean;
  progress: number;
  onDownload: () => void;
  onCancel: () => void;
  onLoad: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{model.name}</Text>
          {model.recommended && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>RECOMMENDED</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardMeta}>
          {formatMB(model.sizeMB)} · {model.license}
        </Text>
        <Text style={styles.cardDesc}>{model.description}</Text>
        <Text style={styles.cardRepo} numberOfLines={1}>
          {model.repo}/{model.file}
        </Text>
      </View>

      {downloading && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        </View>
      )}

      <View style={styles.actions}>
        {active ? (
          <View style={styles.loadedRow}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.dark.success} />
            <Text style={styles.loadedText}>Loaded in chat</Text>
          </View>
        ) : downloading ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel download</Text>
          </TouchableOpacity>
        ) : downloaded ? (
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.disabledBtn]}
            onPress={onLoad}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Load in Chat</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={onDownload}>
            <Ionicons name="cloud-download-outline" size={16} color="#fff" />
            <Text style={styles.primaryText}>Download</Text>
          </TouchableOpacity>
        )}
        {downloaded && !downloading && (
          <TouchableOpacity style={styles.iconBtn} onPress={onRemove} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={18} color={Colors.dark.danger} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function ModelScreen({ navigation }: { navigation: any }) {
  const {
    models,
    downloaded,
    activeModelId,
    status,
    downloadProgress,
    downloadingId,
    loadProgress,
    error,
    download,
    cancelDownload,
    importFromDevice,
    downloadFromUrl,
    load,
    remove,
  } = useModel();

  const [customRepo, setCustomRepo] = useState('');
  const [customFile, setCustomFile] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [directName, setDirectName] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const downloadedIds = new Set(downloaded.map((d) => d.id));

  const handleDownload = async (model: ModelInfo) => {
    setBusy(true);
    try {
      await download(model);
    } catch (e) {
      if ((e as Error).message !== 'Download cancelled.') {
        Alert.alert('Download failed', (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (modelId: string) => {
    try {
      await load(modelId);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Load failed', (e as Error).message);
    }
  };

  const handleRemove = (modelId: string, name: string) => {
    Alert.alert('Delete model?', `${name}\n\nThe .gguf file will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(modelId) },
    ]);
  };

  const handleBrowseRepo = async () => {
    if (!customRepo.includes('/')) {
      Alert.alert('Invalid repo', 'Use the form "owner/name", e.g. bartowski/Qwen2.5-0.5B-Instruct-GGUF');
      return;
    }
    setBrowsing(true);
    try {
      const files = await listGgufFiles(customRepo);
      setCustomFile(files[0]);
      Alert.alert('GGUF files found', files.slice(0, 10).join('\n'));
    } catch (e) {
      Alert.alert('Lookup failed', (e as Error).message);
    } finally {
      setBrowsing(false);
    }
  };

  const handleCustomDownload = async () => {
    if (!customRepo.includes('/') || !looksLikeGgufFilename(customFile)) {
      Alert.alert('Check inputs', 'Enter a valid "owner/name" repo and a filename ending in .gguf');
      return;
    }
    const custom: ModelInfo = {
      id: `custom-${customRepo.replace('/', '-').toLowerCase()}-${customFile.toLowerCase()}`,
      name: customFile,
      repo: customRepo.trim(),
      file: customFile.trim(),
      sizeMB: 0,
      description: 'Custom model from Hugging Face.',
      license: 'Check repo license on Hugging Face',
    };
    await handleDownload(custom);
    setCustomRepo('');
    setCustomFile('');
  };

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets[0];
      const name = picked.name ?? picked.uri.split('/').pop() ?? 'model.gguf';
      if (!/\.gguf$/i.test(name)) {
        Alert.alert('Not a .gguf file', 'Please pick a file ending in .gguf.');
        return;
      }
      setImporting(true);
      try {
        await importFromDevice(picked.uri, name);
        Alert.alert('Imported', `${name} is ready — tap "Load in Chat".`);
      } catch (e) {
        Alert.alert('Import failed', (e as Error).message);
      } finally {
        setImporting(false);
      }
    } catch (e) {
      Alert.alert('Import failed', (e as Error).message);
    }
  };

  const handleDirectUrlDownload = async () => {
    if (!directUrl.trim()) {
      Alert.alert('Check inputs', 'Paste a direct https:// link to a .gguf file.');
      return;
    }
    setBusy(true);
    try {
      await downloadFromUrl(directUrl.trim(), directName.trim());
      Alert.alert('Downloaded', 'Model is ready — tap "Load in Chat".');
      setDirectUrl('');
      setDirectName('');
    } catch (e) {
      if ((e as Error).message !== 'Download cancelled.') {
        Alert.alert('Download failed', (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>On-device models (.gguf)</Text>
        <Text style={styles.hint}>
          Models download from Hugging Face over the network, then run fully offline with llama.rn.
          Start with the recommended small model.
        </Text>

        {status === 'loading' && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
            <Text style={styles.statusText}>Loading weights… {Math.round(loadProgress)}%</Text>
          </View>
        )}
        {downloadingId && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
            <Text style={styles.statusText}>
              Downloading… {Math.round(downloadProgress * 100)}%
            </Text>
          </View>
        )}
        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.dark.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {models.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            downloaded={downloadedIds.has(m.id)}
            active={activeModelId === m.id && status === 'ready'}
            loading={status === 'loading'}
            downloading={downloadingId === m.id}
            progress={downloadingId === m.id ? downloadProgress : 0}
            onDownload={() => handleDownload(m)}
            onCancel={cancelDownload}
            onLoad={() => handleLoad(m.id)}
            onRemove={() => handleRemove(m.id, m.name)}
          />
        ))}

        {downloaded
          .filter((d) => !models.some((m) => m.id === d.id))
          .map((d) => (
            <ModelCard
              key={d.id}
              model={d}
              downloaded
              active={activeModelId === d.id && status === 'ready'}
              loading={status === 'loading'}
              downloading={downloadingId === d.id}
              progress={downloadingId === d.id ? downloadProgress : 0}
              onDownload={() => handleDownload(d)}
              onCancel={cancelDownload}
              onLoad={() => handleLoad(d.id)}
              onRemove={() => handleRemove(d.id, d.name)}
            />
          ))}

        <Text style={styles.sectionTitle}>Custom Hugging Face model</Text>
        <View style={styles.customBox}>
          <Text style={styles.label}>Repo (owner/name)</Text>
          <TextInput
            style={styles.input}
            value={customRepo}
            onChangeText={setCustomRepo}
            placeholder="bartowski/Qwen2.5-0.5B-Instruct-GGUF"
            placeholderTextColor={Colors.dark.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>File (.gguf)</Text>
          <TextInput
            style={styles.input}
            value={customFile}
            onChangeText={setCustomFile}
            placeholder="Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"
            placeholderTextColor={Colors.dark.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.repoHint}>
            URL pattern: {customRepo ? buildRepoUrl(customRepo) : 'huggingface.co/<owner>/<name>'}
            {'\n'}Only public repos with .gguf files. Gated repos (e.g. meta-llama originals) need
            license acceptance in a browser — prefer bartowski *-GGUF mirrors.
          </Text>
          <View style={styles.customActions}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleBrowseRepo}
              disabled={browsing}>
              <Text style={styles.secondaryText}>
                {browsing ? 'Looking up…' : 'Browse .gguf files'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.disabledBtn]}
              onPress={handleCustomDownload}
              disabled={busy}>
              <Text style={styles.primaryText}>Download</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Import .gguf from device</Text>
        <View style={styles.customBox}>
          <Text style={styles.hint}>
            Already have a .gguf in Downloads or another app? Pick it with the file manager and
            it will be copied into the app — no re-download needed.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, importing && styles.disabledBtn]}
            onPress={handleImportFile}
            disabled={importing}>
            <Ionicons name="folder-open-outline" size={16} color="#fff" />
            <Text style={styles.primaryText}>
              {importing ? 'Importing…' : 'Pick .gguf file'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Download from direct URL</Text>
        <View style={styles.customBox}>
          <Text style={styles.label}>Direct .gguf URL (https://)</Text>
          <TextInput
            style={styles.input}
            value={directUrl}
            onChangeText={setDirectUrl}
            placeholder="https://github.com/.../releases/download/.../model.gguf"
            placeholderTextColor={Colors.dark.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>Display name (optional)</Text>
          <TextInput
            style={styles.input}
            value={directName}
            onChangeText={setDirectName}
            placeholder="My 1B model"
            placeholderTextColor={Colors.dark.textTertiary}
          />
          <Text style={styles.repoHint}>
            Works with GitHub release assets and any direct file link. Paste the raw download URL
            (it must end in .gguf) — not a repo or HTML page URL.
          </Text>
          <View style={styles.customActions}>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.disabledBtn]}
              onPress={handleDirectUrlDownload}
              disabled={busy}>
              <Ionicons name="cloud-download-outline" size={16} color="#fff" />
              <Text style={styles.primaryText}>Download URL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  avoider: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.dark.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  hint: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: 12, lineHeight: 18 },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Colors.dark.surface,
    marginBottom: 12,
  },
  statusText: { color: Colors.dark.textSecondary, fontSize: 13 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#3A1D1D',
    marginBottom: 12,
  },
  errorText: { color: '#FCA5A5', fontSize: 13, flex: 1 },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardActive: { borderColor: Colors.dark.success },
  cardHeader: { marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.dark.text, flexShrink: 1 },
  badge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  cardMeta: { fontSize: 12, color: Colors.dark.textTertiary, marginTop: 4 },
  cardDesc: { fontSize: 13, color: Colors.dark.textSecondary, marginTop: 4 },
  cardRepo: { fontSize: 11, color: Colors.dark.textTertiary, marginTop: 4 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.border,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: Colors.dark.primary },
  progressText: { fontSize: 12, color: Colors.dark.textSecondary, minWidth: 36, textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  disabledBtn: { opacity: 0.6 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  secondaryText: { color: Colors.dark.text, fontSize: 14 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Colors.dark.danger,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  cancelText: { color: Colors.dark.danger, fontSize: 14 },
  iconBtn: { padding: 8 },
  loadedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadedText: { color: Colors.dark.success, fontWeight: '600', fontSize: 14 },
  customBox: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  label: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: Colors.dark.inputBackground,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.dark.text,
    fontSize: 14,
  },
  repoHint: { fontSize: 12, color: Colors.dark.textTertiary, marginTop: 8, lineHeight: 16 },
  customActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
