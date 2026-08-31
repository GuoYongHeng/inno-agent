# 📚 auth-frontend 集成文档索引

将 auth-frontend 登录页面集成到 inno-agent 桌面客户端的完整文档。

## 🚀 快速开始

**第一次使用？** 从这里开始 ↓

### [AUTH_INTEGRATION_CHECKLIST.md](./AUTH_INTEGRATION_CHECKLIST.md)
📋 **打包前检查清单** - 确保所有配置正确，避免常见问题

**3 步完成打包**：
1. 在 auth-frontend 创建 `.env.production`，配置 API 地址
2. 运行 `npm run build:with-auth`
3. 在 `dist-electron/` 获取安装包

---

## 📖 详细文档

### [AUTH_INTEGRATION_SUMMARY.md](./AUTH_INTEGRATION_SUMMARY.md)
📝 **快速参考手册** - 包含：
- 方案特点和架构说明
- 使用步骤（零代码改动）
- 常见问题排查
- npm scripts 说明

**适合**：需要快速了解方案和使用方法

---

### [docs/AUTH_INTEGRATION.md](./docs/AUTH_INTEGRATION.md)
📚 **完整技术文档** - 包含：
- 深入架构原理（为什么不需要改代码）
- 详细的使用步骤
- 登录状态传递机制
- 安全建议
- 高级配置选项
- 完整的故障排查指南

**适合**：需要深入理解原理或遇到复杂问题

---

## 🔧 核心文件

### [scripts/build-with-auth.sh](./scripts/build-with-auth.sh)
自动化构建脚本，一键完成：
- 构建 auth-frontend
- 复制构建产物
- 构建 inno-agent
- 打包 Electron 应用

### [electron/main-with-auth.js](./electron/main-with-auth.js)
支持登录窗口的 Electron 主进程：
- 多窗口管理（Loading → 登录 → 主应用）
- 自动检测登录状态
- 窗口间通信

### [electron/preload-auth.js](./electron/preload-auth.js)
登录窗口预加载脚本，提供安全的 IPC 通信接口

---

## 💡 方案核心

### 零代码改动的原因

auth-frontend 本来就是前后端分离：
```javascript
// API 通过环境变量配置
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
fetch(`${API_BASE}/auth/login`, ...)
```

因此：
- ✅ 开发环境：Vite 代理
- ✅ 线上部署：Nginx 代理
- ✅ 桌面客户端：直接 HTTPS 请求

**同一份代码，三种环境，零改动！**

---

## 📋 npm scripts

```bash
# 本地测试
npm run electron:with-auth

# 打包 macOS
npm run build:with-auth

# 打包 Windows
npm run build:with-auth:win

# 自动升级版本 + 打包
npm run build:with-auth:bump
```

---

## 🎯 使用流程

```
1. 配置 API 地址
   ↓
2. 运行打包脚本
   ↓
3. 获取安装包
   ↓
4. 测试登录流程
```

---

## ❓ 遇到问题？

1. **首先查看**：[AUTH_INTEGRATION_CHECKLIST.md](./AUTH_INTEGRATION_CHECKLIST.md) 检查配置
2. **快速排查**：[AUTH_INTEGRATION_SUMMARY.md](./AUTH_INTEGRATION_SUMMARY.md) 的故障排查章节
3. **深入诊断**：[docs/AUTH_INTEGRATION.md](./docs/AUTH_INTEGRATION.md) 的完整故障排查指南

---

## 📞 支持

- 技术问题：查看详细文档或提 Issue
- 配置问题：参考 `config.example.json` 和环境变量说明
- 构建问题：检查 `scripts/build-with-auth.sh` 输出日志

---

## ✨ 方案特点

- ✅ **零代码改动** - 只需配置环境变量
- ✅ **前后端分离** - 前端离线，后端在线
- ✅ **架构一致** - 与线上部署完全相同
- ✅ **一键打包** - 自动化脚本处理一切
- ✅ **多平台支持** - macOS / Windows
