/**
 * On-device image recognition via Google ML Kit image labeling
 * (no network needed after install).
 *
 * Complements OCR (`./ocr`): OCR reads *text* in the image, while this
 * module recognizes *what's in* the image — objects, animals, places,
 * activities (400+ base-model categories like "dog", "beach", "car").
 * Both results are fed to the text-only GGUF model as prompt text,
 * so the LLM can answer "what is in this photo?" fully offline.
 *
 * Requires a custom dev build (`npx expo prebuild` + `run:android/ios`):
 * the native ML Kit module is not present in Expo Go. When unavailable,
 * callers get a clear error instead of a native crash.
 */

export const IMAGE_RECOGNITION_UNAVAILABLE_MESSAGE =
  'On-device image recognition needs a custom dev build — Expo Go is not supported. ' +
  'Run `npx expo prebuild`, then `npx expo run:android` (or `run:ios`), and open the app from that build.';

export interface ImageLabel {
  text: string;
  confidence: number;
}

/** Top-N labels kept per image — bounds prompt size and prefill cost. */
export const MAX_LABELS_PER_IMAGE = 5;
/** Drop low-confidence noise below this threshold. */
export const MIN_LABEL_CONFIDENCE = 0.5;

type LabelFn = (url: string) => Promise<unknown>;

function getLabelFn(): LabelFn | null {
  try {
    // Optional dependency: keep the import lazy so Expo Go / web (where the
    // native module is missing) still loads the rest of the app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-ml-kit/image-labeling');
    const label = mod?.default?.label ?? mod?.label;
    if (typeof label === 'function') return label as LabelFn;
    return null;
  } catch {
    return null;
  }
}

export function isImageRecognitionAvailable(): boolean {
  return getLabelFn() !== null;
}

function extractLabels(result: unknown): ImageLabel[] {
  if (!Array.isArray(result)) return [];
  const out: ImageLabel[] = [];
  for (const item of result) {
    if (item && typeof item === 'object') {
      const r = item as { text?: unknown; label?: unknown; confidence?: unknown };
      const text = typeof r.text === 'string' ? r.text : typeof r.label === 'string' ? r.label : '';
      const confidence = typeof r.confidence === 'number' ? r.confidence : 0;
      if (text.trim()) out.push({ text: text.trim(), confidence });
    } else if (typeof item === 'string' && item.trim()) {
      out.push({ text: item.trim(), confidence: 0 });
    }
  }
  return out
    .filter((l) => l.confidence >= MIN_LABEL_CONFIDENCE || l.confidence === 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_LABELS_PER_IMAGE);
}

/**
 * Run on-device image labeling on a local image URI.
 * Returns top labels with confidence (possibly empty when nothing
 * recognizable was found). Throws IMAGE_RECOGNITION_UNAVAILABLE_MESSAGE
 * when the native module is missing.
 */
export async function recognizeImageLabels(uri: string): Promise<ImageLabel[]> {
  const label = getLabelFn();
  if (!label) {
    throw new Error(IMAGE_RECOGNITION_UNAVAILABLE_MESSAGE);
  }
  const raw = await label(uri);
  return extractLabels(raw);
}

/** "dog (92%), park (78%)" — compact form injected into the LLM prompt. */
export function formatLabels(labels: ImageLabel[]): string {
  return labels
    .map((l) =>
      l.confidence > 0 ? `${l.text} (${Math.round(l.confidence * 100)}%)` : l.text,
    )
    .join(', ');
}
