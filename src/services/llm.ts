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
  onProgress?: (progress: number) => void;
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
  loadPromise = initLlama(
    {
      model: opts.modelPath,
      n_ctx: opts.nCtx ?? 2048,
      n_threads: opts.nThreads,
    },
    opts.onProgress,
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
    return new Error(NATIVE_MODULE_MISSING_MESSAGE);
  }
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
