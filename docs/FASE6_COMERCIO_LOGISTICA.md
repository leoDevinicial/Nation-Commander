# Fase 6 do adendo — comércio internacional e logística visível

O servidor decide tudo (`shared/sim/trade.ts`, ligado à simulação tática). A diplomacia e o tesouro vêm da
camada nacional por uma ligação (`TradeLink`). O cliente só envia intenções:

- `trade_offer` (proposta ou contraproposta);
- `trade_respond` (aceitar ou recusar);
- `trade_withdraw` (retirar uma proposta);
- `trade_cancel` (cancelar um contrato).

O painel mostra custos e motivos de bloqueio com as mesmas regras do servidor.

## Instalações
| Construção | Para quê |
|---|---|
| Terminal Comercial | obrigatório para negociar; despacha comboios rodoviários; 2 embarques simultâneos por terminal |
| Estação Ferroviária | habilita o modal ferroviário (mais carga, menos frete) |
| Porto | precisa ficar na margem da água (2+ células de água em volta); habilita o modal marítimo; o modelo vira o cais para a água |
| Centro de Comando nível 4 | heliponto de carga: habilita o modal aéreo |

**Fórmula da infraestrutura:** embarques simultâneos de um modal = instalações desse modal × 2. Para o aéreo,
contam os terminais comerciais. Construir uma estação ou um porto troca o modal (capacidade, frete e tempo da
tabela abaixo); um segundo terminal dobra os embarques simultâneos.

## Modais
| Modal | Carga por viagem | Velocidade no mapa | Trecho fora do teatro | Frete por unidade | Exposição |
|---|---|---|---|---|---|
| Rodoviário | 60 | 4 | 30 dias | US$ 2.000 | território de países em guerra bloqueia; tropas e torres inimigas a até 5 destroem o comboio |
| Ferroviário | 160 | 7 | 18 dias | US$ 800 | mesma rota terrestre |
| Marítimo | 320 | 3 | 45 dias | US$ 500 | precisa de água junto ao porto; em guerra, escolta: +50% de tempo |
| Aéreo | 20 | 14 | 6 dias | US$ 9.000 | em guerra, +50% de frete (espaço aéreo contestado) |

- **Rota terrestre:** calculada por pathfinding do terminal até a fronteira do mapa no lado do país parceiro (ou
  até o terminal do outro jogador), evitando território de quem está em guerra com quem despacha.
- **Rota marítima e aérea:** seguem em linha reta até a borda.
- **Sem rota:** o contrato fica **suspenso**. Nunca há transporte instantâneo.

## Ofertas
- **Quem pode negociar:** jogadores do teatro e países fora dele governados pela IA, desde que haja contato
  diplomático, nem guerra nem sanções, e as instalações exigidas dos dois lados.
- **Conteúdo da oferta:** recurso (comida, madeira, pedra, ferro, petróleo), quantidade (até 2.000), preço por
  unidade, sentido (comprar ou vender), modal e prazo do contrato (60 a 720 dias).
- **Validade:** 90 dias para ofertas de jogadores e 60 para ofertas dos países da IA. Depois disso, a oferta
  **expira**.
- **Resposta do receptor:** aceitar, recusar ou **contrapropor**. A contraproposta é uma nova oferta ligada à
  original, que fica marcada como contraproposta.
- **Países da IA:**
  - respondem em 3 dias;
  - aceitam a preço de mercado (±3%) quando têm oferta ou demanda suficiente;
  - contrapropõem preço e/ou quantidade quando a proposta está a até 20–25% do mercado;
  - recusam com motivo quando a relação é ruim ou o preço está longe demais.
- **Ofertas espontâneas:** a cada 45 dias, cada país da IA pode enviar uma oferta a quem tem terminal comercial.
- **Mercado:** cada país tem preço de venda e de compra por recurso, conforme a vantagem comparativa (ex.:
  Austrália com muito ferro, Japão importador de petróleo) e a relação diplomática. Também tem estoque para
  exportar e demanda, que se repõem por dia.
- **IA tática:** os jogadores controlados pela IA respondem às ofertas de outros jogadores pela mesma regra de
  aceitação.

## Contratos e estados da mercadoria
1. **Aceite:** o servidor revalida tudo no momento, pela regra `acceptBlocker`:
   - estoque utilizável no depósito certo: petróleo só dos **tanques**, comida dos **silos**, madeira/pedra/ferro
     dos **armazéns**;
   - capacidade livre no destino para o primeiro lote;
   - oferta ou demanda do país da IA;
   - crédito: dívida abaixo de 150% do PIB para importar.
2. **Reservado:** a quantidade inteira sai do estoque utilizável do vendedor e fica presa ao contrato no
   depósito de origem. Não pode ser vendida de novo.
3. **Em transporte:** a cada dia o contrato despacha lotes limitados à capacidade do veículo, enquanto houver
   veículo livre. Quem despacha paga o frete na saída. A carga passa pelos estados carregando (3 s mais a
   distância do depósito ao terminal), em trânsito no mapa e em trânsito fora do teatro, nesta ordem na
   exportação e na ordem inversa na importação.
4. **Entregue:** só entra no estoque do comprador **ao chegar e se couber**. Se faltar espaço, a carga
   **aguarda no pátio** e tenta de novo a cada segundo. O pagamento (preço × quantidade entregue) acontece na
   entrega.
5. **Perdido:** comboio destruído por forças inimigas, terminal de destino destruído ou carga apreendida.

| Estado do contrato | Quando |
|---|---|
| Ativo | despachando normalmente |
| Suspenso | sem rota, sem instalação ou aguardando atraso; retoma sozinho quando a rota volta |
| Cumprido | tudo entregue (ou entregue com perdas registradas) |
| Interrompido | guerra ou sanções entre as partes (a carga a caminho é apreendida), ou reserva perdida com o depósito |
| Cancelado | por uma das partes: a reserva não embarcada volta ao estoque; nada já pago é devolvido |
| Expirado | prazo terminou sem embarcar tudo: a reserva volta ao estoque |

**Depósito de origem destruído antes da retirada:** se houver outro depósito do mesmo tipo, a reserva é
redirecionada para ele, com 10 dias de atraso. Senão, a reserva se perde e o contrato é interrompido.

**Dinheiro:** exportação reduz a dívida nacional; importação e frete a aumentam. A balança aparece na aba
Comércio.

**Insumos interrompidos:** se uma importação é suspensa ou interrompida, o motivo aparece no painel de eventos.
O consumo das fábricas cai pelas regras de manutenção já existentes quando o estoque acaba, com alerta de falta
do recurso.

## Interface
- **Nação → Comércio:**
  - balança comercial e modais disponíveis, com o motivo de cada bloqueio;
  - ofertas recebidas (aceitar, recusar, contrapropor) e propostas enviadas (retirar);
  - contratos com estado, barra entregue/embarcado/perdido, pagamentos, frete, prazo e cargas com estimativa;
  - mercado dos países conhecidos;
  - formulário com total, número de viagens, frete, riscos e o que impede o envio.
- **Ver rota:** centraliza a câmera na carga, desenha o trajeto restante em linha tracejada e abre a inspeção:
  produto, origem/destino, volume, estado, chegada estimada, capacidade, andamento do contrato e riscos.
- **No mapa:** cada embarque em trânsito é um veículo: comboio de caminhões, composição ferroviária, navio
  porta-contêineres ou helicóptero de carga, com a cor da nação.
  - Cada embarque já é um lote agregado (até a capacidade do veículo), e só os 24 mais próximos da câmera são
    desenhados.
  - Os outros jogadores veem só os veículos que estão no campo de visão deles.
- **Modelos:**
  - Terminal Comercial: escritório, balança, cancela, pátio de contêineres e empilhadeira;
  - Porto: cais com defensas e cabeços, portêiner com carro animado, armazém portuário;
  - Estação Ferroviária: plataforma coberta, duas linhas, prédio da estação, pórtico de carga, sinal e
    composição.

## Persistência
O estado do comércio entra em `Simulation.toSave()` e continua idêntico após carregar (teste): ofertas,
contratos, embarques e mercado dos países.

## Testes
`shared/test/trade.test.ts` cobre:

- propostas inválidas: sem terminal, sem contato, guerra, sanções, limites e modal sem instalação;
- estoque insuficiente e reserva sem venda dupla;
- exportação completa com pagamento só na entrega;
- importação limitada pela capacidade;
- rota bloqueada (suspensão e expiração, sem transporte instantâneo);
- guerra interrompendo e apreendendo carga;
- depósito destruído (redirecionamento e perda);
- contraproposta;
- infraestrutura mudando o fluxo (ferrovia com lote maior e entrega antes);
- salvar/carregar;
- validação dos comandos.

## Limitações
- Não há ferrovias desenhadas no mapa: o trem segue a mesma rota terrestre dos caminhões.
- O navio sai em linha reta da água junto ao porto até a borda; lagos internos contam como água navegável.
- Os países da IA não negociam entre si; o comércio deles com o jogador usa estoque e demanda abstratos.
