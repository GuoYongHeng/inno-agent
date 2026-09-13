#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# scripts/build-mac.sh  —  Inno Agent 本地 macOS 打包脚本
#
# 用法：
#   ./scripts/build-mac.sh              # 打包当前版本（arm64 + x64）
#   ./scripts/build-mac.sh --arch x64   # 只打包 Intel 芯片
#   ./scripts/build-mac.sh --bump patch # 先升版本号再打包（patch/minor/major）
#   ./scripts/build-mac.sh --open       # 打包完自动打开产物目录
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUMP=""
OPEN_AFTER=false
ARCH="both"   # arm64 | x64 | both

while [[ $# -gt 0 ]]; do
  case $1 in
    --bump)   BUMP="$2"; shift ;;
    --open)   OPEN_AFTER=true ;;
    --arch)   ARCH="$2"; shift ;;
    *)        echo "未知参数: $1"; exit 1 ;;
  esac
  shift
done

case "$ARCH" in
  arm64|x64|both) ;;
  *) echo "无效的 --arch（支持: arm64 | x64 | both）"; exit 1 ;;
esac

# ── 1. 可选：升版本号 ──────────────────────────────────────────────────────────
if [[ -n "$BUMP" ]]; then
  echo "▶ 升级版本号 ($BUMP)…"
  npm version "$BUMP" --no-git-tag-version
fi

VERSION=$(node -p "require('./package.json').version")
echo "▶ 构建版本 v$VERSION"

# ── 2. 编译后端 TypeScript ────────────────────────────────────────────────────
echo "▶ 编译后端…"
npm --workspace inno-agent run build

# ── 3. 编译前端（Vite）────────────────────────────────────────────────────────
echo "▶ 编译前端…"
npm --workspace inno-agent-web run build

# ── 4. electron-builder 打包 ──────────────────────────────────────────────────
case "$ARCH" in
  arm64) ARCH_FLAGS="--arm64" ;;
  x64)   ARCH_FLAGS="--x64" ;;
  both)  ARCH_FLAGS="--arm64 --x64" ;;
esac
echo "▶ 打包 Electron DMG (${ARCH})…"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg ${ARCH_FLAGS} --publish never

# ── 5. 完成提示 ───────────────────────────────────────────────────────────────
echo ""
echo "✅ 打包完成："
for dmg in "$REPO_ROOT"/dist-electron/*.dmg; do
  [[ -e "$dmg" ]] || continue
  echo "   - $dmg（$(du -sh "$dmg" 2>/dev/null | cut -f1)）"
done

if $OPEN_AFTER; then
  open "$REPO_ROOT/dist-electron"
fi
