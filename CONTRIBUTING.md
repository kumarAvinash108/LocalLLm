# Contributing to LocalLLM

Thanks for helping out. This guide keeps contributions consistent and the
CI pipeline (auto-built APK on every `main` push) healthy.

## Ground rules

1. **Custom dev build is mandatory.** `llama.rn` ships native C++ code, so
   **Expo Go can never run this app**. Develop and test with:
   ```sh
   npx expo prebuild
   npx expo run:android   # or run:ios
   npx expo start --dev-client
   ```
   If "Load in Chat" says a dev build is needed, you are running the wrong
   binary — rebuild, don't change app code to work around it.
2. **Every push to `main` costs a full EAS Android build** (~30–60 min of
   build minutes). Batch your work, open PRs, and let CI build only merges.
3. **Never commit secrets.** `EXPO_TOKEN`, keystores, `.env` files — use
   GitHub Actions secrets / EAS credentials instead.

## Prerequisites

- Node 22+, npm
- Android Studio (Android) and/or Xcode (iOS) for native builds
- An Expo account (only needed to run EAS builds, not for local dev builds)
- A physical device for serious testing (emulators work but are slow;
  models need 1–3 GB free RAM)

## Workflow

1. Fork / branch from `main`: `feat/...`, `fix/...`, `docs/...`.
2. Make your change (see quality gates below).
3. Open a PR against `main` with a clear description + test notes
   (device used, model used, what you tapped).
4. After merge, CI builds the APK and publishes it to the rolling
   **`latest` GitHub Release**. Check the Actions tab if it fails.

Commit messages: short, imperative summary (`Add X`, `Fix Y`). One logical
change per commit.

## Quality gates (must pass before PR)

```sh
npx tsc --noEmit        # typecheck — must be clean
npx expo-doctor@latest  # 21/21 checks must pass
```

If you touched native config (`app.json`, `eas.json`, new native deps),
also run a local build (`npx expo run:android`) — JS-only checks won't
catch C++ linking failures.

## Code conventions

- TypeScript strict; no `any` without justification.
- Native inference stays behind `src/services/llm.ts` — UI code talks to
  `ModelContext` / `ChatContext`, never imports `llama.rn` directly.
- User-facing errors must be actionable sentences, not raw native errors
  (see `translateNativeError` in `src/services/llm.ts`).
- Keep JS thread light during streaming; the chat flush throttle (~120 ms)
  exists to avoid re-render storms — don't remove it casually.
- i18n: user-visible strings go in `src/i18n/*.json` (en + es + hi), not
  hardcoded.

## Adding a model to the catalog (`src/data/models.ts`)

- Prefer small `Q4_K_M` GGUFs from public `bartowski/*-GGUF` mirrors.
- Fill in `sizeMB` honestly and note the upstream weight license.
- Verify the repo/file downloads and **loads on a real device** before PR.
- Remind users: model weights keep their own licenses — the repo's MIT
  license covers app code only.

## Dependencies

- Use `npx expo install <pkg>` (not bare `npm install`) so versions align
  with the Expo SDK.
- Upgrading `llama.rn`, React Native, or the Expo SDK requires a full
  native rebuild + on-device load test. Flag it clearly in the PR.
- When adding/removing a runtime dependency, update the table in
  [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).

## Docs

- User-facing behavior changes → update [`README.md`](./README.md).
- New screens, services, or flows → update the "Key files" table there.

## Releases

Maintainers don't cut releases by hand: merging to `main` triggers
`.github/workflows/android-apk.yml`, which builds the APK on EAS and
attaches it to the `latest` release. If the workflow fails, check that
`EXPO_TOKEN` is still valid and EAS has build minutes left.

## License

By contributing, you agree your work is released under the repo's MIT
license — see [`LICENSE`](./LICENSE).
