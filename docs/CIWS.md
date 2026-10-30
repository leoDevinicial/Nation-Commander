# Phalanx CIWS Móvel

Tropa da **Era Digital** (era 3, a penúltima): um 8×8 blindado com a montagem do Phalanx na traseira. É o veículo
militar mais caro da era: custa mais que o Lança-Foguetes (550) e a Antiaérea Móvel (425) em cada recurso, e um pouco
mais que o Tanque Moderno do Futuro Próximo (725). É a defesa de ponto do exército: derruba no ar parte das salvas
do Lança-Foguetes que vão cair perto dele e conta como defesa antiaérea contra aviões e mísseis.

## Regra

| Item | Valor |
|---|---|
| Produção | Fábrica, atalho **G** |
| Pesquisa | Defesa de ponto (CIWS), atalho **G** no Centro de Pesquisa: nível 2, depois de Defesa antiaérea móvel |
| Custo-base | 95 petróleo, 105 ferro, 95 suprimentos; com o `ECONOMY`, 240 / 265 / 240 (745 no total) |
| Bens | 14 aço e 8 combustível, quando houver estoque |
| Tempo de produção | 20 s |
| Vida, velocidade, visão | 170, 4,4, 15 |
| Arma em terra | Gatling de 20 mm em rajadas: 8 tiros de 9,225 de dano, um a cada 0,25 s (~1,75 s de fogo contínuo), e 2,5 s de pausa entre as rajadas (`burst` na arma); alcance 7,5; ×0,35 contra veículos e ×0,3 contra construções |

**Interceptação** (`CIWS_INTERCEPT` em `shared/sim/Simulation.ts`):

- cada CIWS a até 8 do ponto de impacto derruba 40% dos foguetes que restam de uma salva (arredondado para cima);
- só atira depois de 30% do voo e espera 3 s entre uma rajada e a próxima;
- o dano da salva cai na mesma proporção, e uma salva derrubada por inteiro não cai;
- funciona desde a entrada em serviço (a antiaérea móvel só intercepta no Futuro Próximo, ver `docs/ERAS.md`);
- vários CIWS e antiaéreas perto do mesmo alvo somam: cada um tira a sua parte do que sobrou;
- evento `salvo_intercepted` com `gun: true`.

Como tem `airDefense`, também aumenta a chance de derrubar aviões e mísseis por perto, igual à Antiaérea Móvel.

**IA:** pesquisa a defesa de ponto por último. Quando vê um Lança-Foguetes inimigo, a Fábrica produz o CIWS no lugar
da antiaérea.

## Modelo (`buildCiws` em `src/game/render/models/unitModels.ts`)

Feito a partir da foto de referência do responsável, em low poly:

- cabine em cunha com casco em V, para-brisa duplo inclinado, barra de faróis de LED, ganchos e antenas altas;
- carroceria baixa com painéis aparafusados, armários, caixa lateral entre os eixos e escapamento vertical;
- quatro eixos: dois pares, um sob a cabine e outro sob a montagem;
- montagem do Phalanx: base giratória, garfo de elevação, cúpula clara do radar com tampa em domo;
- faixa da nação em volta da cúpula (a peça mais visível de longe);
- tambor de munição, treliça em X sob o cano, câmera térmica e uma pilha de caixas de eletrônica ao lado;
- Gatling de 6 canos com braçadeiras e a boca com os seis furos.

O casco facetado usa o novo `PartBuilder.convex` do kit (envoltória convexa dos pontos). São 5.828 triângulos.

A torre e o cano são montados na altura real do convés. O shader joga poeira nas peças baixas pela altura local; com
a torre montada embaixo, ela ficaria bege. O campo `lift` dos canos faz o mesmo com a geometria do cano.

## No cliente

- **Disparo:** tiro `gatling` em `Projectiles`, um fio de 9 traçantes finos e rápidos por disparo. O feixe de canos
  gira na rajada (70 rad/s) e perde a velocidade aos poucos (`spin` no modelo).
- **Torre muito rápida:** `turretSlew: 28` no modelo, contra 5 das outras tropas. A montagem estala de um alvo para o
  outro, como os servos de uma defesa de ponto.
- **Interceptação:** `RocketLayer.gunIntercept`. A torre vira para cada foguete (`UnitVisual.aimToward`), e uma rajada
  de traçantes de 0,3 s sai da boca do cano até ele. O foguete explode no ar no fim da rajada.
- **Som:** `gatling` no `AudioService`, um som por rajada (toca no tiro com `burstStart`).
  - A rajada é desenhada amostra a amostra (`gatlingBurst`, três variantes): ~75 tiros por segundo, cada um com
    estalo, corpo curto e sopro, que somem antes do próximo tiro. Assim viram o rasgo contínuo ("brrrrt"), não um
    zumbido.
  - Por cima, o motor dos canos subindo antes do primeiro tiro e descendo depois do último, o ronco grave da rajada e
    o eco do terreno.

## Testes

- `shared/test/military.test.ts`: o CIWS derruba 5 de 12 foguetes já na era 3, e fora do alcance não derruba
  nenhum. Também cobre os bloqueios da pesquisa (era, pré-requisito, nível do centro).
- `shared/test/military.test.ts`: rajada de 8 tiros a cada 0,25 s, pausa de 2,5 s e dano 2,5% maior.
- `shared/test/military.test.ts`: o CIWS é mais caro que as outras tropas da Era Digital em cada recurso.
- `src/test/unitAnim.test.ts`: posição da boca do Gatling, giro do feixe de canos e a torre que vira quase na hora.
