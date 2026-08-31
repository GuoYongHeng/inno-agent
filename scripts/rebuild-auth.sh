#!/bin/bash
# 快速重新构建脚本

echo "=== 1. 检查配置 ==="
if [ ! -f /Users/yonghengguo/work/gyh/auth-service/auth-frontend/.env.production ]; then
  echo "❌ 请先创建 .env.production 文件"
  exit 1
fi

echo "当前配置："
cat /Users/yonghengguo/work/gyh/auth-service/auth-frontend/.env.production

echo ""
read -p "配置正确吗？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "请先修改配置文件，然后重新运行此脚本"
  exit 1
fi

echo ""
echo "=== 2. 构建 auth-frontend ==="
cd /Users/yonghengguo/work/gyh/auth-service/auth-frontend
rm -rf dist
npm run build

echo ""
echo "=== 3. 复制到 inno-agent ==="
cd /Users/yonghengguo/work/gyh/inno-agent
rm -rf electron/auth-dist/*
cp -r /Users/yonghengguo/work/gyh/auth-service/auth-frontend/dist/* electron/auth-dist/

echo ""
echo "=== 4. 重启 Electron ==="
pkill -9 -f "electron.*inno-agent"
sleep 2
npm run electron:with-auth &

echo ""
echo "✅ 完成！Electron 正在启动..."
echo "现在可以测试登录功能了"
