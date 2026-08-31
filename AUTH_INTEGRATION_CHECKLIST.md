# auth-frontend 集成清单

在打包前请确认以下事项：

## ✅ 环境配置

- [ ] auth-frontend 已创建 `.env.production` 文件
- [ ] `VITE_API_BASE` 已设置为线上 API 地址（如 `https://api.your-domain.com`）
- [ ] API 地址包含协议（`https://`）且不以 `/` 结尾

## ✅ API 服务

- [ ] 线上 API 服务可正常访问
- [ ] CORS 已正确配置（允许 Electron 客户端访问）
- [ ] 测试过登录接口（`POST /auth/login`）返回正常

## ✅ 构建测试

- [ ] auth-frontend 可以正常执行 `npm run build`
- [ ] 构建产物在 `auth-frontend/dist/` 目录下
- [ ] 构建产物包含 `index.html` 和资源文件

## ✅ 本地验证

- [ ] 执行过 `npm run electron:with-auth` 本地测试
- [ ] 登录窗口可以正常显示
- [ ] 可以输入账号密码并成功登录
- [ ] 登录成功后能自动跳转到主应用窗口
- [ ] 主应用窗口可以正常使用

## ✅ Token 处理

- [ ] 确认 auth-frontend 登录成功后 token 存储在 localStorage
- [ ] localStorage key 为 `access_token`（或与 `electron/main-with-auth.js` 一致）
- [ ] 可以在浏览器控制台查看到 token：`localStorage.getItem('access_token')`

## ✅ 打包准备

- [ ] inno-agent 项目可以正常执行 `npm run build`
- [ ] 已安装 `electron-builder` 依赖
- [ ] 构建脚本 `scripts/build-with-auth.sh` 有执行权限（`chmod +x`）
- [ ] 确认 auth-frontend 路径配置正确（默认或通过环境变量）

## ✅ 最终检查

- [ ] 确认目标平台（macOS 需要 Apple Silicon 或 x64）
- [ ] Windows 打包需要在 Windows 或 CI 环境执行
- [ ] 磁盘空间充足（至少 2GB 可用空间）

---

## 🚀 开始打包

全部勾选后，执行：

```bash
# macOS
npm run build:with-auth

# Windows
npm run build:with-auth:win

# 自动升级版本 + 打包 + 打开输出目录
npm run build:with-auth:bump
```

## 📦 获取安装包

打包完成后，在 `dist-electron/` 目录下找到：

- macOS: `Inno Agent-{version}-arm64.dmg`
- Windows: `Inno Agent Setup {version}.exe` 和 `.msi`

## 🐛 遇到问题？

查看文档：
- **快速开始**: `AUTH_INTEGRATION_SUMMARY.md`
- **完整文档**: `docs/AUTH_INTEGRATION.md`（包含故障排查）
