#!/usr/bin/env bash
# 生成纯净发布目录 dist/ —— 只含站点运行时文件（index.html / favicon.svg / js/）
# 用途：内置发布通道上传这个目录，避免把 import/ 构建原料、测试脚本、截图一起传上去
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist/js

cp index.html favicon.svg dist/
cp js/*.js dist/js/

echo "dist/ 已生成："
echo "  文件数 $(find dist -type f | wc -l)"
echo "  体积   $(du -sh dist | cut -f1)"
