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

/** Sanitize an arbitrary filename into a safe stable model id. */
export function modelIdFromFileName(fileName: string): string {
  return (
    fileName
      .toLowerCase()
      .replace(/\.gguf$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'imported-model'
  );
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
  // Guard against partial/corrupt files: a previous cancelled download can
  // leave a few MB behind, which must NOT count as "downloaded" or the user
  // gets stuck (download is skipped, load then fails).
  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists && 'size' in existing && (existing.size ?? 0) > 1024 * 1024) {
    const existingSize = existing.size ?? 0;
    const expectedBytes = model.sizeMB > 0 ? model.sizeMB * 1024 * 1024 * 0.9 : 0;
    if (expectedBytes > 0 && existingSize < expectedBytes) {
      // Partial file — delete so the download below starts fresh.
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {
        // ignore cleanup errors
      }
    } else {
      onProgress?.(1, existingSize, existingSize);
      return {
        cancel: async () => {},
        done: Promise.resolve(fileUri),
      };
    }
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

/**
 * Copy a .gguf file the user picked (file manager / Downloads folder)
 * into the app's private model library.
 *
 * Returns the stored ModelInfo entry. The source URI may live in a
 * cache location that the OS can clear, so always copy — never reference.
 */
export async function importGgufFile(
  sourceUri: string,
  fileName: string,
): Promise<{ model: ModelInfo; localUri: string }> {
  if (!/\.gguf$/i.test(fileName)) {
    throw new Error('That file is not a .gguf model. Pick a file ending in .gguf.');
  }
  await ensureModelsDir();
  const id = modelIdFromFileName(fileName);
  const destUri = localUriForModel({ id });
  const existing = await FileSystem.getInfoAsync(destUri);
  if (existing.exists) {
    try {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    } catch {
      // ignore cleanup errors
    }
  }
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  const check = await validateGgufFile(destUri);
  if (!check.ok) {
    try {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    } catch {
      // ignore cleanup errors
    }
    throw new Error(check.reason ?? 'That .gguf file looks invalid or incomplete.');
  }
  const model: ModelInfo = {
    id,
    name: fileName,
    repo: 'local-import',
    file: fileName,
    sizeMB: check.size ? Math.round(check.size / 1048576) : 0,
    description: 'Imported from device storage.',
    license: 'Check the source license before use',
  };
  return { model, localUri: destUri };
}

/**
 * Download a .gguf from any direct https:// URL — e.g. a GitHub release
 * asset (https://github.com/<owner>/<repo>/releases/download/…/*.gguf).
 * Use the raw/redirect-following URL, not an HTML page URL.
 */
export async function downloadModelFromUrl(
  url: string,
  displayName: string,
  onProgress?: (fraction: number, written: number, total: number) => void,
): Promise<{ handle: DownloadHandle; model: ModelInfo }> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error('Enter a direct https:// link to a .gguf file.');
  }
  const baseName = trimmed.split('?')[0].split('/').pop() ?? '';
  if (!/\.gguf$/i.test(baseName)) {
    throw new Error('That URL does not point to a .gguf file. It must end in .gguf.');
  }
  await ensureModelsDir();
  const name = displayName.trim() || baseName;
  const id = modelIdFromFileName(baseName);
  const fileUri = localUriForModel({ id });

  const resumable = createResumable(trimmed, fileUri, onProgress);
  let cancelled = false;

  const done = (async () => {
    try {
      const result = await resumable.downloadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch {
          // ignore cleanup errors
        }
        throw new Error(
          result
            ? `Download failed with HTTP ${result.status}. For GitHub releases, use the direct .../releases/download/... URL.`
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

  const model: ModelInfo = {
    id,
    name,
    repo: 'direct-url',
    file: baseName,
    sizeMB: 0,
    description: `Downloaded from direct URL. Source: ${trimmed.slice(0, 80)}`,
    license: 'Check the source license before use',
  };
  return {
    model,
    handle: {
      cancel: async () => {
        cancelled = true;
        try {
          await resumable.cancelAsync();
        } catch {
          // cancel may throw if already finished — safe to ignore
        }
      },
      done,
    },
  };
}

/** Byte size of a downloaded model, or null if not present. */
export async function getDownloadedSize(modelId: string): Promise<number | null> {
  const uri = localUriForModel({ id: modelId });
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info) return info.size ?? null;
    return info.exists ? 0 : null;
  } catch {
    return null;
  }
}

/**
 * Release builds can have a different documentDirectory than the one stored
 * at download time (reinstall, update, backup restore — especially iOS).
 * Never trust a persisted localUri: always recompute the current path.
 */
export function resolveModelUri(modelId: string): string {
  return localUriForModel({ id: modelId });
}

/**
 * Size-only validation via getInfoAsync (never reads file content).
 *
 * NOTE: do NOT use readAsStringAsync on the .gguf here — the legacy
 * ExponentFileSystem ignores position/length on Android and tries to load
 * the entire ~400MB file into a JS string, which throws OutOfMemoryError
 * on low-RAM devices. Size + extension checks catch truncations and HTML
 * error pages (KBs) without touching file contents.
 */
export async function validateGgufFile(
  fileUri: string,
  minBytes = 10 * 1024 * 1024,
): Promise<{ ok: boolean; reason?: string; size?: number }> {
  let info;
  try {
    info = await FileSystem.getInfoAsync(fileUri);
  } catch (e) {
    return { ok: false, reason: `Cannot stat model file: ${(e as Error).message}` };
  }
  if (!info.exists) {
    return { ok: false, reason: 'Model file not found. Please re-download it.' };
  }
  const size = 'size' in info ? info.size ?? 0 : 0;
  if (size < minBytes) {
    return {
      ok: false,
      size,
      reason:
        `Model file looks incomplete (${(size / 1048576).toFixed(1)} MB). ` +
        `Delete it and download again on a stable connection.`,
    };
  }
  return { ok: true, size };
}

export async function isModelDownloaded(modelId: string): Promise<boolean> {
  const size = await getDownloadedSize(modelId);
  return size !== null && size > 1024 * 1024;
}

export async function deleteDownloadedModel(modelId: string): Promise<void> {
  const uri = `${getModelsDirectory()}${modelId}.gguf`;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
