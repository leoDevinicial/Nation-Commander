import { isCountryId } from '../shared/data/countries.ts';
import { GAME_SPEEDS, MAX_CHAT_LENGTH, type ClientMessage, type GameSpeed } from '../shared/protocol.ts';
import { parseCommand } from '../shared/sim/commands.ts';
import { BUDGET_KEYS, type Budget } from '../shared/strategic/NationalSimulation.ts';
import { TECHNOLOGIES, type TechId } from '../shared/strategic/technologies.ts';
import type { DiplomaticAction } from '../shared/strategic/Diplomacy.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ROOM_CODE = /^[A-Z0-9]{5}$/;
const GUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

/** Valida mensagens do cliente. Qualquer campo inesperado ou malformado → null. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data) || typeof data.t !== 'string') return null;
  switch (data.t) {
    case 'hello': {
      if (typeof data.protocol !== 'number') return null;
      const token = typeof data.token === 'string' && data.token.length < 4096 ? data.token : null;
      const guestId = typeof data.guestId === 'string' && GUEST_ID.test(data.guestId) ? data.guestId : undefined;
      const guestName = typeof data.guestName === 'string' ? sanitizeName(data.guestName) : undefined;
      return { t: 'hello', protocol: data.protocol, token, guestId, guestName };
    }
    case 'create_room':
      if ((data.mode !== 'pvp' && data.mode !== 'vs_ai' && data.mode !== 'sandbox') || !isCountryId(data.countryId)) return null;
      return { t: 'create_room', mode: data.mode, countryId: data.countryId };
    case 'join_room': {
      const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
      if (!ROOM_CODE.test(code) || !isCountryId(data.countryId)) return null;
      return { t: 'join_room', code, countryId: data.countryId };
    }
    case 'leave_room':
      return { t: 'leave_room' };
    case 'set_country':
      return isCountryId(data.countryId) ? { t: 'set_country', countryId: data.countryId } : null;
    case 'set_ready':
      return typeof data.ready === 'boolean' ? { t: 'set_ready', ready: data.ready } : null;
    case 'start':
      return { t: 'start' };
    case 'cmd': {
      const cmd = parseCommand(data.cmd);
      return cmd ? (data.scope === 'battle' ? { t: 'cmd', cmd, scope: 'battle' } : { t: 'cmd', cmd }) : null;
    }
    case 'national': {
      const cmd = isObj(data.cmd) ? data.cmd : null;
      if (!cmd) return null;
      if (cmd.type === 'set_budget' && isObj(cmd.budget)) {
        const budget = {} as Budget;
        for (const k of BUDGET_KEYS) {
          const v = cmd.budget[k];
          if (typeof v !== 'number' || !Number.isFinite(v)) return null;
          budget[k] = v;
        }
        return { t: 'national', cmd: { type: 'set_budget', budget } };
      }
      if (cmd.type === 'diplomacy') {
        const action = parseDiplomaticAction(cmd.action);
        return action ? { t: 'national', cmd: { type: 'diplomacy', action } } : null;
      }
      if (cmd.type === 'set_research') {
        if (cmd.techId === null) return { t: 'national', cmd: { type: 'set_research', techId: null } };
        if (typeof cmd.techId === 'string' && Object.hasOwn(TECHNOLOGIES, cmd.techId)) {
          return { t: 'national', cmd: { type: 'set_research', techId: cmd.techId as TechId } };
        }
      }
      return null;
    }
    case 'set_balance':
      return data.mode === 'parity' || data.mode === 'realistic' ? { t: 'set_balance', mode: data.mode } : null;
    case 'pause':
      return typeof data.paused === 'boolean' ? { t: 'pause', paused: data.paused } : null;
    case 'speed':
      return GAME_SPEEDS.includes(data.speed as GameSpeed) ? { t: 'speed', speed: data.speed as GameSpeed } : null;
    case 'surrender':
      return { t: 'surrender' };
    case 'chat': {
      if (typeof data.text !== 'string') return null;
      // eslint-disable-next-line no-control-regex -- remove caracteres de controle do chat
      const text = data.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH);
      return text ? { t: 'chat', text } : null;
    }
    case 'ping':
      return typeof data.n === 'number' ? { t: 'ping', n: data.n } : null;
    default:
      return null;
  }
}

const isNationId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1000;

/** Valida a forma de uma ação diplomática; regras (prazo, relação, guerra) ficam na simulação. */
export function parseDiplomaticAction(raw: unknown): DiplomaticAction | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'establish_contact':
      return isNationId(raw.partner) ? { type: 'establish_contact', partner: raw.partner } : null;
    case 'declare_war':
      return isNationId(raw.target) ? { type: 'declare_war', target: raw.target } : null;
    case 'propose':
      return (raw.treaty === 'trade' || raw.treaty === 'alliance') && isNationId(raw.partner) ? { type: 'propose', treaty: raw.treaty, partner: raw.partner } : null;
    case 'request_sanctions':
      return isNationId(raw.partner) && isNationId(raw.target) ? { type: 'request_sanctions', partner: raw.partner, target: raw.target } : null;
    case 'impose_sanctions':
    case 'lift_sanctions':
      return isNationId(raw.target) ? { type: raw.type, target: raw.target } : null;
    case 'send_aid':
      return isNationId(raw.partner) && typeof raw.pctGdp === 'number' && Number.isFinite(raw.pctGdp) && raw.pctGdp > 0 && raw.pctGdp <= 0.5
        ? { type: 'send_aid', partner: raw.partner, pctGdp: raw.pctGdp }
        : null;
    case 'set_mission':
      return isNationId(raw.partner) && typeof raw.active === 'boolean' ? { type: 'set_mission', partner: raw.partner, active: raw.active } : null;
    case 'cancel_treaty':
      return Number.isInteger(raw.treatyId) && (raw.treatyId as number) > 0 ? { type: 'cancel_treaty', treatyId: raw.treatyId as number } : null;
    default:
      return null;
  }
}

export function sanitizeName(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, 20);
  return clean.length >= 2 ? clean : 'Convidado';
}
