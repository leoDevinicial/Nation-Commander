# Política: decretos, facções e pedidos das potências

Itens de médio prazo do lote 1 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md), inspirados em
*Tropico 5* e *6*. Ficam na aba **Nação → Política**. As regras estão em `shared/strategic/policies.ts`, e o
estado fica salvo em cada nação (`NationState.policies`).

## Decretos

Cada decreto tem um ganho e um custo, e vigora pelo menos 30 dias antes de poder ser revogado.

| Decreto | Ganho no teatro | Custo |
|---|---|---|
| Alistamento obrigatório | Recrutas 40% mais baratos | −4 de aprovação; Opinião Pública insatisfeita |
| Economia de guerra | Produção militar 20% mais rápida | +1,5 p.p. na inflação-alvo; Sindicatos insatisfeitos |
| Racionamento | Consumo de comida 40% menor | −3 de aprovação; Agro e Opinião Pública insatisfeitos |
| Lei marcial | +10 na estabilidade-alvo; protestos 70% menos prováveis | −6 de aprovação; Sindicatos e Opinião Pública muito insatisfeitos |

Os efeitos chegam ao teatro pelos modificadores do jogador: `recruitCostMul`, `productionTimeMul`, `foodUpkeepMul`
e `gatherMul`. O botão de produção mostra o custo do recruta já com o decreto. A IA nacional também decreta:
- em guerra, economia de guerra, e alistamento se a aprovação estiver folgada;
- lei marcial se a estabilidade desabar.

Ela revoga o que pesa quando a aprovação cai.

## Facções

Forças Armadas, Indústria, Agro, Sindicatos e Opinião Pública têm uma satisfação de 0 a 100 e, de tempos em
tempos, uma exigência com prazo de 90 dias. Por exemplo:
- "ter 2 fábricas de veículos prontas";
- "manter 16 unidades militares";
- "ter 400 de comida em estoque";
- "não passar de 20 baixas em 30 dias".

Cumprir e falhar têm consequências diferentes:
- **Cumprir:** +25 de satisfação, aprovação extra que decai em cerca de 60 dias e recursos entregues no teatro
  (por exemplo, a Indústria dá ferro e petróleo).
- **Falhar ou deixar vencer:** −25 de satisfação.

Abaixo de 30, a facção protesta:

| Facção em protesto | Efeito |
|---|---|
| Forças Armadas | produção militar 10% mais lenta |
| Indústria, Agro, Sindicatos | coleta 10% menor (cada uma) |
| Opinião Pública | −5 de aprovação |

Os decretos mexem na satisfação aos poucos, enquanto vigoram. O servidor conta o que as facções observam no
teatro: edifícios prontos, tropas, trabalhadores e comida.

## Pedidos das potências

Uma das três maiores economias conhecidas, que não esteja em guerra com o jogador, faz um pedido com prazo de 90
dias:
- exportar US$ 15 mi pelo comércio internacional;
- reforçar a defesa em 0,5 p.p. do PIB;
- concluir uma pesquisa nacional;
- não declarar guerra a um rival.

As consequências dependem da resposta:
- **Cumprir:** relação +12 e ajuda de 0,1% do PIB, abatida da dívida.
- **Falhar:** relação −10.
- **Recusar logo:** relação −4.

Declarar a guerra proibida falha o pedido na hora.

## Testes

`shared/test/policies.test.ts` cobre:
- o efeito duplo e o prazo mínimo dos decretos;
- a inflação da economia de guerra;
- as exigências cumpridas e frustradas;
- os protestos das facções;
- os pedidos cumpridos, recusados e quebrados;
- salvar e carregar;
- os decretos da IA.

`server/room.test.ts` confere o decreto numa sala real.
