# Cadeias produtivas, serviços com cobertura e vitórias alternativas

Itens do lote 1, §4 (*Tropico*), e do lote 2, item 15, de
[`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Cadeias produtivas

Duas construções novas da era Pós-Guerra Fria transformam um recurso bruto num **bem industrial**. Os bens ficam num
estoque à parte, `PlayerState.goods`, mostrado na barra superior (⛽ combustível, 🔩 aço).

| Construção | Entrada → bem | Ritmo (com os 3 trabalhadores) | Custo |
|---|---|---|---|
| Refinaria (2×2) | petróleo → combustível | 0,6/s | 80 madeira, 100 pedra, 80 ferro |
| Siderúrgica (2×2) | ferro → aço | 0,5/s | 80 madeira, 120 pedra, 60 ferro |

- O estoque de cada bem vai até 40, mais 150 por usina pronta.
- Sem matéria-prima, a usina fica parada com o estado "sem matéria-prima".

**Uso:** os bens substituem parte do custo, na proporção de 1 unidade de bem para 2 do recurso bruto (`GOODS.saves`).
Por isso a cadeia dobra o rendimento do ferro e do petróleo usados nos blindados. Sem estoque suficiente, a produção
cobra o custo cheio e não trava.

| Onde | Bens usados |
|---|---|
| Veículo Blindado | 5 combustível |
| Tanque | 10 aço, 5 combustível |
| Artilharia | 5 aço |
| Lança-Foguetes, Antiaérea Móvel | 10 aço, 5 combustível |
| Tanque Moderno | 20 aço, 10 combustível |
| Aeronaves (montagem) | combustível: caça 10, reconhecimento 6, cargueiro 8, bombardeiro 20 |
| Missões aéreas | o combustível abastece antes do petróleo |

O cálculo está em `substituteGoods` (`shared/sim/production.ts`) e é o mesmo no servidor, no painel e na IA. A fila
guarda os bens pagos (`ProductionItem.goodsPaid`) e os devolve ao cancelar.

As duas usinas são alvos prioritários dos ataques aéreos da IA. A IA as constrói depois de montar a economia militar.

## Serviços com raio de cobertura

O raio é de 10 células a partir do edifício. O serviço só cobre se estiver pronto, com a manutenção paga e com
trabalhadores. Ao posicionar ou selecionar um serviço, o mapa mostra um anel verde com o raio.

| Serviço | Era | Efeito na área |
|---|---|---|
| Escola (2×2) | 1 | coletas cobertas rendem 10% a mais; tropas formadas em quartel ou fábrica cobertos saem Veteranas (patente 1) |
| Delegacia (1×1) | 1 | os protestos tiram metade da estabilidade, na proporção das moradias cobertas |
| Hospital (2×2) | 2 | tropas próprias recuperam 1,5 de vida por segundo |

Cada serviço dá até +2 de aprovação nacional, proporcional à fração das moradias cobertas. No painel nacional, o fator
aparece como "Hospitais, escolas e delegacias cobrindo os bairros". O cálculo está em `Simulation.serviceCoverage`,
passado à camada nacional por `theaterStats`.

## Vitórias alternativas

Além da queda do Centro de Comando, há duas vitórias alternativas. As duas ficam desligadas no Sandbox.

**Vitória territorial**
- Vence quem controlar 70% de todo o território reivindicado no mapa por 4 minutos seguidos.
- Cair abaixo dos 70% zera a contagem.
- O início, a perda e a vitória são anunciados a todos.

**Vitória política**
- Um governo cai depois de 60 dias seguidos com estabilidade nacional abaixo de 10. O país é derrotado.
- A conta é feita uma vez por dia pela sala, em `Simulation.politicalPressure`.
- Subir acima de 10 zera a contagem.

A barra superior mostra cada contagem em andamento: 🗺 para a territorial e ⚖ para a política. A barra fica verde
quando a contagem favorece o jogador e vermelha quando o ameaça. A tela de resultado mostra o motivo da vitória.

No banco, os motivos `territory` e `political` foram adicionados à restrição de `matches.end_reason`, pela migração
`20261029000000_alternative_victories.sql`.

## Onde está

| O quê | Onde |
|---|---|
| Números | `GOODS`, `GOODS_USE`, `SERVICES` e `VICTORY` em `shared/sim/config.ts`; `AIRCRAFT_FUEL` em `air.ts` |
| Conversão | `Simulation.updateProcessing` |
| Serviços | `Simulation.serviceCovers`, `updateServices` e a veterania na produção |
| Vitórias | `Simulation.updateTerritorialVictory`, `politicalPressure` e `victoryPressure` |
| Modelos 3D | `src/game/render/models/chains.ts` |
| Testes | `shared/test/chains.test.ts`, `shared/test/victory.test.ts` |
