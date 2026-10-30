# Phalanx CIWS Móvel

Tropa da **Era Digital** (era 3, a penúltima): um 8×8 blindado com a montagem do Phalanx na traseira. É a defesa de
ponto do exército: derruba no ar parte das salvas do Lança-Foguetes que vão cair perto dele e conta como defesa
antiaérea contra aviões e mísseis.

## Regra

| Item | Valor |
|---|---|
| Produção | Fábrica, atalho **G** |
| Pesquisa | Defesa de ponto (CIWS), atalho **G** no Centro de Pesquisa: nível 2, depois de Defesa antiaérea móvel |
| Custo-base | 80 petróleo, 90 ferro, 80 suprimentos (escalado pelo `ECONOMY`), 12 aço e 6 combustível quando houver |
| Vida, velocidade, visão | 170, 4,4, 15 |
| Arma em terra | Gatling de 20 mm: 9 de dano a cada 0,5 s, alcance 7,5; ×0,35 contra veículos e ×0,3 contra construções |

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
  gira na rajada e perde a velocidade aos poucos (`spin` no modelo).
- **Interceptação:** `RocketLayer.gunIntercept`. A torre vira para cada foguete (`UnitVisual.aimToward`), e uma rajada
  de traçantes de 0,3 s sai da boca do cano até ele. O foguete explode no ar no fim da rajada.
- **Som:** `gatling` no `AudioService`, o rasgo contínuo ("brrrt") a ~75 tiros por segundo, com o zumbido do motor
  que gira os canos.

## Testes

- `shared/test/military.test.ts`: o CIWS derruba 5 de 12 foguetes já na era 3, e fora do alcance não derruba
  nenhum. Também cobre os bloqueios da pesquisa (era, pré-requisito, nível do centro).
- `src/test/unitAnim.test.ts`: posição da boca do Gatling e giro do feixe de canos.
