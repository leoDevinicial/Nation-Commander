import { randomInt } from 'node:crypto';
import type { RoomMode } from '../shared/protocol.ts';
import type { Connection } from './Connection.ts';
import { Room, type RoomDeps } from './Room.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly deps: Omit<RoomDeps, 'onEmpty'>,
    private readonly maxRooms: number,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  create(host: Connection, mode: RoomMode, countryId: string): Room | string {
    if (this.rooms.size >= this.maxRooms) return 'Servidor cheio, tente novamente em instantes';
    let code: string;
    do {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, mode, host, countryId, { ...this.deps, onEmpty: (r) => this.rooms.delete(r.code) });
    this.rooms.set(code, room);
    return room;
  }

  /** Sala (em andamento ou no lobby) da qual o usuário participa, para reconexão. */
  findByUser(userId: string): Room | undefined {
    for (const r of this.rooms.values()) if (r.status !== 'ended' && r.hasUser(userId)) return r;
    return undefined;
  }

  remove(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
  }

  /** Remove salas encerradas sem ninguém conectado. */
  sweep(): void {
    for (const r of this.rooms.values()) {
      if (r.status === 'ended' && r.players.every((p) => p.isAI || !p.connected || p.conn?.roomCode !== r.code)) this.remove(r);
    }
  }

  stats() {
    let playing = 0;
    for (const r of this.rooms.values()) if (r.status === 'playing') playing++;
    return { rooms: this.rooms.size, playing };
  }
}
