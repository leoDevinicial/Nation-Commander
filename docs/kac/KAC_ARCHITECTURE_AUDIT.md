# KAC — Auditoria de arquitetura (fase 0)

Auditoria feita em 31/10/2026 sobre o código da branch `claude/youthful-dijkstra-a45emp`, para o Kaiser Anti Cheat
(KAC), parte do ecossistema Kaiser junto com o KGPS e o KAICS.

Este documento reúne cinco artefatos pedidos na especificação: arquitetura, fronteiras de confiança, fluxo da
partida, avaliação de autoridade e controles existentes.

Legenda de certeza:
- **Confirmado:** lido no código ou provado em teste.
- **Provável:** coerente com o código, mas não verificado em produção.
- **Desconhecido:** depende da configuração do Render, da Vercel ou do Supabase, que esta auditoria não acessa.

## 1. Inventário tecnológico

| Peça | O que é | Certeza |
|---|---|---|
| Cliente | React 19.3, zustand 5, three.js 0.186 para a cena 3D, Vite 8.3, TypeScript 6.0; hospedado na Vercel | Confirmado (código); hospedagem: Provável (`docs/HANDOFF.md`) |
| Servidor de jogo | Node + `ws` 8.22 (WebSocket), TypeScript rodado com `tsx`; hospedado no Render | Confirmado (código); hospedagem: Provável |
| Simulação | `shared/sim/` (tática, 20 ticks/s) e `shared/strategic/` (nacional), determinísticas, rodando no servidor | Confirmado |
| Autenticação | Supabase Auth: o servidor valida o access token com a chave de serviço (`verifyAccessToken`); convidados opcionais (`ALLOW_GUESTS`) | Confirmado |
| Banco | Supabase Postgres: `profiles`, `matches` (histórico e relatório), `subscriptions`, `feedback`, `community_reports`, `kac_events` | Confirmado (migrações) |
| Salvamento de partidas | `MatchStore`: Supabase ou pasta local (`MATCH_STORE_DIR`) para retomar depois de reinício | Confirmado |
| Protocolo | JSON sobre WebSocket; mensagens do cliente em `shared/protocol.ts`, validadas por `server/messages.ts` | Confirmado |
| Instâncias do servidor | Uma instância (salas, chat e limites na memória do processo) | Provável; Desconhecido no Render |

## 2. Fluxo de uma partida e quem tem a autoridade

| Etapa | Onde acontece | Autoridade |
|---|---|---|
| 1. Login | Supabase Auth no cliente; o token vai no `hello` | Servidor (valida o token) |
| 2. Convidado | `hello` com `guestId` (segredo do navegador) | Servidor (id público = hash do segredo, KAC-01) |
| 3. Sala | `create_room`, `join_room`, `set_room`, bots, times, pronto | Servidor (`Room`, só o anfitrião muda a sala) |
| 4. Início | `start` do anfitrião; mapa gerado pela semente no servidor | Servidor |
| 5. Estado inicial | `match_start` (mapa, jogadores) | Servidor |
| 6. Comandos | `cmd` → `parseCommand` → fila `pending` → `Simulation.applyCommand(slot, cmd)` no tick | Servidor (o slot vem da conexão, nunca do payload) |
| 7. Economia, produção, construção, pesquisa, combate, movimento, visão | `Simulation.step()` | Servidor |
| 8. Envio do estado | `makeSnapshot(sim, events, viewer)` por jogador | Servidor (filtra a névoa) |
| 9. Camada nacional | `national` → fila → `NationalSimulation` | Servidor |
| 10. Reconexão | `hello` → `findOrRestore` → `reattach` (estado reenviado pelo servidor) | Servidor |
| 11. Fim | vitória, rendição ou abandono calculados na simulação ou na sala | Servidor |
| 12. Persistência | `recordMatch` (RPC no Supabase) com relatório | Servidor (chave de serviço) |

**Modelo de autoridade: A, simulação autoritativa no servidor.**
- O cliente só envia intenções (mover estas unidades para x,y; construir este tipo nesta célula; produzir…).
- Posição, dano, recursos, produção, visão e resultado são calculados pelo servidor. Nenhum valor calculado pelo
  cliente é aceito.
- A interpolação, a previsão do fantasma de construção e o relógio de dia e noite do cliente são só visuais.

## 3. Matriz de confiança

| Componente | O jogador pode alterar? | Autoridade competitiva? |
|---|---|---|
| Navegador, JavaScript, estado do zustand | Sim | Não |
| Mensagem recebida pelo servidor | Sim | Não: é intenção, validada por `parseClientMessage` e `parseCommand` |
| Identidade da conexão (`conn.user`) | Não, depois do `hello` (token verificado ou hash do segredo) | Sim |
| Slot do jogador | Não: derivado da conexão (`playerOf(conn)`) | Sim |
| Simulação (`Simulation`, `NationalSimulation`) | Não | Sim |
| Snapshot enviado | Não: montado no servidor por jogador | Projeção autorizada |
| Banco (Supabase) | Não: só o servidor grava as tabelas do jogo (RLS sem políticas nas tabelas sensíveis) | Fonte persistente |
| Logs do cliente, relatório de desempenho (KGPS) | Sim | Não: não são prova de nada |

## 4. Fluxo de dados

- **Cliente → servidor:** `hello` (token ou segredo do convidado, nome), comandos de sala, `cmd` (intenção),
  `national`, chat, Comunidade, feedback, ping.
  - Limites: 16 KB por mensagem, 30 mensagens/s com rajada de 60 por conexão, até 20 comandos por tick por jogador,
    listas de unidades limitadas (`MAX_UNITS_PER_COMMAND`).
- **Servidor → cliente:**
  - `room` (ids públicos derivados por hash, nomes, países; KAC-05);
  - `snapshot` (só o visível ao jogador, mais as lembranças de prédios já vistos);
  - eventos filtrados (`eventVisible`), camada nacional, chat.
- **Servidor → Supabase:** histórico de partidas (com o relatório de integridade), salvamentos, feedback, denúncias e
  o diário do KAC (`kac_events`).

## 5. Controles que já existiam antes do KAC

| Controle | Onde | Certeza |
|---|---|---|
| Validação de forma de toda mensagem (campos, tipos, tamanhos) | `server/messages.ts`, `shared/sim/commands.ts` | Confirmado |
| Dono verificado em todo comando (unidades, prédios, lançamentos, ofertas, contratos) | `Simulation.applyCommand`, `ownUnits`, `air.ts`, `trade.ts` | Confirmado (lido comando a comando) |
| Ferramentas do Sandbox só no Sandbox | `applyCommand`, casos `sandbox_*` | Confirmado |
| Velocidade fixa no multijogador | `Room.setSpeed` | Confirmado |
| Névoa no servidor: entidades inimigas só quando visíveis; fila, reunião, pesquisa e trabalhadores inimigos ocultos | `makeSnapshot` | Confirmado. Dois resíduos achados depois e corrigidos: KAC-07 (alvo) e KAC-12 (base aérea do voo) |
| Eventos filtrados por jogador, com falha segura (tipo não listado não é enviado) | `eventVisible` | Confirmado |
| Minas inimigas não enviadas | `MineSystem.visibleTo` | Confirmado |
| Limite de ritmo e de tamanho, fechamento após 50 violações | `Connection`, `server/index.ts` | Confirmado |
| Uma conexão por conta (a nova derruba a antiga) | `handler.ts` (`sessions`) | Confirmado |
| Origem do WebSocket restrita | `isOriginAllowed` | Confirmado (navegadores; scripts podem forjar a origem) |
| Tabelas sensíveis com RLS e sem políticas (só a chave de serviço acessa) | migrações do Supabase | Confirmado |
| Salvar e retomar idêntico (determinismo) | testes `save/load` | Confirmado |

## 6. Conclusão da auditoria

O núcleo competitivo já segue o princípio "o cliente pede, o servidor decide".
- Editar memória ou o JavaScript não dá recursos, tropas, velocidade, dano nem visão do mapa.
- Os riscos reais estavam nas bordas: identidade de convidado, regras da sala e da pausa, e falta de limites por IP.
- Na fase P0 foram achadas e corrigidas três falhas (KAC-01 a 03). Na fase seguinte, mais quatro (KAC-05, 07, 11 e
  12), além do diário persistente, dos sinais de automação e do relatório de integridade. Veja `KAC_THREAT_MODEL.md`.
