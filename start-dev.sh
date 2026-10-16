#!/usr/bin/env bash
# Single command that boots backend + frontend together.
# Backend starts first; frontend (Vite) is started only after the backend
# health endpoint answers 200, so the dev proxy never hits ECONNREFUSED.

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3000}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✅ Done"
}
trap cleanup EXIT INT TERM

# 1. Backend first
echo "🔧 Starting backend on port ${PORT}..."
cd "$ROOT"
npm start >"$ROOT/.backend.log" 2>&1 &
BACKEND_PID=$!

echo "⏳ Waiting for backend to be ready..."
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/health" 2>/dev/null || echo "000")"
  if [ "$CODE" = "200" ]; then
    echo "✅ Backend ready (http://localhost:${PORT})"
    break
  fi
  sleep 1
done

CODE="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/health" 2>/dev/null || echo "000")"
if [ "$CODE" != "200" ]; then
  echo "❌ Backend did not start. See .backend.log"
  exit 1
fi

# 2. Frontend after backend is up
echo "🌐 Starting frontend (Vite) on port 5173..."
cd "$ROOT/frontend"
npm run dev >"$ROOT/.frontend.log" 2>&1 &
FRONTEND_PID=$!

# 3. Keep the command alive; Ctrl+C triggers cleanup
wait "$FRONTEND_PID" 2>/dev/null || true
