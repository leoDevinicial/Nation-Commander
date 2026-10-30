# Dificuldade, incidentes de fronteira, veterania e logística

Itens de curto prazo do lote 1 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Níveis de dificuldade

O anfitrião escolhe a dificuldade na sala, nos modos contra a IA e Sandbox. A escolha fica salva na partida
(`Simulation.difficulty`) e o HUD mostra o preparo da dificuldade escolhida.

| | Fácil | Normal | Difícil | Brutal |
|---|---|---|---|---|
| Preparo (sem guerra da IA) | 12 min | 8 min | 5 min | 3 min |
| Guarnição no preparo | 4 | 6 | 8 | 8 |
| Primeira ofensiva (com o que tiver) | 14 min, 4+ tropas | 10 min, 4+ | 8 min, 4+ | 6 min, 3+ |
| Onda cheia seguinte / aumento / máximo | 8 / +2 / 16 | 12 / +3 / 24 | 14 / +4 / 30 | 16 / +4 / 36 |
| Intervalo entre ondas | 6 min | 4 min | 3 min | 2,5 min |
| Exército mínimo (tropas por min, a partir dos 2 min) | 0,5 | 0,8 | 1 | 1,2 |
| Fazendas mantidas | 3 | 4 | 5 | 5 |
| QG rumo à próxima era a partir de | 16 min | 10 min | 7 min | 5 min |
| Orçamento de defesa do governo da IA | referência | ×1,5 | ×2 | ×2,5 |
| Incidentes de fronteira | não | sim | sim | sim |
| Aviões / mísseis | não / não | sim / não | sim / sim | sim / sim |
| Bônus de coleta da IA | — | — | — | +15% (declarado na sala) |

Em todos os níveis a IA joga com as mesmas regras e a mesma névoa de guerra. O bônus do Brutal é o único extra
(`TacticalModifiers.gatherMul`). As regras estão em `shared/sim/difficulty.ts`.

### Ritmo da IA

- **Primeira ofensiva:** depois do preparo, a IA forma tropas e, na hora da dificuldade, ataca com o que tiver (pelo
  menos o mínimo da tabela), sem esperar a onda cheia. Essa primeira ofensiva não aumenta a onda seguinte. As
  outras esperam a onda cheia, o intervalo, ou um exército parado de crescer por 5 min.
- **Exército mínimo:** `tropas por min × (minutos − 2)`, até o máximo da onda. Abaixo dele, as tropas passam na frente
  das reservas da pesquisa seguinte, e a IA leva trabalhadores para a fazenda até a comida render 5/s. Abaixo da
  metade, passam também na frente da reserva da era e do QG.
- **Recrutas:** no máximo um por quartel ou fábrica pronta. Recruta parado prendia a comida do soldado.
- **Eras:** a partir do minuto da tabela, com o Centro de Pesquisa pronto, o QG sobe até o nível da próxima era antes
  das outras melhorias, sem reserva de suprimentos extra. A reserva passa na frente das tropas, da força aérea e dos
  recrutas. A fábrica, as prefeituras e as estradas continuam, porque as cidades e as caravanas rendem os
  suprimentos da era. Da era 2 em diante, a IA mantém duas minas e duas pedreiras.
- **Orçamento de defesa:** o governo da IA sobe a defesa 0,2 ponto por mês até o múltiplo da tabela, só com o
  déficit sob controle. Usa o mesmo comando de orçamento do jogador, e a defesa rende os suprimentos do teatro.

Medição em `scripts/sim-economia.ts`, com a camada nacional ligada (ver
[`RECALIBRAGEM_RECURSOS.md`](RECALIBRAGEM_RECURSOS.md), seção 5.1). São duas IAs da mesma dificuldade, 7 seeds e 30 min:

| | Fácil | Normal | Difícil | Brutal |
|---|---|---|---|---|
| Primeira ofensiva da partida | 14:00–14:16 (uma 16:26) | 10:00–10:01 (11:32 e 12:55) | 8:00–8:20 (uma 9:04) | 6:24–7:00 |
| Tropas formadas até 15:00 (média) | 8 | 11 | 11 | 11 |
| IAs na era 3 até 30:00 | 8 de 14 (21–25 min) | 6 de 14 (21–28 min) | 9 de 14 (23–28 min) | 7 de 14 (19–28 min) |

Antes destas mudanças, no Normal, a primeira ofensiva saía aos 16:45, a IA tinha 3 tropas aos 10 min e quase nunca
passava da era 2. A era 3 ainda chega tarde porque os suprimentos viram o único gargalo da IA depois dos 17 min (ver
a seção 5.1 da recalibragem). No Fácil, as duas IAs gastam pouco em tropas e algumas partidas acabam antes dos 25 min.

## Incidentes de fronteira (assédio no preparo)

A partir dos 3 min, e a cada 3 min do preparo, a IA manda 2 a 3 tropas da guarnição até a borda do território
vizinho mais perto da base dela, onde costumam ficar fazendas e serrarias.

- O incidente dura 75 s. Nesse tempo, os dois lados trocam tiros como numa guerra (`Simulation.hostile`).
- Não há guerra declarada (`Simulation.formalWar` continua falso), nem efeito diplomático ou de aprovação.
- A vítima é avisada no painel de eventos, com alarme, e pode revidar.
- O incidente entra no estado salvo.

## Veterania

Cada abate (unidade ou edifício) conta para a patente da tropa que atirou:

| Patente | Abates | Bônus |
|---|---|---|
| Recruta | 0 | — |
| Veterano | 2 | +10% de dano, +8% de vida |
| Elite | 5 | +20% de dano, +16% de vida |
| Herói | 10 | +30% de dano, +24% de vida |

- **Insígnia:** divisas douradas sobre a tropa (uma por patente), visíveis para todos.
- **Painel:** o painel da tropa selecionada mostra a patente, os abates e quantos faltam para a próxima.
- **Bônus:** somam-se aos pacotes de modernização.

As regras estão em `shared/sim/veterancy.ts`.

## Logística do orçamento de defesa

A logística do teatro passou do log₁₀ para uma raiz quadrada com saturação suave:

> x = 0,45 × √(gasto de defesa anual em US$ bi); suprimentos/s = 10 × (1 − e^(−x/10)), × bônus de pesquisa.

- **Paridade:** de 1% para 10% do PIB, a logística vai de cerca de 1,3 para 3,6 suprimentos/s. Antes ia de 1,25
  para 2,4.
- **Escala real:** as maiores economias se aproximam do teto de 10/s, mas aumentar a defesa ainda rende.

A fórmula está em `theaterSupply` (`shared/strategic/params.ts`). O painel nacional, o orçamento e o cartão do país
usam a mesma função.

## Testes

`shared/test/balance.test.ts` cobre:
- o preparo por dificuldade;
- a onda do Difícil;
- o bônus do Brutal;
- os incidentes de fronteira (prazo, salvamento e assédio da IA);
- a promoção da veterania;
- a curva de defesa.

O teste de sala real (`server/room.test.ts`) confere que, antes da guerra, só há dano durante incidentes.
