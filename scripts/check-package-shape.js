'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const required = [
  'README.md',
  'package.json',
  'app/main.js',
  'app/renderer.js',
  'app/preload.js',
  'app/patterns.js',
  'scripts/run-electron-smoke.js',
  'docs/gpu-public-api-blockers.md',
  'examples/cpu-copy-fallback.js'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`missing required file: ${file}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.private !== true) {
  throw new Error('package must remain private; npm publication is out of scope');
}
if (pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, 'publish')) {
  throw new Error('publish script is forbidden for this spike');
}
if (pkg.devDependencies.electron !== '42.4.0') {
  throw new Error(`Electron version must stay pinned to 42.4.0, got ${pkg.devDependencies.electron}`);
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
for (const phrase of [
  'No npm package has been published',
  'No zero-copy/GPU interop support is claimed',
  'CPU-copy fallback sample',
  'MISSING_NODE_FRAME_API'
]) {
  if (!readme.includes(phrase)) {
    throw new Error(`README missing required boundary phrase: ${phrase}`);
  }
}

const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--cache', path.join(root, '.build', 'npm-cache')], {
  cwd: root,
  encoding: 'utf8'
});
if (pack.status !== 0) {
  throw new Error(`npm pack dry-run failed: ${pack.stderr || pack.stdout}`);
}
const parsed = JSON.parse(pack.stdout)[0];
const files = new Set(parsed.files.map((entry) => entry.path));
for (const file of required.concat(['LICENSE'])) {
  if (!files.has(file)) {
    throw new Error(`pack output missing ${file}`);
  }
}
console.log(`package shape ok: ${parsed.files.length} files`);
