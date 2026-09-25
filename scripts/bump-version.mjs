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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

async function interactive() {
  const { version, versionCode } = getCurrent();
  console.log(`\nCurrent version: ${version} (android versionCode ${versionCode ?? 'n/a'})`);
  console.log('  1) patch  (bug fixes)          4) custom  (type x.y.z)');
  console.log('  2) minor  (new features)       5) skip    (no version change, CI will NOT build)');
  console.log('  3) major  (breaking changes)');
  const answer = (await ask('\nSelect version bump [1/2/3/4/5]: ')).trim().toLowerCase();

  if (['5', 'skip', 's', 'n', 'no'].includes(answer)) {
    console.log('Skipped — version unchanged. NOTE: the GitHub Action will skip the EAS build.');
    process.exit(2);
  }
  let kind = 'patch';
  if (['2', 'minor'].includes(answer)) kind = 'minor';
  else if (['3', 'major'].includes(answer)) kind = 'major';
  else if (['4', 'custom', 'c'].includes(answer)) {
    const custom = (await ask('Enter new version (x.y.z): ')).trim();
    const applied = applyVersion(custom);
    console.log(`\nVersion set to ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
    return;
  } else if (!['1', 'patch', '', 'p'].includes(answer)) {
    console.error(`Unknown choice "${answer}". Aborting.`);
    process.exit(1);
  }
  const next = bumpSemver(version, kind);
  const applied = applyVersion(next);
  console.log(`\nBumped (${kind}): ${version} -> ${applied.version} (versionCode ${applied.versionCode}, ios build ${applied.buildNumber})`);
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
