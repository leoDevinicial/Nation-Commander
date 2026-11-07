#!/bin/bash
# Uso: SCENE=r1 [W=.. H=.. FPS=.. TAG=..] ./run.sh  — servidor de gravação novo (porta 8790) e gravação da cena.
cd "$(dirname "$0")/../../.."
PORT=${REC_PORT:-8790}
fuser -k $PORT/tcp >/dev/null 2>&1 || true
sleep 1
REC_PORT=$PORT SEED=${SEED:-7} nohup npx tsx scripts/video/trailer/server.ts > /home/user/trailer_work/recsrv_$PORT.log 2>&1 &
for i in $(seq 1 30); do curl -s localhost:$PORT/step?n=0 >/dev/null 2>&1 && break; sleep 1; done
node scripts/video/trailer/film.cjs
