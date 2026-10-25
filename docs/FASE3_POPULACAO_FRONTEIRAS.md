# Fase 3 do adendo — população, economia produtiva, armazenamento, geologia e fronteiras

Tudo aqui é do **teatro de operações (RTS)** e é decidido pelo servidor (`shared/sim/Simulation.ts`). O cliente só envia
intenções e mostra o estado que recebe. Os valores são parâmetros de jogo e ficam em `shared/sim/config.ts`.

## População

| Regra | Valor |
|---|---|
| Moradia do Centro de Comando | 20 |
| Casa | +10 de moradia (madeira 40, pedra 20) |
| Prédio Residencial | +20 de moradia (madeira 120, pedra 120, suprimentos 80). Manutenção de 0,25 suprimento/s; se não for paga, não abriga ninguém |
| Teto absoluto por nação | **200**: `capacidade = min(soma das moradias concluídas e pagas, 200)` |
| Cidadãos iniciais | 8 (mais as 4 unidades iniciais) |
| Formar cidadão (no QG) | 40 de comida, 6 s; exige vaga de moradia |
| Consumo | 0,02 de comida/s por habitante. Sem comida há fome: produção a 50% |

A interface separa os grupos (passe o mouse ou toque no 👥 da barra superior):
- população total;
- cidadãos — **empregados** e **ociosos**;
- **militares em campo**;
- militares e cidadãos **em formação**.

**Mobilização:** cada unidade militar consome **1 cidadão ocioso** como tripulação no momento em que entra na fila. Cancelar
devolve o cidadão; uma baixa reduz a população. Por isso, mobilizar diminui a força de trabalho.

**Habitação perdida:** se a moradia cair abaixo da população, ninguém é apagado. Novas formações ficam bloqueadas, com uma
mensagem que diz como liberar espaço.

## Trabalhadores
- **Quem emprega:**
  - fazenda, serraria, pedreira e mina: 3 postos cada;
  - poço de petróleo: 2;
  - base militar: 2;
  - fábrica: 4.
- **Distribuição automática:** cidadãos ociosos ocupam os postos vagos na ordem de construção.
- **Ajuste manual:** botões −/+ no painel do edifício, comando `set_workers`. O alvo vai de 0 até o número de postos; os que
  saem voltam a ficar ociosos.
- **Efeito na produção:** é proporcional a `ocupados / postos`. Com zero trabalhadores, o edifício para e o painel de eventos
  explica o motivo.

## Armazenamento físico (estoque finito)
| Recurso | Onde fica | Capacidade |
|---|---|---|
| Suprimentos | Centro de Comando | 1000 |
| Comida | Silos (QG guarda 150) | 400 por silo |
| Madeira, pedra, ferro | Armazém de Recursos (QG guarda 150/150/100) | 400 de cada, **separado por recurso** |
| Petróleo | Tanques de Petróleo, cada um com estoque próprio (QG mantém uma reserva de 100) | 300 por tanque |

- **Armazém inicial:** cada nação começa com **1 Armazém de Recursos** já construído. Ele é criado uma vez, no estado inicial
  da partida.
- **Capacidade cheia:** a produção **pausa** (status "armazenamento cheio"), sem descarte.
- **Poço de petróleo:** só opera com um **tanque concluído a até 9 células** que tenha espaço. A distância é validada no
  servidor.
- **Consumo de petróleo:** sai dos tanques mais cheios e, por último, da reserva do QG.
- **Destruição:**
  - armazém ou silo: o que exceder a capacidade restante se perde, com o evento `storage_lost`;
  - tanque: perde **exatamente** o petróleo guardado nele.
- **Interface:** a barra superior mostra estoque/capacidade e o saldo por segundo de cada recurso; o painel de cada edifício
  mostra estoque, capacidade e situação.

## Depósitos, geologia e limites de extração
- **Depósito:** agrupamento contínuo de um terreno (floresta, rocha, minério) ou uma jazida de petróleo. Cada um tem:
  - **classe de tamanho**;
  - **limite de instalações**;
  - **quantidade finita**.
- **Validação:** o limite é checado na colocação, no servidor (`chooseClaims`). Duas instalações nunca reivindicam a mesma
  célula.

| Depósito | Pequeno / médio / grande (células) | Instalações | Quantidade por célula |
|---|---|---|---|
| Floresta | < 20 / 20–49 / ≥ 50 | 1 / 2 / 3 serrarias | 80 de madeira |
| Rocha (montanha) | < 12 / 12–35 / ≥ 36 | 1 / 2 / 2 pedreiras | 120 de pedra |
| Minério de ferro | < 6 / 6–15 / ≥ 16 | 1 / 1 / 2 minas | 100 de ferro |
| Jazida de petróleo | — | 1 poço | 2500 |

- **Solo fértil:** é renovável; só o limitam as células livres.
- **Montanhas:** o gerador cria formações rochosas, com **veios de ferro** no núcleo. Cada base recebe uma pequena serra com veio
  dentro do seu território.
- **Ferro:** é um recurso novo, exigido por veículos e tanques de petróleo.
- **Esgotamento:** a produção para (status "depósito esgotado", evento `deposit_depleted`). A produção real também depende de
  trabalhadores, território, fome e espaço de armazenamento.

## Fronteiras (inspiradas em Rise of Nations)
- **Origem do território:** cada edifício concluído com raio projeta influência `peso × (raio − distância)`, e cada célula
  pertence à nação de maior influência. Empate fica neutro. As fontes são:

  | Fonte | Raio | Peso |
  |---|---|---|
  | Centro de Comando | 13 | 1,5 |
  | Torre de vigilância | 8 | 1,2 |
  | Base e fábrica | 5 | 1 |
  | Prédio residencial | 4 | 1 |
  | Casa | 3 | 1 |

- **Fronteira dinâmica:** é recalculada quando uma fonte é concluída, destruída ou muda de alcance. Uma torre empurra a
  fronteira; a perda dela faz o território recuar.
- **Pesquisa nacional:** *Administração Territorial* dá +20% de raio.
- **Construção:** só no **próprio território**. Construir em território de outra nação é sempre recusado, com motivo.
- **Recursos fora do território:** células de recurso que ficam fora param de render.
- **Passagem:**
  - tropas **não entram** no território de outra nação sem **guerra** ou **aliança** (ordens recusadas);
  - o caminho contorna o território proibido;
  - unidades surpreendidas pelo avanço da fronteira saem sozinhas.
- **Atrito na guerra:** unidades em território inimigo perdem 1,2% da vida por segundo. Um **Veículo Blindado** a até 12 m
  mantém a linha de suprimento e evita o atrito.
- **Visual:**
  - faixa contínua na cor da nação ao longo da borda e um tom leve sobre o território;
  - borda e tom também no minimapa.
  - As fronteiras são conhecidas por todos, como num mapa político. O servidor só envia a grade quando ela muda.

## Testes
`shared/test/economy.test.ts` cobre:
- moradia: 20/30/50 e teto de 200;
- formação de cidadãos com custo, tempo e bloqueio sem vaga;
- mobilização e cancelamento;
- trabalhadores proporcionais e parada sem trabalhadores;
- armazém inicial único;
- capacidade cheia e destruição do armazém, com perda registrada;
- tanque cheio e tanque destruído, com perda exata;
- classes de depósito e limite de serrarias;
- mina, esgotamento e evento;
- regras de influência;
- construir só no próprio território;
- fronteira dinâmica com torre;
- entrada proibida, com guerra ou aliança liberando;
- caminho que nunca cruza território proibido;
- evacuação;
- atrito e linha de suprimento;
- envio da grade no snapshot.

`shared/test/simulation.test.ts` também foi atualizado:
- floresta média com 2 serrarias;
- poço que exige tanque.

## Limitações e pendências
- **Salvar/carregar:** não existe (o estado vive no servidor; a reconexão restaura). Os critérios de save/load ficam para a
  fase que criar o salvamento.
- **Mercados, portos e bases aéreas:** ainda não existem; os trabalhadores são alocados nos edifícios atuais (base militar =
  forças terrestres).
- **Alianças entre jogadores:** a regra de passagem já aceita aliados (`setAlliance`), mas a diplomacia ainda não permite
  aliança entre os dois jogadores do teatro.
- **Balanceamento:** valores calibrados com partidas IA × IA; precisam de ajuste com jogadores reais.
