# build-with-auth.sh 使用说明

这是将 auth-frontend 和 inno-agent 集成打包的自动化脚本。

## 基本用法

```bash
# macOS 打包（默认）
bash scripts/build-with-auth.sh

# Windows 打包
bash scripts/build-with-auth.sh --platform win
```

> macOS 本机交叉打包 Windows 时默认只生成 NSIS `.exe`。`msi` 依赖 WiX/Wine，macOS Catalina 及更新版本无法运行其 32 位 Windows 执行链；需要在 Windows 本机或 GitHub Actions 的 `windows-latest` runner 上执行 `npm run electron:build:win:all`。

## 所有参数

```bash
bash scripts/build-with-auth.sh [选项]

--platform <mac|win>      目标平台（默认: mac）
--bump <major|minor|patch> 自动升级版本号
--open                    构建完成后打开输出目录
--skip-auth               跳过 auth-frontend 构建（调试用）
--auth-path <path>        指定 auth-frontend 项目路径
-h, --help                显示帮助信息
```

## 使用示例

```bash
# 基础打包
bash scripts/build-with-auth.sh

# 自动升级 patch 版本并打开输出目录
bash scripts/build-with-auth.sh --bump patch --open

# 指定自定义 auth-frontend 路径
bash scripts/build-with-auth.sh --auth-path ~/projects/my-auth

# Windows 打包
bash scripts/build-with-auth.sh --platform win

# 跳过 auth 构建（auth-dist 已存在）
bash scripts/build-with-auth.sh --skip-auth
```

## 环境变量

```bash
# 指定 auth-frontend 路径
export AUTH_FRONTEND_PATH=/path/to/auth-frontend
bash scripts/build-with-auth.sh
```

## 工作流程

脚本自动完成以下步骤：

1. ✅ **检查 auth-frontend 路径** - 验证项目存在
2. ✅ **构建 auth-frontend** - 运行 `npm run build`
3. ✅ **复制构建产物** - 到 `electron/auth-dist/`
4. ✅ **构建 inno-agent** - 后端 + 前端
5. ✅ **打包 Electron** - 根据平台生成安装包

## 输出

打包完成后，安装包位于 `dist-electron/` 目录：

- **macOS**: `Inno Agent-{version}-arm64.dmg`
- **Windows**: macOS 本机交叉打包生成 `Inno Agent Setup {version}.exe`；Windows 本机/CI 可生成 `.exe` 和 `.msi`

## 故障排查

### 问题：找不到 auth-frontend

```bash
# 检查路径
ls -la /Users/yonghengguo/work/gyh/auth-service/auth-frontend

# 指定正确路径
bash scripts/build-with-auth.sh --auth-path /correct/path
```

### 问题：auth-frontend 构建失败

```bash
# 手动测试构建
cd /path/to/auth-frontend
npm install
npm run build

# 检查是否生成 dist 目录
ls -la dist/
```

### 问题：权限不足

```bash
# 添加执行权限
chmod +x scripts/build-with-auth.sh
```

## 更多信息

查看完整文档：
- [AUTH_DOCS_INDEX.md](../AUTH_DOCS_INDEX.md) - 文档索引
- [AUTH_INTEGRATION_SUMMARY.md](../AUTH_INTEGRATION_SUMMARY.md) - 快速参考
- [docs/AUTH_INTEGRATION.md](../docs/AUTH_INTEGRATION.md) - 完整文档
