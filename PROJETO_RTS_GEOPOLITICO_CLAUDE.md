# Projeto: RTS Geopolítico 3D — Especificação para Claude Code

> **Documento principal de produto e implementação.** Use este arquivo como fonte de verdade ao criar, revisar ou expandir o projeto. Ele combina visão de jogo, requisitos funcionais, arquitetura, dados, interface, plano de entrega e critérios de aceite.
>
> **Regra de execução:** não tente construir todos os sistemas descritos de uma só vez. Primeiro inspecione o repositório, implemente uma fatia vertical jogável, valide-a e mantenha o projeto executável durante toda a evolução. Não entregue apenas telas estáticas, pseudocódigo ou componentes sem integração.

---

## 1. Visão geral

Desenvolver um jogo de estratégia em tempo real (RTS) 3D para navegador/desktop, inicialmente **single-player**, com uma camada de grande estratégia geopolítica baseada no mundo real e um modo tático de operações militares. O cenário inicial é o mundo em **2026**, e o jogador pode escolher um país e conduzi-lo por uma linha histórica alternativa.

As referências de direção de jogo são **Warzone 2100**, **Rise of Nations** e **Age of Empires**: leitura clara do campo, comandos responsivos, seleção de unidades, movimentação, construção, economia, pesquisa, confronto militar e interface estratégica. São referências de gênero e usabilidade, não para copiar assets, mapas, interface ou identidade visual.

O jogo deve combinar:

1. **Grande estratégia nacional:** economia, orçamento público, população, aprovação, estabilidade, pesquisa, infraestrutura, forças armadas, comércio, diplomacia e relações internacionais.
2. **Mapa estratégico 3D:** visualização da situação geopolítica, fronteiras, capitais, regiões, rotas e forças militares.
3. **Operações táticas RTS:** mapa 3D local, controle direto de unidades, terreno, obstáculos, linha de visão, logística e combate em tempo real.
4. **Noticiário simulado:** eventos e notícias gerados exclusivamente a partir de fatos registrados pelo motor de simulação.
5. **Painel de análise:** indicadores, rankings mutáveis, causas prováveis de deterioração e riscos de crise.

O objetivo não é obrigatoriamente conquistar o mundo. O jogador pode desenvolver a economia, aumentar o padrão de vida, modernizar as forças armadas, estabilizar o Estado, liderar um bloco diplomático, ampliar influência ou perseguir objetivos próprios.

### 1.1 Princípios centrais

- **Simulação coerente antes de quantidade:** menos mecânicas, mas conectadas e funcionando, são melhores que dezenas de botões fictícios.
- **Sem números mágicos:** resultados devem decorrer de regras legíveis, dados de entrada e decisões registradas.
- **Sem rubber-banding oculto:** a dificuldade pode reagir ao contexto, mas não deve adulterar recursos ou resultados para forçar uma disputa equilibrada.
- **Geografia importa:** terreno, clima, relevo, infraestrutura, distâncias e rotas afetam produção, logística, construção e combate.
- **Ideologia não é bônus automático:** efeitos dependem de políticas, instituições, contexto histórico, capacidade de execução e reação social.
- **Informação rastreável:** todo dado factual deve ter fonte, período, unidade, metodologia e grau de confiança quando aplicável.
- **Linha histórica alternativa:** os dados iniciam na data de referência; os acontecimentos posteriores são produzidos pela simulação, não apresentados como fatos reais.
- **Single-player primeiro:** não adicionar multiplayer, servidores competitivos ou persistência online ao primeiro protótipo.
- **Desempenho e legibilidade:** não simular cada cidadão individualmente; usar agregação, taxas e grupos populacionais.

---

## 2. Decisões de produto

### 2.1 Gênero e perspectiva

- Gênero: RTS 3D + grande estratégia geopolítica/econômica.
- Câmera principal: perspectiva elevada/isométrica, com rotação e zoom controlados pelo jogador.
- Representação visual: 3D estilizado, limpo e tático, com silhuetas fáceis de distinguir, terreno atraente e efeitos contidos.
- Plataforma inicial: navegador moderno em desktop, usando WebGL através de Three.js.
- Idioma inicial da interface: português brasileiro (`pt-BR`), com arquitetura preparada para localização futura.
- Modo de jogo inicial: single-player offline após a aplicação carregar; não depender de API externa para funcionar.

### 2.2 Duas escalas que compartilham regras

**Escala estratégica — país e mundo**

O jogador toma decisões nacionais e acompanha o sistema internacional. O tempo estratégico avança em dias ou semanas simuladas; a frequência exata pode ser ajustada em testes. Economia, aprovação pública, diplomacia, pesquisa, dívida e rankings evoluem sem exigir cálculo a cada frame gráfico.

**Escala tática — operações militares**

Quando existir um confronto, o jogador pode abrir um teatro de operações 3D e comandar forças em tempo real. Unidades táticas usam ordens de movimento, seleção múltipla, terreno, detecção, alcance, moral, suprimentos e combate. A camada tática não deve inventar recursos infinitos: unidades e equipamentos precisam de origem, custo e manutenção na camada estratégica.

As duas escalas devem ser módulos separados e comunicarem-se por contratos de dados claros. **Não tente construir um mapa global de precisão cartográfica e um sistema de combate completo no primeiro incremento.**

---

## 3. Escopo por versão

### 3.1 Primeiro objetivo: fatia vertical jogável (MVP técnico)

O primeiro entregável precisa provar que o jogo é realmente jogável, não apenas uma demonstração visual.

Obrigatório no primeiro incremento:

- Projeto executável com Vite, React, TypeScript, Three.js e Tailwind CSS.
- Tela inicial com opções **Nova partida**, **Continuar** (desativada quando não houver save), **Configurações** e **Sair/Voltar** conforme aplicável ao navegador.
- Tela de escolha de cenário/país com um conjunto pequeno de perfis locais claramente identificados como dados iniciais provisórios, sem fingir que os valores são medições oficiais.
- Cena de batalha 3D estilizada, com câmera RTS, terreno, obstáculos, estruturas, unidades de pelo menos duas facções e HUD integrado.
- Seleção de unidades por clique e seleção por arrasto.
- Movimento por clique direito, cálculo de caminho básico que contorne obstáculos e formação simples para grupos.
- Barra de comando contextual, painel da unidade selecionada, minimapa funcional e mensagens/eventos locais.
- Combate básico entre unidades de facções opostas: alcance, vida, dano, cadência de ataque, alvo e destruição.
- Pausa e controle de velocidade do tempo de jogo; simulação desacoplada do loop de renderização.
- Um recurso simples e limitado para demonstrar economia tática, com pelo menos uma construção ou produção funcional. Não criar árvores de construção enormes nesta fase.
- Save e load local versionados, incluindo país escolhido, estado da operação, unidades, estruturas e recursos.
- Validação por TypeScript, lint/testes configurados quando viável e build de produção sem erros.
- Instruções reais de instalação e execução no `README.md`.

**Condição de sucesso:** uma pessoa deve conseguir abrir a aplicação, iniciar uma partida, selecionar e mover unidades, atacar um inimigo, pausar/retomar e salvar/carregar sem editar código.

### 3.2 Sequência de desenvolvimento

**Fase 0 — Fundação**
- Inspecionar o repositório e preservar código útil já existente.
- Criar ou corrigir o scaffold, configurar TypeScript estrito, lint/testes e scripts.
- Definir convenções, tipos básicos, ciclo de jogo e diagnóstico de erros.

**Fase 1 — RTS tático jogável**
- Cena, câmera, input, seleção, ordens de movimento, pathfinding, combate, recursos e construção mínima.
- HUD conectado ao estado real do jogo.
- Save/load e teste de uma partida completa.

**Fase 2 — Camada nacional**
- Países, indicadores econômicos e sociais, orçamento, pesquisa, infraestrutura e calendário estratégico.
- Tela de país, painel de orçamento e gráficos com dados da própria simulação.
- Separar dados de referência factual de variáveis dinâmicas da partida.

**Fase 3 — Diplomacia e inteligência artificial**
- Relações bilaterais, tratados, comércio, sanções, alianças, rivalidades e decisões da IA.
- Metas de IA, avaliação de ameaças e resposta coerente a ações do jogador.
- Nenhuma vantagem ou penalidade baseada apenas em uma etiqueta ideológica.

**Fase 4 — Mapa mundial 3D**
- Navegação no mapa estratégico, fronteiras/regiões, capitais, rotas comerciais e representação agregada de forças.
- Começar com uma representação simplificada; dados geográficos detalhados entram apenas após validar performance, licenças e qualidade.

**Fase 5 — Eventos, notícias e rankings**
- Linha do tempo, jornal da partida, explicação de eventos, rankings globais e por categoria.
- Rastreabilidade entre evento, alteração de indicador e notícia apresentada.

**Fase 6 — Conteúdo, balanceamento e polimento**
- Mais países, cenários, unidades, biomas, edifícios e cadeias produtivas.
- Otimização, acessibilidade, som, tutorial, testes de regressão e preparação para distribuição.

Cada fase deve terminar com uma versão executável. Não avance deixando a fase anterior quebrada.

---

## 4. Stack tecnológica

### 4.1 Stack escolhida

- **TypeScript** com `strict: true`: reduzir erros de estado, entidades e contratos.
- **Vite**: ambiente de desenvolvimento e build.
- **React**: telas, HUD e interface DOM; não usar React para atualizar milhares de objetos 3D a cada frame.
- **Three.js**: renderização e interação do mundo 3D, geometria, materiais, câmera, raycasting, iluminação e efeitos.
- **Tailwind CSS**: layout e estilos utilitários da interface. Complementar com CSS próprio para identidade visual e componentes complexos.
- **Zustand**: estado de interface e seleções que precisam ser compartilhadas entre componentes React. Não usar a store de UI como substituta do estado de simulação em alta frequência.
- **Vitest**: testes unitários de regras puras, fórmulas, diplomacia, economia e pathfinding.
- **ESLint** e formatação consistente: qualidade de código.
- **localStorage** no MVP para saves pequenos e configurações; projetar uma interface de persistência para migrar a IndexedDB se o estado crescer.

Evitar adicionar bibliotecas apenas por conveniência. Preferir código próprio pequeno para sistemas centrais e dependências bem mantidas para problemas genéricos. Registrar as dependências e versões resolvidas em `package-lock.json`.

### 4.2 Organização de runtime

- React controla a interface HTML, menus, HUD e painéis.
- Um componente dedicado cria e mantém uma única instância principal do renderer Three.js.
- O motor de simulação usa entidades de jogo tipadas, sem depender de componentes React.
- O loop gráfico renderiza com `requestAnimationFrame` e delta de tempo.
- A simulação avança em passos fixos ou controlados, independentes do FPS.
- Eventos do motor atualizam a interface em frequência limitada; não disparar renderizações React a cada frame.
- O estado persistido usa um formato versionado, nunca serializa objetos internos do Three.js.

### 4.3 Compatibilidade e dependências

Usar versões estáveis e compatíveis no momento da implementação, sempre com lockfile. Consultar a documentação oficial ao configurar pacotes que tenham mudado de versão. Não importar Three.js ou outros módulos do CDN em runtime. O jogo deve usar os arquivos instalados no projeto para funcionar sem rede após instalação/build.

Referências técnicas oficiais:

- Three.js — instalação: https://threejs.org/manual/pages/installation.html
- Three.js — documentação: https://threejs.org/docs/
- Vite — guia: https://vite.dev/guide/
- Tailwind CSS — Vite: https://tailwindcss.com/docs/installation/using-vite

---

## 5. Estrutura inicial do repositório

Ajuste os nomes se a estrutura existente justificar, mas mantenha responsabilidades separadas. Não coloque o jogo inteiro em `App.tsx` ou em um único arquivo gigante.

```text
/
├── public/
│   ├── assets/
│   │   ├── models/              # modelos GLB/GLTF locais, quando existirem
│   │   ├── textures/            # texturas locais
│   │   ├── audio/               # áudio local
│   │   └── maps/                # mapas e dados locais
│   └── favicon.svg
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx           # se necessário; evitar roteador pesado sem motivo
│   │   └── providers.tsx
│   ├── ui/
│   │   ├── screens/             # menu, seleção de país, partida
│   │   ├── hud/                 # recursos, seleção, comandos e minimapa
│   │   ├── panels/              # economia, diplomacia, pesquisa, notícias
│   │   ├── components/
│   │   └── styles/
│   ├── game/
│   │   ├── GameRuntime.ts       # coordena cena, simulação e comandos
│   │   ├── core/
│   │   │   ├── GameClock.ts
│   │   │   ├── GameLoop.ts
│   │   │   ├── EventBus.ts
│   │   │   ├── Random.ts        # RNG com seed para reprodutibilidade
│   │   │   └── GameConfig.ts
│   │   ├── render/
│   │   │   ├── Renderer.ts
│   │   │   ├── SceneFactory.ts
│   │   │   ├── CameraController.ts
│   │   │   ├── InputController.ts
│   │   │   ├── Picking.ts
│   │   │   ├── TerrainFactory.ts
│   │   │   ├── UnitVisuals.ts
│   │   │   ├── BuildingVisuals.ts
│   │   │   └── Effects.ts
│   │   ├── simulation/
│   │   │   ├── Simulation.ts
│   │   │   ├── entities/
│   │   │   ├── systems/
│   │   │   │   ├── MovementSystem.ts
│   │   │   │   ├── CombatSystem.ts
│   │   │   │   ├── ResourceSystem.ts
│   │   │   │   ├── ConstructionSystem.ts
│   │   │   │   └── AICommandSystem.ts
│   │   │   └── pathfinding/
│   │   │       ├── Grid.ts
│   │   │       └── AStar.ts
│   │   ├── strategic/
│   │   │   ├── StrategicSimulation.ts
│   │   │   ├── CountryModel.ts
│   │   │   ├── EconomySystem.ts
│   │   │   ├── SocietySystem.ts
│   │   │   ├── DiplomacySystem.ts
│   │   │   ├── ResearchSystem.ts
│   │   │   ├── MilitarySystem.ts
│   │   │   ├── RankingsSystem.ts
│   │   │   ├── NewsSystem.ts
│   │   │   └── advisors/
│   │   ├── data/
│   │   │   ├── countries/
│   │   │   ├── units.ts
│   │   │   ├── buildings.ts
│   │   │   ├── technologies.ts
│   │   │   ├── scenarios.ts
│   │   │   └── dataRegistry.ts
│   │   ├── save/
│   │   │   ├── SaveSchema.ts
│   │   │   ├── SaveService.ts
│   │   │   └── migrations.ts
│   │   └── types/
│   │       ├── entities.ts
│   │       ├── events.ts
│   │       └── common.ts
│   ├── state/
│   │   ├── useUIStore.ts
│   │   └── selectors.ts
│   ├── test/
│   ├── main.tsx
│   └── index.css
├── docs/
│   ├── GAME_DESIGN.md           # opcional, se a documentação crescer
│   └── DATA_SOURCES.md          # fontes, licenças, cobertura e datas
├── .env.example
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── README.md
└── PROJETO_RTS_GEOPOLITICO_CLAUDE.md
```

Não é necessário criar todos os arquivos vazios desde o começo. Adicione-os quando suas responsabilidades forem implementadas.

---

## 6. Modelo de simulação e tempo

### 6.1 Relógios distintos

A renderização, a batalha e a simulação nacional não devem compartilhar um único delta sem controle.

- **Renderização:** acompanha o monitor, com delta limitado para evitar saltos enormes após uma pausa da aba.
- **Simulação tática:** usa passo fixo, por exemplo 20–30 atualizações por segundo, ajustável por perfil de desempenho.
- **Simulação estratégica:** avança por ticks discretos (por exemplo, um dia de jogo), agrupando trabalho quando possível.
- **Velocidade:** pausa, 1×, 2× e 4× para a simulação; o controle estratégico pode avançar em blocos, enquanto combate tático permanece em tempo real quando estiver ativo.

Os valores acima são decisões iniciais de implementação, a validar na prática. Não calcular economia global, diplomacia e todos os países a cada frame.

### 6.2 Determinismo suficiente para depuração

Usar um gerador pseudoaleatório com seed armazenada no save. Sempre que possível, regras econômicas, testes de risco, decisões de IA e resultados de combate devem poder ser reproduzidos com o mesmo estado inicial, seed e sequência de ações. Não depender de `Math.random()` espalhado em sistemas centrais.

### 6.3 Dados de entidade

As entidades de jogo devem ser representadas por dados tipados e identificadores estáveis. Exemplo conceitual:

- `id`, `ownerId`, `type`, `position`, `health`, `maxHealth`, `status`.
- Unidades: velocidade, alcance, dano, cadência, visão, custo de manutenção, tipo de terreno permitido e estado de ordem.
- Edifícios: custo, tempo de construção, vida, função, raio/condição de produção e requisitos geográficos.
- Países: dados de referência e indicadores dinâmicos em objetos distintos.

Os objetos Three.js são representações visuais ligadas a IDs. Não usar `Object3D` como fonte autoritativa de vida, orçamento, propriedade ou diplomacia.

---

## 7. RTS tático: requisitos de jogabilidade

### 7.1 Câmera e interação

- Câmera ortográfica ou perspectiva de campo longo, com leitura semelhante à de um RTS clássico.
- Pan por WASD/setas e arrasto de botão do meio; edge scrolling pode ser opcional.
- Zoom por roda do mouse com limites definidos.
- Rotação por tecla modificadora + arrasto ou controle equivalente, sem conflito com seleção.
- Clique esquerdo seleciona unidade/edifício; clique no terreno limpa seleção ou inicia seleção por arrasto.
- Arrasto de seleção desenha retângulo visível e seleciona todas as unidades amigáveis dentro dele.
- Clique direito em terreno cria ordem de movimento; clique direito em inimigo cria ordem de ataque quando a unidade puder atacar.
- `Esc` cancela a ordem de construção/seleção de alvo e fecha menus contextuais apropriados.
- Todas as entradas passam por um controlador central, com tratamento para não capturar clique em botões do HUD como clique no mundo.

### 7.2 Movimento e pathfinding

- Representar navegabilidade em grid de custo ou grafo equivalente.
- Implementar A* para determinar caminhos iniciais ao redor de obstáculos.
- Custos de terreno devem ser configuráveis: estrada, planície, floresta, lama, água, declive e terreno bloqueado.
- Unidades não devem atravessar edifícios ou obstáculos sólidos.
- Ao selecionar várias unidades, gerar posições de destino separadas; reduzir empilhamento e colisão visual.
- Replanejar caminho quando houver bloqueio persistente, evitando recalcular A* a cada frame.
- Movimento de unidades atualizado pelo motor de simulação, não por animação independente sem estado lógico.
- Se o mapa ou número de unidades exceder o orçamento de CPU, reduzir frequência de pathfinding e usar cache/agrupamento.

### 7.3 Combate

Cada unidade combatente deve ter ao menos:

- Pontos de vida, dano, alcance, tempo entre ataques, velocidade e custo.
- Estado: parada, movendo, perseguindo, atacando, recuando ou destruída.
- Verificação de alcance e, quando aplicável, linha de visão.
- Seleção de alvo válida por facção, alcance, estado e acessibilidade.
- Feedback visual simples: projétil/feixe/efeito, barra de vida, reação ao impacto e destruição.
- Cancelamento da ordem se o alvo morrer ou ficar inválido.
- Resultado reproduzível e regras explícitas para prioridade de alvo.

Não fazer uma simulação de física complexa no MVP. Um sistema de combate determinístico e legível é mais importante.

### 7.4 Economia tática e construção mínima

No MVP, implementar apenas o suficiente para provar a integração:

- Recurso de construção/produção disponível na partida.
- Pelo menos um edifício funcional (por exemplo, quartel ou fábrica simplificada) e uma estrutura central.
- Custo e tempo de construção visíveis antes da confirmação.
- Construção inválida quando o local estiver bloqueado, ocupado ou fora da área permitida.
- Produção de unidade vinculada a um edifício e ao recurso disponível.
- Destruir um edifício interrompe sua fila de produção.

Não implementar nesta fase uma árvore enorme, agricultura completa ou economia global detalhada.

### 7.5 IA tática inicial

A IA inimiga deve cumprir metas funcionais simples, não apenas ficar parada:

- proteger sua estrutura principal;
- atacar unidades hostis visíveis próximas;
- produzir uma unidade quando tiver recurso e a estrutura necessária;
- avançar em direção a um objetivo ou força inimiga;
- respeitar custos, alcance, terreno e tempo de recarga.

Separar a avaliação estratégica da IA da execução de ordens. Evitar uma IA que conheça unidades fora da sua visão quando a regra de fog of war estiver implementada.

---

## 8. Direção de arte 3D

### 8.1 Alvo visual

Criar modelos simples, mas intencionais e visualmente satisfatórios. A identidade deve vir da composição, iluminação, paleta, materiais, silhuetas e animação — não de polígonos em excesso.

- Terreno com variação de altura moderada e regiões legíveis.
- Materiais com paleta coerente: terra, vegetação, rocha, água, metal, concreto e superfícies industriais.
- Luz direcional, sombras com custo controlado, neblina atmosférica leve e céu adequado à cena.
- Edifícios feitos inicialmente com `Group`, geometrias básicas combinadas e materiais próprios.
- Unidades feitas com geometria low-poly: corpo, rodas/esteiras, torre ou arma, sensores e detalhes que permitam reconhecer a classe à distância.
- Animação simples e funcional: deslocamento, rotação, recuo de arma, flashes de disparo e destruição.
- Cores/fita de seleção para diferenciar facções; evitar depender somente de cor para transmitir estado.
- Efeitos visuais curtos e moderados, sem partículas ou pós-processamento excessivos.

### 8.2 Assets e direitos

- Começar com geometrias procedurais e materiais criados no projeto.
- Se modelos externos forem adicionados, usar apenas fontes com licença clara compatível com o jogo, registrar autoria/licença e manter os arquivos localmente.
- Não baixar nem reutilizar diretamente modelos, texturas, ícones, sons ou logos proprietários das franquias citadas.
- Não depender de geração remota de assets em tempo de jogo.

### 8.3 Performance gráfica

- Reutilizar geometrias e materiais para unidades equivalentes.
- Usar `InstancedMesh` quando houver grande número de objetos iguais e a interação permitir.
- Evitar centenas de luzes dinâmicas.
- Configurar resolução do renderer e pixel ratio com limites; não multiplicar cegamente a resolução em telas de alta densidade.
- Descartar geometrias, materiais e texturas na destruição de recursos.
- Reduzir detalhes ou efeitos em modo de desempenho.
- Criar ferramenta de diagnóstico simples para FPS, quantidade de unidades e tempo do tick quando necessário.

---

## 9. Interface e experiência do jogador

### 9.1 Direção da interface

A interface deve parecer um centro de comando estratégico: escura, sóbria, altamente legível, com hierarquia clara, painéis compactos, tipografia consistente e acentos de cor para facção, alerta e estado. Evitar excesso de transparências, neon decorativo e texto miúdo.

Utilizar HTML/CSS para HUD e painéis. O canvas Three.js deve ocupar o espaço de jogo sem ser coberto por elementos desnecessários.

### 9.2 Tela inicial

- Nome de trabalho: **RTS Geopolítico 3D**. Não tratar como nome final.
- Botão Nova partida.
- Continuar apenas se existir save válido.
- Configurações de áudio, qualidade gráfica, câmera e acessibilidade disponíveis conforme forem implementadas.
- Créditos e fontes de dados/licenças em uma tela própria.

### 9.3 Seleção de país

Para cada país escolhido, exibir quando houver dados confiáveis:

- nome e bandeira/representação visual com licença adequada;
- população, PIB e ano/unidade da fonte;
- inflação e desemprego quando disponíveis;
- orçamento público/dívida quando houver séries adequadas;
- despesas militares e efetivo militar, com período e fonte;
- recursos, infraestrutura e capacidade logística;
- chefe de Estado/governo correspondente ao sistema político, com data de referência;
- situação social/política e desafios de abertura da campanha;
- dificuldade contextual estimada, explicando fatores determinantes.

A seleção deve ajudar a compreender as condições iniciais. Não inventar dados para preencher espaços em branco: exibir “sem dado confiável” ou um intervalo explicitamente estimado.

### 9.4 HUD da batalha

- Barra superior: recursos, limite de unidades, tempo e estado de jogo.
- Lado inferior: painel dinâmico da seleção e comandos relevantes.
- Minimap: posição de unidades, estruturas e eventos relevantes; clicar nele move a câmera.
- Painel de eventos: mensagens curtas derivadas do estado real, como “Unidade selecionada”, “Construção iniciada”, “Unidade sob ataque” e “Estrutura destruída”.
- Indicadores de facção, saúde e ordens atuais, sem poluir a cena.
- Ícones com `title`/tooltip e texto acessível quando necessário.

### 9.5 Painel nacional e dashboard

Nas fases posteriores, fornecer abas ou painéis para:

- Visão geral do país.
- Economia e orçamento.
- População e aprovação.
- Infraestrutura e recursos.
- Pesquisa e modernização.
- Forças armadas e logística.
- Diplomacia e comércio.
- Notícias e eventos.
- Rankings e comparação internacional.

Os painéis devem refletir o estado real da simulação, não conter valores estáticos que pareçam funcionais.

---

## 10. Simulação nacional e economia

### 10.1 Estado inicial de cada país

Separar explicitamente:

1. **Dados de referência:** fatos medidos/estimados para uma data, como população, PIB, inflação, geografia, recursos e governo.
2. **Parâmetros do jogo:** coeficientes simplificados, elasticidades, custo de ações e fórmulas usadas pelo modelo.
3. **Estado da campanha:** valores que mudam por decisões e eventos do jogo.

Nunca sobrescrever a fonte histórica com o valor atual da partida. Cada país deve carregar `referenceDate`, `source`, `sourceDate`, `unit`, `value`, `quality` e, se necessário, `notes` nos campos factuais.

### 10.2 Orçamento e dívida

O orçamento nacional precisa ter receitas e despesas identificáveis. Categorias iniciais sugeridas:

**Receitas:** impostos, rendas de recursos naturais, empresas estatais, tarifas e outras receitas agregadas.

**Despesas:** serviços públicos, educação, saúde, infraestrutura, pesquisa, defesa, juros da dívida e administração.

Regras:

- Gastos consomem orçamento de forma explícita.
- Aumentar investimento pode gerar benefícios com atraso, custo de manutenção e retornos incertos.
- Déficits sucessivos acumulam dívida; a dívida cria juros e restrições fiscais.
- A capacidade de tomar empréstimos depende de dívida, crescimento, moeda, credibilidade, instituições e contexto internacional — representados inicialmente por um modelo simplificado e explicável.
- Não presumir que todo gasto gera crescimento linear e instantâneo.
- Apresentar a relação entre orçamento público, PIB e despesas militares sem confundir indicadores diferentes.

### 10.3 Economia realista sem falsa precisão

O objetivo é uma simulação jogável, não um modelo econométrico capaz de prever o mundo. Começar com equações transparentes e parâmetros ajustáveis; registrar hipóteses no código/documentação.

Todo indicador derivado deve distinguir valor observado de estimativa de jogo. Exibir aviso quando houver dados incompletos. Não alegar que o motor prevê resultados políticos ou econômicos reais com precisão científica.

### 10.4 Investimento, pesquisa e infraestrutura

- Ações consomem orçamento, recursos e tempo.
- Pesquisa aumenta capacidades específicas com retornos limitados e atrasados.
- Infraestrutura depende de terreno, energia, população, materiais, manutenção, acesso e conectividade.
- Portos dependem de litoral apropriado, profundidade, infraestrutura terrestre e capacidade logística.
- Hidrelétricas dependem de água, relevo, engenharia, custo de construção, impactos socioambientais e rede elétrica.
- Ferrovias dependem de distâncias, declives, pontes/túneis, demanda e ligação a centros produtivos/portos.
- Indústrias dependem de energia, trabalhadores, fornecedores, transporte, mercado e estabilidade.
- Recursos geológicos não implicam produção imediata: extração depende de capacidade instalada, investimento, tecnologia e infraestrutura.

---

## 11. Sociedade, aprovação e estabilidade

Representar a população por grupos e indicadores agregados, sem criar uma entidade de simulação para cada pessoa.

Variáveis possíveis:

- aprovação geral do governo;
- custo de vida e inflação percebida;
- emprego/renda;
- acesso a serviços;
- desigualdade agregada;
- confiança institucional;
- satisfação de grupos relevantes;
- pressão de protesto, greve ou crise de governo.

As políticas têm custos, defasagens e possíveis efeitos cruzados. Aumentos de impostos podem elevar receita e reduzir popularidade; cortes podem aliviar o déficit e deteriorar serviços; aumento do investimento pode produzir benefícios lentamente. Não transformar essas relações em regras absolutamente universais: devem depender das condições de partida e das instituições.

Protestos, greves e revoluções devem ser eventos de risco probabilístico com causas registadas. O jogador precisa entender os principais fatores, sem receber uma previsão apresentada como certeza.

### 11.1 Painel de diagnóstico

Quando um indicador piorar, o painel deve mostrar:

- o indicador e sua variação;
- fatores contribuintes que realmente ocorreram na simulação;
- fatores mais relevantes e grau aproximado de influência;
- medidas disponíveis, custo e possíveis efeitos colaterais;
- risco estimado, acompanhado de explicação;
- incerteza quando os dados forem insuficientes.

Não gerar explicações vagas sem conexão com eventos e valores do motor.

---

## 12. Diplomacia e relações internacionais

Cada país possui relações bilaterais dinâmicas, mas **a relação entre A e B não deve determinar mecanicamente a relação de B com C**. Alianças e rivais compartilhados são fatores, não leis automáticas.

Fatores que podem influenciar relações:

- tratados e compromissos vigentes;
- comércio, investimento e dependência de insumos;
- sanções e medidas de retaliação;
- conflitos, disputas territoriais e incidentes;
- alianças militares, garantias de segurança e compromissos de defesa;
- história diplomática e interesses estratégicos;
- proximidade cultural e relações entre diásporas, quando houver base documental adequada;
- opinião pública e decisões de governo;
- mediação, concessões, neutralidade, aproximação e acordos de cooperação.

Ações disponíveis no desenvolvimento futuro:

- estabelecer ou encerrar relações diplomáticas;
- negociar tratado comercial;
- formar acordo de defesa ou aliança;
- impor/retirar sanções;
- oferecer mediação, ajuda ou concessões;
- declarar neutralidade ou tentar reaproximação;
- participar de blocos e acordos multilaterais.

Cada tratado deve possuir condições, duração, custos, obrigações e consequências de violação. A IA precisa considerar interesses e limitações, não responder apenas a um único número de amizade.

### 12.1 Identidade, etnia e história

Questões étnicas, culturais, linguísticas, diásporas e disputas históricas podem fazer parte da simulação quando houver dados e justificativa. Não atribuir bônus/penalidades deterministas a povos inteiros, nacionalidades ou etnias. Conflitos entre comunidades devem ser modelados por contexto histórico, instituições, políticas, atores, opinião pública e acontecimentos identificáveis — nunca por estereótipos como regra automática.

### 12.2 Unificação de países

Boa relação diplomática não é suficiente, por si só, para unificar Estados. A unificação deve ser uma opção rara e condicionada a mecanismos políticos e institucionais plausíveis.

Possíveis resultados a modelar futuramente:

- federação;
- confederação;
- união política/econômica;
- integração gradual;
- anexação, com custos e consequências internacionais específicos.

Considerar consentimento/legitimidade, instituições, tratados, opinião pública, soberania, custos de integração, resistência interna, divisão de poder e reação de terceiros. Uma união pode aumentar a escala econômica, mas também aumentar custos administrativos, tensões internas e instabilidade.

---

## 13. Geografia, forças armadas e logística

### 13.1 Princípios

- Terreno e clima afetam velocidade, visibilidade, desgaste e capacidade de operação.
- Florestas densas, montanhas, desertos, áreas urbanas e rios têm efeitos diferentes.
- Familiaridade e treinamento local podem oferecer vantagem limitada; não substituem suprimentos, inteligência, equipamento ou superioridade numérica.
- A logística depende de estradas, ferrovias, portos, aeroportos, combustível, munição, manutenção, distância e capacidade de transporte.
- A indústria e o recrutamento militar não produzem unidades instantaneamente.
- Equipamentos modernos exigem investimento, treinamento, cadeia produtiva e manutenção.
- Reservas e efetivo nominal não equivalem automaticamente a força disponível no campo.

### 13.2 Forças militares

Representar ao longo do tempo:

- efetivo ativo/reserva, com as categorias definidas na fonte;
- equipamento por classe e estado de prontidão;
- treinamento e doutrina;
- orçamento e custo de manutenção;
- produção e importação de equipamento;
- mobilização, abastecimento e reposição;
- inteligência, reconhecimento e capacidade de comunicação;
- moral e fadiga em operações.

Evitar usar um único valor abstrato de “força militar” como substituto de todas essas dimensões. Um indicador agregado pode existir para comparação, mas deve ser explicado e acompanhado por componentes.

### 13.3 Efeitos geográficos no combate

Uma unidade na floresta pode receber modificadores por cobertura, visibilidade e treinamento, mas deve também sofrer limitações de velocidade, linha de suprimento, comunicação e uso de veículos pesados. Cada modificador deve estar definido em uma tabela/configuração legível e ser exibido em tooltip ou relatório de combate.

---

## 14. Lideranças, governos e IA estratégica

Cada líder/governo deve ser descrito por um perfil estruturado com informação rastreável:

- cargo e país na data de referência;
- orientação política documentada, quando aplicável;
- histórico de decisões públicas relevantes;
- estilo de negociação e tolerância a risco como parâmetros de jogo estimados, não fatos incontroversos;
- prioridades do governo e restrições institucionais;
- popularidade/confiança, com série e fonte quando disponível;
- relações diplomáticas e compromissos herdados.

Não reduzir a capacidade de um país a uma pessoa. Separar liderança, instituições, capacidade estatal, recursos econômicos, condições geográficas e contexto social.

O perfil não precisa conter milhares de campos na primeira versão. Projetar schema extensível, documentar a origem de cada atributo e admitir dados desconhecidos. Para estimativas interpretativas, armazenar justificativa, data e nível de confiança.

A IA estratégica deve perseguir objetivos e avaliar custos, riscos e alternativas, por exemplo:

- estabilidade doméstica;
- crescimento e receitas;
- segurança e capacidade militar;
- relações comerciais e diplomáticas;
- metas de governo;
- ameaças e oportunidades regionais.

Usar decisões explicáveis em vez de comportamento inteiramente aleatório. Evitar “personalidade” caricatural baseada em nacionalidade, etnia ou rótulo ideológico.

---

## 15. Dados, fontes e integridade factual

### 15.1 Fonte da verdade

Os dados de referência serão importados e versionados localmente. A aplicação não deve depender de APIs públicas durante a partida. O processo de importação/atualização pode ocorrer fora do jogo e produzir arquivos normalizados no repositório.

Fontes de partida para pesquisa e integração — **verificar cobertura, definições, licenças e datas antes de redistribuir dados**:

- Banco Mundial, indicadores: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
- FMI, World Economic Outlook: https://data.imf.org/datasets/WEO
- ONU, World Population Prospects: https://population.un.org/wpp/
- SIPRI, Military Expenditure Database: https://www.sipri.org/databases/milex
- UN Comtrade, comércio internacional: https://comtrade.un.org/
- V-Dem, dados de democracia e instituições: https://www.v-dem.net/data/the-v-dem-dataset/

Essas fontes não cobrem igualmente todos os campos. Para cada indicador, registrar fonte, período, unidade, método e limitações. O projeto não deve presumir que toda informação de liderança, imagem pública, capacidade militar ou relações bilaterais existe em uma base única e oficial.

### 15.2 Formato sugerido de dado

```ts
export interface SourcedValue<T> {
  value: T | null;
  unit: string;
  referenceDate: string; // ISO 8601 ou ano/mês documentado
  sourceName: string;
  sourceUrl?: string;
  sourceDate?: string;
  quality: "official" | "research" | "estimate" | "game_parameter" | "unknown";
  confidence?: number; // 0..1, somente para estimativas justificadas
  isPlaceholder?: boolean; // true para dados simulados de desenvolvimento
  notes?: string;
}
```

A estrutura é ilustrativa; adaptar nomes e validações ao modelo real do projeto.

### 15.3 Regras de integridade

- Não inventar dados para completar campos.
- Não mostrar pontuação de jogo como se fosse índice oficial.
- Não comparar valores sem conferir unidade, cobertura, ano e definições.
- Não misturar dólar corrente, dólar constante, paridade de poder de compra, PIB nominal e PIB per capita sem identificá-los.
- Não confundir gasto militar como porcentagem do PIB com valor absoluto.
- Registrar estimativas e hipóteses do jogo como tais.
- Informações políticas sensíveis ou controversas devem ter tratamento neutro, fontes e data de referência.
- Respeitar licenças, condições de reutilização, atribuição, limites de API e direitos sobre bandeiras, imagens e outros assets.

### 15.4 Dados provisórios de desenvolvimento

Para testar o motor antes da integração de dados reais, pode-se usar poucos países e valores simulados. Esses perfis devem trazer `isPlaceholder: true` ou equivalente e ser identificados na interface de desenvolvimento. Não publicar pontuações inventadas como avaliações reais dos países.

---

## 16. Índices, comparações e rankings

O jogo terá um ranking composto, mas a fórmula deve ser transparente e os componentes acessíveis.

Dimensões recomendadas:

- poder econômico;
- capacidade militar;
- desenvolvimento humano e condições sociais;
- capacidade industrial/tecnológica;
- influência diplomática;
- resiliência fiscal e logística;
- estabilidade institucional;
- potencial de crescimento.

A fórmula inicial pode ser um índice de jogo normalizado, com pesos configuráveis e documentados. Não chamar o resultado de “classificação oficial”. Um ranking de poder agregado deve ser acompanhado por rankings por categoria, intervalos de incerteza quando pertinentes e descrição da metodologia.

Recalcular após os ticks estratégicos ou quando os indicadores relevantes mudarem, não por frame. Mostrar evolução temporal e explicar por que um país subiu ou caiu. Um país pequeno deve poder crescer por especialização, inovação, logística, diplomacia e boa gestão; não deve ser automaticamente impedido de alcançar posições elevadas.

---

## 17. Sistema de notícias e eventos

### 17.1 Princípio

As notícias devem ser produzidas a partir de eventos reais do motor de simulação, nunca por texto generativo desconectado do estado do jogo. No MVP, usar templates determinísticos. Um eventual sistema de linguagem natural só poderá redigir ou resumir eventos que existam no registro e não poderá criar fatos novos.

### 17.2 Estrutura do evento

Cada evento deve registrar ao menos:

- ID único;
- timestamp do jogo;
- tipo e severidade;
- país/região/atores envolvidos;
- causa ou ação que o originou;
- mudanças de estado relacionadas;
- magnitude, unidade e contexto, quando aplicável;
- evidências internas que permitam auditar a notícia;
- referência ao template ou ao gerador que produziu a manchete.

Exemplos de categorias: orçamento, inflação, crescimento, aprovação, protestos, eleições futuras quando modeladas, acordo comercial, sanções, conflito, pesquisa concluída, construção de infraestrutura, desastre simulado e alteração de ranking.

### 17.3 Notícias não devem alucinar

- Cada afirmação quantitativa precisa corresponder a um campo/evento.
- Manchetes devem evitar afirmar causalidade se o motor registrou apenas correlação.
- Não relatar “crise” ou “revolução iminente” sem que o sistema tenha calculado condição de risco compatível.
- Distinguir evento ocorrido, análise estimada e possibilidade futura.
- Não misturar a timeline alternativa do jogo com notícias do mundo real após a data inicial.
- O painel pode oferecer filtros por país, categoria, severidade e período.

---

## 18. Dificuldade adaptativa e objetivos

A dificuldade deve emergir das condições do país e das reações plausíveis dos adversários. Se o jogador escolher um país com inflação alta, dívida elevada ou instituições frágeis, essas condições tornam-se desafios prioritários; não são apagadas para facilitar a primeira hora.

A adaptação pode considerar a assistência, o tutorial, a agressividade de IA e a complexidade de alertas, mas não deve:

- alterar secretamente dados para prejudicar ou favorecer o jogador;
- conceder recursos invisíveis à IA;
- tornar rivais artificialmente passivos só porque o jogador está em desvantagem;
- impor vitória ou derrota predeterminada.

Metas de campanha sugeridas:

- elevar qualidade de vida;
- alcançar estabilidade fiscal;
- crescer em indústria e pesquisa;
- liderar um bloco regional;
- manter neutralidade e prosperidade;
- modernizar forças armadas respeitando capacidade fiscal;
- construir resiliência a crises.

O jogo pode permitir metas personalizadas, mas elas não são condição para uma campanha aberta.

---

## 19. Save/load e versionamento

O save deve conter apenas dados serializáveis do jogo: identificadores, números, strings, arrays, mapas convertidos e objetos de domínio. Não serializar cenas, meshes, materiais, funções, referências de DOM ou objetos internos do renderer.

Formato sugerido:

```ts
interface SaveGame {
  schemaVersion: number;
  gameVersion: string;
  savedAt: string;
  rngSeed: number;
  scenarioId: string;
  selectedCountryId: string;
  simulationTime: number;
  campaignState: unknown; // substituir pelo tipo concreto quando implementado
  tacticalState: unknown; // substituir pelo tipo concreto quando implementado
  settings: Record<string, unknown>;
}
```

`unknown` acima é apenas um espaço de especificação; o código de produção deve ter tipos concretos e validação de entrada. Criar migrações quando o schema mudar. Se um save estiver inválido ou for de uma versão incompatível, não travar a aplicação: mostrar mensagem clara e oferecer iniciar nova partida.

---

## 20. Desempenho e robustez

Alvo inicial: desktop moderno com GPU compatível com WebGL. Não prometer taxa de quadros específica sem medição real.

- Separar o mundo visual do estado simulado.
- Evitar estado React em alta frequência.
- Usar estruturas e frequência apropriadas para cada sistema.
- Aplicar A* apenas sob demanda e com limites.
- Reutilizar geometria/material e instanciar objetos repetidos.
- Limitar delta de tempo após perda de foco da aba.
- Tratar resize de janela, contexto WebGL perdido quando viável e descarte de recursos.
- Evitar event listeners duplicados após remontagem de componentes.
- Manter o jogo jogável mesmo que gráficos opcionais falhem; registrar erro e aplicar fallback visual quando razoável.
- Nunca deixar promessa assíncrona sem tratamento de erro quando falha puder interromper a partida.

---

## 21. Acessibilidade e usabilidade

- Contraste legível entre texto, fundo, seleção e alertas.
- Estados não indicados apenas por cor: combinar ícone, contorno ou texto.
- Tooltips para atributos e modificadores.
- Atalhos de teclado identificáveis na interface.
- Pausa simples e fácil de encontrar.
- Configuração de volume e efeitos visuais quando houver som.
- Respeitar `prefers-reduced-motion` para partes da interface quando aplicável.
- Não depender exclusivamente de áudio para alertas importantes.
- Menus navegáveis por teclado quando viável.

---

## 22. Testes e critérios de aceite

### 22.1 Testes unitários mínimos

- Cálculo de custo, produção e saldo de recurso.
- Movimento não atravessa célula bloqueada.
- A* retorna caminho válido ou falha controlada quando não há caminho.
- Unidade não ataca alvo fora do alcance sem primeiro mover-se, se essa for a regra definida.
- Ataque respeita cooldown e alvo válido.
- Unidades destruídas deixam de receber ordens e ser selecionadas.
- O save/load preserva os campos relevantes e rejeita schema inválido.
- O avanço de tempo pausado não altera a simulação.
- Rankings usam os dados atuais corretos e a mesma fórmula documentada.
- Notícias apontam para eventos que realmente ocorreram.

### 22.2 Teste manual de fumaça

1. Executar `npm install` e `npm run dev`.
2. Abrir a aplicação em navegador desktop.
3. Iniciar nova partida.
4. Verificar que terreno, unidades e estruturas renderizam.
5. Selecionar uma unidade e um grupo de unidades.
6. Dar ordem para atravessar o mapa e confirmar desvio de obstáculo.
7. Atacar um inimigo e confirmar redução de vida/destruição.
8. Produzir ou construir uma entidade gastando recursos.
9. Pausar, avançar tempo e confirmar que os estados se comportam corretamente.
10. Salvar, recarregar e confirmar restauração.
11. Executar `npm run build` sem erros.

### 22.3 Pronto para encerrar uma fase quando

- As funcionalidades anunciadas estão conectadas e funcionam.
- Os dados exibidos vêm do modelo, não de valores estáticos desconectados.
- Não existem erros críticos de runtime no fluxo normal.
- Build e testes relevantes passam.
- README foi atualizado com comandos reais.
- Limitações conhecidas estão documentadas.

---

## 23. Scripts e comandos esperados

Configurar scripts equivalentes no `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  }
}
```

Ajustar os scripts à estrutura real do TypeScript/Vite. Não copiar configuração às cegas se a versão do scaffold tiver convenções diferentes.

---

## 24. Instruções operacionais para Claude Code

Ao receber este documento no repositório, siga esta sequência:

1. **Inspecione primeiro** os arquivos e scripts existentes. Determine se o projeto está vazio, parcialmente implementado ou já funcional. Preserve trabalho útil; não substitua arquivos inteiros sem necessidade.
2. Resuma internamente as etapas e os riscos técnicos. Se houver `README.md`, leia-o antes de mudar comandos ou estrutura.
3. Se o projeto estiver vazio, crie o scaffold Vite + React + TypeScript e configure Three.js, Tailwind e os testes necessários.
4. Implemente uma fatia vertical jogável. Comece pela Fase 0 e Fase 1 da seção 3.2. Dê prioridade ao fluxo funcional end-to-end, não a menus decorativos nem a arquitetura excessiva.
5. Use TypeScript estrito, funções pequenas, nomes claros e módulos com responsabilidade única. Evite `any`; quando inevitável, documente e restrinja o uso.
6. Não deixe botões que fingem funcionar. Se uma função ainda não estiver implementada, desative o controle ou informe explicitamente que estará disponível numa fase futura.
7. Não use números reais inventados sem marcação. Para dados provisórios, use nomes e valores claramente identificados como placeholders de desenvolvimento.
8. Não dependa de APIs, CDN, fontes ou assets remotos para a partida rodar. O essencial deve estar no projeto local.
9. Depois de cada entrega coerente, execute testes, lint e build disponíveis. Corrija os erros antes de continuar.
10. Abra/inspecione o resultado visual se as ferramentas do ambiente permitirem. Corrija layout quebrado, sobreposição do HUD, canvas em branco e controles que não respondam.
11. Atualize o `README.md` com instalação, execução, controles, testes e limitações atuais.
12. Finalize apresentando: funcionalidades implementadas, arquivos principais alterados, comandos de execução, testes executados e limitações conhecidas. Não declare algo como concluído se não tiver verificado.

### 24.1 Regra de escopo

Não implemente todas as fases no primeiro passe. Entregue primeiro a Fase 1, mas crie fronteiras de módulo que permitam adicionar a simulação nacional depois sem reescrever o motor tático. Quando a Fase 1 estiver estável, prossiga para a Fase 2 em uma tarefa separada e testável.

### 24.2 Critério de qualidade

O resultado deve ser um **jogo pequeno de verdade**, não um mockup: as ações do jogador alteram o estado de jogo; a simulação altera a cena e a interface; a IA executa ações; as condições de vitória/derrota da operação são detectadas; e o save/load funciona.

---

## 25. Próximos entregáveis após o MVP

Depois da Fase 1, planejar entregas separadas e verificáveis:

1. Modelo de país e calendário estratégico com dados provisórios rotulados.
2. Economia, orçamento, dívida, investimento e pesquisa, com testes de invariantes.
3. População agregada, aprovação, diagnóstico de instabilidade e eventos sociais.
4. Diplomacia bilateral e IA que toma decisões com base em interesses e restrições.
5. Mapa estratégico 3D e transição para operações táticas.
6. Rankings transparentes, histórico e comparações por categoria.
7. Jornal da partida e sistema de eventos rastreáveis.
8. Pipeline de ingestão e validação de dados reais para a referência de 2026.
9. Expansão gradual de países, unidades, edifícios e teatros de combate.
10. Polimento visual, áudio, tutorial, acessibilidade e otimização.

---

## 26. Checklist inicial

- [ ] Inspecionar repositório e ferramentas disponíveis.
- [ ] Scaffold Vite + React + TypeScript.
- [ ] Three.js renderer, cena, resize e ciclo de vida corretamente limpo.
- [ ] Câmera RTS, pan, zoom e controles de entrada.
- [ ] Terreno, obstáculos e unidades 3D.
- [ ] Seleção individual e por arrasto.
- [ ] Movimento com pathfinding.
- [ ] Combate funcional entre facções.
- [ ] HUD conectado ao estado real.
- [ ] Economia tática e construção/produção mínima.
- [ ] IA tática funcional.
- [ ] Pausa e velocidades de simulação.
- [ ] Save/load versionado.
- [ ] Testes e build de produção.
- [ ] README com comandos e controles.

**Prioridade absoluta:** concluir os primeiros itens até obter uma partida funcional. Só depois expandir a simulação para economia nacional, diplomacia, rankings e notícias.
