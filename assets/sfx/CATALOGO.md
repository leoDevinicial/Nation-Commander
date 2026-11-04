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

## Lote 3 (04/11) — lançamento de míssil (4 variações)
Pasta `originais/missil-lancamento/`. Todos MP3 48 kHz estéreo, 192 kbps, 15,0 s (≈ 360 KB). Arquivo de origem:
"Modern military miss… N". As 4 são distintas. Diferente dos tiros e explosões, aqui o som é **sustentado**: ignição e
depois o ronco do motor num patamar quase constante (−17 a −20 dB) por ~9–11 s, antes de sumir.

| Arquivo | Origem | Ignição | Patamar do motor | Fim | Pico | Média | Observação |
|---|---|---|---|---|---|---|---|
| `missil-lancamento-1.mp3` | miss 1 | em 0 s | ~9 s, descendo aos poucos (−11 → −22 dB) | queda em ~9,5 s, cauda até ~13 s | −1,1 dB | −16,5 dB | a mais alta; dá sensação de afastamento |
| `missil-lancamento-2.mp3` | miss 2 | **~0,7 s de preparação** antes da ignição | ~10 s, bem constante (−18 dB) | some limpo em ~12,5 s | −1,3 dB | −18,2 dB | a única com "pré-ignição"; boa para silo/lançador pesado |
| `missil-lancamento-3.mp3` | miss 3 | em 0 s | ~9,5 s (−13 → −20 dB) | queda em ~10 s, cauda ainda audível no fim (−56 dB) | 0,0 dB | −18,0 dB | pico no limite; cauda cortada no fim do arquivo (precisa de fade) |
| `missil-lancamento-4.mp3` | miss 4 | em 0 s (ataque forte) | ~10 s (−11 → −22 dB) | fade lento até ~14,5 s | −1,7 dB | −18,1 dB | a mais longa e suave no fim |

Uso provável: `missile_launch` (e talvez `dome_launch`/`aam_launch` encurtadas). Ao implementar: o jogo não precisa dos
15 s; cortar para ~3–5 s (ignição + começo do ronco) com fade, ou deixar o ronco acompanhar o míssil subindo e baixar
com a distância. Normalizar entre elas (a 1 e a 3 estão mais altas) e converter para mono.
