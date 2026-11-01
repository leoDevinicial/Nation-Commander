# KNPS — Auditoria do netcode existente (fase 0)

Classificação: **confirmado** (lido no código), **testado** (coberto por teste executado), **medido**, **inferido**,
**desconhecido**.

## 1. Inventário

| Item | Valor | Estado |
|---|---|---|
| Cliente | React 19 + three.js 0.186 + zustand 5, Vite 8, TypeScript 6 | confirmado (`package.json`) |
| Servidor | Node, `ws` 8.22, `http` nativo; Docker no Render (plano free) | confirmado (`server/index.ts`, `render.yaml`) |
| Região do servidor | nenhuma declarada no `render.yaml`: padrão do Render (Oregon, EUA) | inferido |
| Contas e histórico | Supabase (token verificado no `hello`) | confirmado |
| Transporte | um WebSocket por jogador (TCP + TLS), JSON texto | confirmado |
| WebTransport / UDP | não usado | confirmado |
| Compressão | **nenhuma** antes do KNPS; agora permessage-deflate | confirmado / testado |
| Nagle | o `ws` liga `setNoDelay` no socket | confirmado (biblioteca) |
| Protocolo | `PROTOCOL_VERSION = 6`, recusa versão diferente no `hello`; 48 mensagens do servidor | confirmado (`shared/protocol.ts`) |
| Limite de mensagem | 16 KB (`maxPayload`), também depois de descomprimir | testado |
| Ritmo de mensagens | 30/s por conexão (rajada 60); 50 violações fecham a conexão | confirmado (`Connection`, KAC) |

## 2. Modelo de simulação

- **Servidor autoritativo com tick fixo**: 20 ticks/s (`TICK_RATE`), laço com acumulador e no máximo 8 ticks de
  recuperação por volta (sem acumular trabalho infinito). Velocidade do jogo é da sala inteira (nunca por jogador).
  Confirmado (`Room.onLoop`).
- **Comandos são intenções**: entram numa fila (`Room.pending`, no máximo `MAX_COMMANDS_PER_TICK` por jogador) e são
  validados e aplicados no início do tick seguinte (`Simulation.applyCommand`). O dono vem da conexão, nunca do payload
  (KAC). Rejeição volta como `cmd_rejected`. Confirmado.
- **Snapshots completos** a cada 2 ticks (10/s), um por jogador, já filtrados pela névoa (`makeSnapshot` com o
  visualizador; KAC). O território só vai quando muda (`territoryVersion`). Não há delta. Confirmado.
- **Cliente**: interpola entre os dois últimos snapshots (unidades, edifícios, aviões); drones com buffer no relógio do
  servidor; a câmera do drone em primeira pessoa prevê o voo e corrige devagar (`DroneFpv`). Nada no cliente decide
  resultado. Confirmado.
- **Lockstep / rollback**: não existem e não são recomendados aqui (simulação grande, IA, economia e eventos
  irreversíveis; o modelo atual já é o adequado para o KAC). Decisão registrada.

## 3. Fluxo de comunicação

1. Cliente abre o WebSocket (`GameClient.open`) e manda `hello` com versão e token (ou id de convidado).
2. Servidor verifica, troca a sessão anterior da mesma conta (`replaced`), responde `welcome` e reata a sala em
   andamento (memória ou salvamento: `findOrRestore` → `reattach`, que manda o snapshot completo).
3. Sala: mensagens de lobby (`room`, `chat`); `start` → `match_start` (mapa, tick rate, cadência).
4. Partida: `cmd` → fila → tick; `snapshot` 10/s (+ extra do KNPS-03); `national` (camada estratégica), `operations`,
   batalhas locais.
5. Vida da conexão: `ping`/`pong` do jogo a cada 2,5 s (cliente) e ping de protocolo a cada 15 s (servidor, fecha o
   socket morto).
6. Queda: o cliente detecta (fechamento ou pings sem resposta) e reconecta; o servidor guarda a vaga por 60 s
   (`RECONNECT_GRACE_MS`) e então declara abandono.
7. Fim: `match_end` com o resultado; gravação no Supabase com limite de espera de 8 s.

## 4. Onde o atraso evitável estava (antes do KNPS)

| Fonte | Antes | Estado |
|---|---|---|
| Snapshot sem compressão: ~9,5 KB × 10/s ≈ 600–700 kbit/s por jogador (4 nações, mediana) | fila em links lentos | medido |
| Esperar a cadência: ordem aplicada em tick ímpar só aparecia no snapshot seguinte | +50 ms (média +25) | confirmado |
| Laço do servidor a cada 25 ms | tick até 25 ms atrasado (média ~12) | confirmado / medido |
| Nenhum limite de fila de saída | snapshots velhos empilhados atrás de novos | confirmado |
| Interpolação com intervalo fixo de 100 ms | sem problema antes; precisava mudar com o KNPS-03 | confirmado |
| Detecção de queda só pelo fechamento do navegador | podia levar minutos | confirmado (corrigido na entrega anterior) |

## 5. Transporte: avaliação

- **WebSocket** fica. É o que o Render suporta, o que o KAC já valida e o que todos os navegadores têm.
- **WebTransport** precisa de HTTP/3 (QUIC sobre UDP) no servidor. O Render não expõe UDP para serviços web (até onde
  a documentação pública diz; não verificado num teste real). Não há ganho sem trocar de hospedagem. Não implementado.
- **Formato**: JSON comprimido com contexto ficou em ~5% do tamanho. Um formato binário reduziria CPU de serialização,
  mas o tick inteiro custa ~0,7–2 ms; não é gargalo. Não trocado.
- **Canais lógicos**: controle (ordens, sala) e eventos são confiáveis e nunca descartados; snapshot é substituível
  (KNPS-02); telemetria do jogador não sai do navegador.
