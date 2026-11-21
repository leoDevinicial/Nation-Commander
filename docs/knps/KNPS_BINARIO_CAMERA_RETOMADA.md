# KNPS — formato binário, envio por área da câmera, retomada e leitura no Worker (21/11)

Medido com `npx tsx scripts/knps-banda.ts 6 250 [camera]` (4 nações, 2 exércitos de 250 tropas marchando, ~510
tropas no fim, 6 minutos), por jogador e por hora:

| Caminho | Na rede (compressão do WebSocket) | Compressão pelo servidor | Sem compressão |
|---|---|---|---|
| Delta em texto (antes) | 80 MB | 113 MB | 334 MB |
| Delta binário | 52 MB | 81 MB | 128 MB |
| Binário + câmera longe da batalha (`camera=2`) | **21 MB** | 40 MB | 80 MB |

Com a câmera em cima da batalha (`camera=1`) quase nada espera: o ganho é o do binário.

## 1. Leitura no Web Worker (`src/net/wireDecode.ts`, `src/net/wire.worker.ts`)
Mensagens binárias (quadros do formato abaixo, ou texto comprimido pelo servidor) são lidas num Web Worker: descomprimir,
ler o JSON e montar as tropas do bloco binário saem da thread que desenha o jogo. A entrega segue a ordem de chegada
(texto que chega atrás de um binário espera na fila). Se o worker falhar, cada mensagem pendente é lida na página
(o dado fica guardado até a resposta). Texto puro curto (pong, chat, a maioria das mensagens) segue lido na hora.
O delta continua sendo aplicado na página (é com estado e barato). `gameClient.decodeWhere` diz onde a leitura roda.

## 2. Envio por área da câmera (`view`, `Room.viewDefer`, `SnapshotDeltaEncoder.encode(s, defer)`)
O runtime manda o retângulo do chão que aparece na tela (no máximo 4 vezes por segundo, só quando muda, e de novo a
cada 5 s; `null` com o horizonte à vista). A tropa fora dele (folga de `VIEW_MARGIN_CELLS` = 8 células) e que já
estava fora no último envio é atualizada 1 vez a cada `VIEW_DEFER_EVERY` = 4 envios, em rodízio pelo id. Enquanto
espera, o encoder guarda o registro como o cliente já tem, e a diferença acumulada vai na vez dela. Tropas novas,
mortas e que saem da vista vão sempre na hora. **KAC:** a câmera só muda a frequência; o que entra no snapshot (névoa)
continua decidido pelo servidor, igual para todos. A mensagem é validada (`server/messages.ts`) e fica na conexão.

## 3. Retomada da conexão (`CHECKPOINT_TICKS`, `resumeFrom`, `rewind`, `hello.resume`)
A cada 20 ticks (1 s), o encoder guarda o estado enviado (até 40 pontos, ~40 s) e o decodificador do navegador guarda o
snapshot montado. Os mapas do encoder não são alterados depois de prontos e o registro sem mudança é o mesmo objeto do
envio anterior: guardar um ponto é guardar referências. Na reconexão, o navegador volta ao último ponto e manda
`resume: { tick, key }` (`key` = seed da partida); o servidor, se ainda tem o ponto e a partida é a mesma, manda só a
diferença a partir dele em vez do snapshot inteiro (até ~78 KB numa partida grande). Sem o ponto, vai completo, como
antes. Log do servidor: "Retomada da conexão" (`resumed`).

## 5. Formato binário (`shared/net/wire.ts`)
Numa batalha grande, ~90% dos bytes do delta são as atualizações das tropas (`u`). Elas vão num bloco binário (5 a 13
bytes por tropa: id, campos, x·100, y·100, facing·100, hp) e o resto da mensagem segue JSON:

    [0] 0x00 | [1] versão | u32 tamanho do JSON | JSON | u32 quantidade | registros (little-endian)

Só entra no bloco a atualização que cabe exatamente (posição e direção com 2 casas, vida inteira, só esses campos); com
menos de 8, a mensagem vai em texto. Só para quem pediu no `hello` (`bin`): navegador antigo segue no texto, e o
protocolo não mudou. Com a compressão pelo servidor, todo binário vai comprimido (`Connection.sendBinary`).

Testes: `shared/test/wire.test.ts`, `shared/test/delta.test.ts` (adiamento e retomada), `server/wire.test.ts` (sala
de verdade) e `src/test/gameClient.test.ts`.
