# Rede elétrica (versão 1.2)

Proposta do gerente, com as decisões do responsável pelo projeto em 31/10:
- sem energia, a construção para por completo;
- a energia anda pelas estradas;
- o carvão sai das minas;
- toda nação começa com QG, termelétrica a carvão, estrada curta com postes e carvão em estoque;
- dá para construir termelétrica, eólica e solar; a nuclear (Grande Projeto) é a fonte de fim de partida;
- a IA constrói a própria rede e ataca a do inimigo.

Onde está:
- **Regra:** `shared/sim/power.ts`, integrada em `Simulation.updatePower`.
- **Testes:** `shared/test/power.test.ts`.
- **Modelos:** `src/game/render/models/power.ts`; postes e fios em `RoadLayer.poles`.
- **Interface:** `PowerChip` na barra de cima, aba Energia no menu de construção, aviso de apagão.

## Carvão

- Recurso novo (`coal`), guardado no QG (300) e nos Armazéns (800).
- A Mina tira 0,15 de carvão por unidade de ferro, sem gastar mais do depósito (começou em 0,6, depois 0,3 e 0,2: o carvão sobrava).
- Começo: 160 de carvão, o bastante para a termelétrica inicial por bastante tempo até a primeira mina.

## Fontes

| Usina | Era | Geração | Custo de operação |
|---|---|---|---|
| Termelétrica a Carvão (2×2) | Guerra Fria | 24 | carvão: até 0,6/s, proporcional à carga |
| Parque Eólico (2×2) | Pós-Guerra Fria | 12 × vento (35% a 130%, varia devagar) | nenhum |
| Usina Solar (2×2) | Era Digital | 18 × luz do dia (0 à noite), +40% na Era Digital | nenhum |
| Hidrelétrica (Grande Projeto) | Futuro Próximo | 90 | nenhum |
| Usina Nuclear (Grande Projeto) | Futuro Próximo | 150 | nenhum |

A solar usa o mesmo ciclo de dia e noite do céu (`dayLight` em `shared/sim/climate.ts`). Na simulação, isso é regra:
a usina solar não gera à noite.

## Como a energia chega

- **A malha:** células de estrada do jogador (as pavimentadas por ele e as do mapa dentro do território), mais a área do
  QG e das usinas.
- **Redes:** cada pedaço conexo da malha (vizinhos N/S/L/O) é uma rede própria.
- **Ligação das construções:** uma construção a até **4 células** da malha liga-se a ela (a fiação dos postes). Se ela
  alcança duas redes, as une.
- **Atendimento:** em cada rede, a geração atende as consumidoras **em ordem de construção**; quando falta, as mais novas
  apagam primeiro.
- **Recálculo:** a rede é recalculada a cada 0,5 s. O carvão queima a cada tick, conforme a carga de cada termelétrica.
- **Cortes:** destruir uma usina, cortar a estrada ou acabar o carvão apaga o que dependia dela.

## Quem consome e o que acontece sem luz

**Param por completo sem energia:**

| Construção | Consumo | O que para |
|---|---|---|
| Quartel | 3 | produção |
| Fábrica | 6 | produção |
| Centro de Pesquisa | 5 | pesquisa |
| Base Aérea | 8 | montagem e manutenção de aeronaves |
| Silo de Mísseis | 5 | produção de mísseis |
| Domo de Ferro | 6 | recarga e interceptação |
| Antiaérea | 2 | defesa contra aviões e mísseis |
| Refinaria | 5 | processamento |
| Siderúrgica | 6 | processamento |

**Não param, mas pesam na aprovação:**

| Construção | Consumo |
|---|---|
| Casa | 1 |
| Prédio residencial | 2 |
| Hospital | 3 |
| Escola, Delegacia, Prefeitura, Terminal Comercial | 2 cada |
| Rede 5G | 10 |
| Centro Financeiro | 6 |
| Programa Espacial | 16 |

**Coletas: rendem 75% sem luz (01/11):**

| Construção | Consumo |
|---|---|
| Fazenda, Serraria, Pedreira | 1 cada |
| Mina, Poço de petróleo | 2 cada |

**Depósitos e logística: só pesam na conta:** Armazém, Silo, Tanque de combustível e Torre (1 cada), Porto e
Estação ferroviária (3 cada).

- **Todas consomem (01/11):** pedido do usuário depois de uma partida real ("energia não foi desafio em momento
  algum"). Só o QG fica fora da conta. A coleta no escuro não para (a economia nunca trava por completo), mas rende
  75% (`POWER_DARK_RATE`).
- **Consumo cresce com a era** (`POWER_ERA_MUL`): ×1 na Guerra Fria, ×1,3 no Pós-Guerra Fria, ×1,6 na Era Digital
  e ×2 no Futuro Próximo. Os valores das tabelas são da era 1; avançar de era pede usinas novas.
- **Carvão:** a termelétrica a plena carga queima até 0,5 de carvão por segundo; com a base inteira consumindo, o
  carvão acaba e a eólica e a solar passam a importar.
- **Aprovação:** fator "Bairros com/sem energia elétrica", de até +3 com todas as moradias acesas a até −6 com todas
  no escuro (apagão ou estrada cortada).
- **Status:** a construção parada mostra "Parado: sem energia" no painel.
- **Aviso:** quando construções começam a parar, o jogador recebe o aviso de apagão, com o motivo (falta geração ou
  longe da rede).

## Efeito no ritmo (01/11)

Medido com `npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25` (14 IAs no Normal):

| | Antes (só indústria consumia) | Agora (todas consomem) |
|---|---|---|
| Era 2 | 10:04 a 11:58 | 10:06 a 13:54 |
| Era 3 até 22:00 | 10 de 14 IAs | 5 de 14 IAs |
| Tropas formadas até 15:00 (média) | 10,8 | 10,1 |
| Critérios da seção 5 de `RECALIBRAGEM_RECURSOS.md` | 8 de 9 | 6 de 9 |

O atraso de 1 a 2 minutos nas eras é o custo pedido: usinas a mais, carvão que acaba e coletas longe da rede. Testes
de compensação (sem a 2ª mina da IA, mina com mais carvão, coleta no escuro a 80% ou 100%, consumo por era mais
suave) não devolveram o ritmo antigo sozinhos; a IA ficou com a regra igual à do jogador. A IA liga coletas no escuro
à rede antes das estradas das prefeituras e mesmo guardando recursos, e só ergue eólica quando falta geração.

## Início da partida

Cada nação começa com uma termelétrica a 3 ou 4 células do QG, ligada a ele por uma estrada pavimentada (com postes).
A estrada vai rumo ao meio do mapa e tenta os outros lados se não couber. Se nada couber, a usina fica encostada no
QG.

## IA

- **Usinas:** constrói outra quando a capacidade instalada (solar e eólica contam 60%) fica abaixo da demanda, somando o que está em obra mais uma folga de 4.
  - Termelétrica por padrão.
  - Da era 2 em diante, a eólica alterna com a termelétrica e passa na frente com menos de 150 de carvão (até 4).
  - A primeira solar logo ao chegar na Era Digital; depois, alternada com a termelétrica.
- **Carvão:** com o carvão abaixo de 80 e sem mina, a mina vira prioridade; com o carvão baixo, mais minas (até 2,
  ou 3 da era 2 em diante).
- **Posição:** posiciona quartéis, fábricas e usinas ao alcance da malha.
- **Construções isoladas:** traça estrada até o QG para uma construção (inclusive coleta) que ficou longe da rede,
  antes das estradas das prefeituras e mesmo quando está guardando recursos.
- **Ataque:** as usinas (termelétrica, nuclear, hidrelétrica) entram logo depois da base aérea e do silo na lista de
  alvos aéreos.

## Na tela

- Construção sem luz: ícone ⚡ vermelho piscando acima dela (só o dono vê) e "Parado: sem energia" no painel.
- Ao posicionar uma construção que usa ou gera luz: a área energizada aparece amarela no chão, e o painel diz
  "⚡ Com energia aqui" ou "⚠ Sem energia aqui".
- Painel da construção: "⚡ Consome X de energia" com o que acontece sem luz (para, rende 75% ou fica no escuro) e
  "SEM LUZ agora" em vermelho quando está apagada.
- Barra de cima: ⚡ consumo atendido / geração, vermelho com construções paradas.

## Mercado interno

O carvão entra no Terminal Comercial para venda e compra (taxa-base 0,35 de suprimento por unidade). A IA vende a
sobra como faz com os outros recursos.

## Compatibilidade

- **Salvamentos antigos:** os de antes da rede (sem `power`) continuam funcionando com tudo aceso.
- **Recurso novo:** o carvão entra zerado.
- **Batalhas locais:** não têm rede.
- **Testes de regra antigos:** rodam com a rede desligada (`shared/test/setup.ts`); os da rede a ligam
  explicitamente.
