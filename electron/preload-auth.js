const { contextBridge, ipcRenderer } = require("electron");

// 暴露安全的 API 给登录页面
contextBridge.exposeInMainWorld("electronAPI", {
  // 登录成功后调用，通知主进程
  onAuthSuccess: (token) => {
    ipcRenderer.send("auth-success", token);
  },
});
