# Caixa do país (01/11)

Pedido do usuário depois de uma partida real: "aquele saldo em dinheiro de 75 milhões! Super confuso! Não sei quanto
estou ganhando ou perdendo de dinheiro e de onde vem esse 75 [...] gostaria que ali mostrasse o saldo do país em $ e se
está ganhando ou perdendo com base em ganhos − custos".

Os US$ 75 mi eram a **verba de obras**: um fundo com teto anual (uma fatia do orçamento de infraestrutura) que só pagava
melhorias. Agora ele é o **caixa do país**: sem teto, recebe receitas e paga despesas todo dia de jogo (1 s a 1×).

Onde está:
- **Regra:** `shared/strategic/treasury.ts` (`TREASURY` com os preços, `treasuryDay`); aplicada em
  `NationalSimulation.stepNation` para as nações dos jogadores (as NPCs seguem com o repasse até o teto).
- **Entradas do teatro:** `treasuryInputs` em `server/Room.ts`, dentro de `theaterStats` (`TheaterStats.economy`).
- **Estado:** `works.today` (receitas, despesas e saldo do último dia) em `WorksFund`; `works.fundUsd` é o caixa.
  `works.capUsd` continua sendo o repasse anual, base dos preços de eras, Grandes Projetos e estradas.
- **Interface:** `MoneyChip` (saldo e "+X mil/dia" verde ou vermelho) e `MoneyPopover` (extrato) em
  `src/ui/hud/TopBarExtras.tsx`; aba Orçamento e painel de melhoria falam em "caixa do país".
- **Testes:** `shared/test/treasury.test.ts`; `upgrades.test.ts` (repasse e caixa sem teto).
- **Diagnóstico:** `TREASURY_LOG=1 npx tsx scripts/sim-economia.ts 5 25` imprime o extrato das IAs a cada 2 min.
- **KAC:** o extrato vai só para o dono (`Room.nationViews` filtra a própria nação).

## Receitas (por dia)

| Linha | Cálculo |
|---|---|
| Repasse do orçamento | 1/365 do repasse anual (infraestrutura × PIB × 0,3%), como a antiga recarga |
| Produção | coleta por segundo de cada recurso × preço (comida, madeira, pedra US$ 4,5 mil; carvão e suprimentos 6 mil; ferro 8 mil; petróleo 10 mil); só coletas produzindo |
| Produtividade | produção × (infraestrutura × capital humano − 1), entre −40% e +60% |
| Exportações e acordos | 20% das exportações do dia + 25% do repasse por p.p. de crescimento vindo de acordos comerciais |

## Despesas (por dia)

| Linha | Cálculo |
|---|---|
| Exército | US$ 6 mil por tropa de infantaria, 20 mil por veículo, 40 mil por aeronave |
| Energia | US$ 1,5 mil por unidade de consumo atendida |
| Construções | US$ 400 por célula de área das construções prontas (sem o QG) |
| Estradas | US$ 600 por célula de estrada do jogador |
| Serviços públicos | US$ 20 mil por Hospital, Escola, Delegacia e Prefeitura |

Os preços valem para o PIB de referência (US$ 1 tri, modo paridade); no modo realista, escalam com o PIB do país.

## Medição (IA × IA, seed 5, Normal)

| Minuto | Caixa | Saldo do dia | Receita de produção | Exército |
|---|---|---|---|---|
| 2 | 50 mi | +262 mil | 39 mil | 6 mil |
| 10 | 123 mi | +268 mil | 151 mil | 24 mil |
| 16 | 160 mi | +208 mil | 213 mil | 104 mil |
| 24 | 170 mi | +92 mil | 219 mil | 114 mil |

O saldo cai conforme o exército e a base crescem; com 20 veículos sem produção, fica negativo. O caixa negativo bloqueia
melhorias, estradas, eras e projetos até voltar ao positivo.
