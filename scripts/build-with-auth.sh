#!/usr/bin/env bash
# 集成打包脚本：将 inno-agent 和 auth-frontend 一起打包成桌面客户端
#
# 使用方法：
#   bash scripts/build-with-auth.sh              # 构建 macOS arm64
#   bash scripts/build-with-auth.sh --platform win  # 构建 Windows
#   bash scripts/build-with-auth.sh --bump patch    # 自动升级 patch 版本
#   bash scripts/build-with-auth.sh --open          # 构建后打开输出目录

set -euo pipefail

# ============================================================================
# 配置项
# ============================================================================

# auth-frontend 项目路径（请根据实际情况修改）
AUTH_FRONTEND_PATH="${AUTH_FRONTEND_PATH:-/Users/yonghengguo/work/gyh/auth-service/auth-frontend}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# 辅助函数
# ============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

show_help() {
  cat <<EOF
集成打包脚本：将 inno-agent 和 auth-frontend 一起打包成桌面客户端

用法：
  bash scripts/build-with-auth.sh [选项]

选项：
  --platform <mac|win>    目标平台 (默认: mac)
  --bump <major|minor|patch>  自动升级版本号
  --open                  构建完成后打开输出目录
  --skip-auth             跳过 auth-frontend 构建（仅用于调试）
  --auth-path <path>      指定 auth-frontend 项目路径
  -h, --help              显示此帮助信息

示例：
  bash scripts/build-with-auth.sh
  bash scripts/build-with-auth.sh --platform win
  bash scripts/build-with-auth.sh --bump patch --open

环境变量：
  AUTH_FRONTEND_PATH      auth-frontend 项目路径（默认: /Users/yonghengguo/work/gyh/auth-service/auth-frontend）

EOF
}

# 版本号自动升级
bump_version() {
  local bump_type=$1
  local current_version
  current_version=$(node -p "require('./package.json').version")

  log_info "当前版本: ${current_version}"

  # 使用 npm version 自动升级
  npm version "${bump_type}" --no-git-tag-version

  local new_version
  new_version=$(node -p "require('./package.json').version")
  log_success "版本已升级: ${current_version} → ${new_version}"
}

# ============================================================================
# 参数解析
# ============================================================================

PLATFORM="mac"
BUMP_VERSION=""
OPEN_AFTER_BUILD=false
SKIP_AUTH=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --bump)
      BUMP_VERSION="$2"
      shift 2
      ;;
    --open)
      OPEN_AFTER_BUILD=true
      shift
      ;;
    --skip-auth)
      SKIP_AUTH=true
      shift
      ;;
    --auth-path)
      AUTH_FRONTEND_PATH="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      log_error "未知参数: $1"
      show_help
      exit 1
      ;;
  esac
done

# ============================================================================
# 预检查
# ============================================================================

log_info "开始集成打包流程..."
log_info "目标平台: ${PLATFORM}"
log_info "auth-frontend 路径: ${AUTH_FRONTEND_PATH}"

# 检查 auth-frontend 是否存在
if [ ! -d "${AUTH_FRONTEND_PATH}" ]; then
  log_error "auth-frontend 项目不存在: ${AUTH_FRONTEND_PATH}"
  log_info "请使用 --auth-path 指定正确的路径，或设置环境变量 AUTH_FRONTEND_PATH"
  exit 1
fi

# 检查 auth-frontend 的 package.json
if [ ! -f "${AUTH_FRONTEND_PATH}/package.json" ]; then
  log_error "未找到 ${AUTH_FRONTEND_PATH}/package.json"
  exit 1
fi

# 版本升级（如果指定）
if [ -n "${BUMP_VERSION}" ]; then
  log_info "执行版本升级: ${BUMP_VERSION}"
  bump_version "${BUMP_VERSION}"
fi

# ============================================================================
# 步骤 1: 构建 auth-frontend
# ============================================================================

if [ "${SKIP_AUTH}" = false ]; then
  log_info "步骤 1/4: 构建 auth-frontend..."

  # 保存当前目录
  ORIGINAL_DIR="$(pwd)"

  cd "${AUTH_FRONTEND_PATH}"

  # 安装依赖（如果需要）
  if [ ! -d "node_modules" ]; then
    log_info "安装 auth-frontend 依赖..."
    npm install
  fi

  # 构建
  log_info "运行 auth-frontend 构建..."
  npm run build

  if [ ! -d "dist" ]; then
    log_error "auth-frontend 构建失败：dist 目录不存在"
    cd "${ORIGINAL_DIR}"
    exit 1
  fi

  log_success "auth-frontend 构建完成"

  # 返回原始目录
  cd "${ORIGINAL_DIR}"
else
  log_warn "跳过 auth-frontend 构建"
fi

# ============================================================================
# 步骤 2: 复制 auth-frontend 构建产物到 electron/auth-dist
# ============================================================================

log_info "步骤 2/4: 复制 auth-frontend 构建产物..."

AUTH_DIST_TARGET="./electron/auth-dist"

# 清理旧的构建产物
if [ -d "${AUTH_DIST_TARGET}" ]; then
  log_info "清理旧的 auth-dist..."
  rm -rf "${AUTH_DIST_TARGET}"
fi

# 复制新的构建产物
log_info "复制 ${AUTH_FRONTEND_PATH}/dist -> ${AUTH_DIST_TARGET}"
cp -r "${AUTH_FRONTEND_PATH}/dist" "${AUTH_DIST_TARGET}"

log_success "auth-frontend 构建产物复制完成"

# ============================================================================
# 步骤 3: 构建 inno-agent
# ============================================================================

log_info "步骤 3/4: 构建 inno-agent..."

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
  log_info "安装 inno-agent 依赖..."
  npm install
fi

# 构建后端和前端
log_info "构建 inno-agent 后端和前端..."
npm run build

log_success "inno-agent 构建完成"

# ============================================================================
# 步骤 4: 打包 Electron 应用
# ============================================================================

log_info "步骤 4/4: 打包 Electron 应用..."

case "${PLATFORM}" in
  mac)
    log_info "打包 macOS 应用 (arm64)..."
    npm run electron:build
    OUTPUT_DIR="dist-electron"
    ;;
  win)
    log_info "打包 Windows 应用 (x64)..."
    npm run electron:build:win
    OUTPUT_DIR="dist-electron"
    ;;
  *)
    log_error "不支持的平台: ${PLATFORM}"
    log_info "支持的平台: mac, win"
    exit 1
    ;;
esac

log_success "Electron 应用打包完成！"

# ============================================================================
# 完成
# ============================================================================

if [ -d "${OUTPUT_DIR}" ]; then
  log_success "构建产物位置: ${OUTPUT_DIR}/"
  ls -lh "${OUTPUT_DIR}/" | grep -E "\.(dmg|exe|msi)$" || true

  if [ "${OPEN_AFTER_BUILD}" = true ]; then
    log_info "打开输出目录..."
    open "${OUTPUT_DIR}" 2>/dev/null || explorer "${OUTPUT_DIR}" 2>/dev/null || xdg-open "${OUTPUT_DIR}" 2>/dev/null || true
  fi
else
  log_warn "未找到输出目录: ${OUTPUT_DIR}"
fi

log_success "✨ 集成打包完成！"
