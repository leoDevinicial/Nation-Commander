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

## Diagnóstico do navegador e modo leve (21/11)
Num relato de 20/11 (sala `WMKDK`), um jogador teve 8 quedas "conexão perdida" (código 1006) e a tela ficou branca com a
interface viva; os outros três não caíram nenhuma vez. O servidor estava bem: era a página dele que morria. Agora:
- **`client_diag`** (`src/lib/clientDiag.ts` → `server/messages.ts` → tabela `client_diagnostics`): o navegador avisa
  `context_lost`, `context_restored`, `context_failed` (não voltou em 6 s), `abrupt_end` (a página anterior morreu no
  meio de uma partida com a aba visível), `safe_mode` e os 5 primeiros erros da página, com placa de vídeo, memória,
  núcleos, tela, toque, qualidade e navegador. O servidor valida cada campo, põe a conta pela conexão e aceita até 20
  por conexão. Aparece no log ("Diagnóstico do navegador") e no banco.
- **Modo leve automático**: depois de um `abrupt_end` ou `context_failed`, a qualidade vai para Mobile/Baixo sem sombras;
  a anterior fica guardada e as Configurações mostram "Voltar para …". Escolher a qualidade à mão desliga o automático.
- **Aviso na partida**: gráficos perdidos sem volta mostram "Os gráficos pararam" com "Recarregar no modo leve"; a
  reconexão leva à mesma partida.
- **Derrota por abandono**: `RoomPlayerInfo.abandoned`; a tela de derrota diz que o jogador ficou fora além do prazo
  (antes dizia que o Centro de Comando caiu).

Consulta útil: `select created_at, display_name, kind, detail, device->>'gpu', device->>'memoryGb', room_code from
client_diagnostics order by created_at desc limit 50;`
