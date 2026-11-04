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

## Em uso no jogo (04/11)
`scripts/sfx-preparar.py` recorta, converte para mono e iguala o volume dos clipes em `public/sfx/` (20 arquivos,
~0,8 MB; o tiro de tanque 2 virou dois clipes). O `AudioService` (`SAMPLES`) baixa os clipes em segundo plano quando o
áudio é liberado e, para cada som abaixo, toca a gravação (variação sorteada, sem repetir a anterior, altura ±4%);
enquanto o arquivo não carregou, ou se falhar, toca o sintetizado de antes. Ganhos calibrados no navegador para ficar
no nível do sintetizado substituído.

| Som do jogo | Gravações | Observação |
|---|---|---|
| `tank_gun` (tanque) / `mbt_gun` (tanque moderno) | tanque-tiro 1–5 | o moderno toca 10% mais grave e mais alto |
| `explosion_big`, `bomb`, `vehicle_explosion_heavy` | explosao-grande 1–3 | blindado pesado 8% mais agudo |
| `missile_launch` | missil-lancamento 1–4 | |
| `missile_impact` | missil-impacto 1–4 | |
| `rifle` (infantaria) | metralhadora-tiro 1–4 ou metralhadora-rajada 1 e 3 | metade das vezes 3 a 5 tiros únicos em sequência (0,085 s), metade uma rajada curta gravada |
| `air_mg` (metralhadora do caça) | metralhadora-rajada 1–4 | 25% mais rápida e aguda (~750 tiros/min) |
| Guerra ao longe (`AudioService.warAt`) | artilharia-distante 1–4 | ver abaixo |
| Energia desligando (`AudioService.powerDown`) | energia-desligando | prédio próprio que acabou de ficar sem luz; no máximo 1 vez a cada 4 s (rede inteira caindo toca uma vez), canal de interface |

**Guerra ao longe:** o `GameRuntime` guarda onde houve tiro envolvendo o jogador nos últimos 8 s e, a cada segundo,
chama `warAt`. Quanto mais longe a câmera está do combate mais próximo (ou mais afastada no zoom), mais alto o fundo,
com mais combate deixando mais forte; com a câmera em cima da luta, some. Toca uma artilharia distante sorteada a cada
2–6 s (mais frequente quanto mais alto), vinda do lado do combate, no canal de combate. Em ataque massivo ou guerra
nuclear fica sempre presente (nível mínimo 0,35). Medido no navegador: com a câmera longe, média ~−30 dB e pico ~−17 dB
no canal de combate, bem abaixo dos tiros de perto (−7 a −15 dB).

Lote 7 (rajadas) só não substitui a gatling do CIWS (cadência muito maior, segue sintetizada).
