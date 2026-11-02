# Comércio, rodovias e fim da dívida (02/11)

Pedido do usuário: tirar a dívida pública (ela fazia os jogadores começarem muito desiguais); comércio entre as nações
da partida por anúncios (venda simples e contrato), com rota de verdade (rodovia, porto ou aeroporto); veículos de carga
atacáveis por quem está em guerra com alguma das partes; dinheiro e mercadoria só mudam de mão na chegada. Os países de
fora da partida viraram um mercado mundial simples, de reserva. Substitui o desenho da Fase 6
([`FASE6_COMERCIO_LOGISTICA.md`](FASE6_COMERCIO_LOGISTICA.md), que fica como histórico).

## Sem dívida pública
- `NationState` não tem mais `debtUsd`, juros nem dívida de referência. Todos começam sem dívida.
- O déficit do orçamento continua existindo e vira **inflação** (`COEF.deficitInflation` acima de 3% do PIB ou do
  déficit de referência). Ele não acumula em lugar nenhum.
- O que era pago com dívida sai do **caixa do país**, medido em dias do repasse de referência (`NationState.dayUsd` =
  PIB de referência × 2,5% × 0,003 ÷ 365; na paridade, todos pagam o mesmo). Valores em `CAIXA_DAYS` (`params.ts`):

| Gasto | Antes | Agora |
|---|---|---|
| Declarar guerra (mobilização) | 0,2% do PIB em dívida | 60 dias de repasse (~US$ 12 mi na paridade); sem caixa, bloqueia |
| Missão de contato | 0,01% do PIB em dívida | 3 dias de repasse |
| Ajuda a outro país | % do PIB em dívida | 300 dias de repasse por 1% do PIB (0,1% → 30 dias) |
| Operação expedicionária | US$ 1,5 mi/unidade + 0,6 mi/1.000 km em dívida | US$ 300 mil/unidade + 120 mil/1.000 km do caixa |
| Pedido de potência cumprido | abatia 0,1% do PIB da dívida | 30 dias de repasse entram no caixa |

- Telas: a Visão Geral mostra o **déficit** (% do PIB) no lugar da dívida; o orçamento não tem mais a linha de juros; o
  resultado da partida mostra o caixa final; o cartão do país não cita mais a dívida real.

## Comércio entre as nações da partida (`shared/sim/trade.ts`)
O **Terminal Comercial** (era 2) é a bolsa: sem ele, não se anuncia nem se compra.

### Anúncios
- **Venda simples:** um recurso, quantidade e preço total. A mercadoria sai do estoque ao anunciar (reserva) e volta se
  o anúncio for retirado ou expirar (240 dias).
- **Contrato de fornecimento:** até 3 recursos, entrega a cada 20 a 180 dias, preço **por mês**. Não reserva nada; cada
  entrega tira o estoque na data. Valor de uma entrega = mensalidade × dias ÷ 30.
- Recursos: comida, madeira, pedra, ferro, petróleo (só dos tanques) e carvão. Até 2.000 de cada, 4 anúncios abertos.
- Preço aceito: de 20% a 500% da referência (`REF_PRICE`, igual a `TREASURY.price`: comida, madeira e pedra 4,5 mil,
  ferro 8 mil, petróleo 10 mil, carvão 6 mil por unidade).
- Quem vê: todos que não estão em guerra com o vendedor. O snapshot leva, para cada anúncio, o motivo de cada transporte
  estar bloqueado para o observador (`ListingView.blockers`).

### Compra e rotas
Quem compra escolhe o transporte. A rota é recalculada no máximo a cada 2 s (cache por par e modal).

| Transporte | Precisa dos dois lados | Rota | Carga por veículo | Velocidade |
|---|---|---|---|---|
| 🚚 Caminhão | Terminal Comercial | busca em largura pelas células de estrada (qualquer dono, inclusive rodovias e pontes), de uma vizinha do terminal do vendedor a uma do comprador | 150 | 4 (×1,3 na estrada, ×2 na rodovia) |
| 🚢 Navio | Porto | busca em largura pela água, da água junto a um porto à água junto ao outro | 600 | 3 |
| ✈️ Avião | Base Aérea ou QG nível 4 | linha reta entre os aeroportos mais próximos | 50 | 12 |

- A remessa é dividida em veículos do tamanho da capacidade. Cada terminal opera 2 veículos ao mesmo tempo (no aéreo,
  mais um por cargueiro pronto); os demais esperam na fila.
- **Pagamento e entrega:** só na chegada. O comprador paga e o vendedor recebe a parte daquele veículo, proporcional ao
  que coube no depósito; o resto espera no pátio e tenta de novo a cada segundo.
- **Ataques:** a cada 5 ticks, se o veículo está ao alcance de tropa ou torre (caminhão e navio, raio 5) ou de antiaérea,
  Domo, torre ou tropa antiaérea (avião, raio 9) de quem está em **guerra com o vendedor ou com o comprador**, acumula
  exposição; com 1,5 s seguidos, é destruído (`shipment_lost`, visível a quem vê o local). Ninguém paga.
- **Guerra ou sanções** entre as partes: não há compra; os contratos caem e a carga a caminho é apreendida
  (`TradeSystem.onWar`, chamado por `Simulation.setWar`).

### Contratos: fim por força maior
A cada dia, na data da entrega: o fornecedor precisa ter o estoque de todos os itens, e o comprador, caixa livre para o
valor da entrega (`spendableUsd`: saldo menos as compras do dia ainda não fechadas). Faltou um dos dois, o contrato
termina com o motivo. Sem rota, tenta todo dia; depois de 30 dias sem rota, termina. Qualquer parte pode encerrar; o
que já está a caminho chega e é pago.

### Mercado mundial
Países de fora da partida, sem anúncio: compra a 160% e venda a 80% da referência, até 300 de cada recurso por dia e
jogador. A carga sai ou entra pela borda do mapa (caminhão pelo terreno até a borda mais próxima, sem atravessar
território de quem está em guerra com o jogador; navio pela água até a borda; avião em linha reta) e passa um trecho
fora do mapa (20 / 30 / 8 s). Paga só na chegada.

### Caixa do país
`TradeLink.pay` acumula o dia em `works.tradePending`; o extrato diário (`treasuryDay`) mostra "Vendas no comércio
(cargas entregues)", "Compras no comércio (cargas recebidas)" e, se houver, fretes, e aplica tudo no caixa.

### IA (`TacticalAI.planTrade`, a cada 10 s)
- Com Terminal Comercial: um anúncio de venda aberto por vez, com a maior sobra (o que passa de 35% da capacidade, até
  400), a 115% da referência.
- Compra um anúncio de quem não está em guerra quando um recurso cai abaixo de 20% da capacidade, se o preço por unidade
  não passa de 1,5× a referência e há rota (prefere caminhão, depois navio, depois avião).
- Abaixo de 8% e sem anúncio que sirva, compra um lote do mercado mundial, se tiver mais de US$ 20 mi livres.
- No `sim-economia` (as duas IAs entram em guerra entre si por volta dos 12 min), o comércio entre elas é raro e o
  mercado mundial aparece no fim (seed 2: uma IA comprou US$ 11,8 mi). `TRADE_LOG=1` mostra o comércio a cada 5 min.

## Rodovia (`HIGHWAY` em `config.ts`)
- Comando `build_road` com `highway: true`; validação em `Simulation.highwayPlan`.
- Pode sair do território **sem engenheiro**: terra neutra ou território de nação que não está em guerra com quem
  constrói. Nunca em país inimigo. Estrada própria vira rodovia (paga a célula); estrada ou rodovia de outro jogador e
  pontes do mapa são puladas e servem de ligação.
- Custo: 20 de pedra e 0,4% do teto anual da verba por célula (o dobro da estrada); manutenção conta 2 células.
- Velocidade: caminhões de carga e caravanas ×2 (estrada: ×1,3); tropas ×1,7 (estrada: ×1,3); custo de caminho 0,4 (as
  tropas preferem a rodovia).
- **Não leva energia:** fica fora da rede elétrica (`roads` com `hw`), inclusive dentro do território.
- Snapshot: `highways` (células) junto com `roads`. O cliente desenha pista dupla: asfalto mais escuro, canteiro central de
  concreto, faixas tracejadas em cada pista, linha de borda e guard-rail onde não há vizinha, placa verde de tempos em
  tempos e nenhum poste (`RoadLayer.highwayTile`).
- Botão "Rodovia" na aba Cívicas do QG; a ferramenta é a mesma da estrada (marcar e arrastar), com a prévia e o custo da
  rodovia.

## Testes
`shared/test/trade.test.ts`: anúncio (terminal, faixa de preço, estoque, reserva e retirada), venda por caminhão só com
estrada contínua e pagamento na chegada, rodovia mais rápida que a estrada, avião em três voos, contrato com fim por
falta de estoque e por falta de caixa, guerra apreendendo carga, emboscada, mercado mundial (preços, limite diário,
pagamento na chegada), salvar/carregar, validação dos comandos, IA anunciando e comprando, rodovia fora do território e
em território inimigo, tropas mais rápidas na rodovia. A dívida saiu dos testes nacionais (`national`, `geopolitics`,
`diplomacy`, `operations`, `policies`, `treasury`), que agora conferem o caixa.
