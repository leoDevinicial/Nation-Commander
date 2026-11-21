/**
 * Formato binário dos snapshots (21/11). Numa batalha grande, 9 de cada 10 bytes do snapshot delta são as
 * atualizações das tropas que andam (`u`: id, posição, direção e vida), em texto: `{"id":123456,"x":12.34,"y":45.67,
 * "facing":1.23}` são ~45 bytes por tropa, 10 vezes por segundo. Aqui elas vão num bloco binário de 5 a 13 bytes por
 * tropa; o resto da mensagem continua JSON.
 *
 * Quadro (WebSocket binário):
 *   [0] 0x00 marca (texto JSON nunca começa com 0)   [1] versão
 *   u32 tamanho do JSON | JSON (UTF-8) | u32 quantidade | registros
 * Registro: u32 id | u8 campos (1 x, 2 y, 4 facing, 8 hp) | u16 x·100 | u16 y·100 | i16 facing·100 | u16 hp
 * (cada campo só se o bit estiver ligado; tudo little-endian).
 *
 * Só entra no bloco a atualização que cabe exatamente (posição com 2 casas, vida inteira, nada além desses campos);
 * o resto continua no JSON. O cliente remonta os registros como patches comuns: o delta e o resto do jogo não mudam.
 * Só vai binário para quem pediu no `hello` (`bin`); navegador antigo segue recebendo texto.
 */

export const WIRE_MARK = 0x00;
export const WIRE_VERSION = 1;
/** Abaixo disso não compensa: a mensagem vai em texto. */
export const WIRE_MIN_HOT = 8;

const HOT_KEYS = new Set(['id', 'x', 'y', 'facing', 'hp']);
const BIT = { x: 1, y: 2, facing: 4, hp: 8 } as const;

type Rec = Record<string, unknown>;

const exact100 = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const k = Math.round(v * 100);
  return k >= min && k <= max && k / 100 === v ? k : null;
};

/** Cabe no bloco binário? Devolve os campos já convertidos, ou null. */
function hotRecord(p: Rec): { id: number; mask: number; x?: number; y?: number; f?: number; hp?: number } | null {
  const id = p.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id > 0xffffffff) return null;
  let mask = 0;
  const out: { id: number; mask: number; x?: number; y?: number; f?: number; hp?: number } = { id, mask };
  for (const k of Object.keys(p)) {
    if (!HOT_KEYS.has(k)) return null;
    if (k === 'x' || k === 'y') {
      const v = exact100(p[k], 0, 0xffff);
      if (v === null) return null;
      out[k] = v;
      mask |= BIT[k];
    } else if (k === 'facing') {
      const v = exact100(p[k], -0x8000, 0x7fff);
      if (v === null) return null;
      out.f = v;
      mask |= BIT.facing;
    } else if (k === 'hp') {
      const v = p[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0xffff) return null;
      out.hp = v;
      mask |= BIT.hp;
    }
  }
  if (!mask) return null;
  out.mask = mask;
  return out;
}

const recordBytes = (mask: number) => 5 + (mask & 1 ? 2 : 0) + (mask & 2 ? 2 : 0) + (mask & 4 ? 2 : 0) + (mask & 8 ? 2 : 0);

/**
 * Servidor: quadro binário de uma mensagem de snapshot delta, ou null quando não compensa (snapshot completo, poucas
 * tropas andando). `msg.s.u` sai do JSON para o bloco só com os patches que cabem.
 */
export function encodeSnapshotFrame(msg: { t: 'snapshot'; s: unknown } & Rec): Uint8Array | null {
  const s = msg.s as Rec;
  const u = s?.d === 1 ? (s.u as Rec[] | undefined) : undefined;
  if (!u || u.length < WIRE_MIN_HOT) return null;
  const hot: NonNullable<ReturnType<typeof hotRecord>>[] = [];
  const rest: Rec[] = [];
  for (const p of u) {
    const h = hotRecord(p);
    if (h) hot.push(h);
    else rest.push(p);
  }
  if (hot.length < WIRE_MIN_HOT) return null;
  const s2: Rec = { ...s };
  if (rest.length) s2.u = rest;
  else delete s2.u;
  const json = new TextEncoder().encode(JSON.stringify({ ...msg, s: s2 }));
  let size = 2 + 4 + json.length + 4;
  for (const h of hot) size += recordBytes(h.mask);
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  buf[0] = WIRE_MARK;
  buf[1] = WIRE_VERSION;
  dv.setUint32(2, json.length, true);
  buf.set(json, 6);
  let o = 6 + json.length;
  dv.setUint32(o, hot.length, true);
  o += 4;
  for (const h of hot) {
    dv.setUint32(o, h.id, true);
    buf[o + 4] = h.mask;
    o += 5;
    if (h.mask & 1) {
      dv.setUint16(o, h.x!, true);
      o += 2;
    }
    if (h.mask & 2) {
      dv.setUint16(o, h.y!, true);
      o += 2;
    }
    if (h.mask & 4) {
      dv.setInt16(o, h.f!, true);
      o += 2;
    }
    if (h.mask & 8) {
      dv.setUint16(o, h.hp!, true);
      o += 2;
    }
  }
  return buf;
}

/** É um quadro deste formato (e não texto JSON)? */
export const isWireFrame = (bytes: Uint8Array): boolean => bytes.length >= 10 && bytes[0] === WIRE_MARK && bytes[1] === WIRE_VERSION;

/** Cliente: remonta a mensagem, com os registros do bloco de volta em `s.u` como patches comuns. */
export function decodeSnapshotFrame<T = unknown>(bytes: Uint8Array): T {
  if (!isWireFrame(bytes)) throw new Error('quadro binário desconhecido');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = dv.getUint32(2, true);
  const msg = JSON.parse(new TextDecoder().decode(bytes.subarray(6, 6 + len))) as { s: Rec };
  let o = 6 + len;
  const n = dv.getUint32(o, true);
  o += 4;
  const u = ((msg.s.u as Rec[] | undefined) ?? []).slice();
  for (let i = 0; i < n; i++) {
    const p: Rec = { id: dv.getUint32(o, true) };
    const mask = bytes[o + 4]!;
    o += 5;
    if (mask & 1) {
      p.x = dv.getUint16(o, true) / 100;
      o += 2;
    }
    if (mask & 2) {
      p.y = dv.getUint16(o, true) / 100;
      o += 2;
    }
    if (mask & 4) {
      p.facing = dv.getInt16(o, true) / 100;
      o += 2;
    }
    if (mask & 8) {
      p.hp = dv.getUint16(o, true);
      o += 2;
    }
    u.push(p);
  }
  msg.s.u = u;
  return msg as T;
}
