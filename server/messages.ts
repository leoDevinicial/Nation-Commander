import { isCountryId } from '../shared/data/countries.ts';
import { GAME_SPEEDS, MAX_CHAT_LENGTH, type ClientMessage, type GameSpeed } from '../shared/protocol.ts';
import { parseCommand } from '../shared/sim/commands.ts';

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
      if ((data.mode !== 'pvp' && data.mode !== 'vs_ai') || !isCountryId(data.countryId)) return null;
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
      return cmd ? { t: 'cmd', cmd } : null;
    }
    case 'pause':
      return typeof data.paused === 'boolean' ? { t: 'pause', paused: data.paused } : null;
    case 'speed':
      return GAME_SPEEDS.includes(data.speed as GameSpeed) ? { t: 'speed', speed: data.speed as GameSpeed } : null;
    case 'surrender':
      return { t: 'surrender' };
    case 'chat': {
      if (typeof data.text !== 'string') return null;
      const text = data.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH);
      return text ? { t: 'chat', text } : null;
    }
    case 'ping':
      return typeof data.n === 'number' ? { t: 'ping', n: data.n } : null;
    default:
      return null;
  }
}

export function sanitizeName(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, 20);
  return clean.length >= 2 ? clean : 'Convidado';
}
