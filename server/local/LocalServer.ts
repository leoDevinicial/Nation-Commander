import type { WebSocket } from 'ws';
import type { RoomSave } from '../Room.ts';
import { Connection } from '../Connection.ts';
import { handleClose, handleMessage, type HandlerDeps } from '../handler.ts';
import { parseClientMessage } from '../messages.ts';
import { RoomManager } from '../RoomManager.ts';
import type { MatchStore } from '../matchStore.ts';
import type { MatchRecord } from '../supabase.ts';
import { NetworkGuard } from '../kac/network.ts';

/**
 * Servidor de jogo dentro do navegador (22/11): a partida contra a IA roda no aparelho do jogador, num Web Worker, com o
 * mesmo código do servidor (sala, simulação, IA, camada nacional, `handler.ts`). O navegador conversa com ele pelo mesmo
 * protocolo, como se fosse o servidor remoto, então a regra é idêntica por construção e nada muda na tela.
 *
 * Sem rede: sem lag nem quedas, e o servidor remoto fica livre para as partidas entre humanos. O que muda:
 * - identidade: vem do próprio navegador (não há o que validar; a partida contra a IA não é competitiva);
 * - salvamento: no IndexedDB do aparelho (`store`), em JSON puro, para voltar depois de recarregar a página;
 * - resultado: entregue ao navegador (`record`), que o manda ao servidor remoto para o histórico do perfil.
 */
export interface LocalIdentity {
  /** Id da conta (Supabase) ou `null` para convidado (usa o segredo do convidado do `hello`). */
  id: string | null;
  name: string;
  subscriber?: boolean;
}

export interface LocalServerOptions {
  /** Entrega uma mensagem do servidor à conexão `cid` (texto JSON ou quadro binário). */
  post: (cid: number, data: string | Uint8Array) => void;
  /** A conexão `cid` foi fechada pelo servidor. */
  closed: (cid: number, code: number, reason: string) => void;
  /** Quem está jogando (a conta logada no navegador). */
  identity: () => LocalIdentity | null;
  /** Resultado da partida para o histórico (o navegador repassa ao servidor remoto). */
  record: (rec: MatchRecord) => Promise<boolean>;
  store?: MatchStore | null;
  /** Testes: controla o laço das salas. */
  autoLoop?: boolean;
  seed?: number;
}

/** Só as partidas contra a IA rodam aqui. */
const LOCAL_MODES = new Set(['vs_ai']);

export class LocalServer {
  readonly rooms: RoomManager;
  private readonly deps: HandlerDeps;
  private readonly conns = new Map<number, { conn: Connection; ws: { readyState: number } }>();

  constructor(private readonly opts: LocalServerOptions) {
    this.rooms = new RoomManager(
      {
        reconnectGraceMs: 60_000,
        record: opts.record,
        ...(opts.autoLoop === false ? { autoLoop: false } : {}),
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      },
      4,
      opts.store ?? null,
      { encode: (s: RoomSave) => JSON.stringify(s), decode: (b: string) => JSON.parse(b) as RoomSave },
    );
    this.deps = {
      rooms: this.rooms,
      allowGuests: true,
      sessions: new Map(),
      network: new NetworkGuard(),
      // conta logada: sem servidor para validar o token; vale a identidade que o navegador informa
      verify: async () => {
        const me = opts.identity();
        return me?.id ? { id: me.id, name: me.name, ...(me.subscriber ? { subscriber: true } : {}) } : null;
      },
      // nada disso existe sem rede: o navegador manda direto ao servidor remoto
      saveFeedback: async () => false,
      saveClientDiag: async () => true,
    };
  }

  open(cid: number): void {
    const ws = {
      readyState: 1,
      OPEN: 1,
      bufferedAmount: 0,
      extensions: '',
      send: (data: string | Uint8Array) => {
        if (ws.readyState === 1) this.opts.post(cid, data);
      },
      close: (code = 1000, reason = '') => {
        if (ws.readyState !== 1) return;
        ws.readyState = 3;
        this.opts.closed(cid, code, reason);
        this.drop(cid, code);
      },
    };
    const conn = new Connection(ws as unknown as WebSocket);
    conn.ip = 'local';
    this.conns.set(cid, { conn, ws });
  }

  message(cid: number, data: string): void {
    const c = this.conns.get(cid);
    if (!c) return;
    const msg = parseClientMessage(data);
    if (!msg) {
      c.conn.send({ t: 'error', code: 'bad_message', message: 'Mensagem inválida.' });
      return;
    }
    if (msg.t === 'create_room' && !LOCAL_MODES.has(msg.mode)) {
      c.conn.send({ t: 'error', code: 'room', message: 'Este modo roda no servidor.' });
      return;
    }
    // convidado: o nome mostrado é o que o navegador tem agora (o do hello pode ser de antes de trocar o nome no menu)
    if (msg.t === 'hello') {
      // sem rede, nada a comprimir (e o zlib do Node não existe no navegador)
      delete msg.inflate;
      const me = this.opts.identity();
      if (!me?.id && me?.name) msg.guestName = me.name;
    }
    void handleMessage(c.conn, msg, this.deps);
  }

  /** O navegador fechou a conexão. */
  close(cid: number, code = 1000): void {
    const c = this.conns.get(cid);
    if (!c || c.ws.readyState !== 1) return;
    c.ws.readyState = 3;
    this.drop(cid, code);
  }

  private drop(cid: number, code: number): void {
    const c = this.conns.get(cid);
    if (!c) return;
    this.conns.delete(cid);
    c.conn.closeCode = code;
    c.conn.closeCause ??= code === 1000 || code === 1001 ? 'cliente saiu' : 'conexão local encerrada';
    handleClose(c.conn, this.deps);
  }

  /** Grava as partidas em andamento (a cada poucos segundos e quando a página vai para o fundo). */
  persist(force = false): Promise<number> {
    return this.rooms.persistAll(force);
  }

  /** Limpeza periódica: salas encerradas sem ninguém. */
  sweep(): void {
    this.rooms.sweep();
  }
}
