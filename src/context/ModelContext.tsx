import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DownloadedModel, ModelInfo, ModelStatus } from '../types';
import { DEFAULT_MODELS } from '../data/models';
import { Storage } from '../utils/storage';
import {
  deleteDownloadedModel,
  downloadModel,
  getDownloadedSize,
  isModelDownloaded,
  localUriForModel,
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
  load: (modelId: string) => Promise<void>;
  unload: () => Promise<void>;
  remove: (modelId: string) => Promise<void>;
  refresh: () => Promise<void>;
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
      if (!(await isModelDownloaded(modelId))) {
        const msg = 'Model file is missing on disk. Please re-download it.';
        setError(msg);
        await refresh();
        throw new Error(msg);
      }
      setError(null);
      setStatus('loading');
      setLoadProgress(0);
      try {
        await nativeLoadModel({
          modelId: entry.id,
          modelPath: entry.localUri,
          nCtx: 2048,
          onProgress: (p) => setLoadProgress(p),
        });
        await Storage.setActiveModelId(entry.id);
        setActiveModelId(entry.id);
        await Storage.saveSettings({
          ...(await Storage.getSettings()),
          modelName: entry.name,
        });
        setStatus('ready');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load model.';
        setError(msg);
        setStatus('error');
        throw e;
      }
    },
    [downloaded, refresh],
  );

  const unload = useCallback(async () => {
    await nativeUnload();
    setStatus('idle');
    setLoadProgress(0);
  }, []);

  const remove = useCallback(
    async (modelId: string) => {
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
    [activeModelId],
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
    load,
    unload,
    remove,
    refresh,
  };

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used within a ModelProvider');
  return ctx;
}
