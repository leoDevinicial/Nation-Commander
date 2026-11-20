# Quedas de conexão e reconexão (20/11)

## Por que
Um feedback de 19/11 pediu para "consertar a conexão": três amigos jogavam partidas de ~1 h e, no histórico, as duas
partidas longas do grupo (11/11 e 19/11) terminaram por `disconnect`, com os dois convidados perdendo por abandono, um
deles à frente no placar. O KAC não registrou nada (quedas comuns não vão para o diário).

## O que estava errado
1. **Conexão antiga derrubava quem já tinha voltado.** O navegador reconecta antes de o servidor perceber que a conexão
   antiga morreu (o servidor só nota em 10–15 s, ou no fim do aperto de mão do fechamento). Quando a antiga finalmente
   fechava, `Room.onDisconnect` achava o jogador pelo id e o marcava como caído: a partida parava de chegar na conexão
   nova (tela congelada) e, passado o prazo, ele "abandonava" sem ter saído. Agora a conexão que fecha só conta se for a
   atual do jogador.
2. **Falha passageira do Supabase virava "sessão inválida".** Qualquer erro do `getUser` (rede, 429, 5xx) fazia o
   servidor responder `auth`; o cliente parava de reconectar e saía da conta. Agora `verifyAccessToken` devolve
   `'retry'` nesses casos (`isTransientAuthError`) e o servidor fecha com 1013, que o cliente tenta de novo.
3. **Token não renovado na volta.** Se a renovação do token falhasse (aba em segundo plano mais de 1 h, rede voltando),
   o cliente mandava o `hello` sem token e caía no mesmo `auth`. Agora `currentToken` (`src/app/session.ts`) renova o
   token perto do vencimento e lança se não conseguir; o `GameClient` tenta de novo em vez de entrar sem token.

## Partidas entre humanos
`DISCONNECT_POLICY` (`server/kac/policy.ts`):
- a queda pausa a partida por até 90 s, no máximo 3 vezes por jogador (os outros podem retomar antes);
- o prazo para voltar antes de perder por abandono é `RECONNECT_GRACE_PVP_MS` (padrão 3 min); contra a IA continua
  `RECONNECT_GRACE_MS` (60 s, com a partida pausada).

## Diagnóstico
- Log do servidor: `Conexão encerrada` (código, motivo, ping, tempo de conexão), `Jogador caiu`, `Jogador reconectou`
  (tempo fora) e `Abandono por queda`.
- Histórico: `matches.report.connection` traz, por jogador que caiu, quantas quedas, a mais longa e os motivos
  (`ping sem resposta`, `conexão perdida`, `cliente saiu`, `servidor: ...`). Não vai para a tela dos jogadores e não é
  gravado no salvamento (uma partida retomada recomeça a contagem).

Testes: `server/reconnect.test.ts` e `src/test/gameClient.test.ts` ("token na reconexão").
