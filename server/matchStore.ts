import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSave } from './Room.ts';
import { log } from './logger.ts';
import { SUSPENDED_PREFIX, isSuspendedKey } from './savedKeys.ts';

/**
 * Onde ficam as partidas em andamento enquanto o servidor reinicia (atualização, queda, plano
 * gratuito que adormece). O conteúdo é o `RoomSave` em JSON, comprimido (gzip + base64).
 */
export interface StoredMatch {
  code: string;
  blob: string;
  updatedAt: number;
}

export interface MatchStore {
  readonly kind: string;
  save(code: string, userIds: readonly string[], blob: string): Promise<void>;
  /** Partida em andamento salva mais recente de que o usuário participa (nunca as guardadas pelo jogador). */
  findByUser(userId: string): Promise<StoredMatch | null>;
  /** Partidas guardadas pelo jogador ("salvar e sair", chave `~CÓDIGO`) de que o usuário participa. */
  listSuspended(userId: string): Promise<StoredMatch[]>;
  /** Uma linha pela chave (código ou `~CÓDIGO`), com os ids dos jogadores. */
  get(key: string): Promise<(StoredMatch & { userIds: string[] }) | null>;
  remove(code: string): Promise<void>;
}

export { SUSPENDED_PREFIX, suspendedKey, isSuspendedKey } from './savedKeys.ts';

/** Salvamentos mais velhos que isso são descartados (ninguém voltou a tempo). */
export const MAX_SAVE_AGE_MS = 12 * 60 * 60_000;

export function encodeSave(save: RoomSave): string {
  return gzipSync(Buffer.from(JSON.stringify(save))).toString('base64');
}

export function decodeSave(blob: string): RoomSave {
  return JSON.parse(gunzipSync(Buffer.from(blob, 'base64')).toString('utf8')) as RoomSave;
}

/** Em memória (testes; não sobrevive a reinício). */
export class MemoryMatchStore implements MatchStore {
  readonly kind = 'memória';
  readonly rows = new Map<string, { userIds: string[]; blob: string; updatedAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  async save(code: string, userIds: readonly string[], blob: string): Promise<void> {
    this.rows.set(code, { userIds: [...userIds], blob, updatedAt: this.now() });
  }

  async findByUser(userId: string): Promise<StoredMatch | null> {
    let best: StoredMatch | null = null;
    for (const [code, r] of this.rows) if (!isSuspendedKey(code) && r.userIds.includes(userId) && (!best || r.updatedAt > best.updatedAt)) best = { code, blob: r.blob, updatedAt: r.updatedAt };
    return best;
  }

  async listSuspended(userId: string): Promise<StoredMatch[]> {
    return [...this.rows]
      .filter(([code, r]) => isSuspendedKey(code) && r.userIds.includes(userId))
      .map(([code, r]) => ({ code, blob: r.blob, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(key: string): Promise<(StoredMatch & { userIds: string[] }) | null> {
    const r = this.rows.get(key);
    return r ? { code: key, blob: r.blob, updatedAt: r.updatedAt, userIds: [...r.userIds] } : null;
  }

  async remove(code: string): Promise<void> {
    this.rows.delete(code);
  }
}

/** Arquivos num diretório (servidor com disco persistente ou desenvolvimento local). */
export class FileMatchStore implements MatchStore {
  readonly kind: string;
  constructor(private readonly dir: string) {
    this.kind = `arquivos em ${dir}`;
  }

  private file(code: string): string {
    // partida guardada pelo jogador: S_CÓDIGO (o "~" não vai no nome do arquivo)
    return join(this.dir, `${isSuspendedKey(code) ? 'S_' : ''}${code.replace(/[^A-Z0-9]/gi, '')}.json`);
  }

  private async rows(): Promise<{ code: string; userIds: string[]; blob: string; updatedAt: number }[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: { code: string; userIds: string[]; blob: string; updatedAt: number }[] = [];
    for (const n of names.filter((x) => x.endsWith('.json'))) {
      try {
        out.push(JSON.parse(await readFile(join(this.dir, n), 'utf8')) as { code: string; userIds: string[]; blob: string; updatedAt: number });
      } catch {
        // arquivo incompleto ou estranho: ignora
      }
    }
    return out;
  }

  async listSuspended(userId: string): Promise<StoredMatch[]> {
    return (await this.rows())
      .filter((r) => isSuspendedKey(r.code) && r.userIds.includes(userId))
      .map((r) => ({ code: r.code, blob: r.blob, updatedAt: r.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(key: string): Promise<(StoredMatch & { userIds: string[] }) | null> {
    try {
      const r = JSON.parse(await readFile(this.file(key), 'utf8')) as { code: string; userIds: string[]; blob: string; updatedAt: number };
      return { code: key, blob: r.blob, updatedAt: r.updatedAt, userIds: r.userIds };
    } catch {
      return null;
    }
  }

  async save(code: string, userIds: readonly string[], blob: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(code)}.tmp`;
    await writeFile(tmp, JSON.stringify({ code, userIds, blob, updatedAt: Date.now() }));
    // troca atômica: um reinício no meio da escrita não corrompe o salvamento anterior
    await rename(tmp, this.file(code));
  }

  async findByUser(userId: string): Promise<StoredMatch | null> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return null;
    }
    let best: StoredMatch | null = null;
    for (const n of names.filter((x) => x.endsWith('.json'))) {
      try {
        const r = JSON.parse(await readFile(join(this.dir, n), 'utf8')) as { code: string; userIds: string[]; blob: string; updatedAt: number };
        if (!isSuspendedKey(r.code) && r.userIds.includes(userId) && (!best || r.updatedAt > best.updatedAt)) best = { code: r.code, blob: r.blob, updatedAt: r.updatedAt };
      } catch {
        // arquivo incompleto ou estranho: ignora
      }
    }
    return best;
  }

  async remove(code: string): Promise<void> {
    await rm(this.file(code), { force: true });
  }
}

/** Tabela `active_matches` do Supabase (acesso só com a service role; RLS sem políticas). */
export class SupabaseMatchStore implements MatchStore {
  readonly kind = 'Supabase (active_matches)';
  constructor(private readonly sb: SupabaseClient) {}

  async save(code: string, userIds: readonly string[], blob: string): Promise<void> {
    const { error } = await this.sb.from('active_matches').upsert({ room_code: code, player_ids: userIds, state: blob, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async findByUser(userId: string): Promise<StoredMatch | null> {
    const { data, error } = await this.sb
      .from('active_matches')
      .select('room_code, state, updated_at')
      .contains('player_ids', [userId])
      .not('room_code', 'like', `${SUSPENDED_PREFIX}%`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      log.warn('Falha ao buscar partida salva', { error: error.message });
      return null;
    }
    if (!data) return null;
    return { code: data.room_code as string, blob: data.state as string, updatedAt: Date.parse(data.updated_at as string) };
  }

  async listSuspended(userId: string): Promise<StoredMatch[]> {
    const { data, error } = await this.sb
      .from('active_matches')
      .select('room_code, state, updated_at')
      .contains('player_ids', [userId])
      .like('room_code', `${SUSPENDED_PREFIX}%`)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) {
      log.warn('Falha ao listar partidas salvas', { error: error.message });
      return [];
    }
    return (data ?? []).map((d) => ({ code: d.room_code as string, blob: d.state as string, updatedAt: Date.parse(d.updated_at as string) }));
  }

  async get(key: string): Promise<(StoredMatch & { userIds: string[] }) | null> {
    const { data, error } = await this.sb.from('active_matches').select('room_code, player_ids, state, updated_at').eq('room_code', key).maybeSingle();
    if (error || !data) return null;
    return { code: key, blob: data.state as string, updatedAt: Date.parse(data.updated_at as string), userIds: (data.player_ids as string[]) ?? [] };
  }

  async remove(code: string): Promise<void> {
    const { error } = await this.sb.from('active_matches').delete().eq('room_code', code);
    if (error) log.warn('Falha ao apagar partida salva', { room: code, error: error.message });
  }
}
