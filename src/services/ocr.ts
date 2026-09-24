/**
 * On-device OCR via Google ML Kit (no network needed after install).
 *
 * The bundled text-only GGUF models cannot see pixels, so images are
 * converted to text first and the extracted text is fed to the LLM as
 * part of the prompt. Everything stays offline.
 *
 * Requires a custom dev build (`npx expo prebuild` + `run:android/ios`):
 * the native ML Kit module is not present in Expo Go. When unavailable,
 * callers get a clear error instead of a native crash.
 */

export const OCR_UNAVAILABLE_MESSAGE =
  'On-device text recognition needs a custom dev build — Expo Go is not supported. ' +
  'Run `npx expo prebuild`, then `npx expo run:android` (or `run:ios`), and open the app from that build.';

/** Upper bound on OCR text injected into the prompt (prefill cost grows with length). */
export const MAX_OCR_CHARS = 4000;

type RecognizeFn = (url: string) => Promise<unknown>;

function getRecognizeFn(): RecognizeFn | null {
  try {
    // Optional dependency: keep the import lazy so Expo Go / web (where the
    // native module is missing) still loads the rest of the app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/text-recognition');
    const rec = mod?.default?.recognize ?? mod?.recognize;
    if (typeof rec === 'function') return rec as RecognizeFn;
    return null;
  } catch {
    return null;
  }
}

export function isOcrAvailable(): boolean {
  return getRecognizeFn() !== null;
}

function extractText(result: unknown): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') {
    const r = result as { text?: unknown; blocks?: { text?: unknown }[] };
    if (typeof r.text === 'string') return r.text;
    if (Array.isArray(r.blocks)) {
      return r.blocks
        .map((b) => (typeof b?.text === 'string' ? b.text : ''))
        .filter(Boolean)
        .join('\n');
    }
  }
  return '';
}

/**
 * Run on-device text recognition on a local image URI.
 * Returns trimmed text (possibly empty when no text was found).
 * Throws OCR_UNAVAILABLE_MESSAGE when the native module is missing.
 */
export async function recognizeImageText(uri: string): Promise<string> {
  const recognize = getRecognizeFn();
  if (!recognize) {
    throw new Error(OCR_UNAVAILABLE_MESSAGE);
  }
  const raw = await recognize(uri);
  const text = extractText(raw).trim();
  if (!text) return '';
  return text.length > MAX_OCR_CHARS ? text.slice(0, MAX_OCR_CHARS) + '\n…[truncated]' : text;
}
