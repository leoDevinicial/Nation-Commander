# Combustível e correções da análise (03/11)

Pedido do usuário depois da análise do jogo para jogadores: "corrigir tudo", só bombardear onde já explorou, veículos
consumindo petróleo (gasolina da refinaria) como combustível, submarino sem partes soltas e avião voando mais alto.

## Combustível ⛽ (`FUEL` e `fuelPerWorld` em `shared/sim/config.ts`)

- Veículos e navios gastam petróleo ao andar, por unidade de mundo percorrida: blindados leves (APC, antiaérea móvel)
  0,025; pesados (tanque, tanque moderno, artilharia, lança-foguetes, CIWS) 0,04; navios 0,05; porta-aviões 0,1.
  Infantaria, engenheiro, explorador e aeronaves não entram (as missões aéreas já cobram combustível próprio).
- A conta é do país (`PlayerState.fuelAcc`), cobrada em unidades inteiras na manutenção (`Simulation.chargeFuel`):
  primeiro o **Combustível** da Refinaria (cada unidade vale `GOODS.saves` = 2 de petróleo), depois o petróleo.
- Sem nenhum dos dois, o país fica **sem combustível** (`PlayerState.noFuel`): veículos e navios andam a 50%
  (`FUEL.emptySpeedMul`) até chegar petróleo ou combustível. Evento `fuel` (`out`/`ok`) só para o dono; o petróleo fica
  vermelho na barra superior e a dica explica o gasto.
- Ligado por padrão (`Simulation.fuelByDefault`), desligado nas batalhas locais e nos testes de regra antigos
  (`shared/test/setup.ts`); `shared/test/fuel.test.ts` liga com `fuel: true`. Salvamentos antigos carregam sem ele.

## Correções da análise

| Problema | Correção |
| --- | --- |
| Navios pagavam soldo de infantaria | `treasuryInputs` (`server/Room.ts`): navio conta como veículo, 1 a cada 3 tripulantes (mín. 1) |
| Míssil do submarino saía sem US$ (mais barato que o do silo) | `reloadSubs` cobra `MISSILE.usd` do caixa por míssil recarregado |
| Os 4 caças do porta-aviões não usavam pilotos | `recruitsFor(t)` = tripulação + caças embarcados; produção, cancelamento, população e demolição usam a mesma conta |
| Estrada em solo fértil virava planície para sempre | a estrada guarda o terreno anterior (`roads[].prev`); destruída ou demolida, ele volta |
| Porto em lagoa | `placement.ts` exige água grande (`PORT_MIN_WATER` = 120 células ligadas) junto do porto |
| Comércio por mar exigia cargueiro dos dois lados | só o vendedor (quem despacha) precisa de cargueiro |
| Míssil às cegas | o alvo precisa estar numa célula já explorada pelo país (`Simulation.explored`, salvo em bits) ou junto de edifício inimigo já descoberto |
| Demolir pista aérea, silo ou Grande Projeto sem aviso | segundo clique em até 4 s, com o que se perde |
| Ferro curto (30–43% do tempo abaixo de 40) | Mina `ratePerCell` 0,6 → 0,7 |
| IA sem submarinos | `portMix`: 1 submarino de ataque além-mar, 2 se já viu submarino inimigo; vão de escolta com as fragatas |
| Estoques cheios no fim da partida | a IA vende ao mercado mundial o que passa de 85% da capacidade; o combustível vira um gasto contínuo de petróleo |

## Visual

- Submarino lançador: a corcova dos tubos desce até dentro do casco (antes as bordas ficavam soltas sobre a curva do
  cilindro) e os lemes de proa entram no casco.
- Aviões: cruzeiro de 7 para 10; o cargueiro (C-5 e transporte) voa 2,5 mais alto; bombas soltas de 10,5; o paraquedas
  começa a 12.
