# 集成 auth-frontend 打包指南

本文档说明如何将 `auth-frontend` 登录注册页面与 `inno-agent` 一起打包成桌面客户端。

## 方案概述

采用 **Electron 多窗口 + 前后端分离** 方案：
1. **auth-frontend 前端**打包进客户端（静态文件）
2. **auth-frontend 后端**继续部署在线上，客户端通过 HTTPS 访问
3. 应用启动时先显示登录窗口（加载本地 auth-frontend）
4. 用户登录时请求线上 API（`https://your-api-domain.com/auth/*`）
5. 登录成功后关闭登录窗口，打开主应用窗口（inno-agent）

**核心优势**：
- ✅ **零代码改动**：通过环境变量配置，不修改任何源代码
- ✅ **前后端分离**：前端离线可用，后端在线服务，数据统一管理
- ✅ **架构一致**：与线上部署架构完全相同

## 文件说明

### 新增文件

```
scripts/build-with-auth.sh       # 集成打包脚本（自动化构建两个前端）
electron/main-with-auth.js       # 支持登录窗口的 Electron 主进程
electron/preload-auth.js         # 登录窗口的预加载脚本（可选）
electron/auth-dist/              # auth-frontend 构建产物目录（打包时自动生成）
```

### 修改文件

需要在 `package.json` 中添加新的打包命令（见下文）。

## 使用步骤（零代码改动）

### 步骤 1：配置 auth-frontend 的 API 地址

在 auth-frontend 项目中创建生产环境配置：

```bash
cd /Users/yonghengguo/work/gyh/auth-service/auth-frontend

# 创建 .env.production 文件
cat > .env.production << 'EOF'
# 后端 API 基础 URL（必填）
VITE_API_BASE=https://your-api-domain.com

# 如果有其他环境变量，也在这里配置
# VITE_SOME_CONFIG=value
EOF
```

> 💡 **重要**：`VITE_API_BASE` 是 auth-frontend 访问后端 API 的地址，必须包含协议（`https://`），不要以 `/` 结尾。

**示例**：
```bash
# ✅ 正确
VITE_API_BASE=https://api.example.com

# ❌ 错误（缺少协议）
VITE_API_BASE=api.example.com

# ❌ 错误（多余的斜杠）
VITE_API_BASE=https://api.example.com/
```

### 步骤 2：（可选）配置 auth-frontend 路径

如果 auth-frontend 不在默认位置，可以通过以下方式指定：

**方式 A：编辑构建脚本**

编辑 `scripts/build-with-auth.sh`，修改第 10 行：

```bash
AUTH_FRONTEND_PATH="${AUTH_FRONTEND_PATH:-/path/to/your/auth-frontend}"
```

**方式 B：环境变量**

```bash
export AUTH_FRONTEND_PATH=/path/to/your/auth-frontend
```

### 步骤 3：运行集成打包脚本

```bash
# macOS
bash scripts/build-with-auth.sh

# Windows
bash scripts/build-with-auth.sh --platform win

# 自动升级版本号
bash scripts/build-with-auth.sh --bump patch

# 构建完成后打开输出目录
bash scripts/build-with-auth.sh --open
```

脚本会自动完成：
1. 构建 auth-frontend (`npm run build`)
2. 复制构建产物到 `electron/auth-dist/`
3. 构建 inno-agent 后端和前端
4. 打包 Electron 应用

### 步骤 4：验证打包结果

打包完成后：

```bash
# 查看输出目录
ls -lh dist-electron/

# macOS 输出示例
# Inno Agent-0.4.6-arm64.dmg

# Windows 输出示例
# Inno Agent Setup 0.4.6.exe
# Inno Agent 0.4.6.msi
```

### 步骤 5：本地测试（推荐）

在正式分发前，建议本地测试多窗口流程：

```bash
# 1. 确保 auth-frontend 已配置 .env.production
cd /Users/yonghengguo/work/gyh/auth-service/auth-frontend
cat .env.production  # 查看配置

# 2. 手动构建 auth-frontend
npm run build

# 3. 复制构建产物到 inno-agent
cd /Users/yonghengguo/work/gyh/inno-agent
cp -r /Users/yonghengguo/work/gyh/auth-service/auth-frontend/dist electron/auth-dist

# 4. 本地运行带登录的版本
npm run electron:with-auth

# 5. 测试登录流程
#    a. 应该看到登录窗口
#    b. 输入账号密码登录（会请求线上 API）
#    c. 登录成功后自动跳转到主窗口
```

## 集成原理

### 为什么不需要改代码？

auth-frontend 本来就是**前后端分离**的架构：

```javascript
// auth-frontend/src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function apiFetch(url: string, init?: RequestInit) {
  // 发送 HTTP 请求到线上 API
  return fetch(`${API_BASE}${url}`, { ...init, headers });
}
```

**关键点**：
1. ✅ API 地址通过环境变量配置（`VITE_API_BASE`）
2. ✅ 使用标准的 `fetch()` 发送 HTTP 请求
3. ✅ 打包成静态文件后，请求行为完全不变
4. ✅ token 自动存储在 localStorage

因此：
- **开发环境**：Vite 代理到 `localhost:3000`
- **线上部署**：Nginx 代理到后端服务
- **桌面客户端**：直接 HTTPS 请求到线上 API

**三种环境，同一份代码，零改动！**

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│  桌面客户端（Electron）                                        │
│                                                               │
│  ┌──────────────────┐      登录成功       ┌──────────────┐  │
│  │  登录窗口         │  ────────────→      │  主应用窗口   │  │
│  │                  │                     │              │  │
│  │  file://         │                     │  http://     │  │
│  │  auth-dist/      │                     │  localhost:  │  │
│  │  index.html      │                     │  3000        │  │
│  │                  │                     │              │  │
│  │  ↓ fetch()       │                     │              │  │
│  └──────────────────┘                     └──────────────┘  │
│         │                                                    │
└─────────│────────────────────────────────────────────────────┘
          │
          ↓ HTTPS (环境变量 VITE_API_BASE)
  ┌───────────────────────────────────┐
  │  线上 API 服务                      │
  │  https://your-api-domain.com      │
  │                                   │
  │  POST /auth/login                 │
  │  POST /auth/register              │
  │  GET  /healthz                    │
  │  POST /sms/send                   │
  └───────────────────────────────────┘
```

### 启动流程

```
用户双击桌面图标
  ↓
Electron 启动
  ↓
显示 Loading 窗口（等待 inno-agent 服务启动）
  ↓
inno-agent 服务就绪（/health 返回 200）
  ↓
关闭 Loading，打开登录窗口
  ↓
登录窗口加载本地文件：file:///path/to/electron/auth-dist/index.html
  ↓
用户输入账号密码，点击登录
  ↓
auth-frontend 发送请求：fetch('https://your-api-domain.com/auth/login', ...)
  ↓
线上 API 验证成功，返回 token
  ↓
auth-frontend 存储 token：localStorage.setItem('access_token', token)
  ↓
Electron 主进程检测到 localStorage 中有 token
  ↓
关闭登录窗口，打开主应用窗口（http://localhost:3000）
```

### 登录状态传递

**方式 1：localStorage + executeJavaScript**

登录窗口监听 `localStorage.setItem('auth_token', token)`，主进程定期检查：

```javascript
authWindow.webContents.executeJavaScript(`
  localStorage.getItem('auth_token')
`).then(token => {
  if (token) onAuthSuccess(token);
});
```

**方式 2：路由跳转检测**

监听登录成功后的路由跳转（如 `/dashboard`）：

```javascript
authWindow.webContents.on('will-navigate', (event, url) => {
  if (url.includes('/dashboard')) {
    event.preventDefault();
    onAuthSuccess();
  }
});
```

**方式 3：IPC 消息传递**（推荐，最安全）

在 auth-frontend 中调用预加载脚本暴露的 API：

```javascript
// auth-frontend 登录成功后
window.electronAPI?.onAuthSuccess?.(token);
```

主进程监听：

```javascript
ipcMain.on('auth-success', (event, token) => {
  onAuthSuccess(token);
});
```

### Token 传递给主应用

登录成功后，可以通过以下方式传递 token：

1. **URL 查询参数**：`http://localhost:3000?token=xxx`
2. **localStorage**：在打开主窗口前注入
3. **Cookie**：如果后端支持

## 注意事项

### 1. auth-frontend 的后端接口代理

auth-frontend 需要访问后端的 `/auth`、`/healthz` 等接口。确保：

- **开发模式**：Vite 配置了 proxy（已在 `vite.config.ts` 中配置）
- **生产模式**：后端服务器（server.ts）需要添加 `/auth` 路由处理

### 2. 构建产物路径

打包时，`electron/auth-dist/` 会被包含在应用中。确保 `package.json` 的 `build.files` 包含：

```json
{
  "build": {
    "files": [
      "electron/**/*",
      "apps/inno-agent/dist/**/*",
      "apps/inno-agent/web/dist/**/*"
    ]
  }
}
```

### 3. 安全性

- 使用 `contextIsolation: true` 和 `nodeIntegration: false`
- 通过 `preload.js` 暴露最小必要的 API
- 不要在渲染进程中直接访问 Node.js API

### 4. 多平台兼容

- macOS 和 Windows 的路径分隔符不同，使用 `path.join()` 而不是字符串拼接
- 图标格式：macOS 用 `.icns`，Windows 用 `.ico`

## npm scripts 快捷命令

在 `package.json` 的 `scripts` 中添加：

```json
{
  "scripts": {
    "electron:with-auth": "electron . --main=electron/main-with-auth.js",
    "build:with-auth": "bash scripts/build-with-auth.sh",
    "build:with-auth:win": "bash scripts/build-with-auth.sh --platform win"
  }
}
```

然后可以使用：

```bash
npm run build:with-auth
npm run build:with-auth:win
```

## 故障排查

### 问题 1：登录窗口显示空白

**原因**：`electron/auth-dist/` 不存在或构建失败

**解决**：
```bash
# 检查构建产物
ls -la electron/auth-dist/

# 重新构建 auth-frontend
cd /path/to/auth-frontend
npm run build
cp -r dist /path/to/inno-agent/electron/auth-dist
```

### 问题 2：登录后无法跳转到主窗口

**原因**：登录成功事件未正确触发

**调试**：
```javascript
// 在 main-with-auth.js 中添加日志
authWindow.webContents.on('console-message', (event, level, message) => {
  console.log('[auth-window]', message);
});
```

### 问题 3：打包后体积过大

**原因**：包含了不必要的文件

**优化**：
- 在 `package.json` 的 `build.files` 中排除不需要的文件
- 使用 `.asar` 压缩（默认已启用）
- 排除开发依赖

## 高级配置

### 自定义登录窗口样式

修改 `electron/main-with-auth.js` 中的 `openAuthWindow()`：

```javascript
authWindow = new BrowserWindow({
  width: 1000,
  height: 700,
  frame: false,           // 无边框
  transparent: true,      // 透明背景
  titleBarStyle: 'hidden', // macOS 隐藏标题栏
  // ...
});
```

### 记住登录状态

在主进程中检查本地存储的 token：

```javascript
import { readFileSync, existsSync } from "node:fs";

function checkSavedAuth() {
  const tokenPath = join(innoHome, "auth_token");
  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, "utf-8").trim();
    // 验证 token 是否有效
    return token;
  }
  return null;
}

// 启动时检查
startServer(() => {
  const savedToken = checkSavedAuth();
  if (savedToken) {
    authToken = savedToken;
    openMainWindow();
  } else {
    openAuthWindow();
  }
});
```

## 参考资料

- [Electron 官方文档 - 多窗口](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron 安全最佳实践](https://www.electronjs.org/docs/latest/tutorial/security)
- [IPC 通信](https://www.electronjs.org/docs/latest/api/ipc-main)
