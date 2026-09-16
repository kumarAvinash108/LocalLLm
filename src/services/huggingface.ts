/**
 * Helpers for resolving Hugging Face GGUF URLs and listing .gguf files
 * in a repo via the public HF Hub API (no token needed for public repos).
 */

export function buildDownloadUrl(repo: string, file: string): string {
  const cleanRepo = repo.trim().replace(/\/$/, '');
  const cleanFile = file.trim().replace(/^\//, '');
  return `https://huggingface.co/${cleanRepo}/resolve/main/${encodeURIComponent(cleanFile).replace(/%2F/g, '/')}`;
}

export function buildRepoUrl(repo: string): string {
  return `https://huggingface.co/${repo.trim()}`;
}

interface HFSibling {
  rfilename: string;
}

interface HFModelApiResponse {
  siblings?: HFSibling[];
  license?: string;
  gated?: boolean;
}

/** List .gguf files in a public HF repo, smallest-first best-effort. */
export async function listGgufFiles(repo: string): Promise<string[]> {
  const cleanRepo = repo.trim();
  if (!cleanRepo.includes('/')) {
    throw new Error('Repo must look like "owner/name", e.g. bartowski/Qwen2.5-0.5B-Instruct-GGUF');
  }
  const res = await fetch(`https://huggingface.co/api/models/${cleanRepo}`);
  if (res.status === 401 || res.status === 403) {
    throw new Error('This repo is gated or private. Open it in a browser, accept the license, and use a public GGUF repo instead.');
  }
  if (!res.ok) {
    throw new Error(`Hugging Face repo not found (${res.status}). Check the repo id.`);
  }
  const json = (await res.json()) as HFModelApiResponse;
  const files = (json.siblings ?? [])
    .map((s) => s.rfilename)
    .filter((f) => f.toLowerCase().endsWith('.gguf') && !f.includes('/'))
    .sort((a, b) => {
      // Prefer Q4_K_M / Q4 quants, deprioritize huge Q8 / full-precision files.
      const score = (f: string) => {
        const l = f.toLowerCase();
        if (l.includes('q4_k_m')) return 0;
        if (l.includes('q4')) return 1;
        if (l.includes('q5')) return 2;
        if (l.includes('q8')) return 3;
        return 4;
      };
      return score(a) - score(b) || a.localeCompare(b);
    });
  if (files.length === 0) {
    throw new Error('No .gguf files found in that repo. Try a *-GGUF repo.');
  }
  return files;
}

export function looksLikeGgufFilename(file: string): boolean {
  return file.trim().toLowerCase().endsWith('.gguf');
}
