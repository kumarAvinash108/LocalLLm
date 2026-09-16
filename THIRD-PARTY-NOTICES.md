# Third-Party Notices

LocalLLM is released under the MIT License (see `LICENSE`).
This project bundles and depends on the following third-party software.
All listed packages are MIT-licensed (permissive, compatible with this
project's MIT license). License texts are included in each package's
distribution under `node_modules/<package>/LICENSE*` where provided.

## Runtime dependencies

| Package | Version (at audit) | License | Source |
|---|---|---|---|
| `llama.rn` (llama.cpp binding — on-device GGUF inference) | ^0.10.1 | MIT | https://github.com/mybigday/llama.rn |
| `expo` | ^57.0.0 | MIT | https://github.com/expo/expo |
| `expo-file-system` (model .gguf download/storage, via `/legacy` API) | ~57.0.x (SDK 57) | MIT | https://github.com/expo/expo |
| `expo-sqlite` (chat history persistence) | ~57.0.x | MIT | https://github.com/expo/expo |
| `expo-status-bar` | ~57.0.x | MIT | https://github.com/expo/expo |
| `expo-localization` | ~57.0.x | MIT | https://github.com/expo/expo |
| `react` | 19.2.x | MIT | https://github.com/facebook/react |
| `react-native` | 0.86.x | MIT | https://github.com/facebook/react-native |
| `@react-navigation/native`, `@react-navigation/native-stack` | ^7.x | MIT | https://github.com/react-navigation/react-navigation |
| `react-native-drawer-layout` | ^4.x | MIT | https://github.com/react-navigation/react-navigation |
| `react-native-gesture-handler` | ~2.32.x | MIT | https://github.com/software-mansion/react-native-gesture-handler |
| `react-native-reanimated` | 4.5.x | MIT | https://github.com/software-mansion/react-native-reanimated |
| `react-native-safe-area-context` | ~5.7.x | MIT | https://github.com/software-mansion/react-native-safe-area-context |
| `react-native-screens` | ~4.26.x | MIT | https://github.com/software-mansion/react-native-screens |
| `react-native-keyboard-controller` | 1.21.x | MIT | https://github.com/kirillzyusko/react-native-keyboard-controller |
| `react-native-worklets` | 0.10.x | MIT | https://github.com/software-mansion/react-native-reanimated |
| `@expo/vector-icons` | ^15.0.3 | MIT | https://github.com/expo/vector-icons |
| `i18next`, `react-i18next` | ^26 / ^17 | MIT | https://github.com/i18next/i18next |
| `babel-preset-expo`, `@babel/core` | SDK 57 pinned | MIT | https://github.com/expo/expo |

## Native inference engine

- **llama.cpp / ggml** (via `llama.rn` prebuilt binaries) — MIT License.
  Copyright (c) Georgi Gerganov and llama.cpp contributors.
  See https://github.com/ggml-org/llama.cpp/blob/master/LICENSE

## AI models (not shipped with this repo)

GGUF weights downloaded at runtime from Hugging Face are **not**
covered by this repo's MIT license. Each model carries its own license
(e.g. Llama community license, Qwen license, Apache-2.0, MIT). The app
surfaces the declared repo license where known (see
`src/data/models.ts`), and users must review and accept the model
license on Hugging Face before downloading.

## Why MIT for this project?

All direct native/JS dependencies above are MIT-licensed, so MIT is the
natural, lowest-friction choice: it permits commercial use,
modification, distribution and private use with only the requirement to
preserve the copyright notice. Apache-2.0 would also be compatible, but
MIT keeps attribution to a single `LICENSE` file.
