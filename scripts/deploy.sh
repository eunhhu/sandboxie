#!/bin/bash
set -e

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="/opt/sandboxie"

echo "=== Sandboxie Deploy ==="

# 1. 프론트엔드 빌드
echo "[1/4] Building frontend..."
bun run --cwd "$SRC_DIR/frontend" build

# 2. 백엔드 컴파일
echo "[2/4] Compiling backend..."
bun build --compile "$SRC_DIR/backend/src/index.ts" --outfile "$DEPLOY_DIR/sandboxie" --external cpu-features

# 3. 정적 파일 및 node_modules 복사
echo "[3/4] Copying static files and native modules..."
rm -rf "$DEPLOY_DIR/frontend"
mkdir -p "$DEPLOY_DIR/frontend"
cp -r "$SRC_DIR/frontend/build" "$DEPLOY_DIR/frontend/build"


# .env 파일 복사 (최초 1회 또는 변경 시)
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$SRC_DIR/.env" "$DEPLOY_DIR/.env"
  echo "  .env copied (first deploy)"
else
  echo "  .env already exists, skipping (update manually if needed)"
fi

# 4. 서비스 재시작
echo "[4/4] Restarting service..."
systemctl --user restart sandboxie

sleep 2
if systemctl --user is-active --quiet sandboxie; then
  echo ""
  echo "=== Deploy complete ==="
  echo "Service: active"
  echo "Binary:  $DEPLOY_DIR/sandboxie"
  echo "Static:  $DEPLOY_DIR/frontend/build/"
else
  echo ""
  echo "=== Deploy FAILED ==="
  systemctl --user status sandboxie
  exit 1
fi
