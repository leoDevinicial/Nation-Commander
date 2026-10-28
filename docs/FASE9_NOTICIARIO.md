# Fase 9 do adendo — noticiário com cadeias causais

O noticiário conta o que a simulação registrou. Nenhuma notícia é escrita sem um evento por trás, e nenhuma causa é
citada sem que o motor a tenha registrado.

## Livro de eventos (servidor — `shared/strategic/NationalSimulation.ts` e `eventLinks.ts`)

- **Id único:** todo evento nacional recebe um `id` sequencial na partida, inclusive os diplomáticos.
- **Registro central:** todos os eventos passam por `record()`, que dá o id, liga o evento a eventos anteriores e o
  envia aos clientes. O livro guarda os últimos 400 eventos (`JOURNAL_MAX`) para procurar ligações.
- **Ordem:** eventos diplomáticos pendentes entram no livro antes de qualquer outro. Assim, uma declaração de guerra
  já está registrada quando o primeiro ataque daquela guerra chega.
- **Salvar e carregar:** o livro, o próximo id e a tradução dos ids diplomáticos fazem parte do salvamento
  (`journal`). Salvamentos antigos carregam com o livro vazio.

### Dois tipos de ligação

| Campo | Significado | Exemplos |
|---|---|---|
| `causeIds` | **Causa registrada pelo motor.** A relação existe no código da simulação. | Guerra → tratado rompido. Guerra → sanções dos aliados do alvo. Sanções em vigor → protesto ou queda de aprovação (o fator "sanções" pesou na aprovação). Choque nuclear → protesto (fator "medo e crise do lançamento nuclear"). |
| `contextIds` | **Contexto (correlação).** Evento anterior relacionado, sem causa comprovada. | Guerra declarada → ataque aéreo, operação ou lançamento nuclear entre os mesmos países. Queda de aprovação ou perdas militares recentes → protesto. Sanções, choque nuclear, guerra, ocupação ou novo orçamento → alerta de dívida, inflação ou crescimento. |

Regras das ligações:
- Só aparecem eventos que existem no livro, dentro de uma janela de tempo (`LINK_WINDOW`: 30 dias para baixas,
  180 para aprovação e economia, 365 para dívida e choque nuclear).
- Um indicador que **melhorou** não puxa contexto de crise.
- As sanções só são citadas enquanto o tratado está em vigor. Quando ele expira, os protestos seguintes deixam de
  citá-lo.
- Sem fator registrado, não há causa. Um protesto só por impostos altos não cita tratado nenhum.

## Noticiário (cliente — `src/game/news.ts` e aba **Noticiário** do painel nacional)

- **Notícia:** título, resumo, data de jogo, tema, alcance (nacional ou internacional) e países envolvidos. Cada país
  é um botão que abre o globo nele.
- **Impacto aplicado:** só números que o evento traz ou que o motor aplica de fato. Exemplos: custo da mobilização,
  dano e petróleo perdido num ataque, −2 de aprovação e −4 de estabilidade num protesto (`PROTEST_IMPACT`).
- **Cadeia:** cada notícia mostra três listas:
  - causas registradas;
  - contexto, com o aviso "correlação, não causa comprovada";
  - desdobramentos, que são as notícias posteriores que a citam.

  Clicar num elo leva à notícia correspondente.
- **Filtros:** todas, nacionais, internacionais, militares, econômicas, sociais e diplomáticas.
- **Agrupamento:** protestos no mesmo país, ataques repetidos entre os mesmos países e alertas do mesmo indicador, a
  até 30 dias um do outro, viram uma notícia só (×N). Cada evento continua rastreável.
- **Visibilidade:** o jogador só recebe os eventos que seu governo conhece (`eventsFor`). Um elo para um evento que
  ele não recebeu simplesmente não aparece.

O painel de eventos da operação continua mostrando os avisos rápidos, que somem em 12 segundos. O noticiário guarda
os últimos 400 eventos recebidos na sessão.

## Protocolo

Os eventos nacionais enviados aos clientes ganharam `id`, `causeIds` e `contextIds` (campos opcionais).
`PROTOCOL_VERSION` passou de 5 para 6.

## Testes

- `shared/test/news.test.ts`: ids únicos e crescentes; ligações só para eventos anteriores existentes; tradução das
  causas diplomáticas; ataque ligado à guerra; cadeia guerra → sanções → protesto, com corte quando as sanções
  expiram; ausência de causa sem fator; janelas de tempo; salvar e carregar.
- `src/test/news.test.ts`: notícias só a partir de eventos, agrupamento, cadeia com desdobramentos, elo para evento
  desconhecido, impacto e filtros.

## Limitações conhecidas

- **Histórico da sessão:** o noticiário do cliente começa vazio ao entrar ou reconectar. O servidor guarda o livro,
  mas ainda não reenvia o histórico.
- **Eventos táticos de fora:** escassez, depósito esgotado e ataques a construções ainda não entram no livro
  nacional, então cadeias como "produção cai → estoque cai → preço sobe" ainda não aparecem.
- **Notícias por país:** ainda não há uma página de notícias por país nem uma ligação direta com uma rota de
  comércio ou um contrato específico.
