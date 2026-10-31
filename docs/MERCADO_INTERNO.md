# Mercado interno (excedente → suprimentos)

Resposta ao gargalo medido em [`RECALIBRAGEM_RECURSOS.md`](RECALIBRAGEM_RECURSOS.md), seção 5.1. Com a camada nacional
ligada, depois dos ~17 min sobravam milhares de comida, madeira, pedra e ferro, e só os suprimentos limitavam. O QG, a
era 3 e as tropas esperavam os suprimentos pingarem, e coletar mais não servia para nada.

## Como funciona

O **Terminal Comercial** (era 2) ganhou um mercado interno no painel do edifício. Ele vende comida, madeira, pedra,
ferro ou petróleo, em lotes de 100 ou 500, e paga em suprimentos na hora.

| Recurso | Preço cheio (suprimentos por unidade) |
|---|---|
| Comida | 0,30 |
| Madeira | 0,25 |
| Pedra | 0,20 |
| Ferro | 0,50 |
| Petróleo | 0,60 |

Os preços seguem a proporção do preço internacional de cada recurso (`BASE_PRICE` do comércio).

- **Pressão de mercado:** cada venda soma a quantidade vendida à pressão daquele recurso. O preço cai para
  `cheio × 1000 / (1000 + pressão)`: com 1.000 vendidos há pouco, vale a metade.
- **Recuperação:** a pressão de cada recurso cai 2 por segundo. Mil unidades vendidas se recuperam em cerca de 8 min.
- **Sem truque de lote:** o pagamento é a integral do preço enquanto a pressão sobe. Vender 10 × 100 rende o mesmo que
  1 × 1.000, fora o arredondamento.
- **Exemplo:** 1.000 de madeira de uma vez rendem 173 suprimentos; 1.000 de ferro rendem 346. Sobras de 1.000 dos
  quatro recursos mais comuns pagam quase a era 3 (875).
- **Recusas:** terminal em obra ou de outro jogador, estoque insuficiente, armazém de suprimentos sem espaço para o
  pagamento.
- A venda não conta como recurso gasto nem coletado nas estatísticas do relatório.

## Compra com suprimentos

O mesmo painel também compra os cinco recursos, em lotes de 100 ou 500, pagando em suprimentos.

- **Preço de compra:** começa em 1,6 × o preço cheio (`MARKET.buySpread`) e sobe com a demanda acumulada daquele
  recurso: `cheio × 1,6 × (1000 + demanda) / 1000`.
- **Sem lucro em comprar e revender:** a compra custa sempre mais do que a venda rende.
- **Sem truque de lote:** o custo é a integral do preço enquanto a demanda sobe, arredondado para cima. Picar a compra
  não sai mais barato.
- **Recuperação:** a demanda cai 2 por segundo, como a pressão da venda.
- **Exemplo:** 100 de ferro custam 84 suprimentos (a venda de 100 rende 47).
- **Recusas:** terminal em obra ou de outro jogador, suprimentos insuficientes, armazém sem espaço para o recurso
  comprado.
- A compra também não entra nas estatísticas de gasto e de coleta.
- **IA:** por enquanto, a IA só vende.

## IA

- Ergue o Terminal Comercial quando tem sobra e menos da metade do armazém de suprimentos.
- Guarda pelo menos 500 (ou metade do armazém) de cada recurso e vende o resto. Faz uma venda a cada 5 s, de 100 a
  500 unidades, do recurso que mais rende.
- Para quando o preço cai abaixo da metade do cheio, ou quando os suprimentos passam de 80% do armazém.

## Efeito medido

`npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 30 <dificuldade>`: duas IAs, 7 seeds, 30 min.

| IAs na era 3 até 30 min | Fácil | Normal | Difícil | Brutal |
|---|---|---|---|---|
| Sem o mercado | 8 de 14 (21–25 min) | 6 de 14 (21–28 min) | 9 de 14 (23–28 min) | 7 de 14 (19–28 min) |
| Com o mercado | 11 de 14 (20–22 min) | 13 de 14 (19–26 min) | 13 de 14 (20–30 min) | 14 de 14 (18–23 min) |

A primeira ofensiva e as tropas formadas até os 15 min não mudaram, porque o mercado só entra na era 2. Os silos e
armazéns quase não enchem mais: a comida cheia caiu de até 45% do tempo para no máximo 16% (Normal e Difícil).

## Onde está

| O quê | Onde |
|---|---|
| Números e cálculo | `MARKET`, `marketPrice`, `marketQuote`, `marketRecover` em `shared/sim/market.ts` |
| Comando | `market_sell` e `market_buy` (`shared/sim/commands.ts`), validados em `Simulation.applyCommand` |
| Estado | `PlayerState.marketPressure` e `marketDemand` (vão no salvamento); `PlayerSnapshot.market` e `marketDemand` só para o dono |
| Painel | `MarketInfo` em `src/ui/hud/CommandPanel.tsx` |
| IA | `TacticalAI.planMarket` e `TacticalAI.surplus` |
| Testes | `shared/test/market.test.ts` |
