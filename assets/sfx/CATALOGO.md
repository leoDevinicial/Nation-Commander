# Catálogo de efeitos sonoros recebidos (ainda não usados no jogo)

Arquivos originais enviados pelo responsável do projeto, guardados como vieram (só renomeados). **Nada aqui está ligado
ao jogo ainda**: os efeitos em jogo seguem sintetizados em `src/game/audio/AudioService.ts`. A pasta fica fora de
`public/`, então não entra no build nem é baixada pelo jogador. Quando for implementar, a ideia é recortar, normalizar
e converter cada um para `public/sfx/` e trocar o som sintetizado correspondente.

## Lote 1 (04/11) — tiro de tanque de guerra (4 variações)
Pasta `originais/tanque-tiro/`. Todos MP3 48 kHz estéreo, 192 kbps, 10,0 s (≈ 236 KB). Arquivo de origem:
"Ultra-realistic mode N".

| Arquivo | Origem | Conteúdo | Pico | Média | Cauda audível (até ~−40 dB) | Observação |
|---|---|---|---|---|---|---|
| `tanque-tiro-1.mp3` | mode 1 | 1 disparo em 0 s | 0,0 dB | −18,7 dB | ~4,5 s | o mais encorpado; cauda longa e grave; pico no limite (normalizar com margem) |
| `tanque-tiro-2.mp3` | mode 2 | **2 disparos** (0 s e ~4,0 s) | −1,0 dB | −23,6 dB | ~2,5 s cada | dá duas variações ao recortar em ~3,9 s |
| `tanque-tiro-3.mp3` | mode 3 | 1 disparo em 0 s | −0,8 dB | −20,9 dB | ~3 s | estalo mais seco, cauda média |
| `tanque-tiro-4.mp3` | mode 4 | 1 disparo em 0 s | −1,2 dB | −22,7 dB | ~3 s | decai mais rápido; bom para tiro distante |

Uso provável: `tank_gun` / `mbt_gun` (canhão de tanque), sorteando entre as variações. Ao implementar: cortar o
silêncio final (os arquivos têm 1,5–3,3 s de silêncio no fim), encurtar a cauda para ~2–3 s, normalizar o volume entre
eles e converter para mono (o jogo posiciona o som no espaço).

## Lote 2 (04/11) — explosão grande (3 variações distintas)
Pasta `originais/explosao-grande/`. Todos MP3 48 kHz estéreo, 192 kbps, 15,0 s (≈ 360 KB). Arquivo de origem:
"Massive cinematic ba… N". Vieram 4 arquivos, mas dois eram **idênticos byte a byte** (ambos "…_4"); guardado um só.
A variação 1 não veio (falta, se existir).

| Arquivo | Origem | Conteúdo | Pico | Média | Cauda audível (até ~−40 dB) | Observação |
|---|---|---|---|---|---|---|
| `explosao-grande-2.mp3` | ba 2 | 1 explosão em 0 s | −1,0 dB | −17,6 dB | ~11 s | a mais cheia: corpo forte por ~4 s (−10 a −15 dB) e ronco longo |
| `explosao-grande-3.mp3` | ba 3 | 1 explosão em 0 s | −0,5 dB | −18,9 dB | ~7 s | impacto forte nos primeiros ~3 s e queda mais rápida, com eco/ronco baixo depois |
| `explosao-grande-4.mp3` | ba 4 | 1 explosão em 0 s | −1,1 dB | −19,0 dB | ~9 s | corpo de ~3 s e cauda com reverberação que some devagar (até −68 dB no fim) |

Uso provável: `explosion_big`, `vehicle_explosion_heavy`, `bomb`, `missile_impact` (sorteando entre as variações). Ao
implementar: encurtar a cauda (6–8 s no máximo, com fade), normalizar o volume entre elas e converter para mono; pela
duração, limitar quantas tocam ao mesmo tempo para não embolar no bombardeio pesado.
