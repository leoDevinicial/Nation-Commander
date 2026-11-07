# Catálogo de efeitos sonoros recebidos

Arquivos originais enviados pelo responsável do projeto, guardados como vieram (só renomeados), com a análise de cada
um. A pasta fica fora de `public/`, então não entra no build nem é baixada pelo jogador. `scripts/sfx-preparar.py`
recorta, normaliza e converte o que é usado para `public/sfx/`; o que está ligado a cada som do jogo fica na seção
**Em uso no jogo** (no fim), e o que ainda falta gravar em **O que falta**.

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

## Lote 7 (04/11) — metralhadora, rajada (4 variações)
Pasta `originais/metralhadora-rajada/`. Todos MP3 48 kHz estéreo, 192 kbps, 4,0 s (≈ 97 KB). Arquivo de origem:
"Modern military auto… N". As 4 são distintas. Cadência medida ~600–670 tiros/min (um disparo a cada 0,09–0,10 s),
sem pausas dentro da rajada. Complementa o tiro único do lote 6. Contagem de disparos aproximada (detecção pelo
envelope; disparos colados podem somar).

| Arquivo | Origem | Rajada | Disparos (aprox.) | Cauda audível (até ~−40 dB) | Pico | Média | Observação |
|---|---|---|---|---|---|---|---|
| `metralhadora-rajada-1.mp3` | auto 1 | curta, ~0,45 s | ~5 | ~2,5 s | −1,2 dB | −23,6 dB | rajada curta de controle |
| `metralhadora-rajada-2.mp3` | auto 2 | média, ~1,1 s | ~11 | ~2 s depois do fim | −1,4 dB | −22,1 dB | rajada média, bem uniforme |
| `metralhadora-rajada-3.mp3` | auto 3 | curta, ~0,4 s | ~4 | ~2,5 s | −1,0 dB | −22,6 dB | a mais curta; ataque forte no primeiro disparo |
| `metralhadora-rajada-4.mp3` | auto 4 | longa, ~1,5 s | ~15 | ~1,5 s depois do fim | −0,4 dB | −20,3 dB | a mais longa e alta; boa para metralhadora pesada |

Uso provável: `gatling`, `air_mg`, `apc_gun` e infantaria em fogo contínuo; quando a unidade dispara em sequência,
tocar uma rajada (curta ou longa conforme o tempo de fogo) no lugar de vários tiros únicos. Ao implementar: cortar a
cauda para ~1 s depois do último disparo (o resto é silêncio, −60 a −75 dB), normalizar (a 4 é ~3 dB mais alta) e
converter para mono.

## Lote 8 (04/11) — energia desligando (1 variação)
Pasta `originais/energia-desligando/`. MP3 48 kHz estéreo, 192 kbps, 4,0 s (≈ 97 KB). Arquivo de origem:
"Sfx for shutind down 1". Para quando uma construção fica sem energia (rede elétrica, `shared/sim/power.ts`).

| Arquivo | Conteúdo | Pico | Média | Observação |
|---|---|---|---|---|
| `energia-desligando-1.mp3` | zumbido elétrico que perde força e desce de tom (centro do espectro cai de ~1,2 kHz para ~460 Hz em 3,5 s), com um estalo leve em ~2,9 s | −13,5 dB | −33,4 dB | bem mais baixo que os outros lotes (~12 dB abaixo); som contínuo, sem ataque forte |

Uso provável: evento de prédio próprio que perde a luz (só para o dono e, de preferência, só para o prédio selecionado
ou visível, para não tocar em cascata quando a rede inteira cai; nesse caso tocar uma vez só). Ao implementar: cortar
para ~3 s com fade, subir o volume ~10–12 dB na normalização, converter para mono e tocar no canal de interface ou
ambiente (não no de combate). Só há uma variação: dá para variar a altura (±5%) a cada vez.

## Lote 9 (04/11) — antiaérea, rajada de canhão automático (4 variações)
Primeiro lote da segunda rodada (depois da lista de sons que faltam). Pasta `originais/antiaerea-rajada/`. Todos MP3
48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem: "Duration 2-3 seconds N". As 4 são distintas.

Todas são **uma rajada só** de canhão automático, com o primeiro tiro logo em 0 s: tiros a cada ~45–50 ms (~1.200–1.300
por minuto, medido pelo intervalo entre os picos do envelope), som brilhante (centro do espectro em 3,2–4,5 kHz). Não
há estouro no ar (o "flak" explodindo perto do avião): é só o disparo.

| Arquivo | Origem | Conteúdo | Pico | Média | Até ~−40 dB | Observação |
|---|---|---|---|---|---|---|
| `antiaerea-rajada-1.mp3` | 1 | ~10 tiros em ~0,45 s | +0,5 dB | −23,7 dB | ~0,7 s | a mais fraca no corpo (envelope em −25 a −30 dB), com mais grave (23% abaixo de 200 Hz); precisa de ~+4 dB na normalização |
| `antiaerea-rajada-2.mp3` | 2 | ~10 tiros em ~0,45 s | +1,1 dB | −20,4 dB | ~0,8 s | a mais forte e encorpada no meio da rajada; pouco grave (8%) |
| `antiaerea-rajada-3.mp3` | 3 | ~7 tiros em ~0,3 s | −0,7 dB | −23,5 dB | ~0,6 s | a mais curta e seca; boa para rajada rápida ou distante |
| `antiaerea-rajada-4.mp3` | 4 | ~12 tiros em ~0,6 s | +0,7 dB | −18,8 dB | ~0,95 s | a mais longa e cheia, mais grave (24%, centro em 3,2 kHz) |

Picos acima de 0 dB (o MP3 passa do limite): normalizar com margem. Depois de ~1 s só sobra ruído baixo (−55 a −80 dB).

Uso provável: `aa_gun` (Antiaérea Móvel das eras 1–3, que hoje sintetiza uma rajada de 6–9 tiros a ~12 por segundo):
encaixa direto, só um pouco mais rápida que a sintetizada; sortear entre as 4, altura ±4%. **Não** serve para
`aa_twin` (a antiaérea da era 4 dá dois disparos pesados e separados de 30 mm; dá para testar a 1 ou a 4 tocadas ~15%
mais graves, mas o ideal é outra gravação) nem para `flak` (estouro no ar quando um avião cai; falta gravação). Ao
implementar: cortar em ~1,1 s com fade de ~0,15 s, normalizar o volume entre elas e converter para mono.

## Lote 10 (04/11) — veículo explodindo (4 variações)
Pasta `originais/veiculo-explosao/`. Todos MP3 48 kHz estéreo, 192 kbps, 5,0 s (≈ 122 KB). Arquivo de origem:
"Duration 4-6 seconds N". As 4 são distintas. Muito grave em todas (40–74% da energia abaixo de 200 Hz). Dois tipos:
**estouro curto** (1 e 3: um soco e a cauda de fogo/destroços) e **explosão com estouros secundários** (2 e 4: a
munição cozinhando, estouros que vêm depois do principal).

| Arquivo | Origem | Conteúdo | Pico | Média | Acima de −20 dB | Até ~−40 dB | Observação |
|---|---|---|---|---|---|---|---|
| `veiculo-explosao-1.mp3` | 1 | 1 estouro em 0 s | +0,6 dB | −24,9 dB | 0,3 s | ~3,2 s | soco seco e cauda de crepitar/destroços que cai devagar |
| `veiculo-explosao-2.mp3` | 2 | estouro em 0,07 s + secundários em 0,9 s e 1,4 s (e menores até 3,8 s) | −0,7 dB | −19,6 dB | 1,4 s | ~4,1 s | a mais longa e cheia; corpo forte por ~2 s; menos grave (40%), mais "fogo" |
| `veiculo-explosao-3.mp3` | 3 | 1 estouro em 0 s (+ um baque baixo em 1,4 s) | −0,3 dB | −24,7 dB | 0,3 s | ~2,9 s | parecida com a 1, um pouco mais curta |
| `veiculo-explosao-4.mp3` | 4 | estouro em ~0,4 s (pré-estalo fraco em 0,22 s) + secundários em 1,2 s e 1,7 s e estalos até 4,2 s | +0,9 dB | −20,5 dB | 0,85 s | ~3,4 s | a mais grave (74%); **começa com 0,22 s de silêncio**: cortar o início ao preparar |

Picos acima de 0 dB nas 1 e 4: normalizar com margem.

Uso provável: `vehicle_explosion` (veículo leve/médio destruído, hoje sintetizado) com a 1 e a 3, e também a 2 e a 4
encurtadas (~2 s); `vehicle_explosion_heavy` (blindado pesado, hoje toca a explosão grande) pode ganhar a 2 e a 4
inteiras, pelos estouros secundários de munição. `explosion` (soldado/alvo pequeno, o som mais comum) não tem gravação
própria ainda: dá para testar a 1 e a 3 cortadas em ~1 s e ~15% mais agudas, mas o ideal é um lote de explosão pequena.
Ao implementar: cortar o silêncio inicial (2 e 4), encurtar a cauda para 2–3,5 s com fade, normalizar e converter para
mono; limitar quantas tocam ao mesmo tempo (são longas).

## Lote 11 (04/11) — jato voando (4 variações)
Pasta `originais/jato-voando/`. Todos MP3 48 kHz estéreo, 192 kbps, 8,0 s (≈ 194 KB). Arquivo de origem:
"11 - jet Duration 6 N". As 4 são distintas.

**Não são passagens que vêm e vão:** as 4 começam e terminam com o volume cheio (sem fade nem no início nem no fim) e
quase não mudam de lado no estéreo. São o **ronco contínuo de turbina**, rugido de banda larga com mais energia entre
300 Hz e 1,1 kHz (pouco grave: 7–13% abaixo de 200 Hz). Servem como loop ou como "matéria-prima" de uma passagem: o
jogo faz o vem-e-vai com volume, posição e altura (Doppler) por cima da gravação.

| Arquivo | Origem | Conteúdo | Pico | Média | Nível ao longo do tempo (a cada 0,5 s) | Observação |
|---|---|---|---|---|---|---|
| `jato-voando-1.mp3` | 1 | jato se aproximando, longe | −13,2 dB | −34,9 dB | sobe de −43 a −30 dB, ainda subindo no fim | **muito baixo** (~15 dB abaixo dos outros) e corta no fim ainda crescendo; tem um assobio de turbina mais marcado (tonal); bom para avião distante ou começo de aproximação |
| `jato-voando-2.mp3` | 2 | aproximação e passagem suave | −1,1 dB | −21,2 dB | −27 → máximo −18 em ~4,5–5,5 s → −22 | o único com movimento: vai da direita (+4 dB) para o centro; o tom sobe no fim (1,2 → 2,2 kHz) |
| `jato-voando-3.mp3` | 3 | ronco constante, perto | −1,7 dB | −16,1 dB | −15 a −19 dB, cai um pouco depois de 6 s | o mais forte e brilhante; o tom desce no fim (1,7 → 1,2 kHz), como quem se afasta |
| `jato-voando-4.mp3` | 4 | ronco constante | −0,3 dB | −17,7 dB | −17 a −18 dB, praticamente plano | o mais estável: o melhor candidato a loop |

Uso provável: `jet` (passagem de caça, hoje sintetizada como sobrevoo de 4,8 s com Doppler): tocar a 3 ou a 4 (e a 2)
com um envelope de volume de ~4–5 s (sobe, pico na passagem, desce) e altura caindo ~10–15% depois do pico; a 1
para formações longe da câmera. `bomber` (bombardeiro): a 4 ou a 3 ~20–25% mais graves e com envelope mais longo
(~7 s), até chegar um lote próprio de bombardeiro. Para loop (avião que fica circulando), emendar a 4 com cruzamento
de ~0,3 s (não tem fade, mas o fim e o começo não casam exatamente). Ao implementar: normalizar (subir a 1 em ~15 dB
se for usada), converter para mono.

## Lote 12 (04/11) — Domo de Ferro, interceptação do míssil (4 variações)
Pasta `originais/domo-interceptacao/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"19 - dome intercept N". As 4 são distintas. Estouros **no alto e longe**: curtos, sem soco grave (3–18% abaixo de
200 Hz), mais baixos que as explosões de chão. Dois pares bem diferentes:

| Arquivo | Origem | Conteúdo | Pico | Média | Até ~−40 dB | Observação |
|---|---|---|---|---|---|---|
| `domo-interceptacao-1.mp3` | 1 | estrondo distante, sem ataque | −14,2 dB | −37,3 dB | ~1,7 s | **começa já no meio do som** (−25 dB em 0 s, só cai depois): sem o estalo inicial, parece ter sido cortado no começo; bom como eco/ronco de uma interceptação longe |
| `domo-interceptacao-2.mp3` | 2 | estalo seco em 0,04 s e chiado de fragmentos | +1,6 dB | −28,2 dB | ~0,7 s | o mais "estouro" dos quatro; estalo de ~20 ms, **saturado** (27 amostras no limite) |
| `domo-interceptacao-3.mp3` | 3 | 0,07 s de silêncio, depois 3 estalos (0,08, 0,11 e 0,15 s) | +1,5 dB | −30,0 dB | ~0,7 s | estouro com fragmentação (crepitar); o mais grave no timbre (1,5 kHz); **saturado** (16 amostras no limite); cortar o silêncio inicial |
| `domo-interceptacao-4.mp3` | 4 | estrondo distante, sem ataque | −16,8 dB | −39,2 dB | ~2,1 s | igual à 1 no formato (começa no meio, cauda longa e suave), a mais aguda e sem grave (3%) |

Uso provável: `dome_intercept` (interceptador do Domo de Ferro acertando o míssil) com a 2 e a 3 como o estouro, e a
1 ou a 4 como cauda tocada junto (~15 dB abaixo, 0,05 s depois), o que dá estouro + eco no céu. `intercept`
(interceptação sem o domo, por exemplo pela antiaérea) pode usar as mesmas, um pouco mais agudas. Ao implementar:
cortar o silêncio da 3, normalizar com margem (a 2 e a 3 estão saturadas no pico; as 1 e 4 precisam subir ~12–15 dB
se forem usadas sozinhas), converter para mono, cortar em ~1,5–2 s com fade.

## Lote 13 (04/11) — bombardeiro voando (4 variações)
Pasta `originais/bombardeiro-voando/`. Todos MP3 48 kHz estéreo, 192 kbps, 8,0 s (≈ 194 KB). Arquivo de origem:
"Duration 7-10 second N". As 4 são distintas. Uma passagem completa (1) e três roncos contínuos (2–4) que começam e
terminam no volume cheio, sem fade (servem de loop ou de base para o vem-e-vai feito pelo jogo, como o lote 11).

| Arquivo | Origem | Conteúdo | Pico | Média | Nível (a cada 0,5 s) | Observação |
|---|---|---|---|---|---|---|
| `bombardeiro-voando-1.mp3` | 1 | **passagem completa**: chega, passa, vai embora | −0,5 dB | −20,5 dB | −38 → pico −13 em ~2,5–3,5 s → −37 | o único sobrevoo pronto: o tom sobe na chegada e cai na passagem (centro do espectro 0,85 → 3,1 → 0,85 kHz, Doppler); começa e termina baixo (−37 dB); centralizado |
| `bombardeiro-voando-2.mp3` | 2 | ronco contínuo, o mais pesado | −1,3 dB | −17,1 dB | −19 a −14, cresce um pouco em 3–4,5 s | o mais grave (38% abaixo de 200 Hz e 9% abaixo de 80 Hz): o "peso" de motores grandes; leve à direita |
| `bombardeiro-voando-3.mp3` | 3 | ronco contínuo, plano | −1,2 dB | −14,8 dB | −14 a −15 o tempo todo | o mais forte e estável; tem um pulsar de ~14 Hz (batida de hélice/motor a pistão): bom para bombardeiro das eras antigas e para loop |
| `bombardeiro-voando-4.mp3` | 4 | ronco contínuo, plano | −1,5 dB | −17,0 dB | −16 a −19 | mais brilhante e menos grave (15%), pulsar lento (~2,8 Hz): mais "jato" que hélice |

Uso provável: `bomber` (sobrevoo do bombardeiro, hoje sintetizado com 7,5 s e pico em 3,2 s): a 1 serve **como está**
(o pico em ~3 s bate com o sintetizado); a 2, a 3 e a 4 com o envelope de volume e o Doppler do jogo, para variar. A 2
pode também reforçar o grave de `carpet_rumble` (bombardeio em tapete) por baixo dos impactos. Ao implementar:
normalizar, converter para mono, sortear entre a passagem pronta e os roncos com envelope.

## Lote 14 (04/11) — assobio de bomba caindo (4 variações)
Pasta `originais/bomba-assobio/`. Todos MP3 48 kHz estéreo, 192 kbps, 4,0 s (≈ 97 KB). Arquivo de origem:
"16 - bomb whistle Du N". As 4 são distintas. Assobio tonal puro que **desce** de tom do começo ao fim, entrando com
um sopro curto (0,1–0,25 s) e sumindo em fade, **sem a explosão no fim** (o impacto continua sendo o `bomb` do jogo).
Centralizados (sem movimento no estéreo).

| Arquivo | Origem | Tom (início → fim) | Pico | Média | Assobio audível | Observação |
|---|---|---|---|---|---|---|
| `bomba-assobio-1.mp3` | 1 | 2,3 → 1,3 kHz | −0,3 dB | −13,6 dB | ~0,25–3,4 s, quase plano (−11 a −15 dB) | o mais forte e longo; some só nos últimos 0,5 s |
| `bomba-assobio-2.mp3` | 2 | 2,1 → 1,3 kHz (para de descer em ~2,5 s) | −2,9 dB | −19,3 dB | cresce de −26 até −14 em ~2,4 s, some até 3,7 s | o único que **cresce** (bomba se aproximando), mais trêmulo no fim |
| `bomba-assobio-3.mp3` | 3 | 2,5 → 1,0 kHz | −1,7 dB | −17,7 dB | ~0,25–2,8 s | a maior descida de tom e a mais curta; some mais cedo |
| `bomba-assobio-4.mp3` | 4 | 2,8 → 1,7 kHz | −0,2 dB | −14,7 dB | ~0,25–2,9 s | o mais agudo; 2 amostras no limite (normalizar com margem) |

**Tempo:** no jogo o assobio sintetizado dura ~1,05 s e as bombas do tapete explodem logo depois (`GameRuntime`, evento
`air_strike`). As gravações têm 2,5–3,5 s de assobio. Ao implementar, escolher entre: (a) usar só o trecho final
(~1,2–1,5 s antes do fade, onde o tom já está mais baixo, que é o som de "bomba chegando") com fade-in curto; ou (b)
tocar mais rápido (playbackRate ~1,5–2, o que também sobe o tom). A opção (a) mantém o timbre; a (b) muda pouco o
tempo do jogo. Uso: `bomb_whistle`. Normalizar (a 2 está ~5 dB abaixo das outras) e converter para mono.

## Lote 15 (04/11) — bombardeio em tapete (2 variações)
Pasta `originais/bombardeio-tapete/`. MP3 48 kHz estéreo, 192 kbps, 7,0 s (≈ 170 KB). Arquivo de origem:
"17 - carpet rumble D N". Vieram só as variações **2 e 3** (a 1 e a 4 não vieram); as duas são distintas.

Uma fileira de ~12–14 impactos graves em ~3 s, com o ronco que rola pelo terreno e some até ~6 s. **Quase tudo é
grave**: 89–92% da energia abaixo de 200 Hz e 68–75% abaixo de 80 Hz (subgrave). Começam e terminam em silêncio
(−60 dB), centralizadas.

| Arquivo | Origem | Impactos (s) | Pico | Média | Nível (a cada 0,5 s) | Observação |
|---|---|---|---|---|---|---|
| `bombardeio-tapete-2.mp3` | 2 | 0,15 · 0,48 · 0,63 · **1,03** · 1,2 · 1,33 · 1,84 · 2,26 … 2,95 | −0,5 dB | −19,6 dB | −16, **−12**, −14, −18, −22 … −67 | impactos mais fortes cedo (0,5–1,3 s), depois mais espaçados e distantes |
| `bombardeio-tapete-3.mp3` | 3 | 0,25 · 0,4 · **0,59** · 0,77 · 1,26 · 1,43 · 1,64 · 1,87 · 2,17 … 3,01 | −1,4 dB | −18,1 dB | −20, **−10**, −11, −16, −24 … −57 | a mais grave (75% abaixo de 80 Hz); começa com ~0,2 s quase em silêncio |

**Cuidado com o grave:** em caixinha de celular ou notebook, que quase não reproduz abaixo de ~100–150 Hz, estas
gravações podem soar muito baixas ou sumir. Por isso a ideia é usá-las **por baixo** dos impactos `bomb` (que já são
gravações da explosão grande, mais médias), não no lugar deles.

Uso provável: `carpet_rumble` (o trovão contínuo que acompanha a fileira de bombas, tocado na primeira bomba, hoje
sintetizado), sorteando entre as duas. Os impactos gravados não vão bater exatamente com as explosões visuais da
fileira (`AirLayer.dropBombs`), mas como o ronco é contínuo isso não deve incomodar. Ao implementar: cortar o silêncio
inicial da 3, encurtar para ~5 s com fade, normalizar com margem, converter para mono; se ficar fraco no celular,
somar um pouco do ronco sintetizado (que tem mais médios) ou subir os médios com um filtro.

## Lote 16 (04/11) — Domo de Ferro, lançamento do interceptador (4 variações)
Pasta `originais/domo-lancamento/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"18 - dome launch Dur N". As 4 são distintas. Estalo de ignição seguido do sopro do motor (whoosh) que dura ~1–2 s e
some; terminam em silêncio (−55 a −69 dB). Centralizadas (sem movimento no estéreo). Nenhuma passa do limite.

| Arquivo | Origem | Início | Pico | Média | Nível (a cada 0,25 s) | Observação |
|---|---|---|---|---|---|---|
| `domo-lancamento-1.mp3` | 1 | 0,07 s | −1,6 dB | −17,8 dB | −19, −13, −13, −13, −17, −21 … −49 | sopro forte e brilhante (3 kHz no começo) por ~1 s, tom descendo; um estalo menor em 1,65 s |
| `domo-lancamento-2.mp3` | 2 | 0,15 s | −8,4 dB | −27,9 dB | −29, −21, −22, −27, −35 … −60 | a mais curta (~0,5 s de corpo) e a única **grave** (52% abaixo de 200 Hz): o baque da carga de expulsão; ~10 dB abaixo das outras; estalos menores em 0,83 e 1,58 s |
| `domo-lancamento-3.mp3` | 3 | 0,13 s | −6,3 dB | −25,7 dB | −37, −25, −19, −19, −27 … −52 | o sopro **cresce** até ~0,5–1 s (o tom sobe até 2,7 kHz e depois cai): bom "subindo e se afastando" |
| `domo-lancamento-4.mp3` | 4 | 0,03 s | −4,7 dB | −18,4 dB | −17, −18, −16, −16, −15, −16, −18, −19, −26 … −55 | a mais longa: motor contínuo por ~2 s antes de sumir |

Uso provável: `dome_launch` (hoje sintetizado: estalo da ignição, baque grave e o motor sólido subindo de tom e
sumindo), sorteando entre a 1, a 3 e a 4; a 2, sozinha, é fraca, mas serve como baque grave somado a uma das outras
(o sintetizado tem esse baque). O Domo lança vários interceptadores seguidos: limitar quantos tocam juntos (`MIN_GAP`
já tem 0,2 s). Ao implementar: cortar o silêncio inicial (0,03–0,15 s), cortar em ~2–2,5 s com fade, normalizar (subir
a 2 e a 3), converter para mono.

## Lote 17 (04/11) — míssil interceptado no ar (4 variações)
Pasta `originais/interceptacao-no-ar/`. Todos MP3 48 kHz estéreo, 192 kbps, 2,0 s (≈ 49 KB). Arquivo de origem:
"20 - intercept Durat N". As 4 são distintas entre si e diferentes das do lote 12 (Domo). Estouro que começa já em
0 s (sem silêncio), corpo de ~0,2–0,5 s e cauda que some até ~1,5 s. **Mais encorpadas e graves** que as do lote 12
(48–79% da energia abaixo de 200 Hz): soam como uma explosão de verdade no ar, mais perto. Nenhuma passa do limite.

| Arquivo | Origem | Pico | Média | Nível (a cada 0,25 s) | Observação |
|---|---|---|---|---|---|
| `interceptacao-no-ar-1.mp3` | 1 | −0,4 dB | −23,6 dB | −15, −29, −36, −41 … −60 | estouro curto e cheio (~0,1 s acima de −15 dB) e queda rápida |
| `interceptacao-no-ar-2.mp3` | 2 | −1,1 dB | −23,1 dB | −17, −22, −24, −21, −33 … −57 | a mais longa: corpo de ~0,8 s com **estouros secundários** em 0,66 e 0,86 s (fragmentos/ogiva); a mais grave (79%) |
| `interceptacao-no-ar-3.mp3` | 3 | −1,4 dB | −26,5 dB | −18, −27, −33, −38 … −69 | parecida com a 1, um pouco mais baixa e com cauda mais "chiada" |
| `interceptacao-no-ar-4.mp3` | 4 | −1,4 dB | −22,6 dB | −14, −26, −35, −41 … −69 | a mais brilhante (centro em ~2,3 kHz o tempo todo, 48% de grave): corpo plano de ~0,2 s |

Uso provável: `intercept` (míssil derrubado sem o Domo: antiaérea, CIWS, salva do Lança-Foguetes interceptada,
evento `salvo_intercepted`), sorteando entre as 4. Também servem para `dome_intercept` quando a interceptação for
perto da câmera (as do lote 12 ficam como estouro alto e longe). Ao implementar: cortar em ~1,2–1,5 s com fade,
normalizar, converter para mono.

## Lote 18 (04/11) — gatling do CIWS (4 variações)
Pasta `originais/ciws-gatling/`. Todos MP3 48 kHz estéreo, 192 kbps, 4,0 s (≈ 97 KB). Arquivo de origem:
"23 - ciws gatling Du N". As 4 são distintas. Cada uma é **uma rajada contínua** ("brrrt") com volume plano do começo
ao fim da rajada e corte limpo, seguida de cauda curta e silêncio. Brilhantes (centro do espectro 2,6–3,2 kHz).
Nenhuma passa do limite.

Os tiros se fundem num rasgo contínuo; o que se ouve como "pulsar" fica em 13–21 vezes por segundo (medido pela
modulação do envelope), mais lento que os ~75 tiros/s do sintetizado e do Phalanx real. Pode ser a textura do gerador
e não os tiros em si: **conferir de ouvido** ao implementar.

| Arquivo | Origem | Rajada | Pico | Média | Pulsar | Observação |
|---|---|---|---|---|---|---|
| `ciws-gatling-1.mp3` | 1 | 0,10–2,9 s (~2,8 s) | −0,4 dB | −18,7 dB | ~17/s | a mais longa; começa com 0,1 s de silêncio |
| `ciws-gatling-2.mp3` | 2 | 0–2,1 s | −1,2 dB | −17,6 dB | ~13/s | a mais curta e grossa |
| `ciws-gatling-3.mp3` | 3 | 0–2,2 s | −0,8 dB | −18,9 dB | ~21/s (o mais marcado) | a mais aguda e sem grave (5% abaixo de 200 Hz) |
| `ciws-gatling-4.mp3` | 4 | 0–2,5 s | −1,1 dB | −17,4 dB | difuso (~15/s) | a mais encorpada (37% de grave): o rasgo mais "liso" |

Uso provável: `gatling` (CIWS; hoje sintetizado como rajada de ~1,8 s com o motor girando os canos antes e depois). O
jogo dispara em rajadas de 8 tiros com pausa de 2,5 s (`docs/CIWS.md`) e o som toca uma vez por rajada: cortar cada
gravação em ~1,5–1,8 s com fade de ~0,1 s (ou usar de 0 a ~2 s inteiro, se soar melhor), normalizar e converter para
mono. O giro do motor dos canos não vem nas gravações: dá para manter o do sintetizado por baixo.

## Lote 19 (04/11) — explosão nuclear (4 variações)
Pasta `originais/explosao-nuclear/`. Todos MP3 48 kHz estéreo, 192 kbps, 12,0 s (≈ 289 KB). Arquivo de origem:
"24 - nuclear blast D N". As 4 são distintas. Estrondo enorme e **muito grave** (74–91% da energia abaixo de 200 Hz e
34–61% abaixo de 60 Hz), com uma sequência de ondas/estouros nos primeiros ~2–3 s e o ronco que vai sumindo até o
fim do arquivo (audível até ~6 s, depois só um fundo baixo que chega a −64 a −93 dB em 12 s). Nenhuma passa do limite.

| Arquivo | Origem | Início | Pico | Média | Nível (a cada 1 s) | Observação |
|---|---|---|---|---|---|---|
| `explosao-nuclear-1.mp3` | 1 | 0,04 s | −1,3 dB | −22,3 dB | −13, −17, −25, −36, −42 … −82 | ondas em 0,7 · 1,0 · 1,3 · 1,8 · 2,1 s; 54% abaixo de 60 Hz |
| `explosao-nuclear-2.mp3` | 2 | 0,11 s | −1,3 dB | −23,3 dB | −14, −18, −27, −30, −41 … −93 | a menos grave (78%): o estrondo tem mais "corpo" médio, deve soar melhor em caixinha pequena |
| `explosao-nuclear-3.mp3` | 3 | 0,13 s | −1,1 dB | −20,0 dB | −11, −15, −25, −33, −41 … −64 | a mais forte e a mais grave (91%, 61% abaixo de 60 Hz); ondas até ~3,3 s |
| `explosao-nuclear-4.mp3` | 4 | **0,21 s** | −1,5 dB | −21,4 dB | −14, −15, −19, −24, −32 … −64 | a que mais demora a cair (sustenta ~3 s) e tem um **segundo estrondo em ~3,3 s** (a onda de choque chegando / bola de fogo subindo) |

Uso provável: `nuclear_blast` (hoje sintetizado: estrondo abafado, ronco que incha e ondula, ouvido de longe, chegando
depois do clarão). As 4 servem; a 4 combina com a "onda que chega depois". Por ser muito grave, em celular/notebook a
maior parte some: manter também um pouco do sintetizado por cima ou dar preferência à 2. Ao implementar: cortar o
silêncio inicial (0,04–0,21 s), cortar em ~8 s com fade longo (2–3 s), normalizar, converter para mono. É raro, então
o tamanho do arquivo não pesa.

## Lote 20 (04/11) — Programa Espacial: contagem regressiva e lançamento (2 arquivos)
Pasta `originais/espaco-lancamento/`. Dois arquivos diferentes:

**`espaco-contagem-e-lancamento.mp3`** — composição pronta (origem: "ElevenLabs audio composition 2026-11-04"). MP3
**44,1 kHz mono**, 103 kbps, 16,5 s (≈ 213 KB): formato diferente dos outros lotes.

| Trecho | O que tem (pela análise; não ouvido) |
|---|---|
| 0,08–1,9 s | **voz**: três falas curtas (0,08–0,88 s, com uma pausa em 0,6 s; e 1,55–1,88 s), quase toda a energia na faixa da voz (300–3.400 Hz), sem grave: provavelmente o fim da contagem. **Em inglês** (confirmado pelo responsável em 04/11; segundo ele, o motor alto abafa a voz) |
| ~2,5 s | ignição: o grave entra de uma vez (97% abaixo de 200 Hz em 3,0 s) |
| 2,5–14,5 s | ronco do foguete crescendo de −20 a −3 dB (em 9–13 s), o tom sobe até ~8 s e desce depois |
| 14,5–16,5 s | fade até o silêncio |

Pico **+5,8 dB** e ~25 mil amostras no limite: o ronco está **saturado/clipado** (média de −4 dB em 9–13 s). Ao
implementar, baixar ~8–10 dB; a distorção que já está na gravação fica (no ronco de foguete ela quase não se nota).

**`espaco-decolagem-2.mp3`** — origem "26 - space liftoff D 2" (só a variação 2 veio). MP3 48 kHz estéreo, 192 kbps,
13,0 s (≈ 313 KB). Pico −1,3 dB, média −14,1 dB, nada no limite. Ronco que **cresce** de −44 a −15 dB nos primeiros
~2,5 s e depois fica **plano em −13 dB até o fim, sem fade** (o arquivo termina cortado em pleno ronco). O tom desce
devagar (centro de 3,1 kHz em 3 s até ~1 kHz em 12 s) e o grave cresce (de ~10% a ~59%): soa como o foguete subindo e
se afastando.

**Como o jogo toca hoje** (`GameRuntime`, evento do Programa Espacial): `space_prelaunch` começa **10 s antes** da
decolagem (bombas, válvulas, supressão acústica e ignição a −2,2 s, sincronizado com a animação) e `space_liftoff`
começa na decolagem (força crescendo até ~4 s, depois abafando ao longe).

Uso provável:
- `space_prelaunch` + `space_liftoff`: a composição pode tocar **começando ~4,7 s antes da decolagem**, para a ignição
  dela (2,5 s) cair na ignição da animação (−2,2 s); os primeiros ~5 s da contagem do jogo (bombas, válvulas) seguem
  sintetizados por baixo. A voz é em inglês: **com o jogo em inglês**, tocar a composição inteira; **em português e
  espanhol**, só a partir de ~2,4 s (sem a voz), até chegar uma contagem gravada nesses idiomas. O idioma vem de
  `src/i18n/` (`docs/IDIOMAS.md`). Como a voz fica abafada pelo motor, vale baixar o ronco nos primeiros segundos ou
  tocar a voz um pouco mais alta quando for usada.
- `space_liftoff`: a decolagem 2 como alternativa ao ronco da composição, cortada em ~10 s com fade longo (3–4 s),
  porque o arquivo não tem fim.
Converter tudo para mono 48 kHz e normalizar.

## Lote 21 (04/11) — canhão automático do blindado (APC, 4 variações)
Pasta `originais/blindado-canhao/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"06 - apc gun Duratio N". As 4 são distintas. Disparos curtos (1 ou 2–3 tiros muito próximos), com cauda de eco que
some em 0,7–2,2 s. Bem diferentes entre si em força e formato:

| Arquivo | Origem | Tiros (s) | Pico | Média | Até ~−40 dB | Observação |
|---|---|---|---|---|---|---|
| `blindado-canhao-1.mp3` | 1 | 1, sem ataque | −10,7 dB | −36,8 dB | ~2,2 s | **sem o estalo inicial** (começa em −19 dB e só cai, como os lotes 12-1 e 12-4) e ~15 dB abaixo das outras: soa como um tiro abafado/distante; o mais fraco do lote |
| `blindado-canhao-2.mp3` | 2 | 0 · ~0,05 · ~0,21 | −3,7 dB | −30,2 dB | ~1,7 s | 2–3 tiros rápidos e embolados no começo, mais grave (46%); cauda longa |
| `blindado-canhao-3.mp3` | 3 | 0,02 · 0,07 (e um fraco em ~0,19) | +1,9 dB | −27,5 dB | ~0,7 s | **dois tiros a 50 ms**, secos e fortes; a cauda mais curta; 17 amostras no limite |
| `blindado-canhao-4.mp3` | 4 | 0,08 | +1,3 dB | −30,2 dB | ~1,1 s | **um tiro limpo e forte** (estalo brilhante + grave, 73% abaixo de 200 Hz); 0,08 s de ruído antes do tiro; 6 amostras no limite |

Uso provável: `apc_gun` (canhão de 30 mm do blindado, hoje sintetizado como rajada de **3 tiros a ~0,3 s**, ~200 por
minuto). As gravações não trazem essa rajada pronta: montar no jogo tocando **tiros únicos em sequência** (a 4, e a 3
cortada no primeiro tiro, ~0,05 s) três vezes a ~0,3 s, com altura ±4% e o eco só no último, como já é feito com o
fuzil (`rifle`). A 2 pode entrar inteira como variação "embolada". A 1 serve só como tiro distante. Ao implementar:
cortar o início da 4 (0,08 s), cortar cada tiro em ~0,6–0,8 s com fade, normalizar com margem (a 3 e a 4 estão no
limite; a 1 precisa de ~+12 dB se for usada), converter para mono.

## Lote 22 (04/11) — sirene de ataque aéreo (3 variações)
Pasta `originais/sirene-ataque-aereo/`. MP3 48 kHz estéreo, 192 kbps, 9,0 s (≈ 217 KB). Arquivo de origem:
"27 - air raid siren N". Vieram as variações **1, 2 e 4**: no lugar da 3 veio por engano o `06 - apc gun 1`, idêntico
byte a byte ao `blindado-canhao-1.mp3` do lote 21 (não guardado de novo). As 3 sirenes são distintas.

Sirene mecânica (rotor) que **sobe de tom e depois se sustenta**; nenhuma termina em fade (o som continua até o fim
do arquivo, em −16 a −18 dB). Tom medido a cada 0,25 s:

| Arquivo | Origem | Tom | Pico | Média | Observação |
|---|---|---|---|---|---|
| `sirene-ataque-aereo-1.mp3` | 1 | sobe até ~1,17 kHz em ~1,2 s, fica até ~4,8 s, depois **desce devagar** até ~0,85 kHz em 9 s | +0,8 dB | −17,1 dB | a mais completa: subida, patamar e o lamento descendo (o "uuuuóóó" típico); 13 amostras no limite |
| `sirene-ataque-aereo-2.mp3` | 2 | começa do silêncio (−55 dB), sobe de ~640 a ~805 Hz em 1–2,5 s e **fica plana** até o fim | −0,2 dB | −16,3 dB | a única com o arranque do zero; o patamar plano (2,5–9 s) dá loop |
| `sirene-ataque-aereo-4.mp3` | 4 | sobe de ~430 a ~865 Hz em ~0,5 s e fica plana, com uma queda de volume em ~4–5 s | −1,2 dB | −14,5 dB | a mais grave e a mais forte; o patamar dá loop |

Uso provável:
- **Aviso nuclear "armado"** (`AudioService`, cue `armed`: hoje uma sirene mecânica sintetizada que sobe e desce sem
  parar até autorizar ou abortar): a 2 ou a 4 em loop no patamar (emendando com cruzamento de ~0,3 s), ou a 1
  inteira repetida; parar com fade curto ao autorizar/abortar.
- **Sob ataque** (`ui('attack')`, hoje dois toques curtos de dois tons, ~0,8 s, que tocam a cada ataque): a sirene
  longa não cabe aí, porque o aviso se repete muito. Dá para usar um trecho curto (~1,5–2 s da subida da 2 ou da 4,
  com fade) no primeiro aviso de um ataque e manter o sintetizado nos seguintes; ou deixar a gravada só para o nuclear.
Ao implementar: normalizar com margem (a 1 passa do limite), converter para mono, tocar no canal de interface.

## Lote 23 (04/11) — canhão, tiro único (4 variações)
Pasta `originais/canhao-tiro/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"03 - cannon Duration N". As 4 são distintas. **Um disparo em 0 s** (sem silêncio antes), corpo forte de ~0,25–0,35 s
e cauda com ecos do terreno até 1,3–2,3 s. Graves e pesados (47–71% abaixo de 200 Hz). Três vêm **saturadas**: o
disparo encosta no limite por vários milissegundos (amostras no limite: 83, 79 e 42).

| Arquivo | Origem | Pico | Média | Nível (a cada 0,25 s) | Ecos | Observação |
|---|---|---|---|---|---|---|
| `canhao-tiro-1.mp3` | 1 | +1,9 dB | −19,9 dB | −10, −21, −23, −30 … −47 | 0,68 · 1,0 · 1,2 · 1,4 s | o mais grave (71%) e o de cauda mais longa (~2,3 s), com eco que rola; 83 amostras no limite |
| `canhao-tiro-2.mp3` | 2 | +1,4 dB | −19,8 dB | −9, −23, −30, −31 … −57 | — | o mais seco e curto (~1,3 s), menos grave (47%); 79 amostras no limite |
| `canhao-tiro-3.mp3` | 3 | +1,0 dB | −22,3 dB | −12, −25, −33, −34 … −63 | 0,7 · 1,8 s | estalo mais brilhante; um eco tardio em 1,8 s; 42 amostras no limite |
| `canhao-tiro-4.mp3` | 4 | −1,1 dB | −23,3 dB | −13, −24, −28, −35 … −60 | 0,5 · 1,2 · 1,9 s | o mais "redondo" (centro em 1,4 kHz) e o único sem saturação; vários ecos |

**Onde o jogo usa `cannon` hoje:** só no disparo direto do Lança-Foguetes (`GameRuntime`, evento de ataque com
`rocket_artillery`; a salva em si toca `rocket`). O sintetizado é um baque curto. A artilharia comum usa `howitzer`.

Uso provável: `cannon` (sorteando entre as 4); o obus (`howitzer`) tem lote próprio (lote 25). Diferem do tanque
(`tanque-tiro`, lote 1) por serem mais curtas e com menos corpo depois do disparo. Ao implementar: normalizar com
margem (a saturação já gravada fica; em disparo quase não se nota), cortar em ~1,5–2 s com fade, converter para mono.

## Lote 24 (04/11) — vento (4 variações, para loop)
Pasta `originais/vento/`. Todos MP3 48 kHz estéreo, 192 kbps, 9,0 s (≈ 217 KB). Arquivo de origem:
"38 - wind Duration 8 N". As 4 são distintas. **Prontas para loop:** volume quase constante do começo ao fim (varia
1–4 dB), sem fade, e o nível do início igual ao do fim. **Estéreo largo de verdade** (os dois canais quase sem
correlação, −0,14 a 0,07): para o ambiente, que não tem posição no mapa, vale **manter em estéreo** (diferente dos
efeitos de combate, que vão a mono).

| Arquivo | Origem | Pico | Média | Nível (a cada 0,5 s) | Timbre | Observação |
|---|---|---|---|---|---|---|
| `vento-1.mp3` | 1 | −2,4 dB | −26,4 dB | −25 a −28, bem plano | médio (centro ~2 kHz), pouco grave (10%) | vento contínuo moderado |
| `vento-2.mp3` | 2 | −0,1 dB | −21,6 dB | −24 → −20 (em 2–4 s) → −23 | médio (~1,9 kHz), 16% de grave | o mais forte: uma rajada lenta no meio; 2 amostras no limite |
| `vento-3.mp3` | 3 | −25,7 dB | −44,3 dB | −44 a −45, plano | o mais agudo (~3 kHz), chiado fino | **brisa muito baixa** (~20 dB abaixo das 1 e 2) |
| `vento-4.mp3` | 4 | −23,2 dB | −41,7 dB | −40 a −44 | grave (52% abaixo de 200 Hz) com chiado | **brisa baixa e grave**, ~18 dB abaixo das 1 e 2 |

Uso provável: o ambiente da partida (`AudioService.startAmbient`, hoje ruído rosa abafado a 520 Hz com variação lenta,
"vento e campo, sempre baixos") e a neve (`setWeather`: "só o vento frio, grave e lento"). Sugestão: a 3 ou a 4 como
fundo constante (são as brisas calmas), a 1 e a 2 por cima com volume que sobe e desce devagar (rajadas), mais fortes
em tempestade e neve (`shared/sim/climate.ts`). Para emendar sem corte: cruzamento de ~0,5–1 s entre o fim e o começo
(o volume casa, mas o ruído não). Ao implementar: normalizar o nível entre elas só se forem tocadas sozinhas (a
diferença de volume das 3 e 4 é útil como "calmo"), manter estéreo, canal ambiente.

## Lote 25 (04/11) — obus da artilharia (4 variações)
Pasta `originais/obus-tiro/`. Todos MP3 48 kHz estéreo, 192 kbps, 6,0 s (≈ 145 KB). Arquivo de origem:
"howitzer fire Durati N". As 4 são distintas. Disparo pesado e **muito grave** (50–94% abaixo de 200 Hz) com o
estrondo rolando pelo terreno por vários segundos; mais longo e mais grave que o canhão (lote 23). Formatos diferentes:

| Arquivo | Origem | Disparos (s) | Pico | Média | Nível (a cada 0,25 s) | Observação |
|---|---|---|---|---|---|---|
| `obus-tiro-1.mp3` | 1 | 0,09 (com repiques em 0,26 e 0,55) | +0,5 dB | −24,5 dB | −12, −20, −22, −25, −31 … −42, sobe a −35 em ~3,5–4,3 s, −45 | o mais grave (94%, 42% abaixo de 80 Hz); o eco volta forte em ~4 s (estrondo distante rolando); 13 amostras no limite |
| `obus-tiro-2.mp3` | 2 | 0,11 e 0,28 | +1,0 dB | −23,6 dB | −13, −15, −21, −23, −28 … −54 | o mais "limpo": disparo e cauda que some até ~3 s; 37 amostras no limite |
| `obus-tiro-3.mp3` | 3 | **2,08 e 4,26** (dois disparos) | +1,7 dB | −25,5 dB | −50 (2 s de chiado baixo), −14, −22 … −44, −18, −30 … −42 | **dois tiros separados**: 2 s de ruído baixo antes do primeiro; dá **duas variações** ao recortar (2,0–4,2 s e 4,2–6,0 s); 47 amostras no limite |
| `obus-tiro-4.mp3` | 4 | sem ataque claro | −7,6 dB | −32,2 dB | −20, −29, −31, −30, −31 … −45 | **sem o estalo inicial** (começa em −22 dB e só cai, como os lotes 12-1/4 e 21-1) e ~8 dB abaixo: soa como um tiro distante; ronco médio, sem subgrave |

Uso provável: `howitzer` (obus da artilharia, hoje sintetizado), sorteando entre a 1, a 2 e os dois tiros da 3; a 4
para artilharia longe da câmera (ou como mais uma variação de `warAt`, a guerra ao longe). Substitui a ideia de usar o
canhão do lote 23 para o obus. O `MIN_GAP` do obus já é 0,35 s; com caudas de 3–5 s, limitar quantos tocam juntos.
Ao implementar: recortar a 3 em duas, cortar cada uma em ~3 s com fade, normalizar com margem, converter para mono.
Em caixinha pequena o grave some: a 2 (menos grave) deve ser a que mais se ouve no celular.

## Lote 26 (04/11) — explosão pequena (4 variações)
Pasta `originais/explosao-pequena/`. Todos MP3 48 kHz estéreo, 192 kbps, 1,5 s (≈ 37 KB). Arquivo de origem:
"01 - small explosion N". As 4 são distintas. **Estouro curto e seco começando em 0 s** (sem silêncio), corpo de
0,15–0,5 s e cauda que some até 0,5–1 s: exatamente o formato pedido. Graves (80–85% abaixo de 200 Hz) com estalo
brilhante por cima (centro do espectro 2,9–3,6 kHz). Todas encostam no limite no estalo (amostras no limite: 79, 3, 10
e 8).

| Arquivo | Origem | Pico | Média | Acima de −20 dB | Até ~−40 dB | Observação |
|---|---|---|---|---|---|---|
| `explosao-pequena-1.mp3` | 1 | +1,2 dB | −13,8 dB | 0,53 s | ~1,0 s | a mais forte e longa, com um **segundo estouro em 0,48 s**; a mais saturada (79 amostras no limite) |
| `explosao-pequena-2.mp3` | 2 | +0,5 dB | −16,8 dB | 0,30 s | ~0,6 s | estouro médio, um pouco "rasgado" (vários picos nos primeiros 0,2 s) |
| `explosao-pequena-3.mp3` | 3 | +1,3 dB | −19,9 dB | 0,14 s | ~0,5 s | a mais curta e seca |
| `explosao-pequena-4.mp3` | 4 | +2,0 dB | −19,0 dB | 0,15 s | ~0,7 s | curta, a mais brilhante (centro 3,6 kHz) |

Uso provável: `explosion` (soldado morto, alvo leve, minas, estruturas pequenas; o som de explosão mais frequente,
hoje sintetizado), sorteando entre as 4, altura ±6%. A 1, com o segundo estouro, também cabe em `vehicle_explosion`
como variação mais leve. Como toca muito, limitar a 3–4 simultâneas (o `MIN_GAP` já é 0,06 s). Ao implementar:
normalizar com margem, cortar em ~0,8–1 s com fade, converter para mono.

## Lote 27 (04/11) — lança-foguetes, salva (2 arquivos)
Pasta `originais/lanca-foguetes/`. MP3 48 kHz estéreo, 192 kbps. Dois arquivos de origens diferentes, bem distintos:

**`lanca-foguetes-salva-continua.mp3`** (origem "02 - rocket salvo Du 2", 5,0 s, ≈ 122 KB). Pico −0,2 dB, média
−17,3 dB, nada no limite. **Ronco contínuo e plano** (−13 a −17 dB a cada 0,1 s do começo ao fim), sem saídas
individuais que se destaquem, sem fade nem no começo nem no fim; brilhante (centro ~2,3 kHz, 10% de grave),
centralizado. Soa como os foguetes saindo em sequência tão rápido que viram um rasgo só. Serve de **leito da salva
inteira** ou de loop (cruzamento de ~0,3 s).

**`lanca-foguetes-lancamentos.mp3`** (origem "Millitary multiple r 1", 15,0 s, ≈ 361 KB). Pico −16,4 dB, média
−36,2 dB (**~19 dB abaixo do outro**). **Quatro lançamentos separados**, cada um um sopro que nasce forte e some em
~2–2,5 s (o foguete saindo e se afastando):

| Lançamento | Começa em | Nível no início | Some até |
|---|---|---|---|
| 1 | 0,0 s | −24 dB | ~2,7 s |
| 2 | 2,8 s | −25 dB | ~5,0 s |
| 3 | 5,1 s | −27 dB | ~9,8 s (cauda mais longa) |
| 4 | 9,9 s | −26 dB | ~13 s, depois silêncio até 15 s |

**Como o jogo toca hoje:** `rocket` uma vez **por foguete** que sai do Lança-Foguetes (`GameRuntime`, `onLaunch` da
salva, com `MIN_GAP` de 0,05 s), e a cada 3 mísseis da antiaérea móvel do Futuro Próximo. O sintetizado é curto.

Uso provável: recortar o segundo arquivo em **4 clipes de lançamento** (0–2,7 · 2,8–5,0 · 5,1–7,5 · 9,9–12,5 s, com
fade) e sortear entre eles em cada `rocket`; tocar o ronco contínuo **uma vez por salva**, por baixo, com fade no fim
quando a salva acaba (se as saídas embolarem demais, usar só o ronco e um clipe de lançamento a cada 3 foguetes).
Normalizar (subir os lançamentos ~15–18 dB) e converter para mono.

## Lote 28 (04/11) — torre de defesa, tiro (2 variações)
Pasta `originais/torre-defesa/`. MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"03 - defense tower D N". Vieram só as variações **2 e 3** (a 1 e a 4 não vieram); as duas são distintas.

Cada uma é **um disparo** (dois picos a ~50 ms: o estampido e o estalo/mecanismo logo depois), corpo de ~0,2 s e
cauda que some até ~1,1–1,8 s, com **um eco tardio** bem marcado. Brilhantes (centro ~2,9 kHz).

| Arquivo | Origem | Disparo | Pico | Média | Eco | Observação |
|---|---|---|---|---|---|---|
| `torre-defesa-2.mp3` | 2 | 0 s (picos em 0,13 e 0,18 s) | +1,2 dB | −22,2 dB | ~1,1 s (−32 dB) | mais seco e menos grave (37%); 13 amostras no limite |
| `torre-defesa-3.mp3` | 3 | **0,22 s** (picos em 0,23 e 0,29 s) | +1,1 dB | −25,0 dB | ~1,7 s (−35 dB) | mais encorpado (65% de grave); **0,22 s de silêncio antes**; 6 amostras no limite |

Uso provável: `tower` (tiro da torre de defesa; hoje sintetizado, curto e seco, com `MIN_GAP` de 0,06 s porque a
torre atira muito). Sortear entre as duas com altura ±5% para não soar repetido com só 2 variações. Ao implementar:
cortar o silêncio da 3, cortar em ~0,6–0,8 s com fade (antes do eco tardio, senão o eco de vários tiros embola; ou
manter o eco só a cada poucos tiros), normalizar com margem, converter para mono.

## Lote 29 (04/11) — canhão rotativo do caça (2 arquivos)
Pasta `originais/caca-canhao/`. MP3 48 kHz estéreo, 192 kbps, 5,0 s (≈ 122 KB). Dois arquivos de origens
diferentes ("Create an ultra-real…" e "Authentic 20mm M61A2…"). Os dois são **saturados**: o disparo fica no limite
por muitas amostras (107 e 116), som brilhante e áspero (centro ~4 kHz).

| Arquivo | Origem | Rajada | Pico | Média | Observação |
|---|---|---|---|---|---|
| `caca-canhao-rajada-curta.mp3` | "Create an ultra-real" | **1,70–2,27 s** (~0,55 s), depois eco que some até ~4 s | +2,3 dB | −20,4 dB | **1,7 s de fundo baixo antes** (−49 dB, provavelmente o ronco do avião ao longe); rajada curta e grossa (40% de grave), com pulsar marcado de ~9 por segundo; bom eco "no céu" |
| `caca-canhao-m61-rajada-longa.mp3` | "Authentic 20mm M61A2" | **0–2,0 s**, plana (−12 dB o tempo todo), corte limpo e cauda curta até ~2,6 s | +2,1 dB | −16,0 dB | o "BRRRT" contínuo do M61: rasgo liso (pulsar fraco, ~33/s), pouco grave (13%), começa direto em 0 s |

Uso provável: `jet_cannon` (canhão do caça, hoje sintetizado como rajada de ~0,85–1,1 s a ~100 tiros/s com o ronco
grave e o eco longo; toca no ataque do caça a alvo no chão e no combate aéreo). A M61 cortada em ~0,9–1,1 s com fade
curto é a mais próxima do sintetizado; a rajada curta (recortada de 1,65 s em diante, sem o fundo) entra como
variação mais grossa, com o eco dela. Com só 2 arquivos, cortar a M61 em pontos diferentes (0–1,0 s e 0,8–1,8 s) dá
mais variações. Também pode servir à gatling do CIWS (lote 18), se as de lá soarem lentas. Ao implementar: normalizar
com margem, converter para mono; a saturação gravada fica (combina com o rasgo do canhão).

## Lote 30 (04/11) — míssil ar-ar, disparo do caça (4 variações)
Pasta `originais/missil-ar-ar/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"05 - air to air miss N". As 4 são distintas. Sopro do motor do míssil que nasce em 0,04–0,13 s e se afasta (o tom
cai de 3,5–7 kHz para ~1,5–2 kHz); **quase sem grave** (1–4% abaixo de 200 Hz), bem mais leve que o lançamento de
míssil de chão (lote 3). Nenhuma passa do limite.

| Arquivo | Origem | Início | Pico | Média | Nível (a cada 0,25 s) | Observação |
|---|---|---|---|---|---|---|
| `missil-ar-ar-1.mp3` | 1 | 0,10 s | −1,1 dB | −18,5 dB | −22, −15, −13, −12, −19, −27 … −59 | motor forte por ~1 s, depois some até ~2 s |
| `missil-ar-ar-2.mp3` | 2 | 0,13 s | −0,4 dB | −25,0 dB | −23, −16, −25, −35 … −70 | o mais curto (~0,4 s de corpo) e o mais agudo no começo (7 kHz): um "fsssh" rápido; leve movimento no estéreo |
| `missil-ar-ar-3.mp3` | 3 | 0,04 s | −1,3 dB | −16,5 dB | −16, −13, −13, −12, −13, −17, −21 … −51 | o mais longo e cheio: motor por ~1,3 s e queda lenta até ~2,7 s |
| `missil-ar-ar-4.mp3` | 4 | 0,12 s | −1,9 dB | −27,9 dB | −25, −18, −29, −37 … −58 | curto e mais baixo, com o tom caindo mais (até 1,1 kHz); **puxado para a direita** (+4 dB): converter para mono ao preparar |

Uso provável: `aam_launch` (míssil ar-ar do caça, hoje sintetizado), sorteando entre as 4; a 2 e a 4, mais curtas,
também servem para `agm_launch` (míssil ar-terra) até chegar um lote próprio, tocadas ~10% mais graves. Ao
implementar: cortar o silêncio inicial (0,04–0,13 s), cortar em ~1,5–2 s com fade, normalizar (a 2 e a 4 estão ~8–10 dB
abaixo), converter para mono.

## Lote 31 (04/11) — antiaérea, fogo contínuo (3 arquivos)
Pasta `originais/antiaerea-continua/`. MP3 48 kHz estéreo, 192 kbps, 8,0 s (≈ 194 KB). Arquivo de origem:
"Continuous burst of… N". Vieram dois arquivos diferentes com o mesmo número 1 (guardados como `1a` e `1b`) e a 4;
o quarto anexo era o `05 - air to air miss 4`, idêntico byte a byte ao `missil-ar-ar-4.mp3` do lote 30 (não guardado
de novo). Todos **saturados** no disparo (amostras no limite: 116, 106 e 59).

Cadência de **~10–12 tiros por segundo** (picos a cada ~80–100 ms), mais lenta e mais pesada que a do lote 9 (~20/s):
bate com a rajada sintetizada da Antiaérea Móvel (`aa_gun`, ~12 por segundo).

| Arquivo | Conteúdo | Pico | Média | Nível (a cada 0,25 s) | Observação |
|---|---|---|---|---|---|
| `antiaerea-continua-1a.mp3` | **fogo contínuo de 0,15 a 6,3 s** e cauda até 8 s | +2,0 dB | −17,9 dB | −14 a −22 o tempo todo, depois −29 a −36 | o mais pesado (43% de grave); ~57 tiros; ótimo para recortar várias rajadas de 0,6–1 s |
| `antiaerea-continua-1b.mp3` | rajada curta 0–0,35 s (5 tiros), trecho baixo 1,25–4,8 s (−32 a −45 dB), rajada 5,1–5,9 s (6 tiros) | +2,5 dB | −23,4 dB | −11, −23, −27, −38, −45, −32 … −16, −18 … −60 | duas rajadas curtas e secas (centro 3,3 kHz, pouco grave); o trecho do meio, baixo, parece eco/estouros distantes (não ouvido) |
| `antiaerea-continua-4.mp3` | rajada 0,06–2,5 s, pausa 2,5–4,5 s (−31 a −45 dB), rajada 4,5–6 s | +1,8 dB | −20,1 dB | −16 … −14, −27 … −45, −24 … −21, −39 … −56 | duas rajadas longas separadas por eco; ~51 tiros |

Uso provável: `aa_gun` (Antiaérea Móvel das eras 1–3; hoje rajada sintetizada de 6–9 tiros a ~12 por segundo, ~0,5–0,75
s): recortar rajadas de **6–9 tiros (0,6–0,9 s)** da 1a, da 4 e as duas da 1b, com a cauda de cada uma, e sortear junto
com as do lote 9 (que são mais rápidas). A 1a também serve para fogo antiaéreo sustentado, se um dia houver (bateria
atirando sem parar). **Ainda não cobre** a `aa_twin` (era 4: dois disparos pesados e separados) nem o estouro no ar
(`flak`). Ao implementar: normalizar com margem, converter para mono.

## Lote 32 (04/11) — antiaérea da era 4, disparo duplo (4 variações)
Pasta `originais/antiaerea-era4-duplo/`. Todos MP3 48 kHz estéreo, 192 kbps, 3,0 s (≈ 73 KB). Arquivo de origem:
"07 - aa era4 double N". As 4 são distintas. Dois disparos de canhão (um de cada cano) com cauda curta; o
intervalo entre eles varia bastante:

| Arquivo | Origem | Disparos (s) | Intervalo | Pico | Média | Até ~−40 dB | Observação |
|---|---|---|---|---|---|---|---|
| `antiaerea-era4-duplo-1.mp3` | 1 | 0,00 e 0,09 | 0,09 s | +2,1 dB | −23,3 dB | ~0,8 s | dois tiros fortes e iguais, quase colados; 17 amostras no limite |
| `antiaerea-era4-duplo-2.mp3` | 2 | 0,12 e 0,32 | **0,20 s** | −5,4 dB | −30,3 dB | ~2,0 s | o intervalo **igual ao do sintetizado** (0,2 s); segundo tiro mais fraco; cauda de eco longa; ~7 dB mais baixo |
| `antiaerea-era4-duplo-3.mp3` | 3 | não dá para separar | — | −7,6 dB | −33,4 dB | ~2,7 s | **sem ataque claro** (começa em −21 dB e só cai): soa como disparo distante e abafado; o mais fraco |
| `antiaerea-era4-duplo-4.mp3` | 4 | 0,06 e 0,20 | 0,14 s | +1,9 dB | −26,9 dB | ~0,8 s | o mais pesado e brilhante (46% de grave, centro 3,3 kHz); primeiro tiro bem mais forte que o segundo (−6 e −20 dB); 36 amostras no limite |

Uso provável: `aa_twin` (Antiaérea Móvel do Futuro Próximo, 30 mm gêmeos: hoje dois disparos sintetizados a ~0,2 s,
cada um com estalo, sopro, soco grave e o ferrolho). A 2 encaixa como está; a 1 e a 4 dão o mesmo efeito com o
intervalo mais curto (dá para afastar o segundo tiro ao recortar: cortar no meio e tocar o segundo 0,2 s depois do
primeiro); a 3 serve como tiro distante. Ao implementar: cortar o início da 2, cortar em ~1 s com fade (a 2 em ~1,5 s,
pelo eco), normalizar com margem (subir a 2 e a 3), converter para mono.

## Lote 33 (07/11) — gerado no ElevenLabs: o que faltava (27 sons, 2 variações cada)
Gerado pelo Claude no ElevenLabs (Sound Effects v2, com duração definida; vozes com o Eleven v4). MP3 44,1 kHz
estéreo, 128 kbps. Fluxo "Nation Commander - SFX que faltam" na conta do responsável.

| Pasta (`originais/`) | Arquivos | Duração | O que é | No jogo |
|---|---|---|---|---|
| `antiaerea-estouro/` | 2 | 2,5 s | estouro de granada antiaérea no céu, estilhaços e eco | `flak` (recorte 0,4–1,6 s) |
| `missil-ar-terra/` | 2 | 3 s | míssil ar-terra saindo do caça | `agm_launch` (antes usava o ar-ar) |
| `drone-passagem/` | 2 | 4 s | drone passando por cima, com Doppler | `drone_pass` |
| `drone-fpv/` | 2 | 6 s, loop | som de bordo do drone FPV (hélice aguda e vento) | ainda não ligado |
| `silo-preparo/` | 2 | 6 s | portas hidráulicas do silo, klaxon e baques | `missileCue('prepare')` (0–3,6 s) |
| `silo-autorizado/` | 2 | 3 s | chave girando, dois bipes e alarme grave | `missileCue('authorize')` |
| `chuva/` | 2 | 10 s, loop | chuva média em grama e telhados | ainda não ligado |
| `trovao/` | 2 | 6 s | estalo e ronco longo | `thunder()` (0–5,5 s) |
| `vento-neve/` | 2 | 10 s, loop | vento frio de inverno | ainda não ligado |
| `producao-predios/` | 20 | 8 s, loop | serraria, pedreira, mina, fábrica, petróleo, fazenda, aeroporto, porto, escritório, zumbido | ainda não ligados |
| `interface/` | 12 | 0,5–2,2 s | clique, confirmar, erro, alerta, sucesso, anúncio | `ui('click' / 'confirm' / 'error' / 'alert' / 'success' / 'herald')` |
| `voz-contagem/` | 4 | 3,5–3,8 s | "Três, dois, um, ignição!" (voz Rômulo Franklin) e "Tres, dos, uno, ¡ignición!" (voz Joselo de Tacna) | `espaco-contagem-pt` e `-es` |

Contagem em português e espanhol: `COUNTDOWNS` no `scripts/sfx-preparar.py` põe a voz sobre a `espaco-ignicao` (filtro de
rádio de 300–3.800 Hz, compressão e +12 dB), com o ronco cedendo enquanto ela fala. Um número por segundo: "três" em
T-3 e "ignição!" na decolagem. O `space_prelaunch` escolhe pelo idioma da tela (`voiceLang`); idioma sem gravação
própria cai na ignição sem voz.

Volumes: medidos offline contra o sintetizado que cada gravação substitui (mesma energia no canal), com
`scripts/sfx/calibrar.cjs`; ficam em `AGM_GAIN`, `FLAK_GAIN`, `DRONE_PASS_GAIN`, `UI_GAIN`, `SILO_GAIN` e
`THUNDER_GAIN` no `AudioService`. O estouro antiaéreo ficou um pouco acima do sintetizado (que é quase inaudível). Não
ouvidos por uma pessoa: vale conferir no jogo e ajustar esses números.

## Lote 34 (07/11) — interface "segurar" e "aviso grave", bordo do drone de asa fixa (ElevenLabs)
Gerados no `eleven_text_to_sound_v2` (fluxo "Nation Commander - SFX que faltam"), duas variações de cada.

| Pasta / arquivo | Pedido | Uso |
|---|---|---|
| `interface/ui-segurar-{1,2}` | toque curto subindo de console (0,6 s) | `ui('hold')`, início do aperto longo (recorte 0,4–0,5 s) |
| `interface/ui-aviso-grave-{1,2}` | estática de rádio e clarim grave descendo em tom menor (2,4 s) | `ui('warning')`, anúncio mundial ruim |
| `drone-asa-fixa/drone-asa-fixa-{1,2}` | bordo de drone de asa fixa com turboélice, cruzeiro constante (8 s, loop) | `setDroneFpv`: laço mono de 7 s; a velocidade muda a rotação (`playbackRate` 0,9–1,22) e o chiado de rádio sintetizado continua |

Espectro do drone: 99% e 87% da energia abaixo de 800 Hz (hélice), contra 38% do quadricóptero do lote 33.
Ganhos (`calibrar.cjs`): `hold` 0,07 (um pouco acima da energia do tique sintetizado de 60 ms), `warning` 0,19,
`DRONE_ONBOARD_GAIN` 1.

## Lote 35 (07/11) — marinha e fanfarra de era (ElevenLabs)
Gerados no `eleven_text_to_sound_v2`, duas variações de cada. Antes deste lote a fragata e os submarinos caíam no som
de fuzil (o `shot` só distinguia as armas de terra) e o navio destruído tocava a explosão de blindado.

| Pasta | Pedido | Recorte | Uso |
|---|---|---|---|
| `canhao-naval/` | canhão de convés disparando no mar, eco sobre a água (3 s) | 2,2–2,4 s | `naval_gun`: tiro da fragata |
| `torpedo-lancamento/` | tubo de ar comprimido, bolhas e a hélice do torpedo se afastando (3 s) | 2,8 s | `torpedo`: submarino e submarino de mísseis |
| `explosao-agua/` | explosão submarina abafada e a coluna d'água caindo (4 s) | 3,6 s | `torpedo_hit`: junto ao alvo, 1 s depois do disparo |
| `navio-afundando/` | explosão a bordo, casco rangendo, água entrando e bolhas (6 s) | 4,3–4,4 s | `ship_sink`: qualquer navio destruído |
| `era-fanfarra/` | fanfarra curta de metais, tímpanos e prato (3,5 s) | 3,2 s | `ui('era')`: a própria nação entrou numa era nova |

Ganhos: o sintetizado de reserva da marinha é o estampido fraco do `cannon`, então o nível veio das gravações
vizinhas (`calibrar.cjs`): canhão naval 1 (entre `tank_gun` e `mbt_gun`), torpedo 0,6, explosão na água 1 e naufrágio
1,2 (no nível do `vehicle_explosion_heavy`); fanfarra 0,12 no `UI_GAIN`, uns 3 dB acima do "sucesso".

## Lote 36 (07/11) — motores andando e apito do navio (ElevenLabs)
Duas variações de cada; antes deste lote os veículos e navios andavam em silêncio.

| Pasta | Pedido | Recorte | Uso |
|---|---|---|---|
| `motor-lagarta/` | tanque andando: diesel grave e esteira batendo (8 s, loop) | laço 7 s | `tracked`: tanque, MBT, obus, antiaérea móvel, CIWS |
| `motor-rodas/` | blindado 8×8 em estrada de terra: turbodiesel e pneus no cascalho (8 s, loop) | laço 4,5 s do miolo (o arquivo oscila 14 dB) | `wheeled`: blindado e lança-foguetes |
| `navio-navegando/` | navio de guerra navegando: diesel marítimo, proa nas ondas, água no casco (10 s, loop) | laço 8,6 s | `naval`: todos os navios menos os submarinos (silenciosos) |
| `navio-apito/` | um apito grave saindo do porto, com eco na água (4 s) | 2,6 s | `shipHorn`: navio novo do Porto (menos pesqueiro e submarinos) |

Mixagem (`setEngines`, ~4×/s pelo `updateEngineSound` do `GameRuntime`): um laço por classe, no canal de combate;
o volume soma o ganho espacial de cada unidade em movimento visível e satura (`1 − e^(−0,9·soma)`), e o lado é a média
ponderada. Ganho cheio 0,45 (uma coluna perto da câmera fica no nível médio da chuva, abaixo dos tiros); apito 0,6.
Sem a gravação não há motor sintetizado.

## Em uso no jogo (04/11)
`scripts/sfx-preparar.py` recorta, converte para mono 44,1 kHz (o vento fica estéreo) e iguala o volume dos clipes em
`public/sfx/` (121 arquivos, ~4,3 MB). O `AudioService` (`SAMPLES`) baixa os clipes em segundo plano quando o áudio é
liberado e, para cada som abaixo, toca a gravação (variação sorteada, sem repetir a anterior, altura ±4%); enquanto o
arquivo não carregou, ou se falhar, toca o sintetizado de antes. `src/test/audio.test.ts` confere que todo arquivo
citado existe.

**Calibração (04/11, lotes 9–32):** cada som renderizado num `OfflineAudioContext` no navegador (o mesmo caminho do jogo,
com o compressor do fim), sintetizado e gravado, 4 vezes cada, comparando o maior RMS em janelas de 300 ms. O ganho
de cada conjunto deixa a gravação no nível do sintetizado: quase todos a até ~1,5 dB. Os mais fortes (antiaérea,
interceptação do Domo, obus, canhão do caça) ficaram 2,5–3,7 dB abaixo no pico, porque o compressor segura os picos;
subir mais só comprimiria mais. **Nada foi ouvido**: se algum soar alto ou baixo, ajustar o `gain` no `SAMPLES` (ou em
`LEVELS`, para vento, sirenes e ronco da salva).

| Som do jogo | Gravações | Observação |
|---|---|---|
| `tank_gun` (tanque) / `mbt_gun` (tanque moderno) | tanque-tiro 1–5 | o moderno toca 10% mais grave e mais alto |
| `explosion_big`, `bomb` | explosao-grande 1–3 | |
| `vehicle_explosion_heavy` | veiculo-explosao-pesada 1–2 (lote 10, munição cozinhando) ou explosao-grande 1–3 | 60% / 40% |
| `vehicle_explosion` | veiculo-explosao 1–4 (lote 10) | |
| `explosion` | explosao-pequena 1–4 (lote 26) | o som de explosão mais comum |
| `missile_launch` / `missile_impact` | missil-lancamento 1–4 / missil-impacto 1–4 | |
| `rifle` (infantaria) | metralhadora-tiro 1–4 ou metralhadora-rajada 1 e 3 | metade das vezes 3 a 5 tiros únicos (0,085 s), metade uma rajada curta |
| `air_mg` (metralhadora do caça) | metralhadora-rajada 1–4 | 25% mais rápida e aguda |
| `aa_gun` (antiaérea das eras 1–3) | antiaerea-rajada 1–4 (lote 9, ~20 tiros/s) ou antiaerea-continua 1–7 (lote 31, recortes de 6–9 tiros a ~11/s) | 40% / 60% |
| `aa_twin` (antiaérea da era 4) | antiaerea-era4 1–3 (lote 32) | dois disparos já na gravação |
| `jet` (passagem de caça) | jato-voando 2–4 (lote 11) | ronco contínuo com o vem-e-vai feito no jogo (`pass`): volume até o pico em 1,8 s, some até 4,8 s, tom cai 12% depois do pico; trecho sorteado |
| `bomber` | bombardeiro-passagem (lote 13-1, sobrevoo pronto) ou bombardeiro-voando 2–4 com `pass` (7,5 s, 10% mais grave) | 60% / 40% |
| `dome_intercept` | domo-interceptacao 1–2 (lote 12) + eco domo-eco 1–2 (`layer`, 35%, 0,05 s depois) | |
| `intercept` | interceptacao-no-ar 1–4 (lote 17) | |
| `dome_launch` | domo-lancamento 1–3 (lote 16) | |
| `bomb_whistle` | bomba-assobio 1–4 (lote 14) | só os últimos 1,3 s de cada assobio (as bombas caem ~1 s depois) |
| `carpet_rumble` | bombardeio-tapete 1–2 (lote 15) + o sintetizado a 50% (`synth`) | a gravação é quase toda subgrave; o sintetizado dá os médios |
| `gatling` (CIWS) | ciws-gatling 1–4 (lote 18), rajada de 1,8 s | o giro do motor dos canos do sintetizado saiu junto |
| `nuclear_blast` | explosao-nuclear 1–4 (lote 19) + sintetizado a 50% | |
| `space_prelaunch` | espaco-contagem-en (com a voz, jogo em inglês) ou espaco-ignicao (sem a voz, outros idiomas), lote 20 | começa 0,3 s (inglês) ou 2,6 s depois do pedido, para o "zero" da gravação (~9,7 s) cair na decolagem (ajuste de 04/11, noite: na primeira versão o foguete subia quando a voz dizia "cinco"; a contagem a 1 número por segundo foi suposta, não ouvida); o sintetizado (bombas, válvulas) segue a 70%. Idioma em `audio.voiceLang` (`GameRuntime` lê o `useLangStore`) |
| `space_liftoff` | espaco-decolagem (lote 20-2), 11 s com fade longo | a contagem some entre 0,8 e 3,3 s depois da decolagem enquanto esta cresce |
| `apc_gun` (blindado) | blindado-canhao 1–2 em 3 tiros a 0,3 s (`rounds`) ou a rajada embolada blindado-canhao-3 (lote 21) | 2/3 e 1/3 |
| `cannon` | canhao-tiro 1–4 (lote 23) | |
| `howitzer` (obus) | obus-tiro 1–4 (lote 25; a 3 virou dois tiros) | |
| `rocket` (cada foguete da salva) | foguete-lancamento 1–4 (lote 27, quatro lançamentos recortados) | ganho calibrado pela salva inteira (12 foguetes) |
| Ronco da salva (`AudioService.rocketSalvo`) | foguete-salva (lote 27, ronco contínuo) | toca uma vez por salva, pelo tempo dos lançamentos (`RIPPLE` × foguetes), e some em 0,6 s |
| `tower` | torre-defesa 1–2 (lote 28), cortadas antes do eco tardio | altura +3% |
| `jet_cannon` | caca-canhao 1–3 (lote 29: dois trechos da M61 e a rajada curta com eco) | |
| `aam_launch` / `agm_launch` | missil-ar-ar 1–4 / missil-ar-ar 2 e 4 10% mais graves (lote 30) | o ar-terra usa o ar-ar até chegar um lote próprio |
| Guerra ao longe (`AudioService.warAt`) | artilharia-distante 1–4 e obus-distante (lote 25-4) | ver abaixo |
| Energia desligando (`AudioService.powerDown`) | energia-desligando | prédio próprio que acabou de ficar sem luz; no máximo 1 vez a cada 4 s, canal de interface |
| Sob ataque (`ui('attack')`) | sirene-aviso (subida da sirene 22-4, 2,2 s) | no máximo um aviso a cada 30 s (o evento chega a cada 6 s; o toque quadrado repetido irritava); sem a gravação, dois tons suaves |
| Silo armado (`missileCue('armed')`) | sirene-loop 1–2 (lote 22-2 e 22-4) | sobe do arranque do rotor e fica em loop sem emenda (`LOOPS` no script; o loop começa em 3,0 s e 1,5 s); ao parar, o tom cai e some em 2,4 s |
| Ambiente (`startAmbient`) | vento-3 ou 4 (brisa de fundo) + vento-1 ou 2 (rajadas que sobem e descem a cada ~20 s), estéreo e em loop (lote 24) | se a partida começa antes de o vento carregar, o sintetizado toca e é trocado quando chega |

**Guerra ao longe:** o `GameRuntime` guarda onde houve tiro envolvendo o jogador nos últimos 8 s e, a cada segundo,
chama `warAt`. Quanto mais longe a câmera está do combate mais próximo (ou mais afastada no zoom), mais alto o fundo,
com mais combate deixando mais forte; com a câmera em cima da luta, some. Toca uma artilharia distante sorteada a cada
2–6 s (mais frequente quanto mais alto), vinda do lado do combate, no canal de combate. Em ataque massivo ou guerra
nuclear fica sempre presente (nível mínimo 0,35).

**Correção junto (04/11):** o intervalo mínimo entre dois sons iguais (`gap`) começava como se o último tivesse tocado
em −1 s; nos primeiros segundos de áudio, sons com intervalo maior que 1 s (bombardeiro, tapete, Programa Espacial,
energia, sirene) eram descartados. Agora começa em "nunca tocou".

**Ficaram de fora de propósito:** jato-voando-1 (muito baixo e cortado), antiaerea-era4-duplo-3 (distante, sem ataque),
domo-lancamento-2 (baque fraco sozinho), sirene-ataque-aereo-1 (sem uso por enquanto), blindado-canhao-1 (sem ataque).

## O que falta (07/11)
Chuva, vento de neve e os 10 laços de produção do lote 33 já tocam (07/11): recortados em laço sem emenda pelo `LOOPS`
do `scripts/sfx-preparar.py` (`chuva-*` e `vento-neve-*` estéreo, 8,8 s; `producao-*` mono, 7 s), ligados no
`setWeather` (no lugar das camadas de ruído; com a chuva gravada, as gotas sintetizadas saem) e no `setProduction`
(`PRODUCTION_SFX`), com ganhos de `scripts/sfx/calibrar.cjs` (`PRODUCTION_GAIN`, `RAIN_GAIN`, `SNOW_WIND_GAIN`). Sem o
arquivo, ou antes de ele carregar, fica o sintetizado.

O som de bordo do drone FPV do lote 33 (`drone-fpv`) fica guardado sem uso: é de um quadricóptero elétrico (zumbido
agudo de hélices). O drone do jogo é de asa fixa com turboélice; o lote 34 (`drone-asa-fixa`) é o que toca.

Ainda sem gravação:
- **Variações que não vieram** (opcionais): explosão grande 1, sirene 3, bombardeio em tapete 1 e 4, decolagem 1, 3 e
  4, torre 1 e 4.
- **Interface:** só o toque curto de "sob ataque" (`attack`) segue sintetizado, e apenas enquanto a sirene gravada
  não carregou.
