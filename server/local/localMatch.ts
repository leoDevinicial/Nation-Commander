import { isCountryId } from '../../shared/data/countries.ts';
import type { EndReason, PublicUser } from '../../shared/protocol.ts';
import { MEDALS, type MedalId } from '../../shared/sim/report.ts';
import type { MatchRecord } from '../supabase.ts';

/**
 * Resultado de uma partida contra a IA que rodou no navegador (22/11, `server/local/`), recebido pelo servidor remoto
 * para o histórico do perfil. A partida não passou pelo servidor, então nada aqui é prova de nada: a gravação é marcada
 * como local (`report.integrity.verdict = 'local'`) e serve só para o histórico e as medalhas de quem jogou. O que dá
 * para conferir é conferido: só contra a IA, só a conta da própria conexão como humano, números e textos com limite.
 */
const END_REASONS: readonly EndReason[] = ['hq_destroyed', 'forfeit', 'disconnect', 'draw', 'territory', 'political'];
const STATS = ['unitsProduced', 'unitsLost', 'unitsKilled', 'structuresBuilt', 'structuresLost', 'structuresDestroyed', 'resourcesGathered', 'resourcesSpent', 'damageDealt'] as const;
const MAX_DURATION_S = 24 * 3600;
const MAX_STAT = 1e9;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v, 40);
  return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;
};

/** Confere e normaliza; devolve o registro pronto para gravar ou o motivo da recusa. */
export function validateLocalMatch(raw: unknown, user: PublicUser, now = Date.now()): MatchRecord | string {
  if (user.guest) return 'partidas de convidado não vão para o histórico';
  if (!isObj(raw)) return 'formato inválido';
  if (raw.mode !== 'vs_ai') return 'só partidas contra a IA rodam no navegador';
  const started = iso(raw.started_at);
  const ended = iso(raw.ended_at);
  const duration = num(raw.duration_seconds, MAX_DURATION_S);
  if (!started || !ended || duration === null) return 'datas inválidas';
  if (Date.parse(ended) > now + 5 * 60_000 || now - Date.parse(ended) > 7 * 24 * 3600_000) return 'partida fora do prazo';
  if (!END_REASONS.includes(raw.end_reason as EndReason)) return 'motivo do fim inválido';
  if (!Array.isArray(raw.players) || raw.players.length < 2 || raw.players.length > 6) return 'jogadores inválidos';
  const players: MatchRecord['players'] = [];
  const slots = new Set<number>();
  for (const p of raw.players as unknown[]) {
    if (!isObj(p)) return 'jogador inválido';
    const slot = num(p.slot, 5);
    if (slot === null || !Number.isInteger(slot) || slots.has(slot)) return 'vaga inválida';
    slots.add(slot);
    const isAi = p.is_ai === true;
    // o único humano é quem mandou o resultado; os outros são bots
    const playerId = isAi ? null : user.id;
    if (!isAi && p.player_id !== user.id) return 'o humano da partida não é esta conta';
    if (!isCountryId(p.country_id)) return 'país inválido';
    if (p.result !== 'win' && p.result !== 'loss' && p.result !== 'draw') return 'resultado inválido';
    if (!isObj(p.stats)) return 'estatísticas inválidas';
    const stats = {} as MatchRecord['players'][number]['stats'];
    for (const k of STATS) {
      const v = num(p.stats[k], MAX_STAT);
      if (v === null) return `estatística inválida: ${k}`;
      stats[k] = v;
    }
    players.push({
      slot,
      player_id: playerId,
      is_ai: isAi,
      display_name: isAi ? (str(p.display_name, 40) ?? 'IA') : user.name,
      country_id: p.country_id as string,
      result: p.result,
      stats,
      // o resumo nacional não é conferido peça por peça: vai só o que o perfil mostra, com limite de tamanho
      national: isObj(p.national) && JSON.stringify(p.national).length < 4000 ? (p.national as unknown as MatchRecord['players'][number]['national']) : null,
    });
  }
  if (players.filter((p) => !p.is_ai).length !== 1) return 'a partida local tem um humano só';
  const winnerSlot = players.find((p) => p.result === 'win');
  const report = isObj(raw.report) ? raw.report : {};
  const medals = Array.isArray(report.medals)
    ? (report.medals as unknown[])
        .filter(isObj)
        .filter((m) => slots.has(m.slot as number) && Array.isArray(m.medals))
        .map((m) => ({ slot: m.slot as number, medals: (m.medals as unknown[]).filter((x): x is MedalId => typeof x === 'string' && x in MEDALS) }))
    : [];
  const samples = Array.isArray(report.samples) && JSON.stringify(report.samples).length < 200_000 ? (report.samples as MatchRecord['report']['samples']) : [];
  return {
    // código com prefixo L: partidas locais aparecem separadas no painel de números
    room_code: `L${(str(raw.room_code, 8) ?? 'XXXXX').replace(/[^A-Z0-9]/g, '').slice(0, 5)}`,
    mode: 'vs_ai',
    map_seed: num(raw.map_seed, 2 ** 32) ?? 0,
    started_at: started,
    ended_at: ended,
    duration_seconds: Math.round(duration),
    end_reason: raw.end_reason as EndReason,
    winner_id: winnerSlot && !winnerSlot.is_ai ? user.id : null,
    game_version: str(raw.game_version, 20) ?? '?',
    balance_mode: raw.balance_mode === 'realistic' ? 'realistic' : 'parity',
    players,
    report: {
      samples,
      medals,
      integrity: { version: 1, stateHash: '', ticks: Math.round(duration * 20), competitive: false, players: [], securityEvents: 0, verdict: 'local' },
    },
  };
}
