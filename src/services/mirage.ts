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

export const MAX_MIRAGE_OCR_CHARS = 4000;

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
  try {
    // Optional dynamic integration for Cactus native runtime / cactus-react-native
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cactus = require('cactus-react-native');
    const runner = cactus?.Mirage ?? cactus?.CactusVLM ?? cactus?.default?.Mirage;
    if (typeof runner === 'function') {
      return async (uri: string) => {
        const instance = new runner();
        return await instance.describe(uri);
      };
    }
    return null;
  } catch {
    return null;
  }
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
      res.latencyMs = Date.now() - start;
      return res;
    } catch {
      // Fallback below
    }
  }

  // Fallback to native text & label extractors if Cactus runner is not yet hooked
  return await runFallbackAnalysis(imageUri, start);
}

/**
 * Graceful fallback when running in environment before Mirage runtime hooks.
 * Uses available on-device ML Kit / vision modules and formats them in the unified Mirage schema.
 */
async function runFallbackAnalysis(imageUri: string, start: number): Promise<MirageAnalysisResult> {
  let ocrText = '';
  const labels: ImageLabel[] = [];

  // Try OCR
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ocrMod = require('@react-native-ml-kit/text-recognition');
    const rec = ocrMod?.default?.recognize ?? ocrMod?.recognize;
    if (typeof rec === 'function') {
      const raw = await rec(imageUri);
      if (typeof raw === 'object' && raw?.text) {
        ocrText = String(raw.text).trim();
      } else if (typeof raw === 'string') {
        ocrText = raw.trim();
      }
    }
  } catch {
    // OCR unavailable
  }

  // Try Labels
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const labelMod = require('@react-native-ml-kit/image-labeling');
    const labelFn = labelMod?.default?.label ?? labelMod?.label;
    if (typeof labelFn === 'function') {
      const raw = await labelFn(imageUri);
      if (Array.isArray(raw)) {
        for (const item of raw) {
          const text = item?.text || item?.label;
          const confidence = typeof item?.confidence === 'number' ? item.confidence : 0.8;
          if (text) labels.push({ text: String(text).trim(), confidence });
        }
      }
    }
  } catch {
    // Labels unavailable
  }

  let sceneDescription = '';
  if (labels.length > 0) {
    sceneDescription = `Image featuring ${labels.slice(0, 3).map((l) => l.text).join(', ')}.`;
  } else if (ocrText) {
    sceneDescription = 'Document or image containing printed text.';
  }

  return {
    ocrText: ocrText.length > MAX_MIRAGE_OCR_CHARS ? ocrText.slice(0, MAX_MIRAGE_OCR_CHARS) + '\n…[truncated]' : ocrText,
    sceneDescription,
    labels: labels.slice(0, 5),
    engine: 'mlkit',
    latencyMs: Date.now() - start,
  };
}
