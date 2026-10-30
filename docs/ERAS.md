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
| 2. Pós-Guerra Fria | QG nível 3 | 300 suprimentos, 200 madeira, 150 pedra, 80 ferro, 15% do teto anual da verba de obras | 60 s |
| 3. Era Digital | QG nível 5 | 700 suprimentos, 450 pedra, 350 ferro, 250 petróleo, 30% do teto anual | 90 s |
| 4. Futuro Próximo | QG nível 7 | 1200 suprimentos, 600 pedra, 700 ferro, 500 petróleo, 50% do teto anual | 120 s |

## O que cada era libera

| Era | Tropas | Construções | Melhorias |
|---|---|---|---|
| Guerra Fria | Infantaria, Veículo Blindado | QG, casas, coleta, armazéns, Base Militar, Fábrica, Torre | até o nível 6 |
| Pós-Guerra Fria | Tanque, Artilharia, Infantaria Antitanque | Centro de Pesquisa, Prédio Residencial, Terminal Comercial, Porto, Estação Ferroviária, Bateria Antiaérea | até o nível 6 |
| Era Digital | Antiaérea Móvel, Phalanx CIWS Móvel, Forças Especiais, Lança-Foguetes; caças, reconhecimento e cargueiros | Base Aérea | até o nível 8 |
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

**Peças apoiadas no telhado real:** radar, painéis solares, torre de telecomunicação e faixa de LED usam
`roofSampler`, um raio vertical contra as malhas do modelo. Antes usavam a altura nominal do edifício e por isso
ficavam flutuando.
- Painéis solares só entram em telhado plano. Telhado em arco (quartel) ou de duas águas (armazém) não recebe
  painel.
- Cada painel tem pés que descem até o telhado.
- O radar é uma parabólica aberta, em escala com o tamanho do edifício.
- O mastro e o radar procuram o ponto de telhado mais próximo do canto.

**Drone de vigilância** (`src/game/render/models/droneModel.ts`): casco facetado cinza-grafite com placas, escotilha e
faixas claras, câmera frontal de três lentes, quatro braços com luz de posição e rotores de três pás afiladas dentro de
protetores octogonais com braçadeiras. Circula o QG com a frente na direção do voo, inclinando para dentro da curva. As
hélices giram sem parar, em sentidos alternados, a 22 rad/s; um disco translúcido sob as pás dá a sensação de
velocidade sem o efeito estroboscópico.

**Lança-Foguetes do Futuro Próximo:** na era 4 ele troca de veículo, não só de pintura (`ERA_BUILDERS` em
`src/game/render/models/unitModels.ts`). É um caminhão 8×8 blindado, com:
- cabine facetada: grade de lâminas verticais, para-brisa dividido, luzes vermelhas de comboio, espelhos e ganchos de
  reboque;
- mastro com câmera e antenas no teto;
- armários laterais na carroceria;
- casulo de 12 tubos cilíndricos grandes (3 × 4), presos por cintas.

**Artilharia do Futuro Próximo:** na era 4 a Artilharia também troca de veículo. Vira um caminhão 6×6 com:
- cabine avançada: grade, espelhos, estepe e escapamento atrás;
- tanque de combustível e escada na lateral;
- plataforma com caixas de equipamento e patolas;
- torre facetada grande, em cunha, com cano longo e fino, freio de boca e sensor eletro-óptico cilíndrico na traseira.

**Tanque Moderno do Futuro Próximo** (`t90Future`), inspirado no T-90M "Proryv":
- casco mais largo, glacis coberto por três fileiras de blocos reativos, saias reativas em toda a lateral e para-lamas
  dianteiros grandes e inclinados;
- torre angular em cunha com módulos reativos em ponta de flecha;
- bloqueadores Shtora com lentes **acesas na cor da facção** e mira panorâmica do comandante com lente azul acesa
  (`glow` no modelo: disco brilhante com halo aditivo; `color: 'faction'` usa a cor do dono);
- estação de armas remota, bancos de fumígenos, gaiola de grades na traseira da torre;
- canhão longo com luva térmica e sensor de referência na boca.

**Antiaérea Móvel do Futuro Próximo** (`buildMobileAaFuture`), no estilo Pantsir sobre um 8×8 blindado:
- casco facetado com camuflagem digital;
- torre com dois canhões gêmeos e dois casulos de 6 mísseis interceptadores;
- radar de busca retangular com luzes no mastro de trás, radar de tiro redondo e sensor óptico.

O tiro em terra é de dois disparos fortes e separados (0,2 s), um de cada canhão gêmeo: tiro `twin` em
`Projectiles`, com clarão e fumaça de boca, e o som `aa_twin`. O som tem, em cada tiro:
- o estalo supersônico;
- o sopro saturado da boca;
- o soco grave do recuo e um subgrave longo;
- a mecânica: o ferrolho batendo no fim do curso.

Depois dos dois tiros vem o eco do terreno, pela reverberação de campo aberto (`AudioService.outdoorReverb`, resposta ao
impulso gerada em código, compartilhada pelo canal de combate).

O **Tanque Moderno** usa a mesma receita (`mbt_gun`), com um disparo só e 20% mais grave. O tanque comum (`tank_gun`)
também usa a receita, com um disparo, um pouco mais agudo e mais fraco: 55% do volume, menos subgrave e menos eco. A Antiaérea Móvel das eras anteriores (lagartas, estilo
Gepard) continua com a rajada `flak` e o som `aa_gun`.

**Interceptação de foguetes:** na era 4, a antiaérea intercepta as salvas do Lança-Foguetes em voo. A regra fica em
`ROCKET_INTERCEPT`, em `shared/sim/Simulation.ts`:
- cada antiaérea a até 9 células do ponto de impacto derruba metade dos foguetes que restam de uma salva;
- só intercepta depois de 30% do voo e recarrega em 4 s;
- o dano da salva cai na mesma proporção, e uma salva derrubada por inteiro não chega a cair;
- evento `salvo_intercepted`.

No cliente:
- os interceptadores saem das bocas dos tubos (`launchers` no modelo, `UnitVisual.launcherWorld`);
- são menores que os foguetes do Lança-Foguetes;
- perseguem os foguetes, que explodem no ar (`RocketLayer.intercept`).

O **Phalanx CIWS Móvel** (Era Digital) também derruba foguetes em voo, com o Gatling: 40% do que resta da salva, a
até 8 do impacto, desde a era 3. Ver `docs/CIWS.md`.

As luzes de comboio do Lança-Foguetes, as lanternas da Artilharia e as faixas desses três veículos também seguem a cor
da facção do jogador.

As unidades já em campo trocam de modelo ao serem modernizadas na era nova.

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
