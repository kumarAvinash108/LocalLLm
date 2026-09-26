export interface ImageLabel {
  text: string;
  confidence: number;
}

export interface ImageAttachment {
  id: string;
  /** Local file:// URI persisted under the app's document directory. */
  uri: string;
  width?: number;
  height?: number;
  /**
   * Text extracted on-device via OCR. Empty string = ran OCR, found nothing.
   * Undefined = OCR not run yet / unavailable.
   */
  ocrText?: string;
  ocrState: 'pending' | 'done' | 'empty' | 'error';
  /**
   * Objects/scenes recognized on-device via ML Kit image labeling
   * (e.g. dog, beach, car with confidence scores). Absent on chats
   * saved before image recognition was added — treat as unavailable.
   */
  labels?: ImageLabel[];
  labelState?: 'pending' | 'done' | 'empty' | 'error';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  images?: ImageAttachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model?: string;
}

export interface Settings {
  language: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  /** When true, inference uses fewer threads / shorter answers to save battery. */
  batterySaver?: boolean;
  /**
   * Minutes of background/idle time after which the loaded model is
   * released from RAM. 0 (or undefined) = never auto-unload.
   */
  autoUnloadMinutes?: number;
}

export interface ModelInfo {
  /** Stable id, also used as the local filename base. */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  /** Hugging Face repo, e.g. "bartowski/Qwen2.5-0.5B-Instruct-GGUF". */
  repo: string;
  /** Exact .gguf filename within the repo. */
  file: string;
  /** Approximate download size in MB (for UI display). */
  sizeMB: number;
  /** Short description shown in the model picker. */
  description: string;
  /** Declared weight license (informational — user must verify on HF). */
  license: string;
  /** Shown first / pre-selected. */
  recommended?: boolean;
}

export interface DownloadedModel extends ModelInfo {
  /** Local file:// URI of the downloaded .gguf file. */
  localUri: string;
  /** Bytes on disk (may differ slightly from estimate). */
  bytesOnDisk?: number;
}

export type ModelStatus =
  | 'idle'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error';
