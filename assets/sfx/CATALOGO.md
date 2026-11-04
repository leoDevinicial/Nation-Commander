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

## Lote 4 (04/11) — impacto de míssil (4 variações)
Pasta `originais/missil-impacto/`. Todos MP3 48 kHz estéreo, 192 kbps, 12,0 s (≈ 290 KB). Arquivo de origem:
"A powerful precision… N". As 4 são distintas.

| Arquivo | Origem | Impacto | Corpo | Cauda audível (até ~−40 dB) | Pico | Média | Observação |
|---|---|---|---|---|---|---|---|
| `missil-impacto-1.mp3` | precision 1 | seco, em 0 s | curto (~1 s) | ~7 s | −1,3 dB | −20,7 dB | o mais "limpo": um golpe e o ronco caindo |
| `missil-impacto-2.mp3` | precision 2 | **pico em ~1,2 s** (começa já alto, sem silêncio) | longo, ~4 s em −11 a −15 dB | ~9 s | −1,5 dB | −16,5 dB | o mais pesado; bom para míssil grande/balístico |
| `missil-impacto-3.mp3` | precision 3 | seco, em 0 s | decai rápido | ~10 s | −1,1 dB | −22,3 dB | tem **explosão secundária em ~5,2 s** (algo atingido estourando depois) |
| `missil-impacto-4.mp3` | precision 4 | sobe até o pico em ~1 s | ~3 s | ~8 s | −1,5 dB | −17,7 dB | estouros secundários em ~4,8 e ~5,6 s; soa como alvo destruído |

Uso provável: `missile_impact` (e `explosion_big` para variar com o lote 2). Ao implementar: alinhar o golpe ao momento do
impacto (a 2 e a 4 têm o pico ~1 s depois do início; cortar ou adiantar), encurtar a cauda para ~5–6 s com fade,
normalizar (a 1 e a 3 estão mais baixas) e converter para mono. As secundárias da 3 e da 4 podem ficar só para quando
o míssil destrói um prédio.

## Lote 5 (04/11) — artilharia / bombardeio distante (4 variações)
Pasta `originais/artilharia-distante/`. Todos MP3 48 kHz estéreo, 192 kbps, 8,0 s (≈ 190 KB). Arquivo de origem:
"Distant heavy artill… N". As 4 são distintas. Pensado como **fundo de guerra**: ouvido quando há combate fora da tela
ou quando a câmera se afasta do conflito. Mais baixas que os outros lotes (média −22 a −28 dB): já soam abafadas, como
de longe.

| Arquivo | Origem | Conteúdo | Pico | Média | Observação |
|---|---|---|---|---|---|
| `artilharia-distante-1.mp3` | artill 1 | estrondo em 0 s, outro em ~2,5 s e um leve em ~5 s | −1,5 dB | −27,8 dB | sequência de disparos distantes |
| `artilharia-distante-2.mp3` | artill 2 | 1 estrondo forte em 0 s, ronco longo até ~6 s | −1,7 dB | −21,6 dB | a mais presente; boa para bombardeio pesado longe |
| `artilharia-distante-3.mp3` | artill 3 | estrondos em 0, ~2 e ~4 s | −1,7 dB | −25,4 dB | rajada de artilharia, ritmo regular |
| `artilharia-distante-4.mp3` | artill 4 | 1 estrondo com corpo de ~1,5 s e cauda até ~6 s | −1,2 dB | −26,4 dB | a mais discreta |

**Não são loops**: todas terminam em silêncio (−50 a −60 dB no fim). Para fundo contínuo, o melhor é tocar uma delas
sorteada a cada poucos segundos (com intervalo e volume aleatórios, panorâmica para o lado do combate) em vez de emendar
como loop. Uso provável: camada "guerra ao longe", com volume crescendo à medida que a câmera se afasta do combate (ou
quando há combate do jogador fora da tela), e sumindo quando a câmera chega perto (aí entram os sons de cada tiro).
Converter para mono ao implementar (a panorâmica fica com o jogo).

## Lote 6 (04/11) — metralhadora, tiro único (4 variações)
Pasta `originais/metralhadora-tiro/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"Ultra realistic mode N" (nome igual ao do lote 1, mas são outros arquivos). As 4 são distintas. A rajada vem no lote
seguinte.

| Arquivo | Origem | Estalo | Cauda audível (até ~−40 dB) | Pico | Média | Observação |
|---|---|---|---|---|---|---|
| `metralhadora-tiro-1.mp3` | mode 1 | ~0,2 s, em 0 s | ~0,5 s | 0,0 dB | −23,9 dB | o mais seco e curto; pico no limite (normalizar com margem) |
| `metralhadora-tiro-2.mp3` | mode 2 | ~0,3 s, em 0 s | ~0,7 s | −0,4 dB | −21,5 dB | o mais encorpado; cauda um pouco mais longa |
| `metralhadora-tiro-3.mp3` | mode 3 | ~0,2 s, em 0 s | ~0,5 s, com eco baixo até ~1,2 s | −0,6 dB | −24,9 dB | o mais baixo; eco de ambiente aberto |
| `metralhadora-tiro-4.mp3` | mode 4 | ~0,2 s, em 0 s | ~0,6 s (pequeno eco em ~0,4 s) | −0,5 dB | −22,1 dB | eco curto, como reflexo em parede/terreno |

Uso provável: `rifle`, `air_mg`, `apc_gun`, `gatling` em disparo isolado (sorteando entre as variações e com leve
variação de altura). Ao implementar: cortar para ~0,6–1 s (do segundo 1 em diante é quase silêncio, −60 a −88 dB),
normalizar e converter para mono. Como é o som mais repetido do jogo, vale limitar o número de vozes simultâneas e
usar a rajada (lote seguinte) quando a arma dispara em sequência.
