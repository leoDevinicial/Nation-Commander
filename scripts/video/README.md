# Gravação de vídeo do jogo (trailer de combate)

Grava uma partida real do Sandbox quadro a quadro (o ambiente de nuvem não tem GPU: ~7–17 s por quadro) e monta o som
com os efeitos do próprio jogo. Usado para o vídeo "pegada militar" de 01/11/2026 (36 s, 1080p, sem texto).

Nada aqui muda o jogo: `server.ts` é um servidor só de gravação (simulação parada, avança por `GET /step?n=`), com
`/setup` (base inimiga, guerra, pesquisas liberadas, energia ligada), `/enemy` (ordem às tropas inimigas) e `/state`.

## Passo a passo

```bash
# 1. servidor de gravação (mapa fixo) e cliente apontando para ele
SEED=7 npx tsx scripts/video/server.ts &
VITE_GAME_SERVER_URL=ws://localhost:8790/ws VITE_ALLOW_GUESTS=true npx vite --port 5180 &

# 2. quadros (JPEG) + registro dos sons em OUT/audio.json   (~2,5 h para 36 s)
QUALITY=high DUR=36 OUT=/tmp/frames node scripts/video/film.cjs
#    RANGES=11-21.1,26.8-36 regrava só esses trechos (o resto anda sem desenhar)

# 3. trilha: refaz cada som do jogo no instante e na posição gravados (OfflineAudioContext)
node scripts/video/mix.cjs /tmp/frames/audio.json 36 /tmp/mix.wav

# 4. montagem
ffmpeg -framerate 24 -i /tmp/frames/%05d.jpg -i /tmp/mix.wav -filter_complex "[0:v]scale=1920:1080:flags=lanczos,unsharp=5:5:0.6,eq=contrast=1.12:saturation=0.82:brightness=-0.02,vignette=PI/5,fade=t=in:st=0:d=0.6,fade=t=out:st=34.8:d=1.2,format=yuv420p[v];[1:a]acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1:LRA=11,afade=t=out:st=34.6:d=1.4[a]" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -movflags +faststart -c:a aac -b:a 192k video.mp4
```

## Arquivos

- `fakeclock.js` — relógio controlado na página (`__startFake`, `__advance`, `__advanceNoRender`): o jogo acha que
  passou 1/24 s por quadro, por mais lenta que a renderização seja. Captura com CDP `Page.captureScreenshot` (a
  `page.screenshot` do Playwright espera um quadro do relógio real e trava).
- `shots.js` — roteiro de câmera (6 planos: coluna blindada, choque, lança-foguetes, bombardeiros, drone, nuclear).
- `setup.cjs` — monta a cena (eras, base aérea, silo, bombardeiros, drone, míssil nuclear, exércitos).
- `film.cjs` — laço de gravação: interface escondida, marcadores de alvo escondidos, sons registrados.

## Armadilhas (custaram horas)

- Não editar arquivos do projeto durante a gravação: o Vite recarrega a página e a gravação morre.
- O `requestAnimationFrame` pedido antes de `__startFake` precisa ir para a fila falsa (já tratado), senão o primeiro
  quadro vê um salto de tempo e a exposição automática estoura (imagem toda branca).
- Use `QUALITY=high` (Ultra+ com sombra 8192 fica lento demais sem GPU).
- Vídeos gerados não vão para o git (grandes demais).

## Vídeo do drone ("Drone Update", 01/11/2026)

`scripts/video/drone/` (mesmo servidor e mesma página): drones estacionados → decolagem → rasante → FPV até a fábrica
inimiga (piloto automático do roteiro no `fpv.input`) → enxame de 3 → impactos na base.

```bash
QUALITY=high FPS=24 DUR=40 OUT=/tmp/drone_frames node scripts/video/drone/film.cjs   # ~2 h; grava cuts.json e audio.json
```

Edição feita à mão depois (27 s): cortar a tela "SINAL PERDIDO" (é texto) e o último quadro do FPV (a câmera entra no
prédio); remapear os tempos do `audio.json` para a linha nova, somar a explosão no corte do impacto e pancadas graves
(`howitzer`, `carpet_rumble`) nas trocas de cena; clarões brancos com `drawbox ... enable='between(t,a,b)'`.
Não congelar a exposição automática (`exposureLive = false` deixava a imagem estourada).
