# Caravanas internas

Lote 2, item 6 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md), junto com as estradas do lote 3
([`ESTRADAS_ENGENHARIA.md`](ESTRADAS_ENGENHARIA.md)) e as prefeituras ([`CIDADES_PREFEITURAS.md`](CIDADES_PREFEITURAS.md)).

## Como funciona

Cada prefeitura pronta mantém **uma caravana**: um caminhão de carga que vai e volta entre ela e o Centro de Comando do
mesmo dono. Não precisa de comando nem de construção extra: a caravana sai sozinha do QG assim que a prefeitura fica
pronta.

| Regra | Valor |
|---|---|
| Caravanas | 1 por prefeitura pronta |
| Renda | 0,3 suprimento por unidade de mundo da rota, entregue a cada chegada (no QG e na prefeitura) |
| Velocidade | 3,2 por segundo; na estrada, 30% mais rápida (o mesmo bônus dos comboios do comércio) |
| Descarga | 4 s parada em cada ponta |
| Rota | refeita a cada viagem pelo pathfinding: estradas novas entram no caminho; território de quem está em guerra com o dono é evitado |
| Sem rota | espera e tenta de novo a cada 5 s |
| Emboscada | tropas ou torres de quem está em guerra com o dono, a até 5 da caravana, a destroem |
| Reposição | depois de destruída, uma nova sai do QG em 45 s |

Rotas longas rendem mais por chegada, mas a viagem também demora mais. Na prática a caravana rende de
**0,7 a 0,9 suprimento por segundo** (rotas de 40 a 80 unidades de mundo), e de 20% a 25% a mais quando a rota vai
toda pela estrada. Somada à renda fixa da
prefeitura (1/s), uma cidade bem ligada ao QG por estrada quase dobra o que rende.

- **Cidade tomada:** a caravana do antigo dono some. O novo dono passa a ter uma caravana até o QG dele.
- **Prefeitura destruída em obra ou QG caído:** sem caravana.
- **IA:** recebe as caravanas das próprias prefeituras pelas mesmas regras.

## Na tela

- **Mapa:** a caravana usa o mesmo caminhão dos comboios rodoviários, na cor da nação. O inimigo só a vê em trânsito,
  dentro do raio de visão dele.
- **Painel da prefeitura:** mostra a situação da caravana. Pode estar a caminho do QG ou da prefeitura, descarregando,
  sem rota ou destruída (com o tempo até a próxima), sempre com os suprimentos por chegada.
- **Destruída:** o dono recebe um aviso no painel de eventos, com alarme e explosão no mapa. Quem a destruiu vê
  "Caravana inimiga destruída".

## Onde está

| O quê | Onde |
|---|---|
| Números | `CARAVAN` em `shared/sim/config.ts` |
| Regras | `CaravanSystem` em `shared/sim/caravans.ts` (passo, rota, chegada, emboscada, reposição) |
| Salvamento | `SimulationSave.caravans` |
| Snapshot | `Snapshot.caravans` (`CaravanView`) em `shared/sim/snapshot.ts` |
| Evento | `caravan_lost` |
| Cliente | `GameRuntime.onSnapshot` (caminhões no `CargoLayer`), `CaravanInfo` em `src/ui/hud/CommandPanel.tsx` |
| Testes | `shared/test/caravans.test.ts` |
