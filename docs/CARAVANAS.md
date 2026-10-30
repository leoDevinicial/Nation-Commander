# Caravanas internas

Lote 2, item 6 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md), junto com as estradas do lote 3
([`ESTRADAS_ENGENHARIA.md`](ESTRADAS_ENGENHARIA.md)) e as prefeituras ([`CIDADES_PREFEITURAS.md`](CIDADES_PREFEITURAS.md)).

## Como funciona

Cada prefeitura pronta mantém **uma caravana**: um caminhão de carga que vai e volta entre ela e o Centro de Comando do
mesmo dono. Não precisa de comando: a caravana sai sozinha assim que a prefeitura fica pronta **e está ligada ao QG por
estrada**.

**A caravana só anda por estrada (regra rígida).** Ela precisa de uma ligação contínua de células de estrada, pelas
vizinhas norte, sul, leste e oeste, que encoste no Centro de Comando e na prefeitura (inclusive na diagonal, como no
bairro pavimentado). Vale tanto a estrada construída pelo jogador quanto a estrada de terra que o mapa gera. Sem
ligação, a caravana fica parada no QG e a prefeitura rende só a renda fixa dela. Território de quem está em guerra com o
dono, no meio do caminho, também corta a ligação.

| Regra | Valor |
|---|---|
| Caravanas | 1 por prefeitura pronta |
| Renda | 0,3 suprimento por unidade de mundo da rota, entregue a cada chegada (no QG e na prefeitura) |
| Velocidade | 3,2 por segundo × 1,3 da estrada (o mesmo bônus dos comboios do comércio) |
| Descarga | 4 s parada em cada ponta |
| Rota | o caminho mais curto pela estrada (`roadLink`), refeito a cada viagem: estradas novas entram no caminho |
| Sem estrada | fica parada e confere a ligação de novo a cada 5 s |
| Emboscada | tropas ou torres de quem está em guerra com o dono, a até 5 da caravana, a destroem |
| Reposição | depois de destruída, uma nova sai do QG em 45 s |

Rotas longas rendem mais por chegada, mas a viagem também demora mais. Na prática a caravana rende cerca de
**0,9 a 1 suprimento por segundo** (rotas de 40 a 80 unidades de mundo). Somada à renda fixa da prefeitura (1/s), uma
cidade ligada ao QG por estrada quase dobra o que rende.

- **Cidade tomada:** a caravana do antigo dono some. O novo dono passa a ter uma caravana até o QG dele.
- **Prefeitura destruída em obra ou QG caído:** sem caravana.
- **IA:** recebe as caravanas das próprias prefeituras pelas mesmas regras e constrói as estradas (abaixo).

## IA: estradas até as prefeituras

A IA liga cada prefeitura pronta ao QG com a mesma ferramenta, a mesma regra e o mesmo custo do jogador
(`TacticalAI.planRoads`):
- **Traçado:** Dijkstra na grade, pelas vizinhas norte, sul, leste e oeste, de uma célula colada ao QG até uma colada à
  prefeitura (`TacticalAI.roadRoute`). Estrada existente quase não custa e é reaproveitada; planície e solo fértil
  livres no próprio território custam 1. Água, rocha, floresta, lama, minério, construções e território alheio ficam de
  fora: o traçado desvia de rios e montanhas.
- **Obra:** até 40 células por vez, a partir do QG. Rotas maiores saem em várias obras.
- **Momento:** só quando não está guardando recursos para algo mais urgente (era, Centro de Pesquisa, QG da era 2, obra
  do plano esperando material), sem ameaça perto da base, com pedra suficiente para manter uma reserva de 80 depois da
  obra e no máximo uma obra de estrada a cada 20 s.
- **Limite:** a IA não usa engenheiros para pavimentar fora do território. Se o único desvio possível passar por terra
  sem dono, aquela prefeitura fica sem estrada.

## Na tela

- **Mapa:** a caravana usa o mesmo caminhão dos comboios rodoviários, na cor da nação. O inimigo só a vê em trânsito,
  dentro do raio de visão dele.
- **Painel da prefeitura:** mostra a situação da caravana. Pode estar a caminho do QG ou da prefeitura, descarregando,
  parada por falta de estrada ou destruída (com o tempo até a próxima), sempre com os suprimentos por chegada.
- **Destruída:** o dono recebe um aviso no painel de eventos, com alarme e explosão no mapa. Quem a destruiu vê
  "Caravana inimiga destruída".

## Onde está

| O quê | Onde |
|---|---|
| Números | `CARAVAN` em `shared/sim/config.ts` |
| Regras | `CaravanSystem` e `roadLink` em `shared/sim/caravans.ts` (passo, ligação por estrada, chegada, emboscada, reposição) |
| IA | `TacticalAI.planRoads` e `TacticalAI.roadRoute` |
| Salvamento | `SimulationSave.caravans` |
| Snapshot | `Snapshot.caravans` (`CaravanView`) em `shared/sim/snapshot.ts` |
| Evento | `caravan_lost` |
| Cliente | `GameRuntime.onSnapshot` (caminhões no `CargoLayer`), `CaravanInfo` em `src/ui/hud/CommandPanel.tsx` |
| Testes | `shared/test/caravans.test.ts` |
