'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

function with_timeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ timeout: `${label} timed out after ${ms}ms` }), ms))
  ]);
}

async function collect_backend_info() {
  return {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    gpuFeatureStatus: app.getGPUFeatureStatus(),
    gpuInfoBasic: {
      status: 'not_collected_in_smoke',
      reason: 'app.getGPUInfo(\'basic\') is not a required smoke gate; app.getGPUFeatureStatus() is reported and renderer probes provide the runtime evidence'
    }
  };
}

async function create_probe_window() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.webContents.on('console-message', (_event, level, message) => {
    console.error(`renderer console[${level}]: ${message}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`renderer gone: ${JSON.stringify(details)}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`renderer load failed: ${code} ${description}`);
  });
  const load_result = await with_timeout(
    win.loadFile(path.join(__dirname, 'index.html')),
    5000,
    'BrowserWindow.loadFile'
  );
  return { win, load_result };
}

async function run_smoke() {
  const hard_timeout = setTimeout(() => {
    console.log(`ELECTRON_NOZZLE_SMOKE_RESULT=${JSON.stringify({
      status: 'fail',
      reason: 'main process hard timeout before completing renderer probe',
      passFailMissing: {
        electronRendererTextureToNozzleGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_HANDLE',
        nozzleToElectronRendererGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_IMPORT_HANDLE',
        electronRendererContentToCpuCopySample: 'FAIL_TIMEOUT',
        nozzleToElectronCpuCopyRuntime: 'MISSING_NODE_FRAME_API'
      }
    })}`);
    app.exit(1);
  }, 24000);

  const backend = await collect_backend_info();
  const reports = [];

  ipcMain.on('electron-nozzle-probe-report', (_event, payload) => {
    reports.push(payload);
  });

  const { win, load_result } = await create_probe_window();

  async function wait_for_report_count(count, ms) {
    const deadline = Date.now() + ms;
    while (reports.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return reports.length >= count;
  }

  const first_report_received = await wait_for_report_count(1, 10000);
  await win.webContents.reloadIgnoringCache();
  const reload_report_received = await wait_for_report_count(2, 10000);

  win.destroy();

  const reports_have_shape = reports.length === 2 && reports.every((report) =>
    Array.isArray(report.cpuCopyFallback) && report.cpuCopyFallback.length === 2 &&
    Array.isArray(report.webgl) && report.webgl.length === 2);
  const cpu_copy_pass = reports_have_shape && reports.every((report) =>
    report.cpuCopyFallback.every((entry) => entry.status === 'pass'));
  const webgl_probe_usable = reports_have_shape && reports.every((report) =>
    report.webgl.every((entry) => entry.status === 'pass' || entry.status === 'missing'));
  const reports_valid = first_report_received && reload_report_received && cpu_copy_pass && webgl_probe_usable;

  const result = {
    status: reports_valid ? 'pass' : 'fail',
    evidenceClass: 'runtime_smoke',
    backend,
    loadResult: load_result,
    firstReportReceived: first_report_received,
    reloadReportReceived: reload_report_received,
    reloadReports: reports.length,
    reports,
    passFailMissing: {
      electronRendererTextureToNozzleGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_HANDLE',
      nozzleToElectronRendererGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_IMPORT_HANDLE',
      electronRendererContentToCpuCopySample: cpu_copy_pass ? 'PASS' : (reports.length === 0 ? 'MISSING_RENDERER_REPORT' : 'FAIL'),
      nozzleToElectronCpuCopyRuntime: 'MISSING_NODE_FRAME_API'
    }
  };

  console.log(`ELECTRON_NOZZLE_SMOKE_RESULT=${JSON.stringify(result)}`);
  clearTimeout(hard_timeout);
  if (result.status !== 'pass') {
    process.exitCode = 1;
  }
  app.quit();
}

app.whenReady().then(run_smoke).catch((error) => {
  const result = {
    status: 'fail',
    evidenceClass: 'runtime_smoke',
    reason: String(error && error.stack ? error.stack : error),
    passFailMissing: {
      electronRendererTextureToNozzleGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_HANDLE',
      nozzleToElectronRendererGpuDirect: 'FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_IMPORT_HANDLE',
      electronRendererContentToCpuCopySample: 'FAIL_MAIN_PROCESS_EXCEPTION',
      nozzleToElectronCpuCopyRuntime: 'MISSING_NODE_FRAME_API'
    }
  };
  console.log(`ELECTRON_NOZZLE_SMOKE_RESULT=${JSON.stringify(result)}`);
  process.exitCode = 1;
  app.quit();
});
