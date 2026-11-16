# Proposta: o orçamento governa o país do cenário (16/11, para aprovação)

Pedido do responsável: o painel de orçamento deve mudar o país que está no mapa, como em Cities: Skylines, e não uma
"instância fictícia" do país; os países não começam mais com vantagem financeira ou de recursos vinda dos dados reais,
mas mantêm os bônus únicos (`shared/sim/countryBonus.ts`, ex.: Brasil 25% mais rápido na floresta).

## O que está errado hoje

- Existem duas economias. O **caixa** já é do cenário: entram produção, impostos dos lotes e vendas; saem exército,
  energia, prédios, estradas e serviços (`shared/strategic/treasury.ts`). Ao lado dele roda uma **macroeconomia com
  dados reais** (PIB, inflação, desemprego, déficit, aprovação) que o painel de orçamento controla.
- A única ponte é o **repasse do orçamento**: uma fatia de "infraestrutura % do PIB" vai para o caixa. Infraestrutura no
  máximo multiplica o repasse por 12 (o "+US$ 1 mi/dia" do teste do usuário), e o custo só aparece como déficit, que sem
  dívida pública vira só uma inflação lenta, enquanto o "impulso fiscal" ainda soma crescimento.
- Com "Escala real", o PIB real define logística e verba: EUA e China começam muito à frente.

## Proposta

### 1. Uma economia só: a do mapa

- O **PIB** passa a ser o valor do que o país produz no cenário por dia (coletas, indústrias e lotes) vezes 365. Ele
  cresce porque a cidade cresce, não por fórmula com dados reais.
- O **repasse do orçamento** deixa de existir. O caixa vive de impostos e produção, como uma prefeitura de Cities.
- Inflação, desemprego e déficit "% do PIB" saem do painel (não há mais o que os gere). Desemprego vira o que já existe
  no mapa: cidadãos ociosos.

### 2. Receitas: impostos

| Imposto | Hoje | Proposta |
|---|---|---|
| Residencial, comercial, industrial | alíquota do zoneamento, escondida no painel de zonas | as três no topo do painel de orçamento (0–30%); mais imposto = mais caixa por lote, menos atratividade (lotes crescem menos e abandonam mais) e menos aprovação, como em Cities |
| Produção do Estado (fazendas, minas, serrarias...) | 100% vira caixa | segue igual |

### 3. Despesas: investimento por área (50% a 150%, como os orçamentos de serviço de Cities)

Cada área tem um nível de financiamento. 100% é o custo de referência (o que hoje já sai do caixa como "serviços
públicos" ou manutenção). Abaixo de 100% economiza caixa e perde efeito; acima, custa mais e rende mais, com retorno
decrescente. Cada linha mostra o custo por dia e o efeito, e o efeito é sobre coisas do mapa:

| Área | Custo sai de | Efeito no cenário |
|---|---|---|
| **Defesa** | caixa (por dia) | suprimentos/s da logística (hoje vem do PIB real) e moral: abaixo de 75%, tropas recuperam vida mais devagar |
| **Infraestrutura** | manutenção de estradas e prédios | velocidade das obras e das melhorias; abaixo de 75% as estradas perdem o bônus de velocidade |
| **Educação** | escolas e universidades | pontos de conhecimento por escola/universidade e raio de cobertura |
| **Saúde** | hospitais | crescimento da população (formação de cidadãos) e aprovação na cobertura |
| **Segurança** | delegacias | aprovação e menos abandono de lotes na cobertura |
| **Pesquisa** | por dia | velocidade das pesquisas (nacional e militar); hoje é um custo à parte |
| **Assistência e administração** | por dia | aprovação geral e estabilidade (protestos das facções) |

### 4. Aprovação e estabilidade feitas do mapa

Aprovação = base + serviços cobertos (Saúde/Educação/Segurança onde há casas) + nível de Assistência − impostos acima de
10% − cidadãos ociosos − guerra recente e perdas + decretos e facções (já existem). Estabilidade segue a aprovação. A
"vitória política" (queda de governo) continua usando a estabilidade.

### 5. Sem caixa

Caixa negativo não existe: se o dia não fecha, as áreas são cortadas por igual até caber (os efeitos caem junto) e um
aviso diz quais. Nada de dívida.

### 6. Dados reais

- **Saem do jogo:** PIB, gasto militar, impostos, inflação, desemprego e população reais. Todo país começa igual
  (fim da escolha "Paridade econômica / Escala real" no lobby).
- **Ficam:** nome, sigla, líderes reais na ficha (curiosidade) e o **bônus único** de cada país.
- **A decidir:** a região inicial (Florestal, Petrolífera, Serrana...) vem da geografia real e já tem compensação
  declarada (mais floresta, menos rocha). Proposta: manter, porque é característica, não vantagem.
- Os países de fora da partida (Globo) seguem com tamanho relativo só para a diplomacia; não influenciam recursos.

### 7. IA e interface

- A IA nacional passa a ajustar impostos e áreas pelas mesmas regras (sobe impostos se o caixa cai, Defesa em guerra,
  Educação quando falta conhecimento).
- Painel "Orçamento" no estilo Sala de Situação: impostos em cima, áreas embaixo, cada uma com custo/dia e o efeito em
  números do jogo ("obras 20% mais rápidas", "+3 conhecimento/min"), e o saldo do dia antes → depois.
- "Visão geral" deixa os gráficos macro e mostra PIB do cenário, população, aprovação, caixa e produção.

## Tamanho

É uma reescrita da camada nacional do jogador (`NationalSimulation`, `treasury`, `BudgetTab`, `OverviewTab`, IA
nacional e testes), com nova calibragem pelo `scripts/sim-economia.ts`. Estimativa: uma entrega grande, em etapas que
sempre deixam o jogo jogável: (1) dados reais fora e economia do mapa; (2) impostos e áreas com efeito; (3) aprovação
do mapa; (4) painel novo e IA.
