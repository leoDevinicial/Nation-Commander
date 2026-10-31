# KAC — Modelo de ameaças, superfície de ataque e registro de riscos

Complementa `KAC_ARCHITECTURE_AUDIT.md`. O atacante considerado é um jogador que:
- controla o próprio navegador e o próprio tráfego;
- pode escrever scripts que falam com o WebSocket fora do navegador (forjando a origem);
- pode abrir várias conexões e contas de convidado;
- pode ler tudo o que o servidor manda para ele.

Fora do escopo:
- invadir o Render, a Vercel ou o Supabase;
- roubar o token de outra pessoa (segurança do dispositivo dela);
- ataques de volume na rede, que são proteção da hospedagem.

## 1. Superfície de ataque

| Canal | Entradas | Quem valida |
|---|---|---|
| `hello` | token, `guestId` (segredo), nome | `handler.ts` + Supabase Auth; KAC-01 |
| Sala | criar, entrar, país, bots, times, nome, pública, iniciar | `Room` (anfitrião); KAC-03 para criação |
| `cmd` | ~45 tipos de comando táticos | `parseCommand` + `Simulation.applyCommand` |
| `cmd` com escopo de batalha | comandos na batalha local | `OperationsSystem.battleCommand` |
| `national` | orçamento, pesquisa, diplomacia, decretos | `parseNational` + `NationalSimulation` |
| Pausa, velocidade, rendição | — | `Room`; KAC-02 para a pausa |
| Chat da partida e chat da Comunidade | texto | limite de tamanho e ritmo, filtro, denúncia |
| Feedback | texto, nota | limite de 1/min, validação |
| HTTP `/health` | — | público, só contagens agregadas |
| HTTP `/kac` | `Authorization: Bearer` | painel de leitura da equipe; desligado sem `KAC_ADMIN_TOKEN`; tempo constante; IP barrado após 10 erros |

## 2. Ameaças por domínio (STRIDE resumido)

| Domínio | Ameaça | Situação |
|---|---|---|
| Identidade | Assumir a conta ou a vaga de outro jogador | **KAC-01, corrigido** para convidados. Contas: protegidas pelo token do Supabase |
| Economia | Criar recursos, gastar duas vezes, reembolso duplicado | Mitigado: custo debitado no servidor no momento do comando; reembolsos calculados pelo servidor; um tick é atômico (processo único) |
| Produção e construção | Construir sem custo, sem requisito, fora do território | Mitigado: `placementError`, `checkProduce`, eras, pesquisas no servidor |
| Unidades | Comandar unidade alheia, duplicar unidade | Mitigado: `ownUnits` filtra por dono; unidades só nascem na simulação |
| Movimento | Teletransporte, velocidade | Mitigado: o cliente manda o destino; caminho e velocidade são do servidor |
| Combate | Dano, alcance ou recarga falsos | Mitigado: tudo calculado no `step()` |
| Névoa | Ver tropas e prédios escondidos | Mitigado (servidor). KAC-06, KAC-07 e KAC-12 corrigidos |
| Partida | Pausa infinita, planejar com o tempo parado, tirar a pausa do outro | **KAC-02 e KAC-11, corrigidos** |
| Disponibilidade | Esgotar as salas do servidor com scripts | **KAC-03, corrigido** (limites por IP) |
| Automação | Bot ou macro jogando sozinho | **KAC-09:** sinais de regularidade e de ritmo, só alerta para revisão humana |
| Conluio e multicontas | Vitória combinada, contas alternativas | Sem ranking hoje, então risco baixo; planejar antes do ranking |
| Investigação | Disputa sobre um resultado sem registro | Relatório de integridade em `matches.report.integrity` e diário persistente (KAC-08) |
| Chat | Ofensa, spam | Mitigado (filtro, denúncia, silenciamento) |

## 3. Registro de riscos

Situação:
- **Corrigido:** implementado e com teste adversarial executado (`server/kac.test.ts`, `shared/test/kacProjection.test.ts`,
  `shared/test/air.test.ts`).
- **Mitigado:** reduz o risco sem eliminá-lo (o limite está escrito na linha).
- **Aceito:** comportamento de design, registrado para não ser confundido com falha.
- **Aberto:** risco conhecido, ainda sem correção.

| Id | Risco | Gravidade | Situação | Evidência ou próximo passo |
|---|---|---|---|---|
| KAC-01 | Sequestro de convidado: o id público (`guest:<segredo>`) ia para a sala inteira e servia de senha no `hello` | Crítica | **Corrigido** | `server/kac/identity.ts`. O teste reproduz o ataque e falha no código antigo |
| KAC-02 | Pausa abusada entre humanos: ilimitada, qualquer um a tirava e as ordens pausadas eram executadas juntas na volta | Alta | **Corrigido** | `server/kac/policy.ts`: 3 pausas, 60 s, 15 s de cortesia, ordens recusadas na pausa |
| KAC-03 | Sem limite por IP: scripts abriam conexões e salas até o teto do servidor | Média | **Corrigido** | `server/kac/network.ts`: 12 conexões e 8 salas a cada 10 min por IP |
| KAC-04 | O IP real atrás do proxy do Render é presumido como o último de `X-Forwarded-For` | Média | Aberto (validar) | O "KAC resumo" no log agora traz `xffMaxHops` e `rede.busiestIp`. Se `busiestIp` ficar alto com muitos jogadores, há um proxy na frente e o IP lido é o dele |
| KAC-05 | Ids de conta do Supabase (UUID) iam para os outros jogadores na sala | Baixa (privacidade, não é credencial) | **Corrigido** | `publicId` (hash) na sala, no anfitrião e no `welcome`. O teste falha no código antigo |
| KAC-06 | Ids sequenciais (um contador para todos): num 1x1, ao ver uma unidade inimiga nova dava para calcular quantas unidades e prédios o inimigo tinha criado | Baixa | **Corrigido** | `server/kac/entityIds.ts`: permutação secreta por partida (Feistel com HMAC-SHA256, chave de 256 bits só no servidor) para ids de entidade, voo, míssil, mina e caravana. O teste falha sem a permutação |
| KAC-07 | `targetId` de uma unidade alheia visível citava uma entidade fora da visão (só o id, sem posição) | Baixa | **Corrigido** | `visibleTarget` em `makeSnapshot`. O teste falha no código antigo |
| KAC-08 | Diário do KAC só na memória: sumia num reinício | Média (investigação) | **Corrigido** (falta rodar a migração) | `server/kac/store.ts`: lotes, fila com teto, gravação no encerramento, retenção de 90 dias. Tabela criada por `20261101020000_kac_events.sql` |
| KAC-09 | Automação (bots e macros) não detectada | Média | **Mitigado** (só alerta) | `server/kac/behavior.ts`: regularidade dos intervalos e ritmo sustentado, no relógio do servidor. Testado contra script fixo, script com ruído de 5% e humano rápido. Automação com intervalos humanizados passa |
| KAC-10 | Contas e salas, limites e chat na memória de um processo | Média se houver várias instâncias | Desconhecido | Confirmar no Render que há uma instância; se escalar, estado compartilhado |
| KAC-11 | Comandos nacionais aceitos com o jogo pausado | Baixa | **Corrigido** | `Room.nationalCommand` usa a regra da pausa nas partidas entre humanos |
| KAC-12 | Um voo inimigo visível trazia a posição da base aérea de origem (`bx/by`), mesmo com a base na névoa | Média (revela base escondida) | **Corrigido** | `airView` só manda a base se o observador a enxerga; a animação de decolagem e pouso se adapta. O teste falha no código antigo |
| KAC-13 | Míssil inimigo em voo mostra o silo de origem e o alvo a quem o vê | Baixa | Aceito (design) | É o alerta de lançamento: o alvo sabe de onde veio. Terceiros só veem se o míssil passa na visão deles |

## 4. O que o KAC não faz, por decisão

- Nada de driver, varredura de processos, leitura de memória ou identificação de hardware no computador do jogador.
  O jogo roda no navegador, e a defesa certa é a autoridade do servidor.
- Nenhuma punição automática por sinal estatístico. Registrar um evento não é condenar. O que acontece depois está em
  `KAC_ENFORCEMENT_POLICY.md`.
- Não promete segurança absoluta nem superioridade sobre outros sistemas sem evidência comparável.
