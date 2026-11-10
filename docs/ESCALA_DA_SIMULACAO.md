# Escala da simulação: grade espacial (10/11)

Pergunta de um dev no Reddit ("aguenta 1000 objetos?"). A medição mostrou crescimento quadrático: cada unidade procurava
alvo varrendo todas as entidades do mapa a cada tick, e a separação das unidades comparava todos os pares.

## O que mudou

| Parte | Antes | Agora |
|---|---|---|
| Busca de alvo (`acquireTarget`) | varre `entities` inteiro | só os quadrados de `SpatialGrid` ao alcance (`shared/sim/spatial.ts`, quadrados de 8 unidades de mundo), mais quem entrou no mapa depois da reconstrução (`EntityMap.fresh`) |
| Separação (`separateUnits`) | todos os pares | os mesmos pares, na mesma ordem, só os que estavam perto no começo da passada |
| `hostile` | monta o texto `"a:b"` a cada chamada | memória por tick (`hostileMemo`), invalidada por `setWar`, `startIncident` e ao carregar |

A grade é reconstruída antes de cada fase com buscas de alvo (laço das unidades e armas dos prédios) e desligada depois
(`spatialLive`); fora delas, `acquireTarget` faz a busca completa como antes.

## Por que o resultado é idêntico

- **Alvo:** o escolhido é o menor (distância, id), que não depende da ordem dos candidatos. A busca cobre o raio da
  arma, o raio da maior unidade e uma folga (`SPATIAL_PAD` = 3) maior que o quanto uma unidade anda num tick. Entidade
  que saiu do mapa é ignorada (`entities.get(id) === e`); a que entrou (tropa formada, desembarque, prédio novo) está em
  `fresh`.
- **Separação:** um par ignorado estava a mais de `MAX_SEPARATION + SPATIAL_PAD` no começo da passada. Enquanto nenhuma
  unidade foi empurrada mais que `SPATIAL_PAD / 2`, ele continua longe demais para se empurrar. Se uma pilha enorme
  empurrar alguém além disso, o resto da passada volta a comparar todos os pares, na mesma ordem.
- **Prova:** `npx tsx scripts/sim-escala.ts hash` (duas batalhas e duas partidas IA × IA de 12 min) deu o mesmo hash
  antes e depois; `shared/test/spatial.test.ts` compara a simulação com e sem a grade (`SPATIAL.enabled`) numa batalha e
  numa pilha densa que aciona a volta para a comparação completa.

## Medição (`npx tsx scripts/sim-escala.ts bench`, dois exércitos em combate, mapa 160×160)

| Unidades | Antes (média / p95) | Agora (média / p95) |
|---|---|---|
| 250 | 6,6 / 9,0 ms | 2,0 / 3,4 ms |
| 500 | 26,7 / 35,2 ms | 6,0 / 8,0 ms |
| 1.000 | 102 / 122 ms | 15,2 / 17,0 ms |
| 2.000 | 393 / 442 ms | 37,4 / 50,3 ms |

Orçamento: 50 ms por tick (20 ticks/s). 1.000 unidades em combate cabem com folga; 2.000 ficam no limite.

## 11/11: 6 nações × 600 tropas

Pergunta do usuário: partidas de 6 jogadores com limite de 600 tropas pesam muito? Medição (`npx tsx scripts/sim-escala.ts
seis`, mapa de 6 nações 192×192, 3.600 tropas): **parado nas bases 51 ms** por tick e **três frentes de batalha 88 ms de
média, picos de 264–310 ms**, acima do orçamento de 50 ms. Três ajustes, todos com resultado idêntico:

| Ajuste | Por quê |
|---|---|
| Uma grade por nação na busca de alvo (`spatialByOwner`) | com o exército em casa, cada tropa varria centenas de aliados em volta só para descartá-los; agora só olha as grades de quem está em guerra com ela |
| Separação com grades de terra e de água (`MAX_SEPARATION.land/naval`) | a folga usava o raio do maior navio também para os soldados (~70 vizinhos conferidos à toa) |
| Separação sem a volta para "todos os pares" | numa batalha densa muitas unidades passavam da folga e a passada inteira virava 3.600² comparações (os picos de 300 ms). Agora só quem foi muito empurrado entra na lista `moved` (comparada com todos) e, com mais de 32 nela, a grade é refeita com as posições de agora (nova âncora); a prova de exatidão é a mesma, a partir da âncora |

| Cenário | Antes | Depois |
|---|---|---|
| 6 × 600 paradas nas bases | 51 / 59 ms | 26–27 / 37 ms |
| 6 × 600, três frentes de batalha | 88 / 264–310 ms | 48–53 / 69–73 ms |
| `bench` 1.000 em combate | 15 / 17 ms | 7,5 / 11 ms |
| `bench` 2.000 em combate | 37 / 50 ms | 14 / 18 ms |

(média / p95; medido num contêiner de 4 núcleos, os números variam uns 10% de uma rodada para outra.)

Equivalência: o `hash` ganhou uma partida de 6 nações × 150 em três frentes (mesmo hash antes e depois, como as outras
quatro) e `shared/test/spatial.test.ts` segue comparando com a busca completa (`SPATIAL.enabled = false`).

## Próximo gargalo

Na batalha de 6 × 600 o custo ficou espalhado: separação (~29%), busca de alvo (~27%) e A* (~23%, boa parte no tick em
que 1.800 tropas recebem a ordem juntas). Depois vêm `population` e `updateUpkeep` (~9%, cada uma varre todas as
entidades por jogador a cada tick). Para ir além: caminho em grupo (um A* por esquadrão em vez de um por unidade) ou
campo de fluxo para ordens em massa, e contar a população uma vez por tick.
