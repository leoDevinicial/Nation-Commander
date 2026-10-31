import type { IncomingMessage } from "node:http";

/**
 * KAC — proteção de rede por IP (achado KAC-03 da auditoria).
 *
 * Sem limite por IP, um script fora do navegador abria dezenas de conexões como convidado e criava salas até o teto
 * do servidor (`MAX_ROOMS`), deixando todos sem conseguir criar partida. Agora cada IP tem um teto de conexões
 * simultâneas e de salas criadas por janela de tempo. Os tetos são folgados para uma casa ou escola com vários
 * jogadores atrás do mesmo IP.
 */
export const NETWORK_POLICY = {
  /** Conexões simultâneas por IP. */
  maxConnectionsPerIp: 12,
  /** Salas criadas por IP a cada `roomWindowMs`. */
  maxRoomsPerIp: 8,
  roomWindowMs: 10 * 60_000,
};

/**
 * IP do cliente. Atrás do proxy do Render, o IP real é o último de `X-Forwarded-For` (o proxy acrescenta o
 * endereço que viu; os anteriores podem ter sido escritos pelo próprio cliente). Sem o cabeçalho, o endereço do socket.
 */
export function clientIp(
  req: Pick<IncomingMessage, "headers" | "socket">,
): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd.join(",") : fwd;
  const last = raw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1);
  return last || req.socket.remoteAddress || "desconhecido";
}

export class NetworkGuard {
  private readonly open = new Map<string, number>();
  private readonly rooms = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Tenta abrir uma conexão do IP; false = acima do teto. */
  connect(ip: string): boolean {
    const n = this.open.get(ip) ?? 0;
    if (n >= NETWORK_POLICY.maxConnectionsPerIp) return false;
    this.open.set(ip, n + 1);
    return true;
  }

  disconnect(ip: string): void {
    const n = (this.open.get(ip) ?? 0) - 1;
    if (n > 0) this.open.set(ip, n);
    else this.open.delete(ip);
  }

  /** Tenta registrar uma sala nova do IP; false = acima do teto na janela. */
  createRoom(ip: string): boolean {
    const now = this.now();
    const list = (this.rooms.get(ip) ?? []).filter(
      (t) => now - t < NETWORK_POLICY.roomWindowMs,
    );
    if (list.length >= NETWORK_POLICY.maxRoomsPerIp) {
      this.rooms.set(ip, list);
      return false;
    }
    list.push(now);
    this.rooms.set(ip, list);
    return true;
  }
}

/** Guarda do processo do servidor. */
export const networkGuard = new NetworkGuard();
