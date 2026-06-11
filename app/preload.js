'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronNozzleProbe', {
  report: (payload) => ipcRenderer.send('electron-nozzle-probe-report', payload)
});
