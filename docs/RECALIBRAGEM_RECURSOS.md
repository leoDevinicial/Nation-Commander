# Recalibragem de recursos — economia mais apertada no início

**Status:** proposta, ainda **não aplicada** ao código. Este documento reúne o diagnóstico, os dados medidos, os valores
propostos e o passo a passo para implementar e validar a mudança.

Objetivo: aproximar a sensação do *Rise of Nations*, em que é comum faltar recurso no começo da partida e o jogador
precisa escolher no que focar (economia, exército ou tecnologia). Hoje a economia cresce rápido demais, os armazéns
transbordam e quase nada obriga a escolher.

Relacionado: `docs/BALANCEAMENTO_E_PROGRESSAO.md` (lote 1, diagnóstico geral; lote 2, item 4, teto de comércio).

---

## 1. Diagnóstico

### 1.1 Edifícios de coleta se pagam em segundos
Valores atuais de `shared/sim/config.ts`, com todas as células do edifício ocupadas:

| Edifício | Custo | Rende | Se paga em |
|---|---|---|---|
| Fazenda | 60 madeira | 8 células × 0,5 = 4 comida/s | **15 s** |
| Serraria | 60 suprimentos | 10 células × 0,4 = 4 madeira/s | **15 s** |
| Pedreira | 80 madeira | 8 células × 0,35 = 2,8 pedra/s | ~29 s |
| Mina | 80 madeira + 40 suprimentos | 6 células × 0,45 = 2,7 ferro/s | ~44 s |
| Poço de Petróleo | 80 madeira + 60 pedra | 3 petróleo/s | ~47 s |

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

| Parâmetro | Onde | Atual | Proposto (simulado) | Ajuste fino sugerido |
|---|---|---|---|---|
| Fazenda `ratePerCell` | `BUILDINGS.farm.gather` | 0,5 | 0,25 | 0,25 |
| Serraria `ratePerCell` | `BUILDINGS.sawmill.gather` | 0,4 | 0,22 | 0,22 |
| Pedreira `ratePerCell` | `BUILDINGS.quarry.gather` | 0,35 | 0,35 (sem mudança) | **0,25** |
| Mina `ratePerCell` | `BUILDINGS.mine.gather` | 0,45 | 0,3 | 0,3 |
| Poço `ratePerCell` | `BUILDINGS.oil_well.gather` | 3 | 1,8 | 1,8 |
| Renda do QG | `BUILDINGS.hq.income` | 3 suprimentos/s | 1,5 | 1,5 |
| Consumo de comida | `FOOD_UPKEEP_PER_POP` | 0,02 | 0,05 | **0,04** |
| Recursos iniciais | `STARTING_RESOURCES` | 300 sup / 150 comida / 250 madeira | 200 / 100 / 150 | 200 / 100 / 150 |
| Cidadão | `CITIZEN` | 40 comida, 6 s | 50 comida, 10 s | 50 comida, 10 s |

A coluna "Ajuste fino sugerido" corrige o que as simulações mostraram (seção 3): a pedra virou sobra e a comida ficou
apertada demais.

### 2.2 Custos crescentes (estilo *Rise of Nations*)
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

| | Atual | Recalibrada |
|---|---|---|
| Aos 2:30 | 4 fazendas, 3 serrarias | 2 fazendas, 1 serraria |
| Comida com armazém ≥ 95% | 67% do tempo | **0%** |
| Madeira com armazém ≥ 95% | 69% | 15% |
| Suprimentos com armazém ≥ 95% | 33% | 21% |
| Comida abaixo de 40 | 9% | 76% |
| Ferro abaixo de 40 | 42% | 51% |
| Pesquisas militares concluídas | 0 | 4 |
| Maior exército | 28 | 15 |
| Resultado | vitória de P0 por volta de 20:40 | em andamento aos 25:00, exércitos 12 × 8 |

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

| Métrica | Meta |
|---|---|
| Comida, madeira e suprimentos com armazém ≥ 95% | menos de 20% do tempo cada |
| Algum recurso abaixo de 40 nos primeiros 8 minutos | em todas as seeds |
| Nenhum recurso abaixo de 40 por mais de 60% do tempo | em todas as seeds |
| IA travada (sem nova coleta por mais de 5 minutos antes dos 15:00) | nunca |
| Primeira pesquisa militar da IA | antes dos 12:00 |
| Partida entre IAs equivalentes decidida antes dos 25:00 | menos da metade das seeds |
| Diferença entre os dois jogadores na mesma seed | pequena (mapa simétrico) |

Depois, partidas humanas contra a IA para confirmar a sensação.

---

## Apêndice — script de simulação

Salvar como `scripts/sim-economia.ts` (o diretório `scripts/` já existe) e rodar a partir da raiz do repositório:

```bash
npm ci
MODE=base npx tsx scripts/sim-economia.ts 7 25   # economia atual, seed 7, 25 minutos
MODE=new  npx tsx scripts/sim-economia.ts 7 25   # recalibrada com custos crescentes
```

O script aplica os valores propostos alterando os objetos de configuração em memória, sem mudar arquivos do jogo. A cada
2:30 imprime o estado de P0 e, no fim, o resumo da partida e os percentuais de escassez e transbordamento dos dois
jogadores.

```ts
import { Simulation } from '../shared/sim/Simulation.ts';
import { generateMap } from '../shared/sim/MapGen.ts';
import { TacticalAI } from '../shared/sim/TacticalAI.ts';
import { BUILDINGS, CITIZEN, RESOURCE_TYPES, STARTING_RESOURCES, TICK_RATE, type BuildingType, type Cost } from '../shared/sim/config.ts';

const NEW = process.env.MODE === 'new';
const seed = Number(process.argv[2] ?? 7);
const minutes = Number(process.argv[3] ?? 25);
const ESC = 0.18; // +18% por edifício do mesmo tipo já existente
const EXTRA_FOOD = 0.03; // consumo 0,02 -> 0,05 por habitante/s (aplicado à parte)
const ESCALATE: BuildingType[] = ['farm', 'sawmill', 'quarry', 'mine', 'oil_well', 'house', 'residential', 'warehouse', 'silo', 'oil_tank', 'barracks', 'factory', 'tower', 'market', 'aa_battery'];
const baseCost = Object.fromEntries(Object.entries(BUILDINGS).map(([k, v]) => [k, { ...v.cost }])) as Record<BuildingType, Cost>;
if (NEW) {
  BUILDINGS.farm.gather!.ratePerCell = 0.25;
  BUILDINGS.sawmill.gather!.ratePerCell = 0.22;
  BUILDINGS.mine.gather!.ratePerCell = 0.3;
  BUILDINGS.oil_well.gather!.ratePerCell = 1.8;
  BUILDINGS.hq.income = { supplies: 1.5 };
  Object.assign(STARTING_RESOURCES, { supplies: 200, wood: 150, food: 100 });
  CITIZEN.cost.food = 50; CITIZEN.buildSeconds = 10;
}
const sim = new Simulation({ map: generateMap(seed), playerCount: 2 });
for (const s of [0, 1]) sim.setModifiers(s, { externalIncome: 1.5 });
const ais = [new TacticalAI(0), new TacticalAI(1)];
const setCosts = (slot: number) => {
  if (!NEW) return;
  for (const t of ESCALATE) {
    const n = sim.buildings.filter((b) => b.owner === slot && b.type === t).length;
    const m = (1 + ESC) ** n;
    BUILDINGS[t].cost = Object.fromEntries(Object.entries(baseCost[t]).map(([r, v]) => [r, Math.round((v as number) * m / 5) * 5]));
  }
};
const low = [{} as Record<string, number>, {} as Record<string, number>], full = [{} as Record<string, number>, {} as Record<string, number>];
let samples = 0, war = -1; const waves: string[] = []; let foodAcc = [0, 0]; let kills = [0, 0];
const fmt = (t: number) => `${Math.floor(t / 1200)}:${String(Math.floor((t % 1200) / 20)).padStart(2, '0')}`;
for (let t = 0; t < minutes * 60 * TICK_RATE && !sim.ended; t++) {
  if (t % 20 === 0) for (const ai of ais) {
    setCosts(ai.slot);
    for (const c of ai.think(sim)) {
      if (c.type === 'attack_move' && sim.hostile(ai.slot, 1 - ai.slot) && c.unitIds.length >= 6) waves.push(`${fmt(t)} P${ai.slot}:${c.unitIds.length}`);
      setCosts(ai.slot); sim.applyCommand(ai.slot, c);
    }
    if (ai.wantsWarWith !== null && war < 0) { sim.setWar(ai.slot, ai.wantsWarWith, true); war = t; }
  }
  sim.step();
  for (const e of sim.drainEvents()) if ((e as any).type === 'unit_destroyed' || (e as any).type === 'destroyed') { const k = (e as any).killer ?? (e as any).by; if (k === 0 || k === 1) kills[k]++; }
  if (NEW && t % 20 === 0) for (const s of [0, 1]) { foodAcc[s] += sim.population(s).total * EXTRA_FOOD; const f = Math.floor(foodAcc[s]); foodAcc[s] -= f; const p = sim.players[s]!; p.resources.food = Math.max(0, p.resources.food - f); }
  if (t % 20 === 0) { samples++; for (const s of [0, 1]) { const p = sim.players[s]!; const cap = sim.capacity(s); for (const r of RESOURCE_TYPES) { if (p.resources[r] < 40) low[s][r] = (low[s][r] ?? 0) + 1; if (cap[r] > 0 && p.resources[r] >= cap[r] * 0.95) full[s][r] = (full[s][r] ?? 0) + 1; } } }
  if ((t + 1) % (150 * TICK_RATE) === 0) {
    for (const s of [0]) {
      const p = sim.players[s]!; const inc = sim.incomePerSecond(s); const pop = sim.population(s);
      const bs = sim.buildings.filter((b) => b.owner === s && b.progress >= 1);
      const g = (k: string) => bs.filter((b) => b.type === k).length;
      console.log(`${fmt(t + 1)} P${s} | estoque ${RESOURCE_TYPES.map((r) => `${r.slice(0,3)} ${Math.round(p.resources[r])}`).join(', ')} | renda/s ${RESOURCE_TYPES.map((r) => inc[r].toFixed(1)).join('/')} | pop ${pop.total}/${pop.cap} exército ${sim.units.filter((u) => u.owner === s).length} | QG nv${bs.find((b) => b.type === 'hq')?.level ?? '-'} | faz ${g('farm')} serr ${g('sawmill')} pedr ${g('quarry')} mina ${g('mine')} poço ${g('oil_well')} | pesq ${(p.militaryResearch ?? []).length}`);
    }
  }
}
const pct = (o: Record<string, number>) => Object.fromEntries(RESOURCE_TYPES.map((r) => [r.slice(0, 3), Math.round(100 * (o[r] ?? 0) / samples)]));
console.log('guerra declarada:', war >= 0 ? fmt(war) : 'não', '| ondas:', waves.join(', ') || 'nenhuma', '| fim:', sim.ended ? `vencedor P${sim.winner}` : 'em andamento', '| exércitos finais:', [0, 1].map((s) => sim.units.filter((u) => u.owner === s).length).join(' x '));
for (const s of [0, 1]) console.log(`P${s} % tempo estoque<40:`, JSON.stringify(pct(low[s])), '| armazém≥95%:', JSON.stringify(pct(full[s])));
```
