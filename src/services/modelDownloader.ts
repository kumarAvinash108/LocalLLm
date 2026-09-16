import * as FileSystem from 'expo-file-system/legacy';
import type { DownloadProgressData } from 'expo-file-system/legacy';
import { ModelInfo } from '../types';
import { buildDownloadUrl } from './huggingface';

export const MODELS_DIR_NAME = 'localllm-models';

/** Directory where .gguf files are stored (created on demand). */
export function getModelsDirectory(): string {
  // expo-file-system exposes documentDirectory on iOS/Android.
  const base = FileSystem.documentDirectory ?? '';
  return `${base}${MODELS_DIR_NAME}/`;
}

export function localUriForModel(model: Pick<ModelInfo, 'id'>): string {
  return `${getModelsDirectory()}${model.id}.gguf`;
}

async function ensureModelsDir(): Promise<void> {
  const dir = getModelsDirectory();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export interface DownloadHandle {
  /** Cancel an in-flight download. */
  cancel: () => Promise<void>;
  /** Resolves to the final local file URI when complete. */
  done: Promise<string>;
}

function createResumable(
  url: string,
  fileUri: string,
  onProgress?: (fraction: number, written: number, total: number) => void,
): FileSystem.DownloadResumable {
  return FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (progress: DownloadProgressData) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
      const fraction =
        totalBytesExpectedToWrite > 0
          ? totalBytesWritten / totalBytesExpectedToWrite
          : 0;
      onProgress?.(fraction, totalBytesWritten, totalBytesExpectedToWrite);
    },
  );
}

/**
 * Download a GGUF model from Hugging Face with progress + cancellation.
 * Resumes partially-downloaded files where the server allows it.
 */
export async function downloadModel(
  model: ModelInfo,
  onProgress?: (fraction: number, written: number, total: number) => void,
): Promise<DownloadHandle> {
  await ensureModelsDir();
  const fileUri = localUriForModel(model);
  const url = buildDownloadUrl(model.repo, model.file);

  // If a complete file already exists, report full progress and finish.
  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists && 'size' in existing && (existing.size ?? 0) > 1024 * 1024) {
    onProgress?.(1, existing.size ?? 0, existing.size ?? 0);
    return {
      cancel: async () => {},
      done: Promise.resolve(fileUri),
    };
  }

  const resumable = createResumable(url, fileUri, onProgress);
  let cancelled = false;

  const done = (async () => {
    try {
      const result = await resumable.downloadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        // Clean up partial/corrupt payloads so a retry starts fresh.
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch {
          // ignore cleanup errors
        }
        throw new Error(
          result
            ? `Download failed with HTTP ${result.status}. Check the repo/file name.`
            : 'Download failed. Check your connection and retry.',
        );
      }
      return result.uri;
    } catch (e) {
      if (cancelled) {
        throw new Error('Download cancelled.');
      }
      throw e instanceof Error ? e : new Error('Download failed.');
    }
  })();

  return {
    cancel: async () => {
      cancelled = true;
      try {
        await resumable.cancelAsync();
      } catch {
        // cancel may throw if already finished — safe to ignore
      }
    },
    done,
  };
}

/** Byte size of a downloaded model, or null if not present. */
export async function getDownloadedSize(modelId: string): Promise<number | null> {
  const uri = `${getModelsDirectory()}${modelId}.gguf`;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info) return info.size ?? null;
    return info.exists ? 0 : null;
  } catch {
    return null;
  }
}

export async function isModelDownloaded(modelId: string): Promise<boolean> {
  const size = await getDownloadedSize(modelId);
  return size !== null && size > 1024 * 1024;
}

export async function deleteDownloadedModel(modelId: string): Promise<void> {
  const uri = `${getModelsDirectory()}${modelId}.gguf`;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
