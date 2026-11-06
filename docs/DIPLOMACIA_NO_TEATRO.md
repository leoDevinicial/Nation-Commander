# Diplomacia entre as nações do mapa (06/11)

Pedido do responsável: modo time definido na sala; nas partidas sem times, pactos de não agressão e alianças entre
quem está no mapa (humanos e bots), com envio de recursos e de tropas entre aliados; e a regra para a partida terminar
quando só sobram aliados.

## Modo time

- Definido na sala antes de começar (`set_team`). Não pode todos no mesmo time (a sala recusa ao iniciar).
- Quem está no mesmo time é aliado desde o primeiro dia e para sempre (`team: true` no tratado; `isTeamTreaty`):
  não dá para romper nem declarar guerra ao parceiro.
- Vitória do time: a partida acaba quando só sobra um time vivo e o time inteiro vence, inclusive quem caiu antes
  (`Simulation.teams`, `winners`; o resultado de cada jogador usa `winners`).
- Nas partidas com times não se firma nenhum outro pacto no mapa.

## Pactos sem times

| | Não agressão | Aliança |
|---|---|---|
| Efeito | nenhum dos dois pode atacar o outro (sem guerra possível; sem incidentes de fronteira) | o mesmo, mais visão compartilhada, envio de recursos e tropas em auxílio |
| Firmar | quem propõe paga 20 dias de repasse do próprio caixa | 30 dias |
| Romper | quem rompe paga 90 dias de repasse à outra parte (sem caixa, não rompe) | 120 dias |
| Prazo | sem prazo, até alguém romper | idem |

- Proposta a um **bot**: ele responde na hora (`Diplomacy.evaluatePact`): relação (a rivalidade e o rancor da guerra
  pesam no máximo −15), quem está mais forte no teatro, inimigo em comum e guerra em curso. Não agressão: aceita
  salvo se estiver bem mais forte. Aliança: precisa de inimigo em comum ou relação boa. Recusa segura nova proposta por
  60 dias.
- Proposta a um **humano**: vira convite (`PactOffer`) que ele aceita ou recusa até 60 dias; só quem recebeu responde
  (`answer_offer` confere o dono pela conexão). Aceito, quem propôs paga.
- Firmar em guerra faz a paz (`setPeace`). Não agressão pode virar aliança (a aliança substitui o pacto).
- Com pacto em vigor, a declaração de guerra é recusada até alguém romper.
- Os acordos de defesa com governos de fora do mapa continuam como antes (ajuda militar ao teatro, custo anual).

## Entre aliados

- **Visão compartilhada:** cada um vê o que as unidades e construções do outro veem (sem passar adiante a visão de
  terceiros). Vale também para os aliados de time.
- **Tropas em auxílio:** com tropas de terra selecionadas, o cartão "Auxiliar {país}" manda avançar atacando até o
  Centro de Comando do aliado (`aid_ally`). Entrar no território do aliado já era permitido.
- **Envio de recursos** (`trade_gift`, janela "Enviar recursos" na ficha do país): o jogador escolhe até 6 recursos e
  o transporte; a carga sai do estoque na hora e viaja como as do comércio (pode ser atacada por quem está em guerra
  com uma das partes). Frete pago por quem envia, sobre o valor de referência da carga (mínimo US$ 10 mil):

| Transporte | Frete | Exige |
|---|---|---|
| Caminhão | 4% | Terminal Comercial dos dois lados ligados por rodovia ou estrada contínua |
| Navio | 8% | Porto dos dois lados e um Cargueiro livre de quem envia |
| Avião | 20% | aeroporto dos dois lados (Base Aérea ou QG nível 4) e um avião cargueiro pronto (Transporte ou C-5 Galaxy) |

  Indisponível, o transporte mostra o motivo (`giftModeBlocker`, também no snapshot do dono em `allyLinks`).

## Última aliança

Partida sem times: se depois de uma eliminação só sobram nações com pacto entre si (em todos os pares), os pactos caem
sem indenização e a guerra volta entre elas (`lastPactPairs` + `dissolvePacts`, evento `pacts_dissolved`). Fora de uma
eliminação, um pacto entre os dois últimos vale até alguém romper.

## Testes

`shared/test/pacts.test.ts`: convite, aceite, custo e indenização; sem caixa não rompe; convite expira; paz ao firmar
em guerra e avaliação do bot; modo time; vitória do time; visão compartilhada (e sem repasse a terceiros); última
aliança; auxílio de tropas e envio de recursos (motivos por transporte, frete e entrega pela rodovia).
