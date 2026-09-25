#!/usr/bin/env bash
# One-time (or repeat-safe) setup: point git at the repo's .githooks directory.
set -euo pipefail
cd "$(dirname "$0")/.."
chmod +x .githooks/pre-push
git config core.hooksPath .githooks
echo "Git hooks installed (core.hooksPath = .githooks). Every 'git push' will now ask for a version bump."
