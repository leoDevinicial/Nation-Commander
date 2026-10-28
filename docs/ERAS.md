# Eras

Eixo central da progressão (lote 1, §3.1 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md)).
As regras estão em `shared/sim/eras.ts`.

## Como se avança

O avanço é uma obra no **Centro de Comando** (botão "Era …" no QG selecionado). Ele exige o QG no nível mínimo e
custa recursos do teatro e US$ da verba de obras. Durante a obra, o topo da tela mostra o progresso, e cancelar
devolve 75%. Ao concluir, todos os jogadores recebem o aviso: o seu com som de sucesso, o do inimigo com alarme.

| Era | Requisito | Custo | Obra |
|---|---|---|---|
| 1. Guerra Fria | início | — | — |
| 2. Pós-Guerra Fria | QG nível 3 | 300 suprimentos, 200 madeira, 150 pedra, 80 ferro, US$ 25 mi | 60 s |
| 3. Era Digital | QG nível 5 | 700 suprimentos, 450 pedra, 350 ferro, 250 petróleo, US$ 70 mi | 90 s |
| 4. Futuro Próximo | QG nível 7 | 1200 suprimentos, 600 pedra, 700 ferro, 500 petróleo, US$ 180 mi | 120 s |

## O que cada era libera

| Era | Tropas | Construções | Melhorias |
|---|---|---|---|
| Guerra Fria | Infantaria, Veículo Blindado | QG, casas, coleta, armazéns, Base Militar, Fábrica, Torre | até o nível 6 |
| Pós-Guerra Fria | Tanque, Artilharia, Infantaria Antitanque | Centro de Pesquisa, Prédio Residencial, Terminal Comercial, Porto, Estação Ferroviária, Bateria Antiaérea | até o nível 6 |
| Era Digital | Antiaérea Móvel, Forças Especiais, Lança-Foguetes; caças, reconhecimento e cargueiros | Base Aérea | até o nível 8 |
| Futuro Próximo | Tanque Moderno; bombardeiros | Silo de Mísseis | até o nível 10 |

As pesquisas do Centro de Pesquisa Militar continuam existindo, mas cada uma só abre na era da tropa que libera. O
menu de construção, os botões de produção, de pesquisa e de aeronaves mostram "era N" quando algo é de uma era
futura.

## Aparência

A nação inteira troca de visual ao mudar de era. As construções mudam de material e ganham peças por cima, com um
pulso curto na transição:

| Era | Materiais | Peças |
|---|---|---|
| Guerra Fria | concreto e pintura gastos | — |
| Pós-Guerra Fria | metal pré-fabricado cinza-azulado | radar giratório nas instalações militares e no QG |
| Era Digital | vidro e aço claros e lisos | painéis solares nos telhados; torre de telecomunicação no QG e nas prefeituras |
| Futuro Próximo | compósito escuro; vidros como telas | faixas de LED na cor da facção; drone de vigilância circulando o QG |

As tropas novas saem com a pintura da era do dono: cinza-oliva, camuflagem digital clara e compósito escuro. As
antigas mantêm a pintura até serem modernizadas numa instalação.

## Onde vale

A sala liga as eras em todas as partidas (`Simulation.eras`). No Sandbox, tudo fica liberado, e avançar de era é
livre e instantâneo, para ver o visual de cada uma. Simulações sem eras, como os testes antigos e as batalhas
locais das operações, tratam tudo como liberado.

A IA avança de era assim que o QG permite. Com o QG pronto para a próxima era, ela guarda material para o avanço em
vez de gastar em prefeituras e melhorias.

## Testes

- `shared/test/eras.test.ts`: bloqueios, avanço, custo e prazo, cancelamento, pesquisa, tropas, nível de melhoria,
  visual das tropas, salvar e carregar, Sandbox.
- `server/sandbox.test.ts`: avanço livre no Sandbox.
- `server/persistence.test.ts`: a IA chega à pesquisa militar numa partida real com eras.
