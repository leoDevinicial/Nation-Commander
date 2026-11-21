import type { Snapshot } from '../sim/snapshot.ts';

/**
 * Snapshots delta (15/11). Uma partida de 2 humanos + 2 bots gastou ~3 GB de banda no Render: o servidor mandava o
 * estado inteiro 10 vezes por segundo a cada jogador. Com exército e cidade grandes o snapshot passa da janela de 32 KB
 * da compressão do WebSocket (KNPS-01), que deixa de aproveitar a repetição entre um snapshot e o seguinte.
 *
 * Agora o servidor guarda, por jogador, o último estado que de fato mandou e envia só a diferença:
 * - unidades e prédios: só os que mudaram, e só os campos que mudaram (`id` sempre vai); os novos vão inteiros; os que
 *   saíram da vista ou morreram vão em `ug`/`bg`;
 * - os demais campos do snapshot (jogadores, comércio, zoneamento...): só quando mudam (`set`), e `rm` para os que sumiram;
 * - eventos, território e estradas já eram "só quando muda" e vão como estão (não ficam guardados no cliente).
 *
 * O cliente (`SnapshotDeltaDecoder`, no `GameClient`) remonta o snapshot completo antes de qualquer outra parte do jogo
 * ver a mensagem: para o resto do código nada mudou. O WebSocket é ordenado e confiável, então a diferença sempre é
 * sobre o snapshot anterior; o snapshot pulado por congestionamento (KNPS-02) não é codificado e não conta. Por
 * segurança, um snapshot completo sai a cada `keyframeEvery` envios e sempre depois de uma reconexão.
 */
export interface SnapshotDelta {
  d: 1;
  tick: number;
  events: Snapshot['events'];
  /** Campos persistentes que mudaram (valor novo inteiro). */
  set?: Record<string, unknown>;
  /** Campos persistentes que deixaram de existir. */
  rm?: string[];
  /**
   * Unidades, prédios e nações (players, pelo `slot`) novos (inteiros) ou alterados (chave + campos mudados; `_x` =
   * campos que sumiram).
   */
  u?: Patch[];
  b?: Patch[];
  p?: Patch[];
  /** Chaves que saíram do snapshot. */
  ug?: number[];
  bg?: number[];
  pg?: number[];
  /** Ordem completa das chaves, só quando não é a anterior + os novos no fim (a ordem conta: KAC-06, "mais antigo"). */
  uo?: number[];
  bo?: number[];
  po?: number[];
  territory?: string;
  roads?: number[];
  highways?: number[];
}

type Rec = Record<string, unknown>;
type Patch = Rec & { _x?: string[] };

/** Campos que valem só para aquela mensagem: vão como estão e não ficam no estado do cliente. */
const TRANSIENT = new Set(['tick', 'events', 'territory', 'roads', 'highways']);
/** Listas diferenciadas item a item: campo do snapshot → [mudados, saíram, ordem, chave]. */
const LISTS = { units: ['u', 'ug', 'uo', 'id'], buildings: ['b', 'bg', 'bo', 'id'], players: ['p', 'pg', 'po', 'slot'] } as const;
type ListKey = keyof typeof LISTS;

export const isDelta = (s: Snapshot | SnapshotDelta): s is SnapshotDelta => (s as SnapshotDelta).d === 1;

/**
 * Pontos de retomada (21/11): a cada `CHECKPOINT_TICKS` o servidor guarda o estado que mandou e o cliente guarda o que
 * montou. Na reconexão o cliente diz o último que tem e o servidor, se ainda o guarda, manda só a diferença a partir
 * dele em vez do snapshot inteiro (dezenas de KB justo quando a rede está ruim).
 */
export const CHECKPOINT_TICKS = 20;
/** Quantos pontos de retomada o servidor guarda por jogador (um por segundo: cobre quedas de até ~40 s). */
export const CHECKPOINT_KEEP = 40;

/** Unidade cujo envio pode esperar (fora da área da câmera, 21/11): recebe o registro atual e o último enviado. */
export type DeferFn = (unit: Rec, prev: Rec) => boolean;

interface Checkpoint {
  tick: number;
  top: Map<string, string>;
  ents: Record<ListKey, Map<number, Rec>>;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Servidor: um por jogador. Guarda o último estado enviado e devolve o snapshot completo ou a diferença. */
export class SnapshotDeltaEncoder {
  private top = new Map<string, string>();
  /** Último estado enviado. Os mapas não são alterados depois de prontos (cada envio monta outros), e um registro sem
   * mudança é o mesmo objeto do envio anterior: guardar um ponto de retomada é só guardar as referências. */
  private ents: Record<ListKey, Map<number, Rec>> = { units: new Map(), buildings: new Map(), players: new Map() };
  private sinceFull = Infinity;
  private readonly checkpoints: Checkpoint[] = [];
  /** Unidades adiadas no último envio (medição). */
  deferred = 0;

  constructor(readonly keyframeEvery = 150) {}

  /** O próximo envio vai completo (reconexão, conexão nova). */
  reset(): void {
    this.sinceFull = Infinity;
  }

  /**
   * Reconexão: volta ao estado enviado no `tick` (que o cliente diz ter montado) para a próxima mensagem ser só a
   * diferença a partir dele. Sem esse ponto guardado, o próximo envio vai completo. Devolve se conseguiu.
   */
  resumeFrom(tick: number): boolean {
    const cp = this.checkpoints.find((c) => c.tick === tick);
    if (!cp) {
      this.reset();
      return false;
    }
    this.top = new Map(cp.top);
    this.ents = { ...cp.ents };
    // a retomada conta como envio: o próximo keyframe sai no ritmo normal
    this.sinceFull = Math.min(this.sinceFull, this.keyframeEvery - 1);
    return true;
  }

  private checkpoint(tick: number): void {
    if (tick % CHECKPOINT_TICKS !== 0) return;
    const cp: Checkpoint = { tick, top: new Map(this.top), ents: { ...this.ents } };
    // dois envios no mesmo tick (o extra da ordem e o normal): vale o último, como no cliente
    if (this.checkpoints.at(-1)?.tick === tick) this.checkpoints[this.checkpoints.length - 1] = cp;
    else this.checkpoints.push(cp);
    if (this.checkpoints.length > CHECKPOINT_KEEP) this.checkpoints.shift();
  }

  /**
   * Snapshot completo ou a diferença sobre o último enviado. `defer` (só unidades já conhecidas do cliente): a mudança
   * dessa unidade pode esperar o próximo envio; ela continua no snapshot do cliente como estava.
   */
  encode(s: Snapshot, defer?: DeferFn): Snapshot | SnapshotDelta {
    this.deferred = 0;
    if (this.sinceFull >= this.keyframeEvery) {
      this.remember(s);
      this.sinceFull = 0;
      this.checkpoint(s.tick);
      return s;
    }
    this.sinceFull++;
    const out: SnapshotDelta = { d: 1, tick: s.tick, events: s.events };
    const src = s as unknown as Rec;
    const set: Rec = {};
    let anySet = false;
    for (const [k, v] of Object.entries(src)) {
      if (TRANSIENT.has(k)) {
        if (k !== 'tick' && k !== 'events' && v !== undefined) (out as unknown as Rec)[k] = v;
        continue;
      }
      if (k in LISTS) continue;
      const j = JSON.stringify(v);
      if (this.top.get(k) !== j) {
        set[k] = v;
        anySet = true;
        this.top.set(k, j);
      }
    }
    if (anySet) out.set = set;
    const rm = [...this.top.keys()].filter((k) => !(k in src));
    if (rm.length) {
      out.rm = rm;
      for (const k of rm) this.top.delete(k);
    }
    for (const key of Object.keys(LISTS) as ListKey[]) {
      const [pk, gk, ok, idk] = LISTS[key];
      const map = this.ents[key];
      const next = new Map<number, Rec>();
      const seen = new Set<number>();
      const patches: Patch[] = [];
      const list = (s[key] ?? []) as unknown as Patch[];
      const keyOf = (e: Rec) => e[idk] as number;
      for (const e of list) {
        const id = keyOf(e);
        seen.add(id);
        const prev = map.get(id);
        if (!prev) {
          patches.push(e);
          next.set(id, { ...e });
          continue;
        }
        let p: Patch | null = null;
        for (const [k, v] of Object.entries(e)) if (!same(prev[k], v)) (p ??= { [idk]: id })[k] = v;
        for (const k of Object.keys(prev)) if (!(k in e)) ((p ??= { [idk]: id })._x ??= []).push(k);
        if (p && key === 'units' && defer?.(e, prev)) {
          // fica como o cliente já tem; a diferença acumulada vai quando chegar a vez dela
          this.deferred++;
          next.set(id, prev);
          continue;
        }
        if (p) patches.push(p);
        next.set(id, p ? { ...e } : prev);
      }
      const gone: number[] = [];
      for (const id of map.keys()) if (!seen.has(id)) gone.push(id);
      // ordem que o cliente vai remontar: a anterior sem os que saíram e os novos no fim, na ordem em que vieram
      const expected: number[] = [];
      for (const id of map.keys()) if (seen.has(id)) expected.push(id);
      for (const e of list) if (!map.has(keyOf(e))) expected.push(keyOf(e));
      const orderChanged = expected.some((id, i) => id !== keyOf(list[i]!));
      this.ents[key] = next;
      if (patches.length) (out as unknown as Rec)[pk] = patches;
      if (gone.length) (out as unknown as Rec)[gk] = gone;
      if (orderChanged) (out as unknown as Rec)[ok] = list.map(keyOf);
    }
    this.checkpoint(s.tick);
    return out;
  }

  private remember(s: Snapshot): void {
    this.top = new Map();
    for (const [k, v] of Object.entries(s as unknown as Rec)) if (!TRANSIENT.has(k) && !(k in LISTS)) this.top.set(k, JSON.stringify(v));
    for (const key of Object.keys(LISTS) as ListKey[]) {
      const map = new Map<number, Rec>();
      for (const e of (s[key] ?? []) as unknown as Patch[]) map.set(e[LISTS[key][3]] as number, { ...e });
      this.ents[key] = map;
    }
  }
}

/**
 * Cliente: remonta o snapshot completo. Devolve null para uma diferença sem base (só acontece se a mensagem completa
 * se perdeu; o próximo keyframe resolve). Entidades sem mudança mantêm o mesmo objeto do snapshot anterior.
 */
export class SnapshotDeltaDecoder {
  private base: Snapshot | null = null;
  private readonly ents: Record<ListKey, Map<number, Rec>> = { units: new Map(), buildings: new Map(), players: new Map() };
  /** Último ponto de retomada montado (snapshot completo de um tick múltiplo de `CHECKPOINT_TICKS`). */
  private cp: Snapshot | null = null;

  reset(): void {
    this.base = null;
    this.cp = null;
    this.ents.units.clear();
    this.ents.buildings.clear();
    this.ents.players.clear();
  }

  /**
   * Conexão nova: volta ao último ponto de retomada e devolve o tick dele, para o `hello` pedir só a diferença a
   * partir dali (null: não há; o servidor manda completo). Se o servidor mandar completo assim mesmo, nada se perde.
   */
  rewind(): number | null {
    const cp = this.cp;
    if (!cp) {
      this.reset();
      return null;
    }
    this.load(cp);
    return cp.tick;
  }

  private load(s: Snapshot): void {
    this.base = s;
    for (const key of Object.keys(LISTS) as ListKey[]) {
      const map = this.ents[key];
      map.clear();
      for (const e of (s[key] ?? []) as unknown as Patch[]) map.set(e[LISTS[key][3]] as number, e);
    }
  }

  private mark(s: Snapshot): Snapshot {
    if (s.tick % CHECKPOINT_TICKS === 0) this.cp = s;
    return s;
  }

  apply(s: Snapshot | SnapshotDelta): Snapshot | null {
    if (!isDelta(s)) {
      this.load(s);
      return this.mark(s);
    }
    if (!this.base) return null;
    const out: Rec = {};
    for (const [k, v] of Object.entries(this.base as unknown as Rec)) if (!TRANSIENT.has(k) && !(k in LISTS)) out[k] = v;
    if (s.set) Object.assign(out, s.set);
    for (const k of s.rm ?? []) delete out[k];
    out.tick = s.tick;
    out.events = s.events;
    if (s.territory !== undefined) out.territory = s.territory;
    if (s.roads !== undefined) out.roads = s.roads;
    if (s.highways !== undefined) out.highways = s.highways;
    for (const key of Object.keys(LISTS) as ListKey[]) {
      const [pk, gk, ok, idk] = LISTS[key];
      const map = this.ents[key];
      for (const id of (s[gk] as number[] | undefined) ?? []) map.delete(id);
      for (const p of (s[pk] as Patch[] | undefined) ?? []) {
        const id = p[idk] as number;
        const prev = map.get(id);
        if (!prev) {
          map.set(id, p);
          continue;
        }
        const { _x, ...changes } = p;
        const next: Rec = { ...prev, ...changes };
        for (const k of _x ?? []) delete next[k];
        map.set(id, next);
      }
      const order = s[ok] as number[] | undefined;
      if (order) {
        const byId = new Map(map);
        map.clear();
        for (const id of order) {
          const e = byId.get(id);
          if (e) map.set(id, e);
        }
      }
      out[key] = [...map.values()];
    }
    this.base = out as unknown as Snapshot;
    return this.mark(this.base);
  }
}

/** Testes e scripts que leem a conexão crua: remonta os snapshots como o `GameClient` faz. */
export function decodedMessages<T extends { t: string; s?: unknown; scope?: unknown }>(): (msg: T) => T | null {
  const dec = new SnapshotDeltaDecoder();
  return (msg) => {
    if (msg.t !== 'snapshot' || msg.scope) return msg;
    const s = dec.apply(msg.s as Snapshot | SnapshotDelta);
    return s ? { ...msg, s } : null;
  };
}
