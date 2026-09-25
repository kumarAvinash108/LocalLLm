#!/usr/bin/env node
/**
 * Single source of truth for app versioning.
 *
 * Source files kept in sync:
 *   - package.json  -> version
 *   - app.json      -> expo.version, expo.android.versionCode (+1 per bump),
 *                      expo.ios.buildNumber (+1 per bump, string)
 *
 * Usage:
 *   node scripts/bump-version.mjs               # interactive prompt
 *   node scripts/bump-version.mjs --patch       # 1.0.0 -> 1.0.1
 *   node scripts/bump-version.mjs --minor       # 1.0.0 -> 1.1.0
 *   node scripts/bump-version.mjs --major       # 1.0.0 -> 2.0.0
 *   node scripts/bump-version.mjs --set 1.2.3   # explicit version
 *   node scripts/bump-version.mjs --skip        # no-op (used by hooks/CI)
 *   node scripts/bump-version.mjs --current     # print current version
 *
 * Exit codes: 0 = ok (or skipped), 1 = error, 2 = skipped (for hooks).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = join(ROOT, 'package.json');
const APP_JSON = join(ROOT, 'app.json');

const args = process.argv.slice(2);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function getCurrent() {
  const pkg = readJson(PACKAGE_JSON);
  const app = readJson(APP_JSON);
  return {
    pkg,
    app,
    version: app?.expo?.version ?? pkg.version,
    versionCode: app?.expo?.android?.versionCode,
    buildNumber: app?.expo?.ios?.buildNumber,
  };
}

function isValidSemver(v) {
  return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(v);
}

// Compares two x.y.z versions: -1 if a < b, 0 if equal, 1 if a > b.
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function bumpSemver(version, kind) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) throw new Error(`Cannot bump non-semver version: ${version}`);
  let [, major, minor, patch] = match;
  if (kind === 'major') return `${Number(major) + 1}.0.0`;
  if (kind === 'minor') return `${major}.${Number(minor) + 1}.0`;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function applyVersion(nextVersion) {
  const { pkg, app } = getCurrent();
  if (!isValidSemver(nextVersion)) {
    throw new Error(`Invalid semver "${nextVersion}". Expected e.g. 1.2.3`);
  }
  pkg.version = nextVersion;
  app.expo = app.expo ?? {};
  app.expo.version = nextVersion;

  // Always advance native build numbers so Play Store / App Store accept the binary.
  app.expo.android = app.expo.android ?? {};
  const currentCode = Number(app.expo.android.versionCode ?? 1);
  app.expo.android.versionCode = Number.isFinite(currentCode) ? currentCode + 1 : 1;

  app.expo.ios = app.expo.ios ?? {};
  const currentBuild = Number(app.expo.ios.buildNumber ?? 1);
  app.expo.ios.buildNumber = String(Number.isFinite(currentBuild) ? currentBuild + 1 : 1);

  writeJson(PACKAGE_JSON, pkg);
  writeJson(APP_JSON, app);

  return {
    version: nextVersion,
    versionCode: app.expo.android.versionCode,
    buildNumber: app.expo.ios.buildNumber,
  };
}

async function interactive() {
  const { version, versionCode } = getCurrent();
  console.log(`\nCurrent version: ${version} (android versionCode ${versionCode ?? 'n/a'})`);
  console.log('  1) patch  (bug fixes)          4) custom  (type x.y.z)');
  console.log('  2) minor  (new features)       5) skip    (no version change, CI will NOT build)');
  console.log('  3) major  (breaking changes)');
  console.log('  (or type a version directly, e.g. 1.2.0)');

  // Prompting works in two modes:
  //   - TTY (real `git push` in a terminal, hook re-attaches /dev/tty):
  //     one persistent readline interface for the whole session.
  //   - Piped stdin (scripted use, tests): slurp all lines upfront, because
  //     node:readline can report EOF to a second question even when piped
  //     lines remain (buffering quirk) — deterministic line-feeding avoids it.
  let pipedLines = null;
  let rl = null;
  if (!process.stdin.isTTY) {
    const data = await new Promise((resolve) => {
      let chunks = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (chunks += c));
      process.stdin.on('end', () => resolve(chunks));
    });
    pipedLines = data.split(/\r?\n/);
    // Drop the trailing empty element from a final newline.
    if (pipedLines.length > 0 && pipedLines[pipedLines.length - 1] === '') pipedLines.pop();
  } else {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  let pipedIndex = 0;
  const eofAbort = () => {
    console.error('\nNo input received (EOF) — aborting.');
    if (rl) rl.close();
    process.exit(1);
  };
  const askRequired = async (question) => {
    if (pipedLines !== null) {
      process.stdout.write(question);
      if (pipedIndex >= pipedLines.length) eofAbort();
      const line = pipedLines[pipedIndex++];
      process.stdout.write(`${line}\n`); // echo scripted answers into logs
      return line;
    }
    return new Promise((resolve) => {
      let answered = false;
      rl.question(question, (ans) => {
        answered = true;
        resolve(ans);
      });
      // stdin EOF with a pending question: resolve null instead of hanging
      // forever (node would then exit 0 silently and the hook would misread
      // it as success). The `answered` guard matters: rl.close() emits
      // 'close' synchronously, so it must not override a real answer.
      rl.once('close', () => {
        if (!answered) resolve(null);
      });
    }).then((ans) => {
      if (ans === null) eofAbort();
      return ans;
    });
  };
  const finish = (code) => {
    if (rl) rl.close();
    process.exit(code);
  };

  const raw = await askRequired('\nSelect version bump [1/2/3/4/5 or x.y.z]: ');
  const answer = raw.trim().toLowerCase();
  // Accept a raw semver (e.g. "1.0.0") as a direct custom version.
  if (isValidSemver(answer)) {
    if (compareSemver(answer, version) <= 0) {
      console.log(`\nWarning: ${answer} is not newer than current ${version}.`);
      const confirm = (await askRequired('Use it anyway? [y/N]: ')).trim().toLowerCase();
      if (!['y', 'yes'].includes(confirm)) {
        console.log('Aborted — version unchanged.');
        finish(1);
      }
    }
    const applied = applyVersion(answer);
    console.log(`\nVersion set to ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
    finish(0);
  }

  if (['5', 'skip', 's', 'n', 'no'].includes(answer)) {
    console.log('Skipped — version unchanged. NOTE: the GitHub Action will skip the EAS build.');
    finish(2);
  }
  let kind = 'patch';
  if (['2', 'minor'].includes(answer)) kind = 'minor';
  else if (['3', 'major'].includes(answer)) kind = 'major';
  else if (['4', 'custom', 'c'].includes(answer)) {
    const custom = (await askRequired('Enter new version (x.y.z): ')).trim();
    const applied = applyVersion(custom);
    console.log(`\nVersion set to ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
    finish(0);
  } else if (!['1', 'patch', '', 'p'].includes(answer)) {
    console.error(`Unknown choice "${answer}". Aborting.`);
    finish(1);
  }
  const next = bumpSemver(version, kind);
  const applied = applyVersion(next);
  console.log(`\nBumped (${kind}): ${version} -> ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
  finish(0);
}

async function main() {
  if (args.includes('--current')) {
    console.log(getCurrent().version);
    return;
  }
  if (args.includes('--skip')) {
    console.log('Skipped — version unchanged. NOTE: the GitHub Action will skip the EAS build.');
    process.exit(2);
  }
  const setIdx = args.indexOf('--set');
  if (setIdx !== -1) {
    const v = args[setIdx + 1];
    if (!v) throw new Error('Missing value for --set. Usage: --set 1.2.3');
    const applied = applyVersion(v);
    console.log(`Version set to ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
    return;
  }
  for (const kind of ['major', 'minor', 'patch']) {
    if (args.includes(`--${kind}`)) {
      const { version } = getCurrent();
      const applied = applyVersion(bumpSemver(version, kind));
      console.log(`Bumped (${kind}): ${version} -> ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
      return;
    }
  }
  await interactive();
}

main().catch((err) => {
  console.error(`bump-version failed: ${err.message}`);
  process.exit(1);
});
