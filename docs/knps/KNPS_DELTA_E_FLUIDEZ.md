# KNPS — Snapshots delta, compressão garantida e interpolação sem engasgo (15/11)

## O problema

Uma partida de 2 humanos + 2 bots gastou **~3 GB** de banda no Render, e as tropas e os mísseis andavam aos trancos
("anda, para, anda"). Uma proposta feita com o Grok (buffer de 120 ms, delta, 5 Hz) foi lida e usada como ponto de
partida; a implementação abaixo é outra, pelos motivos da seção "Por que não o pacote do Grok".

## O que foi medido

`npx tsx scripts/knps-banda.ts 6 250`: 4 nações, humano pilotado pela IA e dois exércitos de 250 tropas marchando um
contra o outro (500 tropas, trocam de direção a cada minuto). Por jogador, por hora:

| Envio | Sem compressão | Compressão do WebSocket (contexto) | Compressão do servidor (por mensagem) |
|---|---|---|---|
| Antes (snapshot inteiro, 10 Hz) | **1.557 MB** | 267 MB | — |
| Agora (delta, 10 Hz) | 336 MB | **81 MB** | **114 MB** |

Partida comum de 30 minutos (exército de ~50): de 22,8 MB para 8,5 MB no fio (com compressão do WebSocket).

**Achado:** pedindo a conexão ao servidor de produção (`nation-commander-server.onrender.com`) com
`Sec-WebSocket-Extensions: permessage-deflate`, a resposta veio **sem** a extensão; o mesmo pedido ao servidor local
negociou. O teste passou por um proxy desta máquina que pode ter tirado o cabeçalho, então não é prova, mas os 3 GB
batem com "sem compressão" (~1,5 GB/h por jogador). Por isso a compressão agora não depende mais do caminho.

## O que mudou

1. **Delta** (`shared/net/delta.ts`, KNPS-09). O servidor guarda, por jogador, o último estado que de fato mandou e envia
   só o que mudou: unidades, prédios e nações campo a campo (chave + campos mudados, `_x` para campos que sumiram, novos
   inteiros, `ug`/`bg`/`pg` para os que saíram, `uo`/`bo`/`po` com a ordem completa só quando ela muda: a ordem conta,
   KAC-06); demais campos só quando mudam (`set`/`rm`); eventos, território e estradas como já eram ("só quando muda").
   O `GameClient` remonta o snapshot inteiro antes de qualquer parte do jogo ver a mensagem. Snapshot pulado por
   congestionamento (KNPS-02) não é codificado; reconexão e fim de partida mandam completo; keyframe a cada 150 envios
   (15 s) por segurança. Jogador desconectado ou com fila cheia não monta mais o JSON (só atualiza a memória da névoa).
   `PROTOCOL_VERSION` 7: cliente antigo é avisado para recarregar.
2. **Compressão garantida** (KNPS-14). O navegador olha `ws.extensions` ao abrir; sem `permessage-deflate` (e com
   `DecompressionStream`), pede `inflate` no `hello`. O servidor então manda as mensagens de 1 KB ou mais em binário,
   deflate-raw nível 1 (`Connection.sendRaw`), e o cliente descomprime em fila, na ordem de chegada. `/health` mostra
   `compression` (transporte / servidor / nenhuma) das conexões abertas e o painel de conexão do jogo mostra a do jogador.
   `KNPS_NO_DEFLATE=1` no servidor (só teste) simula o proxy que tira a extensão.
3. **Interpolação** (`src/game/net/interp.ts`, KNPS-15). Antes: `alpha = min(1, ...)` e o ponto de partida virava o
   destino anterior; pacote atrasado → tropa parada; pacote adiantado → salto para a frente. Agora quem recebe snapshot
   parte de onde estava desenhado (`prev = lerp(prev, curr, a0)`, com `a0` do relógio no instante da chegada), cada trecho
   dura o intervalo + uma folga do tamanho da oscilação medida (8–160 ms) e, se ainda atrasar, segue até 15% além.
   Vale para tropas, aviões, mísseis e cargas. Teste com ±45 ms de oscilação: quadros parados 61 → 0, maior salto 0,94 →
   0,21 (passo normal 0,17).

## Por que não o pacote do Grok

- **Buffer de 120 ms com só dois estados:** o jogo guarda `prev`/`curr` por entidade; desenhar 120 ms no passado com o
  intervalo de 100 ms dá alpha negativo logo depois de cada chegada (preso no `prev`) e o salto continua a cada pacote.
  Um buffer de verdade precisaria do histórico por entidade; a partida do ponto desenhado resolve com o que já existe.
- **5 Hz:** os efeitos (tiros, explosões) tocam na chegada do snapshot, sem agendar pelo tick. A 5 Hz uma batalha viraria
  rajadas a cada 200 ms. Ficou 10 Hz; com delta e compressão o custo já caiu ~14×. Baixar para 5 Hz só depois de agendar
  os eventos pelo tick (dá ~metade da banda que sobrou).
- **Quantização para 2 casas:** as posições já iam com 2 casas (`r2`).

## Próximos passos possíveis

- Agendar os eventos pelo tick (permite 5 Hz sem rajadas).
- Delta também na mensagem `national` (1 por segundo, ~12 KB cru).
- Confirmar em produção pelo `/health` (`compression`) e pelo painel de conexão.
