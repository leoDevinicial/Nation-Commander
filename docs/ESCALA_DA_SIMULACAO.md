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

## Próximo gargalo

Com 2.000 unidades: a busca de alvo ainda pesa (~32%, agora proporcional aos vizinhos), seguida do A* (`findPath`,
~26% somando a fila), da separação (~14%) e de `isPassable`. Para ir além, o passo seguinte é o caminho em grupo (um
A* por esquadrão em vez de um por unidade) ou um campo de fluxo para ordens em massa.
