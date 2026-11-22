# Trajetórias no navegador e servidor sobrecarregado (22/11, versão 1.5.5)

Relato de 21/11: partida contra a IA de 50 min (Arquipélago), "o míssil parando e andando no ar aos poucos, bem como
veículos e tropas". O vídeo mostrou o relógio da partida andando 4 s em 12 s reais: o servidor rodava a partida a 1/3
da velocidade (3,2 snapshots/s em vez de 10). O laço do servidor limita o atraso a 250 ms por volta, então a partida
desacelera em vez de pular ticks (o `duration_seconds` do relatório conta ticks e por isso parecia normal).

## O que mudou

**1. Relógio da interpolação no ritmo real** (`src/game/net/interp.ts`). Cada trecho entre snapshots dura pelo menos o
intervalo real médio de chegada. Com o servidor lento, tropas e veículos andam devagar, mas sem parar entre um snapshot
e outro. Teste: `src/test/interp.test.ts` (servidor a 1/3: 239 quadros parados antes, menos de 65 agora).

**2. Mísseis e aviões pela trajetória conhecida** (`shared/sim/snapshot.ts`, `src/game/render/AirLayer.ts`).
- Mísseis: o snapshot leva `at` (tick em que a fase atual começou) e `dur` (duração da fase em ticks). O navegador
  calcula o progresso pela hora estimada do servidor. Antes ele seguia o `progress` arredondado a 0,01: num voo de 30 s
  o valor se repetia por 2 ou 3 snapshots e o míssil parava e pulava **mesmo com o servidor normal**.
- Aviões: o snapshot leva `vx/vy`, a velocidade do centro da esquadrilha (zero no combate aéreo, quando o servidor
  congela o voo). O navegador projeta o centro a partir do último snapshot por até 1,5 s; o seguinte corrige, e a
  perseguição dos aviões (curva de raio limitado) absorve a correção.
- Relógio de previsão (`advancePredictClock`): hora estimada do servidor agora, sem atraso, no ritmo medido do servidor
  (o mesmo do drone), puxada para a última hora recebida sem saltos, nunca volta, parada na pausa.
- Sem os campos novos (servidor antigo), o navegador usa a interpolação de antes.
- Testes: `shared/test/air.test.ts` (a previsão com `vx/vy` e com `at/dur` bate com o servidor).

**3. Separação das unidades mais barata** (`Simulation.separateUnits`). Com 500 tropas amontoadas, um terço do tick
ia para a separação: a linha de uma unidade empurrada além do limite comparava com todas as unidades do mapa. Agora
refaz a âncora da grade com as posições atuais e segue pela grade (exato pelo mesmo motivo da grade), e o raio e a classe
de cada unidade são lidos uma vez por tick. Hash de `scripts/sim-escala.ts hash` idêntico antes e depois; partida pesada
(4 nações, 505 tropas, `scripts/knps-banda.ts` sem as medições de banda): 9,15 → 6,58 ms por tick.

## Medido

- As mudanças de comunicação de 21/11 custam 4% no tick (8,58 → 8,95 ms na partida pesada).
- Simulação pura (IA × IA, 50 min, `sim-economia`): 0,7 ms por tick. O que pesa no fim de partida são os exércitos
  grandes (separação, caminhos, alvos), não a economia nem o envio dos snapshots (≈3%).

## Próximos passos possíveis

Ver a conversa de 22/11: servidor com mais CPU, partida contra a IA rodando no navegador do jogador (o servidor só
guarda e confere), separação a cada 2 ticks para tropas paradas, caminhos em fila com orçamento por tick.
