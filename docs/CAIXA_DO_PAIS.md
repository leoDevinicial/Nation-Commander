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
| Acordos comerciais | 25% do repasse por p.p. de crescimento vindo de acordos comerciais |
| Vendas no comércio (02/11) | o valor inteiro de cada carga entregue no dia (`docs/COMERCIO.md`); compras e fretes viram despesa |

## Despesas (por dia)

| Linha | Cálculo |
|---|---|
| Exército | US$ 2 mil por tropa de infantaria, 7 mil por veículo, 14 mil por aeronave (08/11: antes 6, 20 e 40 mil); navio paga 1 veículo por 3 tripulantes, pesqueiro nada |
| Energia | US$ 1,5 mil por unidade de consumo atendida |
| Construções | US$ 400 por célula de área das construções prontas (sem o QG) |
| Estradas | US$ 600 por célula de estrada do jogador |
| Serviços públicos | US$ 20 mil por Hospital, Escola, Delegacia e Prefeitura |
| Compras no comércio (02/11) | o valor de cada carga recebida no dia |
| Pesquisa nacional | enquanto uma pesquisa corre: `techDailyUsd` = 15 mil + 12 mil por nível na árvore (+15 mil nas de era mínima); prazo = `minDays` da tecnologia |

**Sem dívida (02/11).** Não existe mais dívida pública: guerra, missão de contato, ajuda externa e operações saem do
caixa (em dias de repasse, `CAIXA_DAYS`), e o comércio entra e sai dele direto. Ver `docs/COMERCIO.md`.

**Pesquisa paga por dia.** A pesquisa nacional não usa mais o % de P&D do orçamento (a linha saiu da aba Orçamento):
o custo diário entra como despesa do dia. Quem ganha 300 mil por dia e pesquisa algo de 40 mil fica com 260 mil até a
pesquisa terminar. Se o caixa não cobre o dia, a pesquisa não anda nesse dia (`research.stalled`, aviso na aba
Pesquisa). Nações da IA não têm caixa e avançam como antes, um dia por dia.

Os preços valem para o PIB de referência (US$ 1 tri, modo paridade); no modo realista, escalam com o PIB do país.

## Medição (IA × IA, seed 5, Normal; antes do corte do exército em 08/11)

| Minuto | Caixa | Saldo do dia | Receita de produção | Exército |
|---|---|---|---|---|
| 2 | 50 mi | +262 mil | 39 mil | 6 mil |
| 10 | 123 mi | +268 mil | 151 mil | 24 mil |
| 16 | 160 mi | +208 mil | 213 mil | 104 mil |
| 24 | 170 mi | +92 mil | 219 mil | 114 mil |

Navios pagam um veículo por 3 tripulantes; o pesqueiro, civil e sem tripulação militar, não paga nada (08/11: antes
cada um contava como um veículo, e três por porto pesavam como três tanques).

O saldo cai conforme o exército e a base crescem; com uns 30 veículos sem produção, fica negativo. O caixa negativo bloqueia
melhorias, estradas, eras e projetos até voltar ao positivo.
