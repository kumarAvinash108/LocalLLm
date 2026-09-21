import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { DownloadedModel, ModelInfo, ModelStatus } from '../types';
import { DEFAULT_MODELS } from '../data/models';
import { Storage } from '../utils/storage';
import {
  deleteDownloadedModel,
  downloadModel,
  downloadModelFromUrl,
  getDownloadedSize,
  importGgufFile,
  isModelDownloaded,
  localUriForModel,
  resolveModelUri,
  validateGgufFile,
  type DownloadHandle,
} from '../services/modelDownloader';
import { loadModel as nativeLoadModel, unloadModel as nativeUnload } from '../services/llm';

interface ModelContextValue {
  models: ModelInfo[];
  downloaded: DownloadedModel[];
  activeModelId: string | null;
  activeModel: DownloadedModel | null;
  status: ModelStatus;
  /** 0..1 while downloading. */
  downloadProgress: number;
  /** Currently downloading model id, if any. */
  downloadingId: string | null;
  /** 0..100 while natively loading weights. */
  loadProgress: number;
  error: string | null;
  isReady: boolean;
  download: (model: ModelInfo) => Promise<void>;
  cancelDownload: () => Promise<void>;
  /** Copy a user-picked .gguf (file manager) into the library. */
  importFromDevice: (sourceUri: string, fileName: string) => Promise<void>;
  /** Download a .gguf from a direct https:// URL (e.g. GitHub release asset). */
  downloadFromUrl: (url: string, displayName: string) => Promise<void>;
  load: (modelId: string) => Promise<void>;
  unload: () => Promise<void>;
  remove: (modelId: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Reset the idle auto-unload countdown (call after chat activity). */
  notifyActivity: () => void;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [downloaded, setDownloaded] = useState<DownloadedModel[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<DownloadHandle | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<ModelStatus>('idle');

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const unloadInternal = useCallback(async () => {
    clearIdleTimer();
    await nativeUnload();
    if (statusRef.current === 'ready') setStatus('idle');
    setLoadProgress(0);
  }, [clearIdleTimer]);

  /**
   * Arm the idle auto-unload timer: a model sitting loaded in RAM keeps
   * memory pressured (and tempts background inference), both of which cost
   * battery. Fires after `autoUnloadMinutes` (0 = never).
   */
  const armIdleTimer = useCallback(async () => {
    clearIdleTimer();
    if (statusRef.current !== 'ready') return;
    const settings = await Storage.getSettings();
    const minutes = settings.autoUnloadMinutes ?? 10;
    if (!minutes || minutes <= 0) return;
    idleTimerRef.current = setTimeout(
      () => {
        void unloadInternal();
      },
      minutes * 60 * 1000,
    );
  }, [clearIdleTimer, unloadInternal]);

  const notifyActivity = useCallback(() => {
    void armIdleTimer();
  }, [armIdleTimer]);

  // Release native weights when the app sits in the background: inference
  // can never run usefully there, so holding GBs of weights only burns
  // battery via memory pressure. Returning to foreground cancels it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        void armIdleTimer();
      } else if (state === 'active') {
        clearIdleTimer();
      }
    });
    return () => {
      sub.remove();
      clearIdleTimer();
    };
  }, [armIdleTimer, clearIdleTimer]);

  const refresh = useCallback(async () => {
    const [stored, activeId] = await Promise.all([
      Storage.getDownloadedModels(),
      Storage.getActiveModelId(),
    ]);
    // Reconcile with files actually on disk (user may have cleared storage).
    const verified: DownloadedModel[] = [];
    for (const m of stored) {
      if (await isModelDownloaded(m.id)) {
        const bytes = await getDownloadedSize(m.id);
        verified.push({ ...m, bytesOnDisk: bytes ?? undefined, localUri: localUriForModel(m) });
      }
    }
    setDownloaded(verified);
    const stillThere = activeId && verified.some((m) => m.id === activeId);
    setActiveModelId(stillThere ? activeId : null);
    if (!stillThere && activeId) {
      await Storage.setActiveModelId(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const download = useCallback(
    async (model: ModelInfo) => {
      if (handleRef.current) return; // one download at a time
      setError(null);
      setDownloadingId(model.id);
      setDownloadProgress(0);
      setStatus('downloading');
      try {
        const handle = await downloadModel(model, (fraction) => {
          setDownloadProgress(fraction);
        });
        handleRef.current = handle;
        const uri = await handle.done;
        const bytes = await getDownloadedSize(model.id);
        const entry: DownloadedModel = {
          ...model,
          localUri: uri,
          bytesOnDisk: bytes ?? undefined,
        };
        setDownloaded((prev) => {
          const next = [entry, ...prev.filter((m) => m.id !== model.id)];
          Storage.saveDownloadedModels(next);
          return next;
        });
        // Auto-activate the first ever downloaded model.
        const currentActive = await Storage.getActiveModelId();
        if (!currentActive) {
          await Storage.setActiveModelId(model.id);
          setActiveModelId(model.id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Download failed.';
        if (msg !== 'Download cancelled.') setError(msg);
        throw e;
      } finally {
        handleRef.current = null;
        setDownloadingId(null);
        setDownloadProgress(0);
        setStatus((s) => (s === 'downloading' ? 'idle' : s));
      }
    },
    [],
  );

  const cancelDownload = useCallback(async () => {
    await handleRef.current?.cancel();
  }, []);

  const registerEntry = useCallback(async (model: ModelInfo, uri: string) => {
    const bytes = await getDownloadedSize(model.id);
    const entry: DownloadedModel = {
      ...model,
      localUri: uri,
      bytesOnDisk: bytes ?? undefined,
    };
    setDownloaded((prev) => {
      const next = [entry, ...prev.filter((m) => m.id !== model.id)];
      Storage.saveDownloadedModels(next);
      return next;
    });
    // Auto-activate the first ever downloaded model.
    const currentActive = await Storage.getActiveModelId();
    if (!currentActive) {
      await Storage.setActiveModelId(model.id);
      setActiveModelId(model.id);
    }
  }, []);

  const importFromDevice = useCallback(
    async (sourceUri: string, fileName: string) => {
      setError(null);
      try {
        const { model, localUri } = await importGgufFile(sourceUri, fileName);
        await registerEntry(model, localUri);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Import failed.';
        setError(msg);
        throw e instanceof Error ? e : new Error(msg);
      }
    },
    [registerEntry],
  );

  const downloadFromUrl = useCallback(
    async (url: string, displayName: string) => {
      if (handleRef.current) return; // one download at a time
      setError(null);
      setStatus('downloading');
      setDownloadProgress(0);
      try {
        const { handle, model } = await downloadModelFromUrl(url, displayName, (fraction) => {
          setDownloadProgress(fraction);
        });
        setDownloadingId(model.id);
        handleRef.current = handle;
        const uri = await handle.done;
        await registerEntry(model, uri);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Download failed.';
        if (msg !== 'Download cancelled.') setError(msg);
        throw e;
      } finally {
        handleRef.current = null;
        setDownloadingId(null);
        setDownloadProgress(0);
        setStatus((s) => (s === 'downloading' ? 'idle' : s));
      }
    },
    [registerEntry],
  );

  const load = useCallback(
    async (modelId: string) => {
      const entry =
        downloaded.find((m) => m.id === modelId) ??
        (await Storage.getDownloadedModels()).find((m) => m.id === modelId);
      if (!entry) {
        const msg = 'Model file not found. Download it first.';
        setError(msg);
        throw new Error(msg);
      }
      // Always recompute the path for this install — a persisted localUri
      // can be stale after reinstall/update (documentDirectory changes).
      const freshUri = resolveModelUri(modelId);
      if (!(await isModelDownloaded(modelId))) {
        const msg = 'Model file is missing on disk. Please re-download it.';
        setError(msg);
        await refresh();
        throw new Error(msg);
      }
      // Catch corrupt/truncated downloads before the native loader sees them,
      // so the user gets "re-download" instead of a cryptic native error.
      // Threshold: at least 10MB and at most the smaller of 50% of the
      // advertised size (when known) — small enough to catch truncations,
      // large enough to tolerate size rounding.
      const minBytes = entry.sizeMB
        ? Math.min(entry.sizeMB * 1024 * 1024 * 0.5, 10 * 1024 * 1024)
        : 10 * 1024 * 1024;
      const check = await validateGgufFile(freshUri, minBytes);
      if (!check.ok) {
        const msg = check.reason ?? 'Model file is invalid. Please re-download it.';
        setError(msg);
        await refresh();
        throw new Error(msg);
      }
      setError(null);
      setStatus('loading');
      setLoadProgress(0);
      try {
        // Battery saver → fewer threads + smaller context (see llm.ts):
        // less CPU heat per token on phones.
        const settings = await Storage.getSettings();
        const lowPower = settings.batterySaver ?? false;
        await nativeLoadModel({
          modelId: entry.id,
          modelPath: freshUri,
          nCtx: lowPower ? 1024 : 2048,
          lowPower,
          onProgress: (p) => setLoadProgress(p <= 1 ? p * 100 : p),
        });
        // Persist the fresh path so the next cold start uses a valid URI.
        const bytes = check.size ?? (await getDownloadedSize(modelId)) ?? undefined;
        const updatedEntry = { ...entry, localUri: freshUri, bytesOnDisk: bytes };
        setDownloaded((prev) => {
          const next = prev.some((m) => m.id === modelId)
            ? prev.map((m) => (m.id === modelId ? updatedEntry : m))
            : [updatedEntry, ...prev];
          Storage.saveDownloadedModels(next);
          return next;
        });
        await Storage.setActiveModelId(entry.id);
        setActiveModelId(entry.id);
        await Storage.saveSettings({
          ...(await Storage.getSettings()),
          modelName: entry.name,
        });
        setStatus('ready');
        // Start the idle countdown now that weights are resident.
        void armIdleTimer();
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Failed to load model.';
        const sizeMB =
          check.size != null ? ` (${(check.size / 1048576).toFixed(0)} MB on disk)` : '';
        const msg = /Failed to load|load model|GGUF|memory|mmap|file/i.test(raw)
          ? `${raw}${sizeMB} If the file is corrupt, delete and re-download it.`
          : raw;
        setError(msg);
        setStatus('error');
        throw e instanceof Error ? new Error(msg) : new Error(msg);
      }
    },
    [downloaded, refresh, armIdleTimer],
  );

  const unload = useCallback(async () => {
    await unloadInternal();
  }, [unloadInternal]);

  const remove = useCallback(
    async (modelId: string) => {
      clearIdleTimer();
      if (activeModelId === modelId) {
        await nativeUnload();
        setStatus('idle');
        setActiveModelId(null);
        await Storage.setActiveModelId(null);
      }
      await deleteDownloadedModel(modelId);
      setDownloaded((prev) => {
        const next = prev.filter((m) => m.id !== modelId);
        Storage.saveDownloadedModels(next);
        return next;
      });
    },
    [activeModelId, clearIdleTimer],
  );

  const activeModel = useMemo(
    () => downloaded.find((m) => m.id === activeModelId) ?? null,
    [downloaded, activeModelId],
  );

  const value: ModelContextValue = {
    models: DEFAULT_MODELS,
    downloaded,
    activeModelId,
    activeModel,
    status,
    downloadProgress,
    downloadingId,
    loadProgress,
    error,
    isReady: status === 'ready',
    download,
    cancelDownload,
    importFromDevice,
    downloadFromUrl,
    load,
    unload,
    remove,
    refresh,
    notifyActivity,
  };

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used within a ModelProvider');
  return ctx;
}
