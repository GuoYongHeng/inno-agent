# 集成打包方案总结

将 auth-frontend 登录页面和 inno-agent 打包成一个桌面客户端，**零代码改动**。

## 🎯 方案特点

- ✅ **前后端分离**：auth-frontend 前端打包进客户端，后端继续访问线上 API
- ✅ **零代码改动**：通过环境变量配置，不需要修改任何源代码
- ✅ **多窗口体验**：登录窗口 → 主应用窗口，流畅的用户体验
- ✅ **一键打包**：自动化脚本处理所有构建流程

## 📦 已创建的文件

| 文件 | 说明 |
|------|------|
| `scripts/build-with-auth.sh` | 🔧 一键构建脚本（构建 auth-frontend + inno-agent + 打包 Electron） |
| `electron/main-with-auth.js` | 🪟 支持登录窗口的 Electron 主进程 |
| `electron/preload-auth.js` | 🔐 登录窗口预加载脚本（安全的 IPC 通信） |
| `electron/auth-dist/` | 📁 auth-frontend 构建产物存放目录 |
| `docs/AUTH_INTEGRATION.md` | 📖 详细技术文档（架构、原理、故障排查） |

## 🚀 快速开始（3 步）

### 步骤 1：配置 auth-frontend 的 API 地址

```bash
cd /Users/yonghengguo/work/gyh/auth-service/auth-frontend

# 创建生产环境配置文件
cat > .env.production << 'EOF'
VITE_API_BASE=https://your-api-domain.com
EOF
```

> 💡 **说明**：`VITE_API_BASE` 是 auth-frontend 访问后端 API 的基础 URL（如 `https://api.example.com`）

### 步骤 2：运行集成打包

```bash
cd /Users/yonghengguo/work/gyh/inno-agent

# macOS (arm64)
npm run build:with-auth

# Windows (x64)
npm run build:with-auth:win

# 自动升级版本 + 打包 + 打开输出目录
npm run build:with-auth:bump
```

### 步骤 3：获取安装包

打包完成后，在 `dist-electron/` 目录下找到安装包：

```bash
# macOS
dist-electron/Inno Agent-0.4.6-arm64.dmg

# Windows
dist-electron/Inno Agent Setup 0.4.6.exe
dist-electron/Inno Agent 0.4.6.msi
```

## 🔄 用户使用流程

```
用户启动桌面应用
        ↓
Loading 窗口（等待 inno-agent 服务启动）
        ↓
登录窗口（auth-frontend 前端界面）
        ↓
用户输入账号密码 → 请求线上 API → 登录成功
        ↓
自动检测到 localStorage 中的 token
        ↓
关闭登录窗口，打开主应用窗口（inno-agent）
```

## 🏗️ 架构说明

### 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│  桌面客户端（Electron）                                        │
│                                                               │
│  ┌──────────────────┐      登录成功       ┌──────────────┐  │
│  │  登录窗口         │  ────────────→      │  主应用窗口   │  │
│  │  (auth-frontend) │                     │  (inno-agent)│  │
│  │                  │                     │              │  │
│  │  ↓ HTTP 请求     │                     │  localhost:  │  │
│  └──────────────────┘                     │  3000        │  │
│         │                                  └──────────────┘  │
└─────────│────────────────────────────────────────────────────┘
          │
          ↓ HTTPS
  ┌───────────────────┐
  │  线上 API 服务     │
  │  (auth-service)   │
  │                   │
  │  POST /auth/login │
  │  POST /auth/      │
  │  register         │
  └───────────────────┘
```

### 为什么不需要改代码？

1. **auth-frontend 本来就是前后端分离**
   - 使用 `fetch()` 发送 HTTP 请求到 API
   - 通过环境变量 `VITE_API_BASE` 配置 API 地址
   - 打包成静态文件后，请求行为完全不变

2. **token 存储在 localStorage**
   - auth-frontend 登录成功后自动存储 token
   - Electron 主进程自动检测 localStorage 中的 token
   - 检测到 token 后自动打开主应用窗口

3. **独立的窗口管理**
   - 登录窗口和主应用窗口是两个独立的 BrowserWindow
   - 不需要在代码层面做任何集成

## 📝 新增的 npm scripts

```bash
# 本地测试（需先手动构建 auth-frontend）
npm run electron:with-auth

# 一键打包 macOS
npm run build:with-auth

# 一键打包 Windows
npm run build:with-auth:win

# 自动升级版本 + 打包 + 打开输出目录
npm run build:with-auth:bump
```

## 🔧 高级用法

### 自定义 auth-frontend 路径

```bash
# 方式 1：环境变量
export AUTH_FRONTEND_PATH=/custom/path/to/auth-frontend
npm run build:with-auth

# 方式 2：命令行参数
bash scripts/build-with-auth.sh --auth-path /custom/path/to/auth-frontend
```

### 构建脚本参数

```bash
bash scripts/build-with-auth.sh [选项]

选项：
  --platform <mac|win>      目标平台（默认: mac）
  --bump <major|minor|patch> 自动升级版本号
  --open                    构建完成后打开输出目录
  --skip-auth               跳过 auth-frontend 构建（用于调试）
  --auth-path <path>        指定 auth-frontend 项目路径
  -h, --help                显示帮助信息
```

### 示例

```bash
# Windows 打包并自动升级 patch 版本
bash scripts/build-with-auth.sh --platform win --bump patch

# 跳过 auth 构建（auth-dist 已存在）
bash scripts/build-with-auth.sh --skip-auth --open

# 指定自定义路径
bash scripts/build-with-auth.sh --auth-path ~/projects/my-auth-frontend
```

## 🛠️ 故障排查

### 问题 1：登录窗口显示空白

**可能原因**：
- auth-frontend 构建失败
- `electron/auth-dist/` 目录为空

**解决方法**：

```bash
# 检查构建产物
ls -la electron/auth-dist/

# 手动重新构建
cd /Users/yonghengguo/work/gyh/auth-service/auth-frontend
npm run build
cp -r dist /Users/yonghengguo/work/gyh/inno-agent/electron/auth-dist
```

### 问题 2：登录后无法连接线上 API

**可能原因**：
- `.env.production` 未配置或配置错误
- CORS 问题（线上 API 未允许桌面客户端域名）

**解决方法**：

```bash
# 1. 检查 auth-frontend 的环境配置
cat /Users/yonghengguo/work/gyh/auth-service/auth-frontend/.env.production

# 2. 确认 API 地址正确（需要包含协议，如 https://）
echo "VITE_API_BASE=https://api.your-domain.com" > .env.production

# 3. 重新构建
cd /Users/yonghengguo/work/gyh/inno-agent
npm run build:with-auth
```

**CORS 配置**（后端需要）：

```javascript
// auth-service 后端需要允许 Electron 的 User-Agent
res.setHeader('Access-Control-Allow-Origin', '*');
// 或者更严格的配置
res.setHeader('Access-Control-Allow-Origin', 'file://');
```

### 问题 3：登录成功但无法跳转到主窗口

**可能原因**：
- token 存储的 localStorage key 不匹配
- 脚本检测逻辑未触发

**解决方法**：

查看 auth-frontend 存储 token 的 key：

```javascript
// 查看 auth-frontend/src/api/client.ts
const TOKEN_KEY = 'access_token';  // ← 这是存储的 key
```

确认 `electron/main-with-auth.js` 中检测的 key 一致：

```javascript
// 第 98 行
authWindow.webContents.executeJavaScript(`
  (function() {
    const token = localStorage.getItem('access_token');  // ← 确保 key 一致
    if (token) {
      window.electronAPI?.onAuthSuccess?.(token);
    }
  })();
`)
```

**手动测试**：

```bash
# 1. 本地运行
npm run electron:with-auth

# 2. 打开开发者工具查看
# 在登录窗口按 Cmd+Option+I (macOS) 或 F12 (Windows)
# Console 中输入：
localStorage.getItem('access_token')

# 如果能看到 token，说明存储成功
# 如果看不到，检查 auth-frontend 登录逻辑
```

### 问题 4：打包后体积过大

**优化方法**：

```bash
# 1. 检查 electron/auth-dist/ 体积
du -sh electron/auth-dist/

# 2. 优化 auth-frontend 构建
# 在 auth-frontend/vite.config.ts 中添加：
build: {
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_console: true,  // 移除 console.log
    }
  }
}

# 3. 排除不必要的文件
# 在 package.json 的 build.files 中添加排除规则
```

## 🔐 安全建议

### 1. API 密钥管理

**不要**在客户端硬编码任何密钥：

```javascript
// ❌ 错误：硬编码 API Key
const API_KEY = 'sk-xxx-secret-key';

// ✅ 正确：由后端管理，客户端只传 token
headers.set('Authorization', `Bearer ${token}`);
```

### 2. HTTPS 强制

生产环境必须使用 HTTPS：

```javascript
// .env.production
VITE_API_BASE=https://api.your-domain.com  // ✅ HTTPS

// ❌ 不要使用 HTTP
VITE_API_BASE=http://api.your-domain.com   // 容易被中间人攻击
```

### 3. Token 存储

当前方案使用 localStorage 存储 token，如果需要更高安全性：

- 考虑使用 Electron 的 `safeStorage` API
- 设置 token 过期时间
- 实现刷新 token 机制

## 📚 技术文档

- **详细技术文档**：[docs/AUTH_INTEGRATION.md](./docs/AUTH_INTEGRATION.md)
  - 深入架构原理
  - 窗口间通信机制
  - 高级配置选项
  - 完整故障排查指南

- **构建脚本源码**：[scripts/build-with-auth.sh](./scripts/build-with-auth.sh)
- **主进程源码**：[electron/main-with-auth.js](./electron/main-with-auth.js)

## ✅ 验收清单

打包前确认：

- [ ] auth-frontend 的 `.env.production` 已配置正确的 API 地址
- [ ] auth-frontend 可以正常 `npm run build`
- [ ] 线上 API 服务可访问（HTTPS，CORS 已配置）
- [ ] 本地测试过 `npm run electron:with-auth`
- [ ] 确认登录流程完整（登录 → token 存储 → 跳转主窗口）

全部勾选后，运行 `npm run build:with-auth` 即可打包！
