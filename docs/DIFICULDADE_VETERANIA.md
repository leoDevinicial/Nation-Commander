# Dificuldade, incidentes de fronteira, veterania e logística

Itens de curto prazo do lote 1 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Níveis de dificuldade

O anfitrião escolhe a dificuldade na sala, nos modos contra a IA e Sandbox. A escolha fica salva na partida
(`Simulation.difficulty`) e o HUD mostra o preparo da dificuldade escolhida.

| | Fácil | Normal | Difícil | Brutal |
|---|---|---|---|---|
| Preparo | 12 min | 8 min | 5 min | 3 min |
| Primeira onda / aumento / máximo | 8 / +2 / 16 | 12 / +3 / 24 | 14 / +4 / 30 | 16 / +4 / 36 |
| Intervalo entre ondas | 6 min | 4 min | 3 min | 2,5 min |
| Incidentes de fronteira | não | sim | sim | sim |
| Aviões / mísseis | não / não | sim / não | sim / sim | sim / sim |
| Bônus de coleta da IA | — | — | — | +15% (declarado na sala) |

Em todos os níveis a IA joga com as mesmas regras e a mesma névoa de guerra. O bônus do Brutal é o único extra
(`TacticalModifiers.gatherMul`). As regras estão em `shared/sim/difficulty.ts`.

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
