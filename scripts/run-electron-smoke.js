'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const app_main = path.join(__dirname, '..', 'app', 'main.js');
const result = spawnSync(electron, [app_main], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  timeout: 30000,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
  }
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');

if (result.error) {
  const failure = {
    status: 'fail',
    reason: `electron runtime did not complete smoke: ${result.error.message}`,
    evidenceClass: 'runtime_smoke',
    passFailMissing: {
      electronRendererTextureToNozzleGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_HANDLE',
      nozzleToElectronRendererGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_IMPORT_HANDLE',
      electronRendererContentToCpuCopySample: result.error.code === 'ETIMEDOUT' ? 'FAIL_TIMEOUT_APP_DID_NOT_EXIT' : 'MISSING_RUNTIME_ENVIRONMENT',
      nozzleToElectronCpuCopyRuntime: 'MISSING_NODE_FRAME_API'
    }
  };
  console.log(`ELECTRON_NOZZLE_SMOKE_RESULT=${JSON.stringify(failure)}`);
  process.exit(1);
}

const marker = (result.stdout || '').split('\n').find((line) => line.startsWith('ELECTRON_NOZZLE_SMOKE_RESULT='));
if (!marker) {
  console.error('missing ELECTRON_NOZZLE_SMOKE_RESULT marker');
  process.exit(result.status || 1);
}

const payload = JSON.parse(marker.slice('ELECTRON_NOZZLE_SMOKE_RESULT='.length));
if (payload.status !== 'pass') {
  console.error(`electron smoke failed: ${payload.status}`);
  process.exit(1);
}

process.exit(result.status || 0);
