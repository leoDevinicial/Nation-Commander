# Recalibragem de recursos — economia mais apertada no início

**Status:** aplicada. As seções 1 a 5 são a proposta original (diagnóstico, dados medidos, valores, plano e critérios). A
seção 6 diz o que foi implementado, onde a implementação se afastou da proposta e por quê, e os resultados da validação.

Objetivo: aproximar a sensação do _Rise of Nations_, em que é comum faltar recurso no começo da partida e o jogador
precisa escolher no que focar (economia, exército ou tecnologia). Hoje a economia cresce rápido demais, os armazéns
transbordam e quase nada obriga a escolher.

Relacionado: `docs/BALANCEAMENTO_E_PROGRESSAO.md` (lote 1, diagnóstico geral; lote 2, item 4, teto de comércio).

---

## 1. Diagnóstico

### 1.1 Edifícios de coleta se pagam em segundos

Valores atuais de `shared/sim/config.ts`, com todas as células do edifício ocupadas:

| Edifício         | Custo                       | Rende                          | Se paga em |
| ---------------- | --------------------------- | ------------------------------ | ---------- |
| Fazenda          | 60 madeira                  | 8 células × 0,5 = 4 comida/s   | **15 s**   |
| Serraria         | 60 suprimentos              | 10 células × 0,4 = 4 madeira/s | **15 s**   |
| Pedreira         | 80 madeira                  | 8 células × 0,35 = 2,8 pedra/s | ~29 s      |
| Mina             | 80 madeira + 40 suprimentos | 6 células × 0,45 = 2,7 ferro/s | ~44 s      |
| Poço de Petróleo | 80 madeira + 60 pedra       | 3 petróleo/s                   | ~47 s      |

Mesmo somando os 3 cidadãos (40 comida cada), tudo se paga em menos de 1 minuto. A economia dispara nos primeiros 2 a 3
minutos.

### 1.2 Outras fontes de folga

- **Suprimentos sem esforço:** o QG rende 3/s e a logística nacional cerca de 1,5/s, sem trabalhador nem decisão
  (~270 por minuto).
- **População quase de graça:** `FOOD_UPKEEP_PER_POP = 0.02`. Uma fazenda (4/s) alimenta 200 habitantes, o teto do jogo.
- **Início folgado:** `STARTING_RESOURCES` = 300 suprimentos, 150 comida, 250 madeira, 120 pedra, 60 ferro, 50 petróleo.
  Dá para erguer de imediato 2 fazendas, 2 serrarias e a base militar.
- **Trabalhadores pesam pouco:** 3 trabalhadores bastam para uma fazenda a pleno; o cidadão custa 40 comida e sai em 6 s.
- **Limites burocráticos:** o que trava é a capacidade dos armazéns, e um silo custa 100 em recursos. Não há escolha,
  só mais um depósito.

### 1.3 Problemas revelados pelas simulações

- **A IA tática tem ordem de construção fixa** (`plan` em `shared/sim/TacticalAI.ts`). Com economia folgada isso passa
  despercebido; com economia apertada ela trava (seção 3.3).
- **O início varia muito entre mapas:** em alguns mapas a primeira serraria alcança poucas árvores. Com renda apertada,
  um começo ruim vira desvantagem enorme.
- **O ferro esgota por volta de 20 minutos** (já acontece hoje): as minas perto da base acabam e a IA não procura
  outros veios.
- **Com a economia atual, a IA não pesquisa** em alguns mapas: a pedra fica presa e falta para o Centro de Pesquisa.

---

## 2. Proposta

### 2.1 Valores

| Parâmetro              | Onde                        | Atual                              | Proposto (simulado) | Ajuste fino sugerido |
| ---------------------- | --------------------------- | ---------------------------------- | ------------------- | -------------------- |
| Fazenda `ratePerCell`  | `BUILDINGS.farm.gather`     | 0,5                                | 0,25                | 0,25                 |
| Serraria `ratePerCell` | `BUILDINGS.sawmill.gather`  | 0,4                                | 0,22                | 0,22                 |
| Pedreira `ratePerCell` | `BUILDINGS.quarry.gather`   | 0,35                               | 0,35 (sem mudança)  | **0,25**             |
| Mina `ratePerCell`     | `BUILDINGS.mine.gather`     | 0,45                               | 0,3                 | 0,3                  |
| Poço `ratePerCell`     | `BUILDINGS.oil_well.gather` | 3                                  | 1,8                 | 1,8                  |
| Renda do QG            | `BUILDINGS.hq.income`       | 3 suprimentos/s                    | 1,5                 | 1,5                  |
| Consumo de comida      | `FOOD_UPKEEP_PER_POP`       | 0,02                               | 0,05                | **0,04**             |
| Recursos iniciais      | `STARTING_RESOURCES`        | 300 sup / 150 comida / 250 madeira | 200 / 100 / 150     | 200 / 100 / 150      |
| Cidadão                | `CITIZEN`                   | 40 comida, 6 s                     | 50 comida, 10 s     | 50 comida, 10 s      |

A coluna "Ajuste fino sugerido" corrige o que as simulações mostraram (seção 3): a pedra virou sobra e a comida ficou
apertada demais.

### 2.2 Custos crescentes (estilo _Rise of Nations_)

- Cada edifício novo de um tipo custa **+18%** a mais por edifício do mesmo tipo que o jogador já tem (concluído ou em
  obra): `custo = custo_base × 1,18^n`, arredondado para múltiplos de 5.
- Vale para: fazenda, serraria, pedreira, mina, poço, casa, prédio residencial, armazém, silo, tanque de petróleo, base
  militar, fábrica, torre, terminal comercial e bateria antiaérea.
- Ficam de fora: Centro de Comando, Centro de Pesquisa, base aérea, silo de mísseis e os Grandes Projetos, que já são
  caros ou únicos.
- Edifícios destruídos deixam de contar.
- O painel de construção deve mostrar o custo atual e o próximo.

### 2.3 Produção por trabalhador (não incluída na simulação)

A produção do edifício passa a crescer com cada trabalhador, até cerca de 6, em vez de 3 bastarem para o pleno. Com o
cidadão mais caro, formar população volta a competir com formar tropas.

### 2.4 Mudanças necessárias fora dos números

1. **IA que reage ao gargalo:** trocar a lista fixa de construção por uma avaliação do recurso que mais falta (estoque,
   renda e o que ela quer construir a seguir), construindo o coletor certo, inclusive em depósitos mais distantes quando
   os próximos se esgotam. A IA também deve usar o custo crescente na decisão.
2. **Início garantido no gerador de mapas** (`shared/sim/MapGen.ts`): mínimo de células livres de floresta, solo fértil,
   rocha e minério ao alcance da primeira instalação de cada tipo perto do ponto inicial.
3. **Período de preparo e ondas da IA:** com menos renda, a partida fica mais longa. Rever `PREPARATION_TICKS`,
   `AI_FIRST_WAVE` e `AI_WAVE_COOLDOWN_TICKS`.
4. **Teto de comércio** (lote 2, item 4): opcional, para frear a bola de neve no meio da partida.

---

## 3. Dados das simulações

Partidas de **IA contra IA, 25 minutos**, com `TacticalAI` nos dois lados, sem camada nacional e logística externa
fixa de 1,5 suprimento/s. A guerra é declarada quando a IA pede. Percentuais medidos uma vez por segundo.

A versão "recalibrada" aplicou: os valores da coluna "Proposto (simulado)" e os custos crescentes de +18%. O consumo de
comida extra (0,05 − 0,02) foi descontado pelo script, porque `FOOD_UPKEEP_PER_POP` é constante. A produção por
trabalhador **não** foi incluída.

### 3.1 Seed 7: a recalibragem funcionou

|                                | Atual                            | Recalibrada                              |
| ------------------------------ | -------------------------------- | ---------------------------------------- |
| Aos 2:30                       | 4 fazendas, 3 serrarias          | 2 fazendas, 1 serraria                   |
| Comida com armazém ≥ 95%       | 67% do tempo                     | **0%**                                   |
| Madeira com armazém ≥ 95%      | 69%                              | 15%                                      |
| Suprimentos com armazém ≥ 95%  | 33%                              | 21%                                      |
| Comida abaixo de 40            | 9%                               | 76%                                      |
| Ferro abaixo de 40             | 42%                              | 51%                                      |
| Pesquisas militares concluídas | 0                                | 4                                        |
| Maior exército                 | 28                               | 15                                       |
| Resultado                      | vitória de P0 por volta de 20:40 | em andamento aos 25:00, exércitos 12 × 8 |

Valores de P0; P1 teve comportamento parecido.

### 3.2 Seed 11, economia atual (referência)

- Comida com armazém ≥ 95%: 71% (P0) e 76% (P1) do tempo.
- Ferro abaixo de 40: 59% do tempo nos dois jogadores; as minas se esgotam por volta dos 15 minutos.
- Vitória de P0 antes dos 25 minutos, exércitos finais 38 × 0.

### 3.3 Seed 11, recalibrada: a IA travou

- A IA ficou **20 minutos com 1 fazenda e 1 serraria**. A madeira entrava a 0,7/s e faltou em 50% do tempo.
- Os suprimentos ficaram no teto em 71% do tempo, sem uso.
- A pedra acumulou até 1.745.
- A guerra só foi declarada aos 24:07.
- Causa: a ordem fixa da IA exige a Base Militar (100 madeira) antes da segunda serraria, e a serraria desse mapa
  alcança poucas árvores.

### 3.4 Teste anterior: só taxas reduzidas (sem custos crescentes, 15 minutos, seed 11)

- Madeira abaixo de 40: de 22% para 43% do tempo.
- Comida com armazém ≥ 95%: de 63% para 25%.

### 3.5 Conclusões

- A recalibragem cria escassez real e escolhas no começo da partida, e alonga a partida.
- Ela só funciona junto com a IA que reage ao gargalo e com o início garantido no mapa.
- Pedra precisa de corte (pedreira 0,25) e comida de alívio (consumo 0,04).
- Ressalva: são partidas de IA contra IA. Um jogador humano reage melhor ao gargalo; para ele, o resultado deve ficar
  entre as duas versões.

---

## 4. Plano de implementação

Ordem sugerida, cada passo validado antes do seguinte:

1. **IA que reage ao gargalo** (`shared/sim/TacticalAI.ts`), ainda com a economia atual. Os testes de IA existentes
   (`shared/test/geopolitics.test.ts` e outros) devem continuar passando.
2. **Início garantido no mapa** (`shared/sim/MapGen.ts`), com teste em `shared/test/mapgen.test.ts` cobrindo várias seeds.
3. **Custos crescentes:** função pura em `shared/sim/config.ts` (ou `shared/sim/placement.ts`), por exemplo
   `buildingCost(type, existingCount)`, usada pelo servidor ao validar e cobrar a obra, pela IA e pelo painel do cliente
   (`src/ui/hud/CommandPanel.tsx`). O custo do cancelamento e do reembolso deve usar o valor efetivamente pago.
4. **Novos valores** da seção 2.1 (coluna "Ajuste fino sugerido").
5. **Produção por trabalhador** (seção 2.2/2.3).
6. **Preparo e ondas da IA** (seção 2.4, item 3).
7. **Documentação:** atualizar o `README.md` (tabela de recursos e taxas) e o `docs/FASE3_POPULACAO_FRONTEIRAS.md`.

**Testes que provavelmente precisarão ser revistos:** os que dependem das taxas, custos e recursos iniciais atuais, em
especial `shared/test/economy.test.ts`, `shared/test/simulation.test.ts`, `shared/test/production.test.ts` e
`shared/test/upgrades.test.ts`.

---

## 5. Critérios de validação

Rodar o script do apêndice em pelo menos 5 seeds, 25 minutos cada, com os valores finais. Metas:

| Métrica                                                            | Meta                       |
| ------------------------------------------------------------------ | -------------------------- |
| Comida, madeira e suprimentos com armazém ≥ 95%                    | menos de 20% do tempo cada |
| Algum recurso abaixo de 40 nos primeiros 8 minutos                 | em todas as seeds          |
| Nenhum recurso abaixo de 40 por mais de 60% do tempo               | em todas as seeds          |
| IA travada (sem nova coleta por mais de 5 minutos antes dos 15:00) | nunca                      |
| Primeira pesquisa militar da IA                                    | antes dos 12:00            |
| Partida entre IAs equivalentes decidida antes dos 25:00            | menos da metade das seeds  |
| Diferença entre os dois jogadores na mesma seed                    | pequena (mapa simétrico)   |

Depois, partidas humanas contra a IA para confirmar a sensação.

---

## 6. Implementação

Feita sobre o rebalanceamento de custos de [`ECONOMIA.md`](ECONOMIA.md) (custos 1,25× a 3× maiores, começo com 6
cidadãos e 1 Explorador), que veio antes desta recalibragem.

### 6.1 Valores aplicados

| Parâmetro              | Antes                              | Agora                     | Observação                                        |
| ---------------------- | ---------------------------------- | ------------------------- | ------------------------------------------------- |
| Fazenda `ratePerCell`  | 0,5 (×0,8)                         | 0,5                       | com **6** trabalhadores (eram 3)                  |
| Serraria `ratePerCell` | 0,4 (×0,8)                         | 0,44                      | 6 trabalhadores                                   |
| Pedreira `ratePerCell` | 0,35 (×0,8)                        | 0,5                       | 6 trabalhadores                                   |
| Mina `ratePerCell`     | 0,45 (×0,8)                        | 0,6                       | 6 trabalhadores                                   |
| Poço `ratePerCell`     | 3 (×0,8)                           | 3,6                       | 4 trabalhadores (eram 2)                          |
| Renda do QG            | 3 suprimentos/s                    | 1,5                       |                                                   |
| `FOOD_UPKEEP_PER_POP`  | 0,02                               | 0,04                      |                                                   |
| Cidadão                | 50 comida, 6 s                     | 50 comida, 10 s           |                                                   |
| `STARTING_RESOURCES`   | 200 sup / 150 comida / 200 madeira | 200 / 100 / 150           | pedra 60, ferro 0, petróleo 50                    |
| Custo crescente        | —                                  | +18% por edifício do tipo | `buildingCost` em `shared/sim/config.ts`          |
| Avanço de era          | ×1,6                               | ×1,25                     | era 2: 375 sup, 250 madeira, 190 pedra, 100 ferro |

**Produção por trabalhador (§2.3) e as taxas.** A proposta simulou as taxas da coluna "Ajuste fino" com 3 trabalhadores por
coleta e não simulou os 6. Aplicar as duas coisas juntas cortava pela metade o que cada cidadão produz: a IA estacionava
com 1 fazenda e 1 serraria, sem conseguir formar gente, e nenhum critério da seção 5 passava. A taxa por célula foi então
dobrada em relação ao "Ajuste fino". Assim cada **trabalhador** rende o que a proposta simulou, e a coleta só chega ao
rendimento cheio com 6 pessoas: a população vira o recurso que limita a economia, como pedia o §2.3. O consumo de 0,04 e o
cidadão de 50 de comida e 10 s ficaram como propostos.

**Distribuição dos cidadãos.** Os ociosos agora entram nos postos vagos em rodízio, um por edifício de cada vez
(`Simulation.staff`). Antes o edifício mais antigo absorvia todos (a primeira serraria ficava com 6 e a fazenda com 1).

### 6.2 Custo crescente (§2.2)

- `buildingCost(type, existentes)` e `ownedOfType` em `shared/sim/config.ts`. Os tipos estão em `ESCALATING_BUILDINGS`,
  a lista da proposta.
- O servidor cobra o custo crescente (`Simulation.buildingCostFor`) e a validação usa o mesmo valor (`placementError`).
  Não há reembolso de obra, então não há custo pago a guardar.
- No menu de construção, o cartão mostra o custo atual. A dica diz quantos o jogador tem e quanto custará o seguinte, e
  durante o posicionamento aparece "o próximo: …" (`ownBuildingCounts` no HUD).

Exemplo: fazendas a 95, 110, 130 e 155 de madeira; Base Militar a 200, 235 e 280 de madeira.

### 6.3 IA que reage ao gargalo (§2.4, item 1)

`TacticalAI.think`:

- **Desejos.** A IA soma o que quer pagar em seguida: 2 cidadãos, a próxima construção-chave (quartel → Centro de
  Pesquisa → fábrica), uma casa quando falta moradia, a próxima era (ou a melhoria do QG que ela exige), 2 infantarias,
  1 tanque e a primeira pesquisa. Para cada recurso, calcula quantos segundos de coleta faltam com a renda atual.
- **Próxima coleta.** O coletor do recurso mais atrasado é a próxima obra. Passa na frente da base militar quando o atraso
  é grave (mais de 60 s); fica na posição normal quando passa de 30 s.
- **Falta de gente.** Com 4 ou mais postos vagos, a IA não ergue outra coleta. Forma cidadãos e, se as fazendas estão
  cheias e a comida rende menos de 3/s, ergue outra fazenda.
- **Trabalhadores.**
  - Com a comida abaixo de 0,8/s (ou abaixo de 2/s com falta de gente), um trabalhador de outra coleta passa para a
    fazenda.
  - Fora disso, a coleta mais atrasada com posto vago recebe um trabalhador da mais folgada.
  - Centro de Pesquisa, quartel e fábrica sem ninguém recebem um cidadão da maior coleta.
- **Reservas.**
  - A primeira obra do plano que espera recursos tem o custo reservado: as obras seguintes, as melhorias e as tropas só
    usam a sobra.
  - Os cidadãos são formados antes das obras e guardam 20 de comida.
  - A pesquisa é planejada antes das melhorias, e a primeira tem reserva até ser paga.
- **Ordem da progressão.** Quartel → QG 3 → era 2 → Centro de Pesquisa → fábrica. A pesquisa destrava os blindados, então
  vem antes deles.
- **Depósitos esgotados.** A IA procura sítios também em volta das torres e prefeituras. Se o gargalo não tem sítio no
  território, ergue uma torre perto do depósito livre mais próximo (até 30 células, no máximo 3 torres). O custo
  crescente entra em todas as decisões.
- **Guarnição mínima.** Com o quartel pronto, a partir dos 4 min ou em guerra, a IA mantém 2 tropas além do explorador.
  Enquanto não as tem, as tropas vêm antes das reservas.
- **Explorador.** Faz uma ronda em volta da base, a 18 células, e passa pelo centro do mapa.

### 6.4 Início garantido no mapa (§2.4, item 2)

A proposta cita `MapGen.ts`, mas as partidas usam `generateMatchMap` (`shared/sim/matchMap.ts`). Mudanças:

- O veio de minério do kit de cada base aflora do lado voltado à base, com raio de 2,2 a 2,6 células (1,0 a 1,8 antes),
  e a rocha perto da base cresceu.
- Nos mapas de 3, 5 e 6 nações, cada disco do kit é pintado inteiro em volta do centro girado. Antes cada célula era girada
  e arredondada, e o disco perdia células.
- Nesses mapas a estrada para o centro é uma linha reta (largura 2, passagem ortogonal contínua). Antes era um caminho em
  escada que cortava os recursos da base.
- Os discos do kit são repintados depois das estradas, sem cobrir a estrada.

**Teste** (`shared/test/matchMap.test.ts`): a melhor posição da primeira fazenda, serraria, pedreira e mina de cada nação
reivindica o máximo de células. Cobre:

- todos os tipos de mapa;
- 2, 3 e 6 nações;
- os 5 perfis de país;
- seeds 1 e 2.

Na medição manual com as seeds 1 a 4, 2 a 6 nações e todos os perfis, só um caso ficou abaixo: Rios e Pontes, 5 nações,
perfil agrícola, seed 3, com a mina alcançando 5 de 6 células.

### 6.5 Preparo e ondas (§2.4, item 3)

O preparo e o tamanho das ondas ficaram como estavam. Com a economia mais lenta, a IA atacava com o que tinha depois de 3
min sem crescer o exército e perdia tudo no contra-ataque. Mudanças:

- `AI_STALL_TICKS` passou de 180 s para 300 s;
- `AI_MIN_WAVE` passou de 6 para 8;
- 3 tropas ficam na base quando a onda sai (`AI_HOME_GUARD`).

O teto de comércio (item 4) não foi feito.

### 6.6 Resultados

`scripts/sim-economia.ts`: IA contra IA no mapa das partidas de 2 nações, 25 min, sem camada nacional e com logística
externa fixa de 1,5 suprimento/s.

- **Mudança na métrica de trava.** A versão do apêndice media "sem coleta nova". Aqui a métrica é "sem coleta nova **e**
  sem cidadão novo empregado": com 6 postos por coleta, a economia também cresce enchendo as coletas que já existem.
- **Valores medidos em 12 seeds (1 a 12):**
  - armazém de comida, madeira ou suprimentos quase cheio: no máximo 4% do tempo;
  - primeira pesquisa militar entre 11:30 e 11:42;
  - maior pausa sem crescimento: 3:22;
  - nenhuma partida decidida antes dos 25:00;
  - os dois lados de cada seed com a mesma economia.

| Critério (seção 5)                                                    | Seeds 1–12 |
| --------------------------------------------------------------------- | ---------- |
| Comida, madeira e suprimentos com armazém ≥ 95% menos de 20% do tempo | ✓          |
| Algum recurso abaixo de 40 nos primeiros 8 min                        | ✓          |
| Nenhum recurso abaixo de 40 por mais de 60% do tempo                  | ✓          |
| IA nunca travada antes dos 15:00                                      | ✓          |
| Primeira pesquisa militar antes dos 12:00                             | ✓          |
| Menos da metade das partidas decididas antes dos 25:00                | ✓          |

Para comparar: com os custos de [`ECONOMIA.md`](ECONOMIA.md) e as taxas antigas, a madeira ficava cheia até 42% do tempo
e a IA passava até 10 min sem coleta nova.

**Testes ajustados.** Com a economia mais lenta, dois testes passaram a esperar menos tropas:

- em 6 min de guerra, a IA forma pelo menos 2 tropas;
- no Fácil, até os 13 min só sai a guarnição do preparo (4 tropas).

Os testes de regra que dependiam de 3 trabalhadores leem `BUILDINGS.*.workers`.

**Falta ver.** Partidas humanas contra a IA, para confirmar a sensação.

## Apêndice — script de simulação

O script está em `scripts/sim-economia.ts`. Ele usa o mapa das partidas e os valores do código, sem alterar nada em
memória:

```bash
npx tsx scripts/sim-economia.ts 7 25          # seed 7, 25 minutos, estado de P0 a cada 2:30
npx tsx scripts/sim-economia.ts 1,2,3,4,5 25  # várias seeds e a tabela de critérios da seção 5
```
