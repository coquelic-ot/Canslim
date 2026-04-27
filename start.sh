#!/bin/bash

# ポートが使用中なら停止してから起動
PORT=8000
if lsof -ti :$PORT > /dev/null 2>&1; then
  kill $(lsof -ti :$PORT) 2>/dev/null
  sleep 0.5
fi

cd "$(dirname "$0")"
python3 -m http.server $PORT &
SERVER_PID=$!

sleep 0.8

# OS に応じてブラウザを開く
if command -v xdg-open > /dev/null; then
  xdg-open "http://localhost:$PORT"
elif command -v open > /dev/null; then
  open "http://localhost:$PORT"
fi

echo "サーバー起動中 → http://localhost:$PORT"
echo "終了するには Ctrl+C を押してください"
wait $SERVER_PID
