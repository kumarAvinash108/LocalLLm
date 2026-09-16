import { ModelInfo } from '../types';

/**
 * Curated list of GGUF models known to run on phones via llama.rn.
 *
 * Sizes are approximate. Quant naming: Q4_K_M ≈ best quality/size
 * trade-off for mobile; Q8_0 is larger and slower.
 *
 * Model weights are NOT covered by this repo's MIT license — each entry
 * notes its upstream weight license; verify on Hugging Face before use.
 */
export const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m',
    name: 'Qwen 2.5 0.5B Instruct (Q4_K_M)',
    repo: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF',
    file: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    sizeMB: 397,
    description: 'Tiny and fast. Best for first run / low-RAM phones.',
    license: 'Apache-2.0',
    recommended: true,
  },
  {
    id: 'smollm2-360m-instruct-q4_k_m',
    name: 'SmolLM2 360M Instruct (Q4_K_M)',
    repo: 'bartowski/SmolLM2-360M-Instruct-GGUF',
    file: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    sizeMB: 230,
    description: 'Smallest option. Fastest, weakest quality.',
    license: 'Apache-2.0',
  },
  {
    id: 'llama-3.2-1b-instruct-q4_k_m',
    name: 'Llama 3.2 1B Instruct (Q4_K_M)',
    repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeMB: 807,
    description: 'Better quality. Needs ~2 GB free RAM.',
    license: 'Llama 3.2 Community License',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen 2.5 1.5B Instruct (Q4_K_M)',
    repo: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF',
    file: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    sizeMB: 1110,
    description: 'Stronger reasoning. Needs ~3 GB free RAM.',
    license: 'Apache-2.0',
  },
];

export const DEFAULT_MODEL_ID = DEFAULT_MODELS.find((m) => m.recommended)?.id
  ?? DEFAULT_MODELS[0].id;
