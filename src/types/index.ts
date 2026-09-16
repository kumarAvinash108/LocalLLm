export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
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
