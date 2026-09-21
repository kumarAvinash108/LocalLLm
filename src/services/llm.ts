import { TurboModuleRegistry } from 'react-native';
import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn';
import { Message } from '../types';

/**
 * Singleton owner of the native llama.cpp context.
 *
 * Only one model is kept in memory at a time: loading a new model
 * releases the previous context first. Chat code talks to this module
 * instead of importing llama.rn directly so UI state and inference
 * stay decoupled.
 */

let context: LlamaContext | null = null;
let loadedModelId: string | null = null;
let loadPromise: Promise<LlamaContext> | null = null;

export function getLlamaContext(): LlamaContext | null {
  return context;
}

export function getLoadedModelId(): string | null {
  return loadedModelId;
}

export function isModelLoaded(): boolean {
  return context !== null;
}

/**
 * The llama.rn TurboModule is only present in a custom dev build.
 * In Expo Go (or a stale build from before llama.rn was added) the
 * registry returns null and initLlama would fail with the cryptic
 * "Cannot read property 'install' of null".
 */
export function isNativeModuleAvailable(): boolean {
  try {
    return TurboModuleRegistry.get('RNLlama') != null;
  } catch {
    return false;
  }
}

export const NATIVE_MODULE_MISSING_MESSAGE =
  'On-device inference needs a custom dev build — Expo Go is not supported. ' +
  'Run `npx expo prebuild`, then `npx expo run:android` (or `run:ios`), ' +
  'and open the app from that build.';

export interface LoadOptions {
  modelId: string;
  modelPath: string; // local file:// URI or absolute path
  nCtx?: number;
  nThreads?: number;
  /**
   * Battery-saver mode: fewer CPU threads and a smaller context window,
   * so inference uses less energy at the cost of some speed/context.
   */
  lowPower?: boolean;
  onProgress?: (progress: number) => void;
}

/**
 * Battery-efficient thread default. Lighting up every core (the llama.cpp
 * default) drains the battery fast on phones; 4 threads is the sweet spot
 * for small on-device models, 2 in low-power mode.
 */
export const BALANCED_THREADS = 4;
export const LOW_POWER_THREADS = 2;
const LOW_POWER_MAX_CTX = 1024;

function resolveThreads(nThreads: number | undefined, lowPower: boolean): number {
  if (lowPower) return LOW_POWER_THREADS;
  if (typeof nThreads !== 'number' || !Number.isFinite(nThreads)) return BALANCED_THREADS;
  return Math.min(Math.max(Math.round(nThreads), 1), 8);
}

/** Load (or return the already-loaded) model. Serializes concurrent calls. */
export async function loadModel(opts: LoadOptions): Promise<LlamaContext> {
  if (!isNativeModuleAvailable()) {
    throw new Error(NATIVE_MODULE_MISSING_MESSAGE);
  }
  if (context && loadedModelId === opts.modelId) return context;
  if (loadPromise && loadedModelId === opts.modelId) return loadPromise;

  // Release any previous model before allocating a new context.
  await unloadModel();

  loadedModelId = opts.modelId;
  const lowPower = opts.lowPower ?? false;
  // Clamp thread count: unbounded threads keep big cores awake and burn
  // battery. Cap the context too in low-power mode — a smaller KV cache
  // means less memory pressure and less work per token.
  const nThreads = resolveThreads(opts.nThreads, lowPower);
  const requestedCtx = opts.nCtx ?? 2048;
  const nCtx = lowPower ? Math.min(requestedCtx, LOW_POWER_MAX_CTX) : requestedCtx;
  // llama.cpp reports progress as 0..1; normalize to 0..100 for the UI.
  const normalize = opts.onProgress
    ? (p: number) => {
        try {
          opts.onProgress!(p <= 1 ? p * 100 : p);
        } catch {
          // ignore UI callback errors
        }
      }
    : undefined;
  loadPromise = initLlama(
    {
      model: opts.modelPath,
      n_ctx: nCtx,
      n_threads: nThreads,
      // mmap pages weights straight from storage instead of copying them
      // into RAM; mlock would pin RAM awake and waste power — keep it off.
      use_mmap: true,
      use_mlock: false,
      // Shift the KV cache instead of failing when the prompt exceeds
      // n_ctx, so long chats don't force an expensive full reload.
      ctx_shift: true,
    },
    normalize,
  ).then((ctx) => {
    context = ctx;
    return ctx;
  }).catch((e) => {
    loadedModelId = null;
    loadPromise = null;
    throw translateNativeError(e);
  });

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export async function unloadModel(): Promise<void> {
  if (loadPromise) {
    // A load is in flight — release everything once it settles.
    try {
      await loadPromise;
    } catch {
      // ignore; we are unloading anyway
    }
  }
  if (context) {
    try {
      await context.release();
    } catch {
      try {
        await releaseAllLlama();
      } catch {
        // ignore release errors
      }
    }
    context = null;
  } else {
    try {
      await releaseAllLlama();
    } catch {
      // nothing loaded — ignore
    }
  }
  loadedModelId = null;
  loadPromise = null;
}

/**
 * Map low-level native failures to actionable messages. The RNLlama
 * TurboModule can be null (Expo Go / stale build) or present but unable
 * to install its JSI bindings (broken native build) — both mean the
 * running binary lacks working llama.rn native code.
 */
export function translateNativeError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (
    /install.+of null/i.test(message) ||
    /JSI bindings not installed/i.test(message) ||
    /RNLlama/i.test(message)
  ) {
    return new Error(`${NATIVE_MODULE_MISSING_MESSAGE} (native: ${message})`);
  }
  // Preserve the native message — release builds give no logcat to the user,
  // so the alert text is the only diagnostic. Never swallow it.
  return e instanceof Error ? e : new Error(message);
}

export interface ChatCompletionOptions {
  messages: Pick<Message, 'role' | 'content'>[];
  temperature?: number;
  maxTokens?: number;
  onToken?: (token: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Streaming chat completion using the model's built-in chat template.
 * Resolves with the full assistant text.
 */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const ctx = context;
  if (!ctx) {
    throw new Error('No model loaded. Download and load a model first.');
  }

  const stopOnAbort = opts.abortSignal
    ? new Promise<never>((_, reject) => {
        if (opts.abortSignal!.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        opts.abortSignal!.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      })
    : null;

  const completion = ctx
    .completion(
      {
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: opts.temperature ?? 0.7,
        n_predict: opts.maxTokens ?? 512,
      },
      (data) => {
        if (data.token) opts.onToken?.(data.token);
      },
    )
    .then((result) => result.text);

  if (stopOnAbort) {
    return Promise.race([completion, stopOnAbort]).catch(async (e) => {
      if (e instanceof DOMException && e.name === 'AbortError') {
        try {
          await ctx.stopCompletion();
        } catch {
          // ignore stop errors
        }
      }
      throw e;
    });
  }
  return completion;
}

export async function stopCompletion(): Promise<void> {
  if (context) {
    try {
      await context.stopCompletion();
    } catch {
      // ignore
    }
  }
}
