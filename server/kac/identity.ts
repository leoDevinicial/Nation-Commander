import { createHash, randomUUID } from 'node:crypto';

/**
 * KAC — identidade dos convidados (achado KAC-01 da auditoria).
 *
 * O convidado se identifica com um segredo gerado no navegador dele (`nc.guestId`, um UUID aleatório). Antes, o
 * servidor usava esse segredo como id público (`guest:<segredo>`), que vai para todos da sala em `RoomInfo.players`
 * e `hostUserId`. Quem estivesse na sala podia mandar `hello` com o mesmo `guestId`, derrubar a conexão do convidado
 * ("conta conectada em outra aba") e assumir a vaga dele na partida.
 *
 * Agora o id público é um hash do segredo: o mesmo segredo sempre dá o mesmo id (reconexão e retomada continuam
 * funcionando), mas conhecer o id não permite produzir o segredo.
 */
export function guestIdentity(secret: string | undefined): string {
  const s = secret ?? randomUUID();
  return `guest:${createHash('sha256').update(`nc-guest-v1:${s}`).digest('hex').slice(0, 32)}`;
}

/**
 * KAC-05 — id público de qualquer conta (contas do Supabase e convidados), usado em tudo o que vai para outros
 * jogadores (`RoomInfo`, fim de partida) e no `welcome` (o cliente compara "sou eu?" com ele). O id real da conta só
 * existe no servidor: não é credencial, mas é dado pessoal e não precisa sair dali.
 */
export function publicId(userId: string): string;
export function publicId(userId: string | null): string | null;
export function publicId(userId: string | null): string | null {
  if (userId === null) return null;
  return `p:${createHash('sha256').update(`nc-public-v1:${userId}`).digest('hex').slice(0, 24)}`;
}
