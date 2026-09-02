import { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage, ipcMain, screen } from "electron";
import { existsSync, mkdirSync, copyFileSync, appendFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// macOS 上避免未签名 app 触发钥匙串权限弹窗
app.commandLine.appendSwitch("use-mock-keychain");

const __dirname = dirname(fileURLToPath(import.meta.url));

// 调试日志函数
function debugLog(message) {
  const log = `[${new Date().toISOString()}] ${message}\n`;
  try {
    appendFileSync("/tmp/electron-main-debug.log", log);
  } catch (e) {
    console.error("Failed to write debug log:", e);
  }
}

// ── 路径 ─────────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const serverScript = isDev
  ? join(__dirname, "../apps/inno-agent/dist/server.js")
  : join(app.getAppPath(), "apps/inno-agent/dist/server.js");

// auth-frontend 构建产物路径
const authDistPath = isDev
  ? join(__dirname, "auth-dist")
  : join(app.getAppPath(), "electron/auth-dist");

const innoHome = join(homedir(), ".inno-agent");
const configDir = join(innoHome, "config");
const configPath = join(configDir, "config.json");
const PORT = 3000;

// ── 首次启动创建默认配置（不要求 API Key） ────────────────────────────────────
function ensureConfig() {
  if (existsSync(configPath)) return;
  mkdirSync(configDir, { recursive: true });
  const bundledConfigPath = isDev
    ? join(__dirname, "default-config.json")
    : join(process.resourcesPath, "default-config.json");
  copyFileSync(bundledConfigPath, configPath);
}

// ── 全局状态 ──────────────────────────────────────────────────────────────────
let authWindow = null;
let mainWindow = null;
let loadingWindow = null;
let serverProcess = null;
let tray = null;
let authToken = null; // 存储登录后的 token
let currentUser = null;
let userPanelWindow = null;
let clearAuthStorageOnNextLoad = false;

function getAuthApiBase() {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const authApiBase = typeof config.authApiBase === "string" ? config.authApiBase : "";
    return (authApiBase || "https://innospark.cn").replace(/\/+$/, "");
  } catch (error) {
    debugLog(`Failed to read auth API config: ${error.message}`);
    return "";
  }
}

function sanitizeUser(user) {
  if (!user || typeof user !== "object") return null;

  return {
    id: typeof user.id === "string" ? user.id : "",
    username: typeof user.username === "string" ? user.username : "",
  };
}

async function loadCurrentUser(token) {
  const authApiBase = getAuthApiBase();
  if (!authApiBase || typeof token !== "string" || !token) {
    currentUser = null;
    return;
  }

  try {
    const response = await fetch(`${authApiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    currentUser = sanitizeUser(await response.json());
  } catch (error) {
    debugLog(`Failed to load current user: ${error.message}`);
    currentUser = null;
  }
}

function positionUserPanelWindow() {
  if (!mainWindow || !userPanelWindow || userPanelWindow.isDestroyed()) return;

  const { x, y, height } = mainWindow.getBounds();
  const [panelWidth, panelHeight] = userPanelWindow.getSize();
  const { x: workAreaX, y: workAreaY, width: workAreaWidth, height: workAreaHeight } =
    screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const left = Math.max(workAreaX, Math.min(x + 16, workAreaX + workAreaWidth - panelWidth - 8));
  const top = Math.max(workAreaY, Math.min(y + height - panelHeight - 8, workAreaY + workAreaHeight - panelHeight - 8));

  userPanelWindow.setPosition(Math.round(left), Math.round(top), false);
}

function resizeUserPanelWindow(layout) {
  if (!userPanelWindow || userPanelWindow.isDestroyed()) return;

  const menuOpen = layout?.menu === true;
  const aboutOpen = menuOpen && layout?.about === true;
  const width = aboutOpen ? 430 : 240;
  const height = aboutOpen ? 360 : menuOpen ? 300 : 80;

  userPanelWindow.setSize(width, height, false);
  positionUserPanelWindow();
}

function closeUserPanelWindow() {
  if (userPanelWindow && !userPanelWindow.isDestroyed()) {
    userPanelWindow.close();
  }
  userPanelWindow = null;
}

function openUserPanelWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (userPanelWindow && !userPanelWindow.isDestroyed()) {
    userPanelWindow.webContents.send("user-panel:user-updated", currentUser);
    positionUserPanelWindow();
    userPanelWindow.show();
    return;
  }

  userPanelWindow = new BrowserWindow({
    width: 240,
    height: 80,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    parent: mainWindow,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload-user-panel.js"),
    },
  });

  userPanelWindow.loadFile(join(__dirname, "user-panel.html"));
  userPanelWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  userPanelWindow.once("ready-to-show", () => {
    if (!userPanelWindow || userPanelWindow.isDestroyed()) return;
    userPanelWindow.webContents.send("user-panel:user-updated", currentUser);
    positionUserPanelWindow();
    userPanelWindow.show();
  });
  userPanelWindow.on("closed", () => {
    userPanelWindow = null;
  });
}

// ── Loading 窗口（服务启动期间显示） ────────────────────────────────────────
function openLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 280,
    resizable: false,
    frame: false,
    backgroundColor: "#0f1117",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  loadingWindow.loadFile(join(__dirname, "loading.html"));
  loadingWindow.on("closed", () => { loadingWindow = null; });
}

// ── 登录窗口 ──────────────────────────────────────────────────────────────────
function openAuthWindow() {
  debugLog("=== openAuthWindow() CALLED ===");
  if (authWindow) {
    debugLog("Auth window already exists, focusing");
    authWindow.focus();
    return;
  }

  debugLog("Creating auth window...");
  authWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    resizable: true,
    frame: true,
    title: "Inno Agent - 登录",
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload-auth.js"),
      partition: "persist:auth",
    },
  });

  const authIndexPath = join(authDistPath, "index.html");
  debugLog(`Loading auth window from: ${authIndexPath}`);
  debugLog(`File exists: ${existsSync(authIndexPath)}`);

  // 退出登录后先清理认证窗口的持久化存储，再加载登录页，避免自动登录。
  const clearAuthStorage = clearAuthStorageOnNextLoad;
  clearAuthStorageOnNextLoad = false;
  const loadAuthWindow = () => {
    if (!authWindow || authWindow.isDestroyed()) return;
    authWindow.loadFile(authIndexPath);
  };
  if (clearAuthStorage) {
    void authWindow.webContents.session
      .clearStorageData({ storages: ["cookies", "localstorage", "serviceworkers", "cachestorage"] })
      .catch((error) => {
        debugLog(`Failed to clear auth storage: ${error.message}`);
      })
      .finally(loadAuthWindow);
  } else {
    loadAuthWindow();
  }

  // 仅在配置显式开启时打开 DevTools
  let openDevTools = false;
  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    openDevTools = config.ui?.openDevTools === true || process.env.INNO_OPEN_DEVTOOLS === "1";
  } catch (e) {
    debugLog(`Failed to read ui config: ${e.message}`);
  }
  if (openDevTools) {
    authWindow.webContents.openDevTools();
  }

  // 注入配置（在页面加载完成后）
  authWindow.webContents.on('did-finish-load', () => {
    debugLog("Auth window loaded, injecting config...");

    // 从 config.json 读取 auth API 地址
    let authApiBase = '';
    try {
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      authApiBase = typeof config.authApiBase === 'string' && config.authApiBase
        ? config.authApiBase
        : 'https://innospark.cn';
      debugLog(`Auth API Base from config: ${authApiBase}`);
    } catch (e) {
      debugLog(`Failed to read auth config: ${e.message}`);
    }

    // 注入配置到页面
    authWindow.webContents.executeJavaScript(`
      window.__AUTH_CONFIG__ = {
        apiBase: '${authApiBase}'
      };
      console.log('Auth config injected:', window.__AUTH_CONFIG__);
    `).catch(err => {
      debugLog(`Failed to inject config: ${err.message}`);
    });
  });

  // 监听加载失败
  authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    debugLog(`Failed to load: ${validatedURL}`);
    debugLog(`Error: ${errorCode} - ${errorDescription}`);
  });

  // 监听控制台消息
  authWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    debugLog(`Console [${level}]: ${message}`);
  });

  authWindow.on("closed", () => {
    debugLog("Auth window closed");
    authWindow = null;
  });

  // 拦截外部链接在系统浏览器打开
  authWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 监听登录成功事件（通过拦截导航或消息传递）
  authWindow.webContents.on("will-navigate", (event, url) => {
    // 如果登录成功后跳转到特定路径（如 /dashboard），则打开主窗口
    if (url.includes("/dashboard") || url.includes("/success")) {
      event.preventDefault();
      onAuthSuccess();
    }
  });

  // 或者通过 localStorage/cookie 检测登录状态
  authWindow.webContents.on("did-finish-load", () => {
    // 可以注入脚本检查登录状态
    authWindow.webContents.executeJavaScript(`
      (function() {
        const token = localStorage.getItem('auth_token') || localStorage.getItem('access_token');
        if (token) {
          window.electronAPI?.onAuthSuccess?.(token);
        }
      })();
    `).catch(() => {});
  });
}

// ── 登录成功处理 ──────────────────────────────────────────────────────────────
function notifyUserPanel() {
  if (userPanelWindow && !userPanelWindow.isDestroyed()) {
    userPanelWindow.webContents.send("user-panel:user-updated", currentUser);
  }
}

function onAuthSuccess(token) {
  console.log("[auth] 登录成功，准备打开主窗口");
  authToken = token;
  currentUser = null;

  // 关闭登录窗口
  if (authWindow) {
    authWindow.close();
    authWindow = null;
  }

  // 打开主窗口
  openMainWindow();

  void loadCurrentUser(token).finally(() => {
    notifyUserPanel();
  });
}

function logoutFromUserPanel() {
  authToken = null;
  currentUser = null;
  closeUserPanelWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }

  // 登录页使用持久化 localStorage，清理后避免退出登录又被自动登录。
  clearAuthStorageOnNextLoad = true;
  openAuthWindow();
}

// 监听来自 preload 的登录成功消息
ipcMain.on("auth-success", (event, token) => {
  onAuthSuccess(token);
});
ipcMain.handle("user-panel:get-current-user", () => currentUser);
ipcMain.handle("user-panel:logout", () => logoutFromUserPanel());
ipcMain.handle("user-panel:open-account", () => {
  const authApiBase = getAuthApiBase();
  if (!authApiBase) return false;
  void shell.openExternal(`${authApiBase}/sandbox/account`);
  return true;
});
ipcMain.handle("user-panel:open-external", (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  void shell.openExternal(url);
  return true;
});
ipcMain.on("user-panel:set-expanded", (_event, layout) => {
  resizeUserPanelWindow(layout);
});

// ── 主窗口 ────────────────────────────────────────────────────────────────────
function openMainWindow() {
  debugLog("=== openMainWindow() CALLED ===");
  if (mainWindow) {
    debugLog("Main window already exists, focusing");
    mainWindow.focus();
    return;
  }

  debugLog("Creating main window...");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Inno Agent",
    backgroundColor: "#0f1117",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载主应用，并附加 token（如果需要）
  let url = `http://localhost:${PORT}`;
  if (authToken) {
    // 可以通过查询参数或其他方式传递 token
    // url += `?token=${encodeURIComponent(authToken)}`;
  }
  mainWindow.loadURL(url);

  // 关闭 loading 窗口
  loadingWindow?.close();

  mainWindow.once("ready-to-show", () => {
    openUserPanelWindow();
  });
  mainWindow.on("move", positionUserPanelWindow);
  mainWindow.on("resize", positionUserPanelWindow);
  mainWindow.on("maximize", positionUserPanelWindow);
  mainWindow.on("unmaximize", positionUserPanelWindow);
  mainWindow.on("closed", () => {
    closeUserPanelWindow();
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── 启动后端服务器 ────────────────────────────────────────────────────────────
function startServer(onReady) {
  process.env.INNO_HOME = innoHome;
  process.env.INNO_CONFIG_DIR = configDir;
  process.env.INNO_CONFIG_FILE = configPath;
  process.env.INNO_DATA_DIR = join(innoHome, "data");
  process.env.INNO_SKILLS_DIR = join(innoHome, "skills");
  process.env.INNO_WORKSPACE_DIR = join(homedir(), "Documents");
  process.env.INNO_PORT = String(PORT);

  serverProcess = spawn(process.execPath, [serverScript, "--server"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (d) => console.log("[server]", d.toString()));
  serverProcess.stderr.on("data", (d) => console.error("[server]", d.toString()));

  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      dialog.showErrorBox(
        "Inno Agent 服务异常退出",
        `服务器进程以代码 ${code} 退出。\n请检查日志或重新启动应用。`
      );
    }
  });

  // 轮询 /health，最多等待 30s
  let elapsed = 0;
  const poll = setInterval(async () => {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) {
        clearInterval(poll);
        onReady?.();
      }
    } catch { /* 还未就绪 */ }
    elapsed += 500;
    if (elapsed >= 30000) clearInterval(poll);
  }, 500);
}

// ── 应用生命周期 ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Inno Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开 Inno Agent",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          } else if (authWindow) {
            authWindow.show();
          } else {
            // 检查是否已登录
            // 这里简化处理，实际可以检查本地存储的 token
            openAuthWindow();
          }
        },
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ])
  );
  tray.on("click", () => {
    if (mainWindow) mainWindow.show();
    else if (authWindow) authWindow.show();
    else openAuthWindow();
  });

  ensureConfig();
  openLoadingWindow();

  // 启动服务器
  startServer(() => {
    debugLog("=== Server ready callback ===");
    debugLog("Closing loading window...");
    loadingWindow?.close();
    debugLog("Calling openAuthWindow()...");
    openAuthWindow();
  });
});

app.on("window-all-closed", () => {
  // macOS 上关闭所有窗口不退出，保持在托盘运行
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!app.isReady()) return;
  if (mainWindow) {
    mainWindow.show();
  } else if (authWindow) {
    authWindow.show();
  } else {
    openAuthWindow();
  }
});

app.on("before-quit", () => {
  serverProcess?.kill();
});
