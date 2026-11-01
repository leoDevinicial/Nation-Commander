# KNPS — Kaiser Network Performance System

Sistema da série Kaiser para a rede do Nation Commander: transporte, cadência de estado, fila de saída, reconexão e
medição de conexão. Objetivo: o menor atraso **evitável** para todos os jogadores, sem mudar as regras da partida para
ninguém e sem tirar autoridade do servidor nem do KAC.

O KNPS não elimina distância física. O que ele faz é tirar o atraso que o próprio jogo criava (dados demais, fila,
cadência) e medir o resto. A parte que depende de onde o servidor está (região) é decisão de infraestrutura: ver
[KNPS_REGIONAL_INFRASTRUCTURE.md](KNPS_REGIONAL_INFRASTRUCTURE.md).

## Nomes

- **KACS** (nome usado no documento do KNPS) = **KAC — Kaiser Anti Cheat** no código (`server/kac/`, `docs/kac/`).
  Os identificadores do KAC não foram renomeados.
- **KGPS / KAICS**: qualidade gráfica adaptativa (`src/game/perf/`). O KNPS não mexe neles; o painel de rede fica ao
  lado do painel de desempenho, separado.

## Estado das capacidades

Legenda: **feito** (código + teste + medição), **parcial**, **proposto**, **fora do alcance do código**.

| Id | Capacidade | Estado | Onde | Prova |
|---|---|---|---|---|
| KNPS-01 | Compressão do transporte (permessage-deflate com contexto) | feito | `server/knps/transport.ts`, `server/index.ts` | `server/knps.test.ts` (negociação real e bytes no fio < 20%); navegador negociou a extensão (`.audit/knps_e2e.cjs`) |
| KNPS-02 | Fila de saída limitada: snapshot substituível é pulado na conexão congestionada, eventos guardados | feito | `Connection.congested`, `Room.broadcastSnapshot` | `server/knps.test.ts` |
| KNPS-03 | Resposta imediata: snapshot extra no tick em que a ordem do jogador é aplicada | feito | `Room.advance` / `sendQuickSnapshot`; interpolação por ticks em `GameRuntime` | `server/knps.test.ts` |
| KNPS-04 | Laço do servidor mais fino (10 ms em vez de 25 ms) e medição do tick | feito | `Room.startLoop/onLoop`, `server/knps/stats.ts`, `/health` | partida real: tick p95 2 ms, atraso do laço p95 9 ms |
| KNPS-05 | Medição no cliente (ping, p95, oscilação, pings sem resposta, cadência, dados) e painel | feito | `src/net/netStats.ts`, `src/ui/hud/NetPanel.tsx` | `src/test/netStats.test.ts`; painel visto no jogo |
| KNPS-06 | Reconexão rápida (pings sem resposta, tentativas curtas, rede de volta) | feito (entrega anterior) | `src/net/GameClient.ts` | `src/test/gameClient.test.ts` |
| KNPS-07 | Servidor em região mais perto dos jogadores | fora do alcance do código | Render | ver regional |
| KNPS-08 | Várias regiões com salas marcadas por região e escolha pelo ping | proposto | — | depende do KNPS-07 |
| KNPS-09 | Snapshot por diferença (delta) | proposto, baixa prioridade | — | a compressão com contexto já tira ~95% no fio |
| KNPS-10 | WebTransport (UDP/QUIC) | não viável hoje | — | o Render não expõe UDP para serviços web (a confirmar) |

## Qualidade da conexão (painel)

Critérios fixos, mostrados com o motivo (não é nota científica nem é usada pelo KAC):

| Classificação | Quando |
|---|---|
| ruim | ping p95 > 250 ms **ou** mais de 10% dos pings sem resposta em 5 s |
| instável | oscilação média > 40 ms, **ou** intervalo p95 entre snapshots > 300 ms, **ou** ping p95 entre 150 e 250 ms |
| boa | nenhum dos casos acima |
| medindo | menos de 3 amostras de ping |

O ping inclui o tempo que a página leva para ler a resposta: com o jogo a poucos quadros por segundo ele sobe junto.

## Regras que o KNPS segue

- O servidor continua sendo a única autoridade. Nada do KNPS muda a velocidade, o tick, o dano ou a ordem de execução
  para um jogador específico. O snapshot extra (KNPS-03) é só uma foto do mesmo estado, mais cedo.
- Só se descarta o que é substituível (snapshot inteiro, o próximo traz tudo). Ordens, confirmações, mensagens de sala,
  chat e eventos nunca são descartados.
- O snapshot extra sai pelo mesmo filtro de névoa do KAC (`makeSnapshot` com o visualizador); não há caminho novo de dados.
- Ping alto ou conexão instável nunca é sinal de trapaça (KAC: `docs/kac/KAC_ENFORCEMENT_POLICY.md`).
- Nenhum teste de velocidade nem tráfego extra: as medições usam o ping de vida que já existia e os snapshots.

## Como medir

```bash
npx tsx scripts/knps-baseline.ts 12 3
```

Partida contra bots no servidor, sem rede: tamanho dos snapshots, kbit/s, ganho da compressão e custo do tick.

```bash
curl -s http://localhost:8787/health
```

Inclui `knps`: pior tick p95, atraso do laço p95, snapshots enviados, extras e pulados.

Documentos: [auditoria](KNPS_ARCHITECTURE_AUDIT.md) · [linha de base](KNPS_LATENCY_BASELINE.md) ·
[regiões](KNPS_REGIONAL_INFRASTRUCTURE.md) · [riscos e próximos passos](KNPS_RISKS_AND_ROADMAP.md).
