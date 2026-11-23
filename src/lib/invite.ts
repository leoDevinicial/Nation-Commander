/**
 * Link de convite direto para a sala (23/11): `/sala/ABCDE` abre o jogo e, depois do login (conta ou convidado), entra
 * sozinho na sala. O código fica guardado na aba até ser usado; o endereço volta para `/`.
 */
const KEY = 'nc.invite.v1';
const ROOM_CODE = /^[A-Z0-9]{5}$/;

/** Código no caminho (`/sala/abcde`, `/room/abcde`), ou null. */
export function inviteCodeFromPath(path: string): string | null {
  const m = /^\/(?:sala|room|join)\/([A-Za-z0-9]{5})\/?$/.exec(path);
  const c = m?.[1]?.toUpperCase() ?? null;
  return c && ROOM_CODE.test(c) ? c : null;
}

export const inviteUrl = (code: string, origin = location.origin): string => `${origin}/sala/${code}`;

/** Lê o convite do endereço ao abrir o jogo (guarda e limpa o caminho). */
export function captureInvite(): void {
  const c = inviteCodeFromPath(location.pathname);
  if (!c) return;
  try {
    sessionStorage.setItem(KEY, c);
  } catch {
    // sem armazenamento: o convite vale só se a entrada for imediata
  }
  history.replaceState(null, '', '/');
  pending = c;
}

let pending: string | null = null;

/** Pega o convite pendente (uma vez). */
export function takeInvite(): string | null {
  let c = pending;
  try {
    c ??= sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    // ignora
  }
  pending = null;
  return c && ROOM_CODE.test(c) ? c : null;
}
