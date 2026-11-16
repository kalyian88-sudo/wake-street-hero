#!/usr/bin/env bash
# Make sure ONE shared Vite dev server is running on port 5173 (detached). Safe to call repeatedly.
cd "$(dirname "$0")/.." || exit 1
if curl -s -o /dev/null --max-time 3 http://localhost:5173/; then
  echo "dev server already up: http://localhost:5173"
  exit 0
fi
mkdir -p .shots
nohup setsid npx vite --port 5173 --strictPort --host 127.0.0.1 > .shots/vite.log 2>&1 &
for i in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 2 http://localhost:5173/; then
    echo "dev server started: http://localhost:5173"
    exit 0
  fi
  sleep 0.5
done
echo "dev server failed to start — see .shots/vite.log" >&2
tail -20 .shots/vite.log >&2
exit 1
