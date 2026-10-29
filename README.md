# 3D Modern Geopolitical RTS

RTS geopolítico 3D multijogador para navegador (repositório e nome de trabalho: *Nation Commander*).
Implementa as **Fases 1, 2 e 3** da [especificação](PROJETO_RTS_GEOPOLITICO_CLAUDE.md) e, do
[adendo v2](docs/AUDITORIA_ADENDO.md), a auditoria (Fase 0) e a identidade visual com suporte a
celular e tablet (Fase 1, ver [docs/FASE1_VISUAL_MOBILE.md](docs/FASE1_VISUAL_MOBILE.md)) e o globo
diplomático com contato e guerra formal (Fase 2, ver [docs/FASE2_GLOBO_GUERRA.md](docs/FASE2_GLOBO_GUERRA.md)) e
população, armazenamento, depósitos finitos e fronteiras no estilo Rise of Nations (Fase 3, ver
[docs/FASE3_POPULACAO_FRONTEIRAS.md](docs/FASE3_POPULACAO_FRONTEIRAS.md)): uma operação tática jogável com servidor
autoritativo via WebSocket, e uma camada nacional (economia, orçamento, opinião pública, pesquisa)
que roda dentro de cada partida a partir de dados reais de 10 países.

## Arquitetura

```
┌──────────────────────┐   WebSocket (JSON)   ┌────────────────────────────┐
│ Cliente (Vercel)     │ ───── comandos ────▶ │ Servidor de jogo (Node)    │
│ React + Three.js     │ ◀──── snapshots ──── │ ws + simulação autoritativa│
└─────────┬────────────┘     (10/s)           └─────────────┬──────────────┘
          │ login/cadastro, perfil, histórico               │ valida token, grava partidas
          ▼                                                 ▼
                  ┌──────────────────────────────────────────┐
                  │ Supabase: Auth + Postgres (RLS)          │
                  └──────────────────────────────────────────┘
```

| Pasta | Responsabilidade |
| --- | --- |
| `shared/sim/` | Simulação tática determinística (mapa, A*, movimento, combate, economia, construção, IA). Sem DOM, sem Three.js, sem rede — usada pelo servidor e pelos testes. |
| `shared/strategic/` | Simulação nacional (PIB, inflação, desemprego, orçamento, dívida, aprovação, estabilidade, pesquisa), IA de governo e leitura dos dados de referência. |
| `shared/data/reference/` | Dados reais importados do Banco Mundial (`worldbank.json`) e lideranças (`leaders.ts`). |
| `scripts/` | `import-reference-data.ts`: importação dos dados de referência. |
| `server/` | Servidor WebSocket: autenticação, salas (PvP e contra IA), laço de 20 ticks/s, validação de mensagens, reconexão, pausa/velocidade e gravação de partidas. |
| `src/` | Cliente: telas (React + Tailwind), HUD (Zustand), cena 3D (Three.js), interpolação de snapshots e entrada do jogador. |
| `supabase/migrations/` | Esquema do banco (perfis, partidas, participações, view de estatísticas, RLS). |

**Por que um servidor autoritativo?** O cliente só envia intenções (`mover`, `atacar`, `construir`…);
o servidor valida dono, alcance, custo e posição, simula e devolve o estado. Isso impede trapaça
simples, mantém os dois jogadores sincronizados e garante que as estatísticas gravadas sejam
confiáveis (só o servidor, com a chave `service_role`, pode gravar partidas).

**Por que o servidor não fica na Vercel?** Funções da Vercel não mantêm conexões WebSocket abertas.
O servidor de jogo precisa de um processo persistente: o repositório inclui `Dockerfile` e
`render.yaml` (Render), mas roda igualmente em Fly.io, Railway ou qualquer VPS com Node 22.

## Rodando localmente

Requisitos: Node 22+.

```bash
npm install
cp .env.example .env.local      # ajuste se necessário
```

Em dois terminais:

```bash
# 1) servidor de jogo (porta 8787)
SUPABASE_URL=https://vzzzfseliawtnodsysrn.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<chave service_role> \
ALLOWED_ORIGINS=http://localhost:5173 \
npm run dev:server

# 2) cliente (http://localhost:5173)
npm run dev
```

Sem a chave `service_role` dá para testar como convidado: inicie o servidor com `ALLOW_GUESTS=true`
e o cliente com `VITE_ALLOW_GUESTS=true` (no `.env.local`). Partidas de convidado não são gravadas.

### Variáveis de ambiente

| Variável | Onde | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | cliente | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | cliente | chave pública (publishable/anon) |
| `VITE_GAME_SERVER_URL` | cliente | `wss://…/ws` do servidor de jogo |
| `VITE_ALLOW_GUESTS` | cliente | `true` mostra "jogar como convidado" |
| `PORT` | servidor | porta HTTP/WebSocket (padrão 8787) |
| `SUPABASE_URL` | servidor | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | **secreta**: valida sessões e grava partidas |
| `ALLOWED_ORIGINS` | servidor | origens aceitas, separadas por vírgula; `*` funciona como curinga (ex.: `https://seu-app.vercel.app,https://seu-app-*.vercel.app`) |
| `ALLOW_GUESTS` | servidor | aceita conexões sem conta |
| `RECONNECT_GRACE_MS` | servidor | prazo para reconectar antes de perder por abandono (padrão 60000) |
| `SAVE_INTERVAL_MS` | servidor | intervalo de gravação das partidas em andamento (padrão 30000) |
| `MATCH_STORE_DIR` | servidor | sem Supabase: diretório onde gravar as partidas em andamento (vazio = não grava) |

## Publicação

1. **Banco (Supabase)** — a migração em `supabase/migrations/` já foi aplicada ao projeto
   `nationscommander`. Para cadastro sem confirmação de e-mail, desative
   *Authentication → Sign In / Providers → Email → Confirm email* no painel do Supabase.
2. **Servidor de jogo (Render)** — *New → Blueprint*, aponte para este repositório; o `render.yaml`
   cria o serviço. Preencha `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys) e
   `ALLOWED_ORIGINS` com o domínio da Vercel. Teste em `https://<serviço>.onrender.com/health`.
3. **Cliente (Vercel)** — importe o repositório; o `vercel.json` já define build e saída. Configure
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_GAME_SERVER_URL=wss://<serviço>.onrender.com/ws`.

> O plano gratuito do Render hiberna após inatividade (a primeira conexão demora ~30–60 s).
> Partidas em andamento **não se perdem** quando o serviço reinicia ou é publicado de novo: o
> servidor grava cada partida a cada 30 s e no encerramento (tabela `active_matches`), e a retoma
> quando o jogador reconecta — ver `docs/PARTIDAS_SALVAS.md`.

## Como jogar

| Ação | Controle |
| --- | --- |
| Selecionar | clique esquerdo · arrastar para seleção em área · Shift adiciona · duplo clique seleciona o mesmo tipo |
| Mover / atacar | clique direito no terreno / no inimigo |
| Avançar atacando | `F` e clique no destino |
| Parar | `X` |
| Construir (com o Centro de Comando selecionado) | `C` Fazenda · `M` Serraria · `P` Pedreira · `O` Poço de Petróleo · `B` Base Militar · `N` Fábrica de Veículos · `K` Torre de Vigilância |
| Produzir | `I` Infantaria (Base Militar) · `V` Veículo Blindado · `T` Tanque · `R` Artilharia (Fábrica) · `Del` cancela o último da fila |
| Ponto de reunião | clique direito com Caserna/Fábrica selecionada |
| Grupos | `Ctrl+1…9` grava · `1…9` seleciona |
| Câmera | `WASD`/setas · botão do meio arrasta · `Q`/`E` ou Alt+botão do meio giram · roda faz zoom · `H` centraliza no QG · clique no minimapa |
| Pausa / velocidade | `Espaço` · botões 1×/2×/4× (velocidade só contra a IA) |
| Menu / chat | `F10` · `Enter` |

| Painel nacional | `G` ou botão **🏛 Nação**: visão geral, orçamento, pesquisa, diplomacia, diagnóstico e dados de referência |
| Globo diplomático | `Tab` ou botão **🌐 Globo**: contatos, relações, tratados, sanções e declaração de guerra |

#### Toque (celular e tablet)

| Ação | Gesto ou botão |
| --- | --- |
| Selecionar | toque curto · dois toques seleciona o mesmo tipo visível · ferramenta **Área** + arrastar seleciona em retângulo · **Somar** adiciona à seleção |
| Mover / atacar / ponto de reunião | toque longo (~0,5 s) no destino ou no inimigo · ou ferramenta **Ordem** + toque |
| Construir | toque no Centro de Comando → botão da construção → toque no mapa para posicionar → toque de novo no mesmo lugar ou **Confirmar** |
| Câmera | arrastar um dedo move · pinça aproxima/afasta · girar dois dedos gira · botões **Aproximar**, **Afastar**, **Girar** e **QG** · toque no minimapa |
| Cancelar | botão **Cancelar** (modo de construção/ataque) · **Desmarcar** limpa a seleção |

Limiares contra comandos acidentais: o dedo precisa andar 10 px para virar arrasto; zoom e giro só
começam após uma variação clara; um segundo dedo cancela o toque e o toque longo em andamento.

**Objetivo:** destruir o Centro de Comando inimigo — depois de declarar guerra no globo (sem guerra
formal, nenhum lado pode atacar nem entrar no território do outro).

**População e fronteiras:** cidadãos são formados no Centro de Comando (`Z`) e trabalham nos
edifícios; cada soldado ou tripulação sai da força de trabalho. Moradia: QG 20, Casa (`U`) +10,
Prédio Residencial (`I`) +20, teto de 200. Recursos ficam em Armazéns (`R`), Silos (`L`) e Tanques de
Petróleo (`Y`) — poços só operam com tanque por perto; minas (`J`) extraem ferro nas montanhas.
Só se constrói dentro do próprio território, que cresce com o QG, torres, bases, fábricas e casas.

### Recursos (estilo Rise of Nations)

| Recurso | Fonte | Usado em |
| --- | --- | --- |
| Suprimentos | Centro de Comando (+1,5/s) e logística nacional (orçamento de defesa) | veículos, fábrica, serraria |
| Comida | **Fazenda** no solo fértil (marrom) | infantaria |
| Madeira | **Serraria** junto à floresta | construções |
| Pedra | **Pedreira** junto aos afloramentos rochosos | construções, artilharia, torres |
| Petróleo | **Poço** sobre jazida (manchas escuras) | veículos |

Cada edifício de coleta **reivindica** as células de recurso livres ao seu alcance (fazenda até 8
de solo fértil, serraria até 10 árvores, pedreira até 8 rochas) e rende por célula — dois edifícios
do mesmo tipo não dividem as mesmas células. Ao posicionar, o painel mostra quantas células livres
estão ao alcance e a renda resultante. A coleta só rende cheia com 6 trabalhadores (4 no poço): formar cidadãos
compete com formar tropas. Cada edifício novo do mesmo tipo custa 18% a mais (custo crescente, como no Rise of
Nations). Madeira, pedra, ferro e petróleo vêm de depósitos finitos (o solo fértil
é renovável): um depósito esgotado pede outro edifício em outro lugar. Detalhes em `docs/RECALIBRAGEM_RECURSOS.md`. Construções exigem estar perto das
suas estruturas; poços podem ser erguidos em qualquer jazida livre.

### Névoa de guerra

O servidor só envia a cada jogador as unidades inimigas dentro do raio de visão das suas unidades e
edifícios; recursos do adversário ficam ocultos. Edifícios inimigos já avistados continuam
"lembrados" com o último estado conhecido até a área ser observada de novo. No mapa e no minimapa,
áreas inexploradas ficam escuras e as exploradas fora de visão, esmaecidas. A artilharia (alcance 16,
visão 9) precisa de outras unidades ou torres para enxergar seus alvos.

## Camada nacional (Fase 2)

Cada partida simula também a nação de cada jogador a partir de 01/01/2026, **1 dia de jogo por
segundo** (a 1×). Tudo depois dessa data é uma linha histórica alternativa.

- **Dados iniciais reais** (Banco Mundial e séries que ele redistribui: OIT, SIPRI, IISS, UNESCO,
  OMS): população, PIB, crescimento, inflação, desemprego, dívida, receita e despesa do governo,
  gasto militar, educação, saúde, P&D. Cada número mostra ano e fonte; lacunas aparecem como "sem
  dado confiável" e usam valores de jogo declarados. Detalhes em `docs/DATA_SOURCES.md`.
- **Orçamento** (% do PIB): receita, defesa, educação, saúde, infraestrutura, pesquisa e
  previdência/administração. Déficits viram dívida; a dívida gera juros com prêmio de risco.
- **Economia:** crescimento = tendência + impulso fiscal − carga tributária + infraestrutura (com
  acumulação) + capital humano (defasado) − dívida excessiva − instabilidade + pesquisas. Inflação
  converge para uma âncora e reage a déficits acima do de referência; desemprego segue a lei de Okun.
- **Opinião pública:** aprovação converge para um alvo formado por fatores visíveis no
  **Diagnóstico** (inflação, desemprego, serviços, impostos, crescimento, baixas e vitórias militares).
  Abaixo de 35 há risco diário de protestos, sorteado com a seed da partida e registrado com causas.
- **Pesquisa:** 13 tecnologias em árvore, com pré-requisitos, duração mínima e investimento em US$
  registrado. A velocidade depende do % do PIB investido. As militares liberam pacotes de modernização,
  instalados unidade por unidade numa base militar ou fábrica (ver `docs/FASE5_PESQUISA_MODERNIZACAO.md`).
- Dentro da partida, o **Centro de Pesquisa Militar** libera tropas novas (antitanque, forças especiais, antiaérea
  móvel, lança-foguetes e tanque moderno), com contras por tipo de alvo (ver `docs/PROGRESSAO_MILITAR.md`).
- **Ligação com o combate:** o orçamento de defesa vira suprimentos/s no teatro de operações:
  `1,2 × log₁₀(1 + gasto de defesa anual em US$ bi)`. A regra do teatro é escolhida pelo anfitrião:
  **paridade** (todos como se tivessem PIB de US$ 1 tri: vale a parcela do PIB investida) ou
  **escala real** (vale o gasto real; grandes economias têm vantagem).
- **IA de governo:** revisa o orçamento mensalmente com regras explícitas (déficit, aprovação,
  baixas) e escolhe pesquisas — usando os mesmos comandos do jogador.
- Todos os coeficientes estão em `shared/strategic/params.ts`; são hipóteses de jogo, não
  estimativas econométricas.

Para atualizar os dados: GitHub → Actions → **Importar dados de referência** → *Run workflow*
(ou `npm run data:import` numa máquina com acesso a `api.worldbank.org`).

## Diplomacia (Fase 3)

Os 8 países que nenhum jogador escolheu entram na partida como **governos da IA**, com economia
própria simulada. Na aba **Diplomacia** do painel nacional:

- **Relações** de −100 a +100, sempre explicadas pelos fatores que as compõem (acordos, sanções,
  ajuda, missões, histórico de acordos rompidos, aliança com um adversário). Não existe base de dados
  confiável de relações bilaterais na data de referência, então todas começam em 0 — exceto entre os
  jogadores, rivais no mesmo teatro (−20; −60 depois de uma guerra declarada). A relação A–B não determina a B–C.
- **Acordo comercial** (360 dias): aumenta o crescimento das duas partes (escalado pela razão de PIBs).
- **Acordo de defesa** (540 dias): o aliado envia ajuda militar ao teatro (suprimentos/s); custa
  0,1% do PIB/ano; exige relação alta. O adversário ganha um fator negativo com esse aliado.
- **Sanções**: impostas por você ou pedidas a um governo da IA contra o adversário; reduzem o
  crescimento e a aprovação do alvo e encerram o comércio entre as partes.
- **Missão diplomática** (melhora a relação aos poucos, custa 0,02% do PIB/ano) e **ajuda** (paga
  com dívida; efeito que decai).
- **Romper** um acordo antes do prazo custa relação com o parceiro e reputação com todos.
- Os governos da IA **aceitam ou recusam** propostas somando fatores de interesse e risco (benefício
  do comércio, risco de entrar numa guerra, laços com o adversário, custo de sancionar). Recusas
  mostram os fatores contrários e impõem espera de 60 dias para repetir o pedido.
- A IA adversária usa a mesma diplomacia: abre missões, assina acordos e pede sanções contra você.

Coeficientes em `shared/strategic/Diplomacy.ts` (`DIPLO`), todos hipóteses de jogo.

## Globo diplomático, contato e guerra formal (adendo, Fase 2)

O **globo** (🌐 Globo ou `Tab`) é a camada política e de informação da partida; economia,
construções, bases e combate ficam no **teatro de operações** (RTS). As duas visões leem o mesmo
estado do servidor.

- **Contato**: só se negocia com países com quem há contato (inicial: mesma região diplomática e o
  rival do teatro; depois, missão de contato com custo e prazo, ou notícia de tratado assinado por
  um país conhecido). Sem contato, o país aparece hachurado e não revela dados; com contato, mostra
  indicadores públicos; dados atuais exigem missão diplomática.
- **Guerra formal**: sem declaração, nenhum lado ataca no teatro (ordens recusadas, sem disparo
  automático). Declarar custa 150 suprimentos, 50 de combustível, 0,2% do PIB e 3 p.p. de
  aprovação; rompe tratados com o alvo e pode gerar sanções dos aliados dele. O diálogo mostra a
  estimativa antes de confirmar; recursos insuficientes bloqueiam com explicação. A IA segue as
  mesmas regras e declara pelo mesmo caminho.

Detalhes, regras e testes em [docs/FASE2_GLOBO_GUERRA.md](docs/FASE2_GLOBO_GUERRA.md).

## Banco de dados

| Objeto | Conteúdo | Acesso |
| --- | --- | --- |
| `profiles` | username (único, sem diferenciar maiúsculas), nome de exibição, país preferido | leitura pública; o dono edita nome de exibição e país |
| `matches` | modo, regra do teatro, seed do mapa, início/fim, duração, motivo do fim, vencedor, versão | leitura pública; escrita só pelo servidor |
| `match_players` | estatísticas por jogador na partida (produção, abates, perdas, estruturas, recursos, dano) e resumo nacional (`national_summary`) | idem |
| `player_stats` (view) | agregados por jogador | leitura pública |
| `record_match(jsonb)` | grava partida + participações numa transação | apenas `service_role` |
| `username_available(text)` | checagem antes do cadastro | público |

O perfil é criado por trigger em `auth.users` usando o `username` enviado no cadastro.

## Gráficos e assets

Unidades e edifícios são modelos low-poly procedurais (`src/game/render/models/`), montados a partir
de primitivas e fundidos em poucas malhas por modelo (corpo com cores de vértice, detalhes na cor da
facção e vidros). Árvores, arbustos e rochas vêm do **Nature Kit** do
[Gobkit](https://github.com/Ariescar/gobkit-free-assets) (CC0, em `public/assets/models/nature/`); se
não carregarem, o terreno usa vegetação procedural. A névoa de guerra é aplicada no shader de todos
os materiais por posição de mundo.

O globo do menu (`src/globe/`) usa as fronteiras simplificadas do **Natural Earth 1:110m** (domínio
público) empacotadas pelo [`world-atlas`](https://github.com/topojson/world-atlas) (ISC) e
decodificadas com `topojson-client` (ISC). O arquivo é servido pelo próprio build — nada é baixado
de terceiros em tempo de execução. Fronteiras, litoral, marcadores e nuvens são camadas separadas.

**Presets gráficos** (Configurações): *Mobile/Baixo*, *Equilibrado*, *Alto*, *Ultra* e *Ultra+* ajustam resolução,
antisserrilhado, sombras, vegetação, número de efeitos e as camadas do globo (`src/lib/graphics.ts`).
O preset inicial é escolhido pelo aparelho (toque com tela pequena, pouca memória ou poucos núcleos
→ Mobile/Baixo); Ultra e Ultra+ nunca são escolhidos automaticamente, e o Ultra+ mostra um aviso de
desempenho antes de ser ativado (detalhes em `docs/GRAFICOS_REALISTAS.md`). Os presets nunca alteram
regras nem resultados da simulação.

**Modo Sandbox** (menu → 🧪 Modo Sandbox): partida livre contra uma IA parada, com:
- recursos ilimitados (sem barra de economia) e tudo pesquisado e liberado;
- obras e produção instantâneas;
- criação de tropas próprias ou inimigas já modernizadas;
- qualquer edifício no nível máximo e mapa revelado.

O QG não cai e nada conta no histórico. Detalhes em `docs/MODO_SANDBOX.md`.

**Eras:** a nação avança da Guerra Fria ao Futuro Próximo por obras no Centro de Comando. Cada era libera tropas,
construções e níveis de melhoria e troca a aparência de todas as construções. Detalhes em `docs/ERAS.md`.

**Grandes Projetos e Programa Espacial:** na última era, cada nação pode erguer Usina Nuclear, Rede 5G,
Hidrelétrica, Centro Financeiro e o Programa Espacial, cujo satélite revela o mapa inteiro e orbita o globo. Detalhes
em `docs/GRANDES_PROJETOS_E_ESPACO.md`.

**Estradas e Engenharia de Combate:** o jogador pavimenta estradas arrastando na grade (pedra e verba de obras); tropas
e comboios andam mais rápido nelas, e moradias ligadas à estrada melhoram a aprovação. O Engenheiro de Combate instala
minas antitanque (invisíveis ao inimigo e ao satélite), remove as inimigas, pavimenta fora do território e ergue
obstáculos antitanque. Detalhes em `docs/ESTRADAS_ENGENHARIA.md`.

**Cadeias produtivas, serviços e vitórias alternativas:** Refinaria e Siderúrgica transformam petróleo e ferro em
combustível e aço, que barateiam blindados e aeronaves. Hospital, Escola e Delegacia têm raio de cobertura (cura,
coleta maior, tropas veteranas, aprovação). Além da queda do QG, vence-se dominando 70% do território por 4 minutos ou
com o colapso político do rival. Detalhes em `docs/CADEIAS_SERVICOS_VITORIAS.md`. No fim da partida, o relatório mostra a evolução de tropas, construções,
território, recursos e PIB, e as medalhas de cada comandante (`docs/RELATORIO_POS_PARTIDA.md`).

**Economia:** cada tropa, construção, pesquisa e avanço de era custa caro (1,25× a 3× os valores-base, no bloco
`ECONOMY` de `shared/sim/config.ts`). A partida começa enxuta: 6 cidadãos, 1 Explorador, nenhuma tropa de combate e
pouco estoque. Detalhes em `docs/ECONOMIA.md`.

**Partidas maiores:** até 4 nações (6 para assinantes), entre humanos e bots, com times aliados. Os mapas vão de 96 a
160 células conforme o número de nações, com simetria para cada uma, nos tipos Continental, Rios e Pontes, Montanhoso e
Deserto. A região inicial reflete o país. Detalhes em `docs/PARTIDAS_MAIORES_E_MAPAS.md`.

**Dificuldade e veterania:** contra a IA, o anfitrião escolhe Fácil, Normal, Difícil ou Brutal, que mudam o preparo
(12 a 3 min), as ondas, o uso de aviões e mísseis e os incidentes de fronteira no preparo. Tropas que abatem
inimigos sobem de patente (Veterano, Elite, Herói), com mais dano e vida e insígnia. Detalhes em
`docs/DIFICULDADE_VETERANIA.md`.

**Política (Nação → Política):** decretos com ganho e custo (alistamento, economia de guerra, racionamento, lei
marcial), facções com exigências ligadas ao teatro e pedidos das grandes potências com prazo. Detalhes em
`docs/POLITICA_DECRETOS_FACCOES.md`.

**Bônus por país e armas nucleares:** cada país tem um bônus único (por exemplo, guerra na selva para o Brasil e
artilharia em massa para a Rússia). Com a pesquisa Armas nucleares, o silo produz ogivas nucleares; todo lançamento
derruba a economia de todos os países por meses. Detalhes em `docs/BONUS_PAISES_E_NUCLEAR.md`.

**Qualidade adaptativa (KGPS + KAICS)**, ligada por padrão: durante a partida, o KGPS mede o tempo de
cada quadro. Se o jogo fica lento, alivia primeiro o que menos aparece (reflexos, efeitos de tela,
sombras, resolução), um ajuste por vez, e desfaz o que não ajudou. Com folga, devolve a qualidade do
preset. O KAICS só deixa mexer em parâmetros validados no renderizador e confere cada mudança lendo
o estado de volta. Tocar no contador de FPS abre o painel com as medidas e as decisões. Detalhes em
`docs/KGPS_KAICS.md`.

## Testes e verificação

```bash
npm test          # Vitest: A*, mapa, movimento, combate, economia, construção, IA, determinismo, servidor
npm run lint
npm run build     # typecheck + build do cliente
npm run build:server
```

## Decisões e desvios em relação à especificação

- **Multijogador desde já** (decisão do projeto): a especificação previa single-player primeiro. A
  simulação continua isolada em `shared/` e roda igual no servidor e nos testes; o modo "contra a
  IA" também passa pelo servidor.
- **Save/load local substituído** por estado no servidor + reconexão automática: ao recarregar a
  página ou perder a conexão, o jogador volta à mesma partida (até 60 s; contra a IA a partida pausa
  enquanto isso). Não há saves persistentes de partidas.
- **Pausa em PvP**: qualquer jogador pode pausar/retomar; a velocidade é fixa em 1×.
- **Camada nacional dentro da partida**: a especificação previa uma campanha estratégica separada;
  aqui ela roda junto com cada operação tática e termina com ela (decisão do projeto para o
  multijogador). Não há campanha persistente entre partidas.

## Limitações conhecidas

- Snapshots completos (~1,6 kB a 10/s); compressão delta fica para quando houver mais unidades.
- Salas vivem em memória de um único processo: reiniciar o servidor encerra partidas em andamento,
  e não há escala horizontal.
- Sem áudio, tutorial ou matchmaking automático (entrada por código de sala).
- O estado da implementação de cada fase do adendo está em [docs/AUDITORIA_ADENDO.md](docs/AUDITORIA_ADENDO.md).
- Propostas de balanceamento, progressão por eras, mapas maiores e novos sistemas (ainda não implementadas) estão em
  [docs/BALANCEAMENTO_E_PROGRESSAO.md](docs/BALANCEAMENTO_E_PROGRESSAO.md).
- Partidas duram minutos (≈ centenas de dias simulados): efeitos de longo prazo (educação,
  infraestrutura) aparecem pouco numa partida curta.
- Os governos da IA só reagem a propostas (não tomam iniciativa diplomática própria) e mantêm o
  orçamento de referência. Não há acordos entre jogadores nem negociação de paz.
- Mapa mundial, notícias e rankings ainda não existem (Fases 4+).
