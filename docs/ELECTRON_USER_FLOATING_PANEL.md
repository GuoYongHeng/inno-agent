# Electron 客户端用户浮层方案

## 1. 背景

网页端的左下角用户按钮属于 auth-service 宿主页面中的 `UserPanel`。网页端通过 iframe 嵌入 Inno Agent，用户浮层由 iframe 外层页面负责显示。

Electron 登录成功后的页面结构不同：

```text
authWindow
  登录页

mainWindow
  http://localhost:3000
```

登录成功后，Electron 会关闭 `authWindow`，再创建独立的 `mainWindow`。主窗口没有 auth-service 宿主页面，因此不会自动显示网页端的左下角用户按钮。

## 2. 目标

在 Electron 客户端主界面显示一个左下角用户入口，同时满足：

- 不修改 Web 端页面的视觉展示；
- 不在浏览器网页端显示该按钮；
- 不依赖 iframe 父页面的 `window.parent.postMessage`；
- 登录成功后显示，退出登录或应用退出时关闭；
- 后续可以扩展用户信息、账号设置和退出登录。

## 3. 推荐方案

在 Electron 主进程中创建一个独立的无边框浮动窗口，作为用户按钮窗口。

```text
Electron
├── mainWindow
│   └── http://localhost:3000
└── userPanelWindow
    └── Electron 专用用户按钮页面
```

`userPanelWindow` 是 Electron 客户端的 UI，不属于 Inno Agent Web 页面。因此它不会影响：

- `apps/inno-agent/web/` 的布局；
- 浏览器访问 `http://localhost:3000` 时的展示；
- 网页端 iframe 宿主页面；
- Web 端构建产物中的业务组件。

## 4. 窗口设计

用户浮层窗口可以使用以下配置：

```js
const userPanelWindow = new BrowserWindow({
  width: 240,
  height: 80,
  frame: false,
  transparent: true,
  resizable: false,
  movable: false,
  parent: mainWindow,
  skipTaskbar: true,
  webPreferences: {
    preload: join(__dirname, "preload-user-panel.js"),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
```

浮层收起时窗口为 `240 x 80`，按钮本身保持线上 `56px` 高、左下角 `16px` 的视觉位置。展开菜单时，主进程动态将窗口调整为更大的尺寸，并重新定位窗口，使菜单向上展开且不被裁剪。

由一个独立的 Electron 页面承载按钮：

```text
electron/user-panel.html
electron/user-panel.css
electron/user-panel.js
electron/preload-user-panel.js
```

按钮和菜单按线上 auth-service `UserPanel` 的结构实现，包含：

```text
账号管理
InnoAgent
关于启创
退出登录
```

“关于启创”继续展开二级菜单，保持线上菜单层级和布局。

## 5. 生命周期

### 登录成功

当前入口位于：

```text
electron/main-with-auth.js
```

登录成功后执行：

```text
onAuthSuccess()
  ├── 保存 authToken
  ├── 关闭 authWindow
  ├── 打开 mainWindow
  └── 打开 userPanelWindow
```

### 主窗口关闭

主窗口关闭时同步关闭用户浮层窗口，避免留下孤立窗口：

```js
mainWindow.on("closed", () => {
  userPanelWindow?.close();
  userPanelWindow = null;
  mainWindow = null;
});
```

### 退出登录

退出登录时：

1. 通过 IPC 通知主进程；
2. 主进程清理 `authToken`；
3. 关闭 `userPanelWindow`；
4. 关闭 `mainWindow`；
5. 重新打开 `authWindow`。

## 6. 左下角位置同步

浮层窗口需要跟随主窗口的位置和尺寸变化。建议封装一个定位函数：

```js
function positionUserPanelWindow() {
  if (!mainWindow || !userPanelWindow) return;

  const [x, y] = mainWindow.getPosition();
  const [width, height] = mainWindow.getSize();
  const [panelWidth, panelHeight] = userPanelWindow.getSize();

  userPanelWindow.setPosition(
    x + 16,
    y + height - panelHeight - 16,
    false,
  );
}
```

监听主窗口事件：

```js
mainWindow.on("move", positionUserPanelWindow);
mainWindow.on("resize", positionUserPanelWindow);
mainWindow.on("maximize", positionUserPanelWindow);
mainWindow.on("unmaximize", positionUserPanelWindow);
```

窗口创建并加载完成后调用一次：

```js
userPanelWindow.once("ready-to-show", () => {
  positionUserPanelWindow();
  userPanelWindow.show();
});
```

需要根据 macOS 和 Windows 的窗口边界实际调整偏移量。若主窗口最大化，浮层应继续位于主窗口内容区域左下角，而不是屏幕左下角。

## 7. IPC 设计

不要让浮层页面直接访问 Node.js API。通过 preload 暴露最小化的安全接口：

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("userPanelAPI", {
  getCurrentUser: () => ipcRenderer.invoke("user-panel:get-current-user"),
  logout: () => ipcRenderer.invoke("user-panel:logout"),
  openAccount: () => ipcRenderer.invoke("user-panel:open-account"),
});
```

主进程注册对应处理器：

```js
ipcMain.handle("user-panel:get-current-user", () => {
  return currentUser;
});

ipcMain.handle("user-panel:logout", async () => {
  await logout();
  return { ok: true };
});
```

IPC 接口只返回必要的用户信息，例如：

```js
{
  id: "user-id",
  name: "用户名称",
  avatarUrl: ""
}
```

不要把完整 token 暴露给渲染页面，也不要通过 URL 查询参数传递 token。

## 8. 当前 token 状态

当前实现中，登录成功后的 token 保存在：

```js
let authToken = null;
```

并由 `onAuthSuccess(token)` 写入主进程内存。主应用加载时，token 目前没有真正传给 `http://localhost:3000`。

因此本方案可以分两个阶段实施：

### 第一阶段：只显示按钮

- 用户浮层显示固定图标或“账户”文字；
- 不读取真实用户信息；
- 点击可以打开账号页面或显示基础菜单；
- 不涉及 token 传递。

### 第二阶段：接入真实用户信息

- 登录成功时同时保存用户基本信息；
- 主进程通过 IPC 返回用户信息；
- 退出登录统一由主进程处理；
- 必要时增加 auth-service 的登出接口调用。

## 9. 安全要求

- `contextIsolation: true`；
- `nodeIntegration: false`；
- 通过 preload + `contextBridge` 暴露白名单 API；
- 不使用 `executeJavaScript` 注入 token；
- 不把 token 放进 URL、页面 DOM 或 localStorage；
- IPC 参数进行校验；
- 用户浮层只加载本地可信页面；
- 外部账号页面通过 `shell.openExternal` 在系统浏览器打开。

## 10. 文件改动范围

推荐改动范围如下：

```text
electron/main-with-auth.js       # 创建、定位、销毁浮层窗口
electron/preload-user-panel.js   # 暴露最小化 IPC API
electron/user-panel.html         # Electron 专用按钮页面
electron/user-panel.css          # 按钮样式
electron/user-panel.js           # 菜单和交互
```

不修改：

```text
apps/inno-agent/web/src/react/
apps/inno-agent/web/src/stores/
auth-service/auth-frontend/
```

## 11. 验证清单

- 登录成功后主窗口和用户浮层同时出现；
- 用户浮层位于主窗口左下角；
- 拖动主窗口后浮层跟随移动；
- 调整主窗口大小后浮层位置正确；
- 最大化和恢复窗口后位置正确；
- 关闭主窗口时浮层同步关闭；
- 退出登录后浮层关闭并回到登录窗口；
- 浏览器访问 Web 页面时不会显示该按钮；
- Windows 和 macOS 打包后均能正常显示；
- 未登录状态不会出现用户浮层；
- 用户浮层无法直接访问 Node.js 或文件系统。

## 12. 方案结论

对于“只在 Electron 客户端显示，不能影响 Web 页面”的要求，独立的 Electron 浮动窗口是最合适的低侵入方案。

它不复用 iframe 宿主的 `UserPanel` 页面结构，而是在 Electron 层提供同等入口。第一阶段可以只实现一个按钮，后续再通过安全 IPC 接入用户信息、账号设置和退出登录。
