# Pesqueiro e custo crescente em US$ (05/11)

Pedido do responsável: navio pesqueiro que sai sozinho do Porto, pesca e volta trazendo comida, até 3 por porto; e
custo que cresce a cada construção do mesmo tipo, em recursos e em US$, para não dar para encher o mapa de portos e
pesqueiros.

## Pesqueiro (`fishing_boat`)

| Item | Valor |
|---|---|
| Produção | Porto, era 1, sem pesquisa extra (o Porto já exige Logística naval) |
| Custo base | 90 madeira, 30 suprimentos, 10 petróleo (× `ECONOMY`), +18% por pesqueiro que o jogador já tem (prontos e na fila) |
| Limite | 3 por Porto (`FISHING.perPort`), contando os prontos e os da fila daquele porto |
| Tripulação | nenhuma (civil): não usa recrutas |
| Vida / velocidade | 220 / 3,2; sem arma; em guerra pode ser afundado |
| Ciclo | área de pesca na água a 6–14 células do porto (próprio território ou água neutra, alcançável pela água) → 12 s pescando → volta e descarrega 80 de comida ao encostar no porto (× decretos e bônus de coleta de comida do país) |
| Rendimento | ~1,5 de comida/s por barco no mapa de teste; 3 barcos ≈ uma fazenda cheia (4,2/s) |
| Combustível | gasta 40% do de um navio comum ao andar |

- A comida vai para os silos (`store`): sem espaço, o excedente se perde.
- Sem o porto de origem (destruído ou perdido), o barco adota o Porto próprio mais perto; sem nenhum, fica parado.
- Uma ordem de mover do jogador vale até o barco chegar; depois ele volta à rotina sozinho.
- A área de pesca gira com o id do barco e o número de viagens, para os barcos se espalharem.
- Snapshot: `fish` (etapa do ciclo) para quem vê o barco; `fishing` (total e por porto) só para o dono, para o botão
  mostrar o limite e o custo certos. Evento `fish_landed` só para o dono.
- IA: 2 pesqueiros por porto, depois das prioridades militares do Porto (`portMix`).
- Modelo low poly próprio em `src/game/render/models/naval.ts` (`buildFishingBoat`): casco verde-escuro com fundo
  vermelho e faixa da nação, timoneira branca com janelas azuis, pórtico de popa com cabo e tambor da rede, boias e
  caixas de peixe.

## Custo crescente em recursos e US$

- Recursos (já existia, `buildingCost`): +18% por edifício do mesmo tipo que o jogador já tem. A lista
  `ESCALATING_BUILDINGS` ganhou Porto, Refinaria, Siderúrgica, as três usinas, hospital e delegacia.
- US$ (novo, `buildingUsd`): taxa de obra paga do caixa do país ao começar a obra, a partir do segundo edifício do
  tipo: `repasse anual × 0,004 × ((1,18)^n − 1) / 0,18`, com n = edifícios do tipo que já existem. Com repasse de
  ~US$ 75 mi: 2º ~US$ 0,3 mi, 6º ~US$ 2 mi, 11º ~US$ 8 mi. Sem caixa, a obra é recusada (`placementError` também
  avisa, então a IA não tenta).
- Ficam de fora (como antes): QG, Centro de Pesquisa, base aérea, silo, Grandes Projetos, limitados por cidade,
  Prefeitura e obstáculo antitanque. Sandbox não paga.
- Cartão de construção: mostra `+US$` da taxa (vermelho sem caixa, "sem caixa" no lugar do motivo) e a dica traz o
  custo do próximo em recursos e US$; o painel de posicionamento mostra a taxa e o próximo.

## Testes

`shared/test/fishing.test.ts`: ciclo completo com comida entregue, limite de 3 por porto e custo crescente do barco,
troca de porto quando o de origem cai, e taxa de obra (primeiro grátis, segundo paga, sem caixa recusa).
`sim-economia` 1–7 × 25 min: mesmos critérios de antes (nada piorou).
