const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("userPanelAPI", {
  getCurrentUser: () => ipcRenderer.invoke("user-panel:get-current-user"),
  logout: () => ipcRenderer.invoke("user-panel:logout"),
  openAccount: () => ipcRenderer.invoke("user-panel:open-account"),
  openExternal: (url) => ipcRenderer.invoke("user-panel:open-external", url),
  setExpanded: (layout) => ipcRenderer.send("user-panel:set-expanded", layout),
  onUserUpdated: (callback) => {
    if (typeof callback !== "function") return () => {};

    const listener = (_event, user) => callback(user);
    ipcRenderer.on("user-panel:user-updated", listener);
    return () => ipcRenderer.removeListener("user-panel:user-updated", listener);
  },
  onCloseMenu: (callback) => {
    if (typeof callback !== "function") return () => {};

    const listener = () => callback();
    ipcRenderer.on("user-panel:close-menu", listener);
    return () => ipcRenderer.removeListener("user-panel:close-menu", listener);
  },
});
