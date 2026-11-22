# Partida contra a IA no navegador (22/11, versão 1.6.0)

A partida contra a IA roda no aparelho do jogador, num Web Worker, com **o mesmo código do servidor** (sala, simulação,
IA tática e nacional, `server/handler.ts`). O navegador conversa com ele pelo mesmo protocolo, como se fosse o servidor
remoto: a regra é idêntica por construção e nada muda na tela.

Motivo: todas as partidas recentes eram contra a IA, e partidas longas sobrecarregavam o servidor (relato de 21/11: a
partida rodando a 1/3 da velocidade). Rodando no aparelho, a partida contra a IA não tem lag nem quedas (continua mesmo
se a internet cair depois de começar) e o servidor fica livre para as partidas entre humanos.

## Como funciona

| Peça | Onde | O que faz |
|---|---|---|
| `server/local/LocalServer.ts` | worker | `RoomManager` + `handleMessage` com conexões falsas; só `vs_ai` |
| `server/local/worker.ts` | worker | entrada do Web Worker; grava a partida a cada 10 s e ao ir para o fundo |
| `server/local/idbStore.ts` | worker | salvamento no IndexedDB (JSON puro; o `RoomManager` aceita o formato) |
| `server/local/shims/` | build | substitutos de `node:crypto` (SHA-256/HMAC em JS, idênticos ao Node), `zlib`, `fs`, `path` |
| `vite.config.ts` (`nc-node-shims`) | build | troca os módulos do Node pelos substitutos, só fora do vitest |
| `src/net/localSocket.ts` | página | "WebSocket" que fala com o worker; marca de partida local em andamento |
| `src/net/localMode.ts` | página | quando ir para o local e voltar ao remoto; fila dos resultados para o histórico |
| `server/local/localMatch.ts` | servidor remoto | confere e grava o resultado (`local_match`) |

- O `GameClient` usa o endereço `local:` (`LOCAL_URL`) para abrir um `LocalSocket` em vez de um WebSocket. Todo o resto
  (hello, reconexão, delta, formato binário, retomada) é o mesmo. Sem compressão (não há rede).
- "Jogar contra a IA" troca para o local se o aparelho suporta e a opção **Partida contra a IA no seu aparelho**
  (Configurações, `localAi`, ligada por padrão) está ligada. Multijogador, Sandbox, Tutorial e entrar por código usam
  sempre o remoto. Sair da sala local volta ao remoto.
- Recarregar ou abrir o jogo de novo com partida local em andamento (`nc.local.active.v1`, até 12 h) conecta direto ao
  local, que retoma do IndexedDB (perde no máximo os últimos segundos).
- Mensagens que só o remoto atende (opinião, diagnóstico, comunidade, lista de salas) não vão para o local: ficam com
  quem as mandou e saem quando o remoto voltar.

## Histórico do perfil

O servidor local entrega o resultado ao navegador, que o guarda (`nc.localmatches.v1`) e manda ao remoto
(`local_match`) até receber `local_match_ok`. O remoto confere: só contra a IA, só contas (convidados não vão para o
histórico, como antes), o humano é a conta da conexão, números e textos com limite, no máximo um a cada 20 s por conta.
Grava com `room_code` começando por `L` e `report.integrity.verdict = 'local'`. As amostras do relatório são enxugadas
para a mensagem caber nos 16 KB do servidor.

**Não é prova de nada:** a partida não passou pelo servidor. Por isso só serve para o histórico e as medalhas de quem
jogou (a partida contra a IA não é competitiva). Ranking ou recompensa que valha algo entre jogadores não deve contar
partidas com `verdict = 'local'` (ver `docs/kac/KAC_THREAT_MODEL.md`).

## Limites conhecidos

- O navegador não sabe se a conta é assinante: a partida local usa o limite da versão grátis (4 nações).
- As partidas locais não entram no "partidas hoje" do painel de números (que conta as do servidor); entram no banco.
- O aparelho faz o trabalho do servidor: em celular fraco e partida longa, pode esquentar. A opção nas Configurações
  devolve a partida contra a IA ao servidor.

## Testes

- `server/local/LocalServer.test.ts`: sala, início, ordens, snapshots, retomada numa instância nova, resultado.
- `server/local/localMatch.test.ts`: validação e gravação no remoto (repetição, limite, recusas).
- `server/local/shims.test.ts`: SHA-256 e HMAC iguais aos do Node.
- No navegador (Playwright, dev e build de produção): a partida anda pelo `local:` com zero snapshots no WebSocket
  remoto, continua com o servidor remoto desligado, volta depois de recarregar e, ao sair, o jogo volta ao remoto.
