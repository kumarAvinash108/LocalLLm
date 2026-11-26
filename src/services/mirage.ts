/**
 * On-device Vision-Language Model (VLM) & OCR via Cactus Compute Mirage.
 * Model reference: https://cactuscompute.com/blog/mirage
 *
 * Mirage is an ultra-compact (~22 MB, 51.3 million parameters, 2-bit quantized)
 * vision-language model engineered by Cactus Compute for local edge devices.
 *
 * In a single forward pass, Mirage performs:
 *  1. Optical Character Recognition (OCR) — reads all text, documents, signs, numbers.
 *  2. Scene Description — generates natural language captions of what's in the image.
 *  3. Object Detection — identifies items, categories, and attributes.
 *  4. Structured Extraction — produces machine-readable key-value pairs.
 *
 * Utilizing Mirage eliminates the need for separate heavy OCR and image-labeling
 * native modules, providing unified multi-modal understanding in ~22 MB.
 */

import { ImageLabel } from '../types';
import { NativeModules } from 'react-native';

export const MIRAGE_MODEL_INFO = {
  id: 'mirage-ocr-vlm',
  name: 'Cactus Mirage (OCR & Vision VLM)',
  repo: 'Cactus-Compute/mirage',
  file: 'mirage.cact',
  sizeMB: 22,
  description:
    'Ultra-compact 22MB on-device VLM by Cactus Compute (https://cactuscompute.com/blog/mirage). ' +
    'Extracts OCR text, scene description, and detected objects in a single fast pass.',
  url: 'https://cactuscompute.com/blog/mirage',
  hfUrl: 'https://huggingface.co/Cactus-Compute/mirage',
};

export const MAX_MIRAGE_OCR_CHARS = 2500;

/**
 * Extract plain text from an ML Kit text recognition response (string,
 * `{ text }`, or `{ blocks: [{ text }] }`).
 */
export function extractOcrText(result: unknown): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') {
    const r = result as { text?: unknown; blocks?: { text?: unknown }[] };
    if (typeof r.text === 'string' && r.text.trim()) return r.text;
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
 * Normalize whitespace, drop pure punctuation/symbol noise on non-text photos,
 * and enforce the prompt-size cap on extracted OCR text.
 */
export function cleanOcrText(raw: string, maxChars = MAX_MIRAGE_OCR_CHARS): string {
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Reject pure punctuation/symbol noise (e.g. "| . -") with no letters or digits.
  if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) {
    return '';
  }

  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars).trimEnd() + '\n…[truncated]';
}

export interface MirageAnalysisResult {
  /** OCR text extracted from the image. Empty string if no text found. */
  ocrText: string;
  /** Natural language description of the scene/photo. */
  sceneDescription: string;
  /** Detected objects, items, or visual tags with confidence. */
  labels: ImageLabel[];
  /** Structured key-value extractions if present. */
  structured?: Record<string, unknown>;
  /** Which engine handled this analysis. */
  engine: 'mirage' | 'mlkit';
  /** Latency in milliseconds if recorded. */
  latencyMs?: number;
}

type CactusRunner = (imageUri: string, task?: string) => Promise<unknown>;

function getCactusRunner(): CactusRunner | null {
  // cactus-react-native is optional and not installed in this project.
  // A static require() breaks Metro resolution; enable only after adding
  // the package and wiring the native runtime here.
  return null;
}

/**
 * Checks if the native Cactus runtime is loaded.
 */
export function isMirageRuntimeAvailable(): boolean {
  return getCactusRunner() !== null;
}

/**
 * Parses raw Mirage output (which can be a structured JSON string or object)
 * into a typed MirageAnalysisResult.
 */
export function parseMirageOutput(raw: unknown): MirageAnalysisResult {
  if (!raw) {
    return {
      ocrText: '',
      sceneDescription: '',
      labels: [],
      engine: 'mirage',
    };
  }

  // If Mirage returned a structured object directly
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const ocrText =
      typeof obj.ocrText === 'string'
        ? obj.ocrText
        : typeof obj.text === 'string'
          ? obj.text
          : typeof obj.ocr === 'string'
            ? obj.ocr
            : '';

    const sceneDescription =
      typeof obj.description === 'string'
        ? obj.description
        : typeof obj.scene === 'string'
          ? obj.scene
          : typeof obj.caption === 'string'
            ? obj.caption
            : '';

    const labels: ImageLabel[] = [];
    if (Array.isArray(obj.objects)) {
      for (const item of obj.objects) {
        if (typeof item === 'string') {
          labels.push({ text: item, confidence: 0.9 });
        } else if (item && typeof item === 'object') {
          const o = item as { label?: string; name?: string; text?: string; confidence?: number };
          const name = o.label || o.name || o.text;
          if (name) {
            labels.push({ text: name, confidence: o.confidence ?? 0.85 });
          }
        }
      }
    } else if (Array.isArray(obj.labels)) {
      for (const l of obj.labels) {
        if (typeof l === 'string') {
          labels.push({ text: l, confidence: 0.9 });
        } else if (l && typeof l === 'object') {
          const lo = l as { text?: string; confidence?: number };
          if (lo.text) labels.push({ text: lo.text, confidence: lo.confidence ?? 0.85 });
        }
      }
    }

    return {
      ocrText: ocrText.trim(),
      sceneDescription: sceneDescription.trim(),
      labels,
      structured: obj,
      engine: 'mirage',
    };
  }

  // If Mirage returned text / markdown / JSON string
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    // Try parsing as JSON first
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseMirageOutput(parsed);
      } catch {
        // Not valid JSON, continue with text parsing
      }
    }

    // Parse plain text output sections (e.g. "Text: ... Description: ...")
    let ocrText = '';
    let sceneDescription = '';
    const labels: ImageLabel[] = [];

    const lines = trimmed.split('\n');
    let currentSection: 'text' | 'desc' | 'labels' | 'general' = 'general';

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('text:') || lower.startsWith('ocr:')) {
        currentSection = 'text';
        ocrText += line.replace(/^(text|ocr):\s*/i, '') + '\n';
      } else if (lower.startsWith('description:') || lower.startsWith('scene:')) {
        currentSection = 'desc';
        sceneDescription += line.replace(/^(description|scene):\s*/i, '') + '\n';
      } else if (lower.startsWith('objects:') || lower.startsWith('labels:')) {
        currentSection = 'labels';
        const rawLabels = line.replace(/^(objects|labels):\s*/i, '').split(',');
        for (const rl of rawLabels) {
          const t = rl.trim();
          if (t) labels.push({ text: t, confidence: 0.9 });
        }
      } else {
        if (currentSection === 'text') {
          ocrText += line + '\n';
        } else if (currentSection === 'desc') {
          sceneDescription += line + '\n';
        } else {
          // General output treated as scene description
          sceneDescription += line + '\n';
        }
      }
    }

    return {
      ocrText: ocrText.trim(),
      sceneDescription: sceneDescription.trim() || trimmed,
      labels,
      engine: 'mirage',
    };
  }

  return {
    ocrText: '',
    sceneDescription: '',
    labels: [],
    engine: 'mirage',
  };
}

/**
 * Runs Mirage single-pass visual analysis (OCR + Scene Understanding).
 * Returns OCR text, scene description, and detected labels.
 */
export async function runMirageAnalysis(imageUri: string): Promise<MirageAnalysisResult> {
  const start = Date.now();
  const runner = getCactusRunner();

  if (runner) {
    try {
      const raw = await runner(imageUri);
      const res = parseMirageOutput(raw);
      res.ocrText = cleanOcrText(res.ocrText);
      res.latencyMs = Date.now() - start;
      return res;
    } catch {
      // Fall through to ML Kit below — do not swallow into empty results.
    }
  }

  return await runFallbackAnalysis(imageUri, start);
}

/**
 * Fallback when the Mirage/Cactus runtime is unavailable.
 * Uses on-device ML Kit text recognition + image labeling.
 *
 * Throws when no vision engine can run (e.g. Expo Go) or when every
 * available engine fails — callers must surface that as an error state
 * instead of reporting "nothing found in image".
 */
async function runFallbackAnalysis(imageUri: string, start: number): Promise<MirageAnalysisResult> {
  const canOcr = NativeModules.TextRecognition != null;
  const canLabel = NativeModules.ImageLabeling != null;

  if (!canOcr && !canLabel) {
    throw new Error(
      'On-device vision needs a custom dev build — Expo Go is not supported. ' +
        'Run `npx expo prebuild`, then `npx expo run:android` (or `run:ios`).',
    );
  }

  let ocrText = '';
  let ocrError: unknown = null;
  const labels: ImageLabel[] = [];
  let labelError: unknown = null;

  if (canOcr) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ocrMod = require('@react-native-ml-kit/text-recognition');
      const rec = ocrMod?.default?.recognize ?? ocrMod?.recognize;
      if (typeof rec === 'function') {
        const raw = await rec(imageUri);
        ocrText = cleanOcrText(extractOcrText(raw));
      }
    } catch (e) {
      ocrError = e;
    }
  }

  if (canLabel) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const labelMod = require('@react-native-ml-kit/image-labeling');
      const labelFn = labelMod?.default?.label ?? labelMod?.label;
      if (typeof labelFn === 'function') {
        const raw = await labelFn(imageUri);
        if (Array.isArray(raw)) {
          for (const item of raw) {
            const text = item?.text || item?.label;
            const confidence = typeof item?.confidence === 'number' ? item.confidence : 0;
            if (text && confidence >= 0.5) {
              labels.push({ text: String(text).trim(), confidence });
            }
          }
          labels.sort((a, b) => b.confidence - a.confidence);
        }
      }
    } catch (e) {
      labelError = e;
    }
  }

  const ocrFailed = canOcr && ocrError != null;
  const labelFailed = canLabel && labelError != null;
  // Every engine that could run failed — surface the error, not "empty".
  if ((canOcr || canLabel) && (ocrFailed || !canOcr) && (labelFailed || !canLabel)) {
    const err = ocrError ?? labelError;
    throw err instanceof Error
      ? err
      : new Error('On-device image analysis failed. Try a custom dev build if you are on Expo Go.');
  }

  let sceneDescription = '';
  if (labels.length > 0) {
    sceneDescription = `Image featuring ${labels.slice(0, 3).map((l) => l.text).join(', ')}.`;
  } else if (ocrText) {
    sceneDescription = 'Document or image containing printed text.';
  }

  return {
    ocrText,
    sceneDescription,
    labels: labels.slice(0, 5),
    engine: 'mlkit',
    latencyMs: Date.now() - start,
  };
}
