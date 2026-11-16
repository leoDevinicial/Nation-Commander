# Orçamento do país do cenário (16/11)

Pedido do responsável: o painel de orçamento deve mudar o país que está no mapa, como em Cities: Skylines, e não uma
"instância fictícia"; os países não começam mais com vantagem financeira ou de recursos vinda dos dados reais, mas
mantêm os bônus únicos. Proposta aprovada em `docs/PROPOSTA_ORCAMENTO_NO_CENARIO.md` ("cuidar pra não ficar fácil
demais ganhar dinheiro, e o contrário também"); a região inicial pelo país ficou como estava.

## Onde está

| O quê | Arquivo |
|---|---|
| Áreas, limites, custos e efeitos | `shared/strategic/areas.ts` (`AREA_KEYS`, `AREA_COST`, `SERVICE_AREA`, `AREA_FX`, `taxApproval`) |
| Caixa do dia (receitas, despesas, linhas por área) | `shared/strategic/treasury.ts` (`treasuryDay`, `TREASURY`) |
| Passo diário do país do mapa | `NationalSimulation.treasuryStep`, `mapEconomy`, `updateMapApproval`, `syncBudget`, `setAreas` |
| Valores neutros de partida, base de preços, aprovação | `shared/strategic/params.ts` (`NEUTRAL_NATION`, `PRICE_BASE_USD`, `MAP_APPROVAL`, `diploSize`) |
| Efeitos no teatro | `areaModifiers` → `TacticalModifiers.knowledgeMul`/`citizenTimeMul` e `constructionTimeMul` (`server/Room.ts`, `scripts/sim-economia.ts`) |
| Comando | `{ t: 'national', cmd: { type: 'set_areas', areas } }` (validado em `server/messages.ts`); `set_budget` antigo vira níveis |
| IA | `NationalAI.think` devolve `areas`; `setAreasUncapped` deixa a Defesa da IA passar de 150% na dificuldade alta |
| Interface | `src/ui/national/BudgetTab.tsx` (impostos + áreas), `OverviewTab.tsx`, `DiagnosisTab.tsx`, `CountryCard.tsx` |
| Testes | `shared/test/national.test.ts` (modelo nacional), `treasury.test.ts`, `diplomacy.test.ts`, `policies.test.ts` |

## Regras

**Todos começam iguais.** As nações da partida nascem com `NEUTRAL_NATION` (sem PIB, impostos, gastos ou população
reais). A opção "Escala real" saiu do lobby; salvamentos antigos com ela voltam em paridade. Ficam o nome, os líderes (na
ficha, como curiosidade), o bônus único (`countryBonus.ts`) e a região inicial. Os países de fora da partida (Globo)
mantêm os dados reais só para o tamanho relativo na diplomacia (`diploSize`: as nações do mapa contam como US$ 1 tri).

**Uma economia só, a do mapa.** O antigo "repasse do orçamento" (uma fatia de infraestrutura % de um PIB fictício)
acabou. O caixa recebe por dia:

| Receita | Como |
|---|---|
| Produção | coletas e indústrias × preço (`TREASURY.price`) |
| Produtividade | produção × (índice de infraestrutura × capital humano − 1) |
| Acordos comerciais | 20% da produção por ponto de crescimento vindo dos acordos (até 1) |
| Imposto dos cidadãos | US$ 2.200 por cidadão a 10% (escala com a alíquota residencial) |
| Imposto dos lotes | por lote ativo, como no zoneamento, com valores 2,5× maiores |
| Comércio | vendas entregues |

Os Grandes Projetos rendem receita a mais (cada ponto de `growth` = +10%; Centro Financeiro +25% além disso); sanções
sofridas tiram 10% por ponto (até 40%); a inflação dos decretos (economia de guerra) tira 5% por ponto.

**Despesas por área (50% a 150%).** 100% é o custo de referência; a linha do extrato escala com o nível.

| Área | Paga | Efeito no cenário |
|---|---|---|
| Defesa | US$ 15 mil/dia | suprimentos/s da logística (`theaterSupply` sobre a verba de referência × nível) |
| Infraestrutura | manutenção de prédios e estradas | obras (tempo ÷ 0,75+0,25·nível) e o índice de infraestrutura (alvo 0,4+0,65·nível: 1,05 a 100%; o QG 8 pede 1,02, então cortar a Infraestrutura abaixo de ~95% trava o QG 8) |
| Educação | escolas e universidades | conhecimento formado (×0,5+0,5·nível) e capital humano |
| Saúde | hospitais | formação de cidadãos (×0,7+0,3·nível) e peso da cobertura na aprovação |
| Segurança | delegacias | peso da cobertura na aprovação (e protestos mais fracos, como antes) |
| Pesquisa | o dia da pesquisa em andamento | ritmo das pesquisas nacionais (×0,5+0,5·nível); a pesquisa militar acompanha |
| Assistência e administração | US$ 8 mil/dia + prefeituras | aprovação direta (14 × (nível − 1)) |

Missões diplomáticas (US$ 4 mil/dia cada) e alianças com países de fora (US$ 10 mil/dia) também saem do caixa.

**Sem caixa.** Se o dia não fecha, as áreas são cortadas por igual (de 10 em 10%, até 50%) e um aviso diz quais; os
efeitos caem junto. O caixa nunca fica negativo: o que faltar fica sem pagar (`works.shortUsd`) e pesa na aprovação.

**Preços em US$.** Estradas, pesquisas militares, eras, Grandes Projetos e taxas de obra custam frações de uma base
fixa (`PRICE_BASE_USD`, US$ 75 mi), igual para todos e para qualquer orçamento (antes subir a infraestrutura
encarecia tudo). O caixa começa com 40% dela.

**PIB e indicadores.** PIB = (produção + produtividade + produção privada dos lotes) × 365, suavizado; crescimento =
PIB contra a média de 30 dias; "desemprego" = cidadãos ociosos. Inflação e déficit "% do PIB" saíram do país do mapa.

**Aprovação feita do mapa** (`updateMapApproval`, base 50): impostos (10% neutro; 0,8 ponto por ponto de alíquota
média, de +8 a −16), Assistência, serviços cobrindo os bairros (4 pontos por serviço completo a 100%), cidadãos ociosos
(depois de 3 min e com 10 ou mais cidadãos, até −6), crescimento do PIB, contas sem pagar (−8) ou cortes (−3), baixas e
vitórias, sanções, decretos e facções, bairros pavimentados, energia, minas esquecidas e o choque nuclear. As facções
pedem níveis do orçamento ("Defesa em pelo menos 130%", "Educação, Saúde e Assistência em 100%") e os Sindicatos, no
máximo 10,5% de cidadãos ociosos.

## Calibragem

`npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25` (critérios de `docs/RECALIBRAGEM_RECURSOS.md`, seção 5), contra a
versão anterior na mesma máquina:

- era 2 nos mesmos tempos; era 3 mais cedo (critério "era 3 até 22:00" passou a ser cumprido); IA nunca travada;
- caixa das IAs: ~29 mi aos 2 min (antes 45 mi), ~110 mi aos 16 min e ~200 mi aos 20 min (antes 200–290 mi): mais
  apertado no começo, sem ficar sobrando no fim;
- um jogador parado (só o QG) perde uns US$ 9 mil por dia: o começo pede que se monte a economia, mas sem pressa
  (o caixa inicial dura bem mais que a partida inteira nesse ritmo).

Diagnóstico: `TREASURY_LOG=1 npx tsx scripts/sim-economia.ts 2 25` imprime o extrato das IAs a cada 2 min.
