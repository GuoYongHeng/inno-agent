const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  setSettingsOverlayOpen: (open) => ipcRenderer.send("main-window:set-settings-open", open),
});
