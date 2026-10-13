#!/bin/bash

set -e

echo "🚀 Starting RSS News Hub..."

# Run initial fetch
echo "📡 Fetching RSS feeds..."
npm run fetch

# Start backend in background
echo "🔧 Starting backend on port 3000..."
npm start &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 2

# Start frontend dev server
echo "🌐 Starting frontend on port 5173..."
cd frontend && npm run dev &
FRONTEND_PID=$!

# Cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  echo "✅ Done"
}
trap cleanup EXIT INT TERM

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID