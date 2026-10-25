# Fase 2 do adendo — globo diplomático, descoberta e guerra formal

## Divisão de papéis entre as duas visões

| Visão | Para que serve | O que **não** acontece nela |
|---|---|---|
| **Globo diplomático** (botão 🌐 Globo ou `Tab`) | Mostra quem existe, com quem há contato, relações, tratados, sanções e guerras. É onde se tomam as decisões diplomáticas: contato, missões, comércio, alianças, sanções, ajuda e declaração de guerra | Economia, construção ou combate |
| **Teatro de operações (RTS)** | Economia (recursos e edifícios de coleta), bases, produção de tropas e combate | Decisões diplomáticas |

As duas visões leem o mesmo estado autoritativo do servidor (`NationalSimulation` + `Simulation`):

- a guerra declarada no globo é o que libera o combate no teatro;
- os suprimentos e o combustível da mobilização saem do mesmo estoque do teatro.

## Regras

### Existir, ter contato e conhecer

| Estado | O que o jogador vê | O que pode fazer |
|---|---|---|
| **Existe** (sem contato) | Geografia e nome. No globo, o país aparece hachurado | Abrir uma missão de contato |
| **Contato estabelecido** ("descoberto") | Indicadores públicos de referência (Banco Mundial/FMI, início do cenário), relação e fatores, tratados públicos | Negociar e, se o país estiver no teatro, declarar guerra |
| **Informação atual** | PIB, crescimento, aprovação, defesa e dívida correntes | Disponível só com missão diplomática ativa |

Orçamento, pesquisa e demais detalhes de outro país nunca são enviados ao cliente. O servidor filtra por jogador (`viewFor` e
`eventsFor`): eventos sobre pares que o jogador não conhece também não chegam.

**Como se descobre um país:**
1. **Contato inicial** (regra de jogo): países da mesma região diplomática (Américas, Europa, Ásia-Pacífico, África) e as forças
   do mesmo teatro. Não é uma afirmação sobre o mundo real — é o ponto de partida do cenário.
2. **Missão de contato**: custa 0,01% do PIB (financiado por dívida) e leva 20 dias. O contato passa a ser mútuo.
3. **Noticiário de terceiros**: quando um país conhecido assina um tratado, a outra parte se torna conhecida. O evento registra a
   causa (`causes` aponta o tratado).

Todas as descobertas geram o evento `discovered`, com método e causa.

### Declaração de guerra
- Sem guerra formal não há ofensiva:
  - ordens de ataque são recusadas pelo motor, com a mensagem "Sem estado de guerra…";
  - unidades e torres não disparam automaticamente;
  - mover tropas continua permitido.
- **Validação**, sempre na mesma função (`warPreview`):
  - o país é conhecido;
  - os dois países ainda não estão em guerra;
  - o alvo tem forças no teatro;
  - a dívida está abaixo do teto de financiamento (250% do PIB);
  - há suprimentos e combustível no teatro.
- **Custos**, cobrados uma única vez:
  - 150 suprimentos e 50 de combustível do teatro;
  - mobilização de 0,2% do PIB, financiada por dívida;
  - −3 p.p. de aprovação.
- **Consequências**:
  - tratados com o alvo são rompidos;
  - reputação −8 com todos os demais países e −20 com os aliados do alvo;
  - aliados do alvo (governos da IA) com relação abaixo de 40 impõem sanções e encerram o comércio.
  - Todos esses eventos apontam para o `war_declared` como causa.
- **Recursos insuficientes**: a declaração é bloqueada com o motivo e nada muda — sem saldo negativo e sem cobrança parcial.
- **Confirmação**: antes de confirmar, o cliente mostra a estimativa calculada pela mesma função do servidor, só com o que o
  jogador conhece, e por isso rotulada como estimativa. O servidor recalcula com informação completa.
- **IA**:
  - a IA tática não lança ofensiva sem guerra;
  - quando quer atacar, guarda a mobilização e pede a declaração (`wantsWarWith`), que passa pelo mesmo caminho validado do
    jogador humano;
  - comandos de ataque diretos da IA também são recusados sem guerra;
  - a IA de governo só negocia com quem conhece e abre missões de contato para os demais.

### Fora do escopo desta fase (identificado no jogo)
- **Guerra contra governos fora do teatro.** Só existirá com a transição globo → batalha (Fase 8). O botão explica isso em
  vez de fingir uma guerra sem combate.
- **Paz e armistício.** Ainda não implementados.
- **Países fora do cenário.** Os países além dos 10 jogáveis aparecem esmaecidos, sem dados nem governo simulado.

## Interface
- **Globo** com camadas que se ligam e desligam sem reconstruir a esfera: Política, Tratados e Conflitos, Fronteiras e Nomes.
  - A legenda usa as mesmas cores dos painéis (`src/globe/political.ts`).
  - Os nomes aparecem só no hemisfério visível; as capitais, com zoom próximo.
- **Interação**:
  - toque ou clique seleciona o país;
  - arrastar gira o globo;
  - pinça ou roda dão zoom.
  - O painel do país é uma folha inferior no celular e uma coluna lateral no desktop.
- **Painel nacional → Diplomacia**: as mesmas ações em formato de lista (componente `NationActions`), com "Ver no globo".
- **Teatro**: ao inspecionar uma unidade ou construção rival, o painel de comando diz se há guerra e oferece "Abrir no Globo".
- **Desempenho**: com o globo aberto, o teatro continua simulando e interpolando, mas não desenha. O globo é criado na primeira
  abertura e depois só pausa e retoma.

## Protocolo
`PROTOCOL_VERSION` 2. Mudanças:
- a mensagem `national` traz só a própria nação em `nations`;
- `diplomacy` passou a ser a visão filtrada (`nations` com `known`/`intel`, `relations`, `treaties`, `missions`, `wars`);
- há duas ações novas: `establish_contact` e `declare_war`.

Clientes da versão anterior recebem "Versão do jogo desatualizada. Recarregue a página."

## Testes
- `shared/test/geopolitics.test.ts` cobre:
  - a regra de contato inicial;
  - o custo e o prazo da missão de contato;
  - a descoberta por terceiros, com causa;
  - o filtro de informação;
  - a declaração válida: custo cobrado uma vez, tratados rompidos, sanções dos aliados e causas;
  - recursos insuficientes, sem efeito nenhum;
  - o teto de dívida;
  - alvo desconhecido e alvo fora do teatro;
  - a estimativa do cliente;
  - combate e torres sem guerra;
  - a IA tática pedindo guerra em vez de atacar.
- `server/room.test.ts`:
  - a IA declara guerra pelo caminho validado antes de causar qualquer dano;
  - o humano é recusado ao atacar sem guerra;
  - a visão do cliente não traz o orçamento do rival nem dados de países sem contato.
- `src/test/ui-foundation.test.ts`:
  - estado político e cores;
  - hachura dos países sem contato;
  - linhas de tratados e guerras;
  - seleção de país por coordenada.
- **Verificação no navegador** (Chromium headless, desktop e celular com toque):
  - abrir o globo e selecionar a Argentina;
  - abrir o diálogo de guerra e confirmar;
  - ver a Argentina em vermelho e a seleção do Japão, sem contato, oferecer "Estabelecer Contato";
  - no teatro, o ataque ao QG rival é recusado antes da guerra e há combate depois dela.

## Ritmo da IA: período de preparo (ajuste antes da Fase 4)

Partidas são pensadas para 30–60 min. Antes, a IA lançava a primeira ofensiva aos 2,5 min de jogo, enquanto o jogador
ainda montava a base.

| Regra | Valor | Onde |
|---|---|---|
| Período de preparo (sem pedir guerra nem atacar) | 12 min de jogo | `PREPARATION_TICKS` (`shared/sim/config.ts`) |
| Exército máximo da IA no preparo (guarnição) | 6 unidades, salvo se já estiver em guerra | `AI_PREP_GARRISON` |
| Primeira onda | 12 unidades | `AI_FIRST_WAVE` |
| Crescimento por onda | +3, até 24 | `TacticalAI.ts` |
| Intervalo mínimo entre ondas | 4 min de jogo | `AI_WAVE_COOLDOWN_TICKS` |

- No preparo a IA investe na economia (coleta, moradia, depósitos) e só mantém a guarnição; defende a base se atacada.
- Se o jogador declarar guerra antes, a IA deixa de estar em preparo e responde normalmente.
- A barra superior mostra "🛡 Preparo mm:ss" até o fim do período.
- Medido em três mapas: a IA pede guerra aos ~12,4 min (antes: 2,5 min).
- Testes: `shared/test/geopolitics.test.ts` (sem guerra no preparo, guarnição, economia montada, intervalo entre ondas) e
  `server/room.test.ts` (declaração só depois do preparo, pelo caminho validado).
