# Fase 4 do adendo — melhorias de construções

O servidor decide tudo (`shared/sim/Simulation.ts`). As regras são dados em `shared/sim/upgrades.ts`, e o servidor (para
validar) e o painel do cliente (para mostrar) usam as mesmas funções puras: `planUpgrade`, `upgradeCost` e
`buildingEffects`. O cliente só envia a intenção (`upgrade` / `cancel_upgrade`).

## Como o jogador usa
1. Selecione uma construção sua concluída. O botão **"Nv N ⬆ Melhorar"** mostra o custo em US$. Ele fica vermelho
   quando algo impede a obra.
2. O botão abre o **painel de melhoria**, com:
   - nível atual e próximo;
   - custo em recursos do teatro, em US$ (com o saldo do fundo de obras) e tempo de obra;
   - requisitos, cada um com ✔/✖ e o valor atual;
   - ganhos esperados (antes → depois) e manutenção adicional;
   - riscos;
   - quando há especialização, a escolha entre as opções, com vantagens e desvantagens;
   - a tabela de todos os níveis da classe.

   O botão de iniciar só fica ativo com tudo atendido. Quando falta algo, o rodapé diz exatamente o quê.
3. Durante a obra, o edifício:
   - mostra andaimes e um guindaste;
   - opera a **50%**;
   - pode ser **cancelado**, devolvendo **80%** dos recursos e do dinheiro;
   - se for **destruído**, perde o investimento.
4. Na conclusão, o nível e os efeitos passam a valer, e o painel de eventos avisa.

No celular, o painel sobe da base da tela (até 92% da altura), com rolagem e o botão de iniciar fixo no rodapé.

## Regras gerais
| Regra | Valor |
|---|---|
| Níveis | até **10** por classe (casa 3, torre 5) |
| Uma obra por vez | por edifício; o edifício precisa estar concluído |
| Nível relativo ao QG | nenhum edifício passa de **nível do QG + 2** |
| Pesquisa | cada classe tem uma tecnologia nacional exigida a partir de certo nível (tabela abaixo) |
| Logística | coleta, quartel e fábrica exigem, a partir do nível 4, um depósito do produto com nível ≥ ⌊N/2⌋ |
| Infraestrutura nacional | a partir do nível **8**, índice de infraestrutura nacional ≥ **1,02** |
| Estabilidade | QG nível 9+: estabilidade política ≥ **45** |
| Especialização | escolhida no nível **6**; obrigatória e permanente |
| Custo | recursos do teatro **e** US$ do orçamento nacional; ambos são cobrados no início da obra |
| Durante a obra | o edifício opera a 50%; cancelar devolve 80%; destruído = investimento perdido |

## Dinheiro: fundo nacional de obras
Toda melhoria custa US$ ao orçamento nacional. Não existe dinheiro infinito:
- **Origem:** o fundo recebe **0,3% do orçamento anual de infraestrutura** (`WORKS_SHARE_OF_INFRA`). Essa fatia já está dentro
  do gasto de infraestrutura contabilizado na economia nacional, então não cria despesa nem dívida nova.
- **Saldo inicial:** começa com **50% do teto anual**.
- **Recarga:** 1/365 do teto por dia de jogo (1 dia = 1 s). O saldo nunca passa do teto.
- **Ajuste pelo orçamento:** mudar a fatia de infraestrutura muda o teto. O quadro **Verba de obras do teatro**, na aba
  **Orçamento**, mostra o saldo, o teto, a prévia do teto no rascunho, o total gasto e o livro das últimas obras (débitos e
  devoluções).
- **Falta de dinheiro:** sem saldo, a obra é recusada ("Verba de obras insuficiente: disponível X de Y").

Com a infraestrutura padrão (2,5% do PIB):

| Modo | Teto anual | Saldo inicial | Recarga por minuto de partida |
|---|---|---|---|
| Paridade (todos iguais) | US$ 75 mi | US$ 38 mi | ≈ US$ 12 mi |
| Realista — Estados Unidos | US$ 2.308 mi | US$ 1.154 mi | ≈ US$ 379 mi |
| Realista — Alemanha | US$ 379 mi | US$ 189 mi | ≈ US$ 62 mi |
| Realista — Brasil | US$ 171 mi | US$ 85 mi | ≈ US$ 28 mi |
| Realista — Argentina | US$ 51 mi | US$ 26 mi | ≈ US$ 8 mi |
| Realista — África do Sul | US$ 32 mi | US$ 16 mi | ≈ US$ 5 mi |

No modo realista, o PIB vem dos dados reais (Banco Mundial/FMI, `docs/DATA_SOURCES.md`). Os custos em US$ das melhorias
são **parâmetros de jogo**, não preços reais.

Escala dos custos: levar o QG ao nível 10 custa US$ 353 mi no total, e uma fazenda, US$ 88 mi. Em paridade, numa partida de
45 min, isso obriga a escolher o que melhorar.

## Classes, custos e requisitos
Fórmulas:
- custo em recursos do nível N: `custo × crescimento^(N−2)`, arredondado a 5;
- custo em US$: `US$ × crescimento^(N−2)`;
- tempo: `tempo × crescimento^(N−2)`; a pesquisa *Construção modular* acelera as obras.

| Classe | Níveis | Nível 2: recursos · US$ · tempo | Nível máximo: recursos · US$ · tempo | Ganho por nível | Pesquisa | Logística | Especialização (nível 6) |
|---|---|---|---|---|---|---|---|
| Centro de Comando | 10 | 150 sup · 80 mad · 80 ped · US$ 12 mi · 30 s | 1225 sup · 655 mad · 655 ped · US$ 87 mi · 74 s | +12% armazenagem, +4 moradia, +12% renda, +0,5 de raio, +8% vida, +6% dano, +0,2 alcance, +0,5 visão | Logística integrada (4); Administração territorial (7) | — | administrativo / logístico / fortificado |
| Fazenda | 10 | 50 sup · 50 mad · 20 ped · US$ 3 mi · 14 s | 360 sup · 360 mad · 145 ped · US$ 22 mi · 35 s | +10% coleta, +6% vida, +1 posto nos níveis 4 e 8 | Mecanização agrícola (5) | Silo | intensiva / mecanizada / celeiro |
| Serraria | 10 | 60 sup · 40 ped · US$ 3,6 mi · 14 s | 430 sup · 290 ped · US$ 26 mi · 35 s | idem | Extração mecanizada (5) | Armazém | intensiva / eficiente / mecanizada |
| Pedreira | 10 | 60 sup · 50 mad · US$ 3,6 mi · 15 s | 430 sup · 360 mad · US$ 26 mi · 37 s | idem | Extração mecanizada (5) | Armazém | idem |
| Mina | 10 | 70 sup · 50 mad · 30 ped · US$ 4,4 mi · 16 s | 505 sup · 360 mad · 215 ped · US$ 32 mi · 40 s | idem | Extração mecanizada (5) | Armazém | idem |
| Poço de Petróleo | 10 | 80 sup · 50 ped · 30 fer · US$ 5 mi · 16 s | 575 sup · 360 ped · 215 fer · US$ 36 mi · 40 s | idem | Perfuração avançada (5) | Tanque de Petróleo | recuperação avançada / gestão do reservatório / enxuta |
| Armazém de Recursos | 10 | 60 mad · 60 ped · US$ 2,4 mi · 12 s | 430 mad · 430 ped · US$ 17 mi · 26 s | +15% armazenagem, +8% vida | Logística integrada (5) | — | alta capacidade / protegido |
| Silo | 10 | 60 mad · 30 ped · US$ 2 mi · 10 s | 430 mad · 215 ped · US$ 14 mi · 21 s | idem | Logística integrada (5) | — | idem |
| Tanque de Petróleo | 10 | 60 ped · 30 fer · US$ 3 mi · 12 s | 430 ped · 215 fer · US$ 22 mi · 26 s | idem | Logística integrada (5) | — | idem |
| Casa | 3 | 30 mad · 20 ped · US$ 0,8 mi · 10 s | 40 mad · 30 ped · US$ 1 mi · 12 s | +3 moradia, +10% vida | — | — | — |
| Prédio Residencial | 10 | 60 sup · 80 mad · 80 ped · US$ 5 mi · 20 s | 430 sup · 575 mad · 575 ped · US$ 36 mi · 43 s | +4 moradia, +8% vida | Construção modular (5) | — | alta densidade / autossuficiente |
| Base Militar | 10 | 100 sup · 60 mad · 40 ped · US$ 6 mi · 20 s | 720 sup · 430 mad · 290 ped · US$ 43 mi · 43 s | −4% tempo de treino e de alistamento, +8% vida, +1 posto no nível 5 | Treinamento acelerado (5) | Silo | treinamento intensivo / elite / alistamento |
| Fábrica de Veículos | 10 | 140 sup · 80 ped · 60 fer · US$ 10 mi · 25 s | 1010 sup · 575 ped · 430 fer · US$ 72 mi · 54 s | −4% tempo de produção, +8% vida, +1 posto no nível 5 | Automação industrial (5) | Armazém | volume / energia / avançados |
| Torre de Vigilância | 5 | 80 ped · 30 fer · US$ 3 mi · 14 s | 175 ped · 65 fer · US$ 6,6 mi · 20 s | +12% dano, +0,6 alcance, +1 visão, +0,5 de raio, +10% vida | Munição guiada (4) | — | — |

Abreviações: sup = suprimentos, mad = madeira, ped = pedra, fer = ferro. As três tecnologias novas (*Mecanização
agrícola*, *Extração mecanizada*, *Perfuração avançada*) entram na árvore nacional, e a IA nacional as pesquisa.

**Manutenção adicional.** Por nível acima do 1, cada classe soma manutenção em suprimentos/s:

| Classes | Suprimentos/s por nível |
|---|---|
| Coleta | +0,03 |
| Depósitos, casa e torre | +0,02 |
| Base militar | +0,04 |
| Fábrica e prédio residencial | +0,05 |

Algumas especializações também custam petróleo.

**Manutenção não paga.** Se faltar o recurso na cobrança, os edifícios que dependem dele param (status "manutenção não
paga") até o estoque voltar: deixam de coletar, produzir ou abrigar. O QG não tem manutenção, então a renda nunca trava.

### Centro de Comando, nível a nível
| Nível | Recursos | US$ | Tempo | Vida | Renda (sup/s) | Moradia | Raio (células) |
|---|---|---|---|---|---|---|---|
| 1 | inicial | — | — | 1500 | 3,00 | 20 | 13 |
| 2 | 150 sup · 80 mad · 80 ped | 12 mi | 30 s | 1620 | 3,36 | 24 | 13,5 |
| 3 | 195 sup · 105 mad · 105 ped | 15 mi | 34 s | 1740 | 3,72 | 28 | 14 |
| 4 | 255 sup · 135 mad · 135 ped | 20 mi | 38 s | 1860 | 4,08 | 32 | 14,5 |
| 5 | 330 sup · 175 mad · 175 ped | 25 mi | 42 s | 1980 | 4,44 | 36 | 15 |
| 6 | 430 sup · 230 mad · 230 ped | 32 mi | 47 s | 2100 | 4,80 | 40 | 15,5 |
| 7 | 555 sup · 295 mad · 295 ped | 41 mi | 53 s | 2220 | 5,16 | 44 | 16 |
| 8 | 725 sup · 385 mad · 385 ped | 53 mi | 59 s | 2340 | 5,52 | 48 | 16,5 |
| 9 | 940 sup · 500 mad · 500 ped | 68 mi | 66 s | 2460 | 5,88 | 52 | 17 |
| 10 | 1225 sup · 655 mad · 655 ped | 87 mi | 74 s | 2580 | 6,24 | 56 | 17,5 |

A moradia continua limitada ao teto nacional de 200 habitantes.

## Especializações (mutuamente exclusivas)
Nenhuma é superior em tudo: cada uma tem vantagem e custo claros. O painel mostra os dois lados antes da escolha.

| Classe | Especialização | Vantagens | Desvantagens |
|---|---|---|---|
| Centro de Comando | Centro administrativo | +3 células no raio da fronteira; +10% de renda | −20% de vida; −10% de armazenagem |
| Centro de Comando | Centro logístico | +40% de armazenagem; +15% de renda | −2 células no raio; −10% de vida |
| Centro de Comando | QG fortificado | +60% de vida; +50% de dano e +2 de alcance da defesa | −15% de renda; −20% de moradia |
| Fazenda | Agricultura intensiva | +30% de produção | +0,15 suprimento/s de manutenção |
| Fazenda | Mecanizada | 2 trabalhadores a menos | +0,1 petróleo/s; sem petróleo, para |
| Fazenda | Celeiro próprio | +300 de capacidade de comida; +5% de produção | abre mão dos +30%; +0,05 suprimento/s |
| Serraria, pedreira, mina | Extração intensiva | +35% de produção | o depósito diminui 25% a mais por unidade (esgota antes) |
| Serraria, pedreira, mina | Recuperação eficiente | o depósito diminui 30% menos (rende ~43% mais no total) | −10% de produção |
| Serraria, pedreira, mina | Mecanizada | 1 trabalhador a menos | +0,08 petróleo/s; sem petróleo, para |
| Poço de Petróleo | Recuperação avançada | +35% de produção | +0,2 suprimento/s; o depósito diminui 10% a mais |
| Poço de Petróleo | Gestão do reservatório | o depósito diminui 30% menos | −15% de produção |
| Poço de Petróleo | Operação enxuta | −70% de manutenção; 1 trabalhador a menos | −10% de produção |
| Armazém, silo, tanque | Alta capacidade | +30% de capacidade | −25% de vida (destruído, o excedente se perde) |
| Armazém, silo, tanque | Protegido | +70% de vida | −10% de capacidade |
| Prédio Residencial | Alta densidade | +30% de moradia | +0,25 suprimento/s; −15% de vida |
| Prédio Residencial | Condomínio autossuficiente | −60% de manutenção | −15% de moradia |
| Base Militar | Treinamento intensivo | −20% no tempo de treino de infantaria e de alistamento | +0,25 suprimento/s |
| Base Militar | Escola de elite | infantaria formada aqui com +20% de vida | cada soldado custa +25% e leva +15% de tempo |
| Base Militar | Centro de alistamento | recrutas −30% de custo e de tempo | treino de infantaria 10% mais lento |
| Fábrica de Veículos | Produção em volume | −25% no tempo de produção | +0,15 petróleo/s e +0,1 suprimento/s |
| Fábrica de Veículos | Eficiência energética | veículos gastam −25% de petróleo; −50% de manutenção | produção 10% mais lenta |
| Fábrica de Veículos | Equipamentos avançados | veículos com +20% de vida | cada veículo custa +20% e leva +15% de tempo |

## Efeitos: sempre derivados, nunca somados
`buildingEffects(classe, nível, especialização)` calcula todos os valores funcionais:
- vida máxima, coleta e consumo do depósito;
- postos, armazenagem, moradia, renda, raio de território e manutenção;
- tempo e custo de produção, petróleo e vida das unidades;
- alistamento, dano, alcance e visão.

A fórmula é `1 + passo × (N − 1)`, mais os modificadores da especialização uma única vez. O resultado é congelado e
memorizado.

A simulação **nunca** acumula um efeito no estado: guarda só `level`, `spec` e a obra em andamento, e consulta
`buildingEffects` sempre que precisa. Por isso um efeito não pode ser aplicado duas vezes, nem em reconexões nem ao carregar.

Na conclusão de uma obra, o servidor:
- aumenta a vida atual pela diferença da vida máxima;
- ajusta os postos e redistribui os trabalhadores;
- recalcula o território;
- se a capacidade diminuiu (troca para *Protegido*), descarta o excedente.

A IA tática começa a melhorar aos 2 min, uma obra por vez. A ordem de prioridade é:
1. QG — guarda recursos para ele quando é o próximo passo;
2. coletas;
3. depósitos, só quando um requisito de logística bloqueia ou o estoque passa de 70%;
4. quartel e fábrica, depois do período de preparo;
5. moradia, perto do limite.

Ela sempre mantém uma reserva de suprimentos e comida. Especializações da IA (`AI_SPEC`):

| Classe | Escolha |
|---|---|
| QG | fortificado |
| Fazenda | intensiva |
| Extração | eficiente |
| Poço | recuperação avançada |
| Depósitos | alta capacidade |
| Prédio residencial | alta densidade |
| Base militar | treinamento intensivo |
| Fábrica | volume |

## Evolução visual modular
`src/game/render/models/upgradeModules.ts` define módulos procedurais por nível e especialização. Um edifício no nível N
mostra todos os módulos de nível ≤ N, mais os da sua especialização. Os módulos ficam dentro da área do edifício e somam
à silhueta:

| Classe | Exemplos de módulos |
|---|---|
| QG | postes de luz, painéis solares, anexo com condensadora, segundo pavimento na torre, mastro, radar (nível 9), holofotes; bandeiras, átrio de vidro e parabólica (*administrativo*), contêineres e tanques (*logístico*), casamata, segunda torre de defesa, sacos de areia e persianas blindadas (*fortificado*) |
| Base militar | armários, respiros, pista de obstáculos, guarita, caixa-d'água, cerca, holofotes; estande de tiro e torre de rapel (*treinamento*), rede de camuflagem e blindado (*elite*), tenda e bandeiras (*alistamento*) |
| Fábrica | exaustores, tanque, pórtico rolante, rack de tubulação, condensadoras, holofote; chaminé alta com fumaça (*volume*), painéis solares e aerogerador (*energia*), blindado em teste e radar de ensaio (*avançados*) |
| Fazenda | estufa, caixa-d'água, pulverizador (*intensiva*), colheitadeira (*mecanizada*), silos (*celeiro*), aerogerador, elevador de grãos |
| Serraria | pilha de toras, estufa de secagem com chaminé, caminhão, silo de serragem, caixa-d'água, holofote; descascador de toras (*intensiva*), ciclone de serragem e briquetes (*eficiente*), grua florestal (*mecanizada*) |
| Pedreira | blocos, britador, caminhão, esteira até a pilha de brita, tanque, holofote; segunda escavadeira e explosivos (*intensiva*), peneira com pilha classificada (*eficiente*), pá carregadeira (*mecanizada*) |
| Mina | caçambas de minério, britador, caminhão, tubos de ventilação na encosta, poço de ventilação no alto, holofote; escavadeira (*intensiva*), separação de minério com pilha de rejeito (*eficiente*), pá carregadeira (*mecanizada*) |
| Poço | vaso separador, tanques, tocha de queima de gás, rack de tubulação, segundo cavalo-mecânico; bombas de injeção e tanque de água (*recuperação avançada*), sala de controle e mastro (*gestão do reservatório*), painéis solares (*enxuta*) |
| Depósitos | docas cobertas, lanternim, ponte rolante, muros de proteção (*protegido*), estantes externas (*alta capacidade*); silo e tanque crescem em altura |
| Moradias | puxadinho e segundo andar (casa); pavimentos extras, terraço verde e garagem solar (prédio) |
| Torre | sacos de areia, blindagem da cabine, parabólica e holofote, base de concreto armado |

Mais detalhes:
- **Mesma fonte da simulação:** o modelo é escolhido pelo `level`/`spec` do snapshot do servidor. Edifícios inimigos
  também mostram o nível e a especialização reais quando estão visíveis.
- **Obra em andamento:** andaimes e um guindaste com a lança girando.
- **Desempenho:**
  - cada variante (classe × nível × especialização) é gerada uma vez e reutilizada;
  - as peças são fundidas por material (poucas chamadas de desenho por edifício);
  - **LOD:** peças pequenas (postes, cercas, armários) ficam numa camada separada que some de longe — 80 m nos presets
    normais e 50 m no preset de celular.

## Salvar e carregar
- **Serialização:** `Simulation.serialize()` / `Simulation.deserialize()` (e `toSave`/`fromSave`) gravam e restauram o
  estado tático completo, incluindo nível, especialização e obra em andamento de cada edifício. A partida continua idêntica:
  o teste compara o resumo dos snapshots após avançar as duas cópias.
- **Reconexão:** o estado volta do servidor, como antes.
- **Pendente:** ainda não existe salvamento acessível ao jogador (botão, armazenamento, camada nacional e estado das IAs).
  Isso fica com o save/load completo da Fase 12.

## Protocolo
`PROTOCOL_VERSION = 5`. Mudanças:
- novos comandos `upgrade` e `cancel_upgrade`;
- campos `level`, `spec`, `maxHp` e `upgrade` nos snapshots de edifício;
- eventos `upgrade_started`, `upgrade_completed` e `upgrade_cancelled`;
- `shortage` passa a incluir petróleo;
- o fundo de obras no estado nacional.

Cliente (Vercel) e servidor (Render) precisam estar na mesma versão.

## Testes
`shared/test/upgrades.test.ts` (18 testes):

**Dados**
- O nível 1 reproduz os valores-base.
- Os custos são crescentes, e todas as trilhas têm no máximo 10 níveis.
- Toda especialização tem vantagem e desvantagem.

**Regras**
- Os efeitos são derivados: o armazém 1 → 2 → 3 nunca acumula.
- Sem recursos, a obra é recusada sem cobrança.
- Sem dinheiro no fundo, a obra é recusada sem cobrança.
- O custo exato é cobrado, com registro no livro do fundo.
- A cadeia de requisitos: QG + 2, silo, pesquisa, infraestrutura e estabilidade.
- A especialização é obrigatória no nível 6 e permanente.
- A obra opera a 50%; cancelar devolve 80%.
- Destruído durante a obra, o investimento se perde.
- Sem manutenção paga, o edifício para.
- A fábrica *avançada* cobra +20%, devolve o valor exato ao cancelar e o tanque sai com +20% de vida.
- O território do QG cresce com o nível.

**Persistência**
- `serialize` → `deserialize` preserva nível, especialização e obra, e a continuação é idêntica.

**Fundo nacional**
- Teto e recarga diária.
- Débito e devolução com livro.
- O vínculo real entre o teatro e a camada nacional debita o fundo.

`server/room.test.ts` — melhoria pela rede:
- o adversário não consegue melhorar o QG de outra nação e nada é cobrado;
- o dono paga os recursos exatos e a verba nacional, com lançamento no livro;
- o snapshot do dono mostra a obra;
- cancelar devolve 80% de recursos e verba.

Verificação visual (navegador headless, presets alto e celular):
- todas as classes nos níveis 1, intermediário e 10, com cada especialização;
- o painel no desktop e no celular;
- a obra com andaimes e guindaste;
- o QG chegando ao nível 2 com os novos valores;
- o lançamento no extrato da verba de obras.

## Limitações
- **Modelos GLB:** não existem; os módulos são volumes procedurais no estilo do resto do jogo. Quando houver modelos finais,
  basta trocar `buildingModel(type, level, spec)`; as regras não mudam.
- **Mercados, portos e bases aéreas:** não existem ainda (Fases 6 e 7), por isso não têm trilha de melhoria.
- **Save/load para o jogador:** só a serialização da simulação tática existe (veja acima).
- **Balanceamento:** calibrado com partidas IA × IA (`AI_FIRST_UPGRADE_TICK`, custos em US$ dobrados após o primeiro
  teste porque o fundo não limitava). Precisa de ajuste com jogadores reais.

## Clareza no HUD (feedback de jogo no celular)

Retorno de um jogador após uma partida de ~10 min no celular:
- não ficava claro de onde vem o dinheiro das melhorias, onde ver o saldo nem quanto entra;
- faltava ver a fila de produção militar;
- botões de tropa ficavam cinza sem motivo aparente.

| Problema | Solução | Onde |
|---|---|---|
| Saldo invisível | **US$** na barra superior (primeiro item, visível também no celular), com a recarga por segundo na velocidade atual. Um toque abre a explicação: para que serve, de onde vem (0,3% da infraestrutura do orçamento nacional), quanto entra, como aumentar, último lançamento e o atalho **Abrir Orçamento** | `src/ui/hud/TopBarExtras.tsx` |
| Painel de melhoria | O card da verba diz de onde ela vem e quanto entra por dia de jogo | `UpgradePanel.tsx` |
| Fila de produção | Indicador **🏭 N** na barra (⚔ = unidades militares). Um toque lista, por edifício, o item em produção com progresso e os próximos, com atalho para ir até o edifício. No edifício selecionado: "Produzindo" com %, "Depois: …" e N/5 da fila; cada botão mostra o selo **×N** dos que já estão na fila | `TopBarExtras.tsx`, `CommandPanel.tsx` |
| Botão cinza sem motivo | O motivo curto aparece no próprio botão: *sem recruta*, *faltam 15 comida*, *fila cheia*, *sem moradia*, *em obra*. Um toque num botão bloqueado mostra o motivo completo. O custo exibido já inclui nível e especialização. O botão do recruta mostra a reserva — "Recruta (0)" — porque a causa mais comum era a falta de recruta | `CommandPanel.tsx` |

A regra de produção agora é uma só (`shared/sim/production.ts`, `checkProduce`): o servidor valida com ela e o HUD a usa
para explicar. O motivo mostrado é, portanto, exatamente o que o servidor diria. Testes em
`shared/test/production.test.ts`.

## Painel de comando com miniaturas 3D

- **Cartões com preview:** os botões de construir, formar cidadão/recruta/tropas e melhorar mostram uma miniatura 3D
  da estrutura ou tropa (os próprios modelos do jogo, na cor da facção), além do nome, custo, atalho e motivo de
  bloqueio. As miniaturas são renderizadas uma vez por partida (`src/game/render/Thumbnails.ts`) num alvo fora da
  tela do mesmo renderizador e viram imagens comuns no HUD (`useHudStore.thumbs`); sem WebGL, o cartão cai para o ícone.
- **Fila de produção à esquerda:** nos edifícios que produzem (Centro de Comando, Base Militar, Fábrica), uma coluna
  mostra o item em andamento (miniatura, nome e progresso), os próximos em miniaturas menores, a capacidade (x/5) e
  "Cancelar". No celular deitado, a coluna fica compacta.
- **Prévia da obra no local:** ao escolher onde construir, em vez do quadrado verde aparece o próprio modelo da
  estrutura pronta, translúcido, em verde (posição válida) ou vermelho (inválida) — `PlacementGhost` em
  `BuildingVisuals.ts`.
- **Menu de toque recolhível:** a barra lateral de toque virou um menu que se recolhe sozinho quando o painel de
  comando mostra algo (seleção, inspeção ou escolha de local), para não cobrir o painel no celular. O botão do topo
  mostra a ferramenta atual e abre o menu mesmo assim; ao fechar o painel, o menu volta a abrir. No PC (sem toque) a
  barra não aparece.

## Modelos mais detalhados: fazenda e poço de petróleo
- **Lavouras** (`src/game/render/models/crops.ts`): cada célula cultivada da fazenda tem solo arado com camalhões e
  plantas low poly em fileiras. Há quatro culturas: milho (colmo, folhas caídas, pendão e espiga), trigo (touceiras
  douradas com espigas e palha ao longo da fileira), soja (moitas) e hortaliças (repolho/alface com folhas externas).
  A cultura de cada célula é sorteada pelo índice da célula (sempre a mesma), com variação de altura, cor e posição. Para
  pesar pouco, as plantas usam primitivas de 3–4 lados abertas embaixo: cerca de 2–4 mil vértices por célula.
- **Trator** com capô, grade, cabine envidraçada, rodas traseiras grandes e escapamento (base e especialização
  *mecanizada*).
- **Cavalo-mecânico** (`src/game/render/models/pumpjack.ts`), no padrão real:
  - base de concreto e skid de aço;
  - poste sansão em "A" com escada e plataforma amarelas;
  - balancim em perfil I e cabeça de cavalo curva com faixas de alerta;
  - redutor com manivelas e contrapesos listrados, bielas e motor elétrico com proteção da correia;
  - cerca em volta da manivela, cabresto e haste polida;
  - cabeça de poço vermelha com válvulas e linha de produção em suportes até o manifold.
- **Animação do cavalo-mecânico:** é sincronizada, a cerca de 13 golpes por minuto, como um poço real:
  - o balancim oscila;
  - a manivela gira acompanhando a traseira do balancim;
  - as bielas ligam os dois a cada quadro;
  - a haste sobe e desce pelo arco da cabeça.
- **Segundo poço do nível 9:** usa o mesmo modelo, parado e em escala menor.
- **Poça escura removida:** a mancha de petróleo sob o poço saiu (o adendo pede que a jazida não pareça um lago).

## Serraria, pedreira e mina com movimento; acabamento das demais construções
Novos modelos base em `src/game/render/models/industry.ts` e um sistema genérico de partes animadas
(`BuildingModel.anims`), com estes movimentos:

- `spin`: girar sem parar (serras, polias);
- `swing`: oscilar (giro do guindaste);
- `slide`: correr numa esteira e recomeçar (toras);
- `shuttle`: ir e voltar (vagonetes);
- `bob`: subir e descer (gancho).

Uma parte pode ser carregada por outra: o gancho acompanha a lança do guindaste. As partes animadas
aparecem paradas na prévia de construção e nas miniaturas.

- **Serraria:**
  - galpão de blocos de concreto com juntas, faixa de janelas, lanternim e chaminé da caldeira com fumaça;
  - esteira de toras verde com corrente, berços pretos e garras vermelhas, por onde as toras correm até
    o portão, passando pela serra circular que gira;
  - mesa de transferência com rolos verdes e serra destopadeira, com tora em movimento;
  - cabine do operador, pilhas de toras com as pontas claras, madeira serrada com tabiques e monte de serragem.
- **Pedreira:**
  - bancadas da cava em degraus de rocha clara cortada, com tons e veios variados;
  - guindaste de base quadrada com faixa amarela, pedestal cônico e passarela circular com guarda-corpo;
  - plataforma giratória com casa de máquinas, mastro em A, lança treliçada e cabos;
  - a plataforma gira para um lado e para o outro, e o gancho sobe e desce com um bloco de pedra;
  - silo de agregado com anéis, escada e faixa na cor da nação, escritório pré-fabricado, blocos no pátio e tambores.
- **Mina:**
  - encosta rochosa com afloramentos e topo gramado;
  - portal de concreto com escoramento, luminárias e faixa da nação;
  - via férrea com dormentes, em que dois vagonetes engatados saem do túnel e voltam;
  - castelete em A com escoras e polias que giram;
  - casa do guincho com cabos até as polias e pilha de minério.
- **Demais construções:**
  - base militar: costelas na cobertura em arco, pilastras, portão com réguas, portas laterais e luminárias;
  - fábrica: pilastras, marquise sobre o portão, porta de pessoal, faixa de segurança e luminárias;
  - armazém: chapa ondulada nas laterais e no fundo, para-choques e faixas de doca, luminárias e calhas;
  - silo: escada marinheiro com gaiola, rosca transportadora e respiro;
  - tanque de petróleo: escada helicoidal com corrimão, anel de reforço, bocal com válvula e placa de risco;
  - casa: venezianas, floreira, marquise, caminho, cerca de madeira, cerca viva, caixa de correio e janela lateral.

Os módulos de melhoria continuam nos mesmos lugares. As bases novas ocupam só as áreas livres de módulos,
conferidas no nível 10 com cada especialização.
