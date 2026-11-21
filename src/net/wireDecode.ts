import type { ServerMessage } from '../../shared/protocol.ts';
import { decodeSnapshotFrame, isWireFrame } from '../../shared/net/wire.ts';

/**
 * Leitura das mensagens do servidor (21/11): texto JSON, texto comprimido pelo servidor (`inflate` no hello) ou quadro
 * binário de snapshot (`shared/net/wire.ts`, comprimido ou não). A mesma função roda no Web Worker
 * (`wire.worker.ts`) e, sem ele, na própria página.
 */
export async function decodeData(data: string | ArrayBuffer, inflate: boolean): Promise<ServerMessage> {
  if (typeof data === 'string') return JSON.parse(data) as ServerMessage;
  const bytes = inflate ? await inflateRaw(data) : new Uint8Array(data);
  if (isWireFrame(bytes)) return decodeSnapshotFrame<ServerMessage>(bytes);
  return JSON.parse(new TextDecoder().decode(bytes)) as ServerMessage;
}

/** Descomprime uma mensagem do servidor (deflate-raw, ver `Connection.sendRaw` e `sendBinary`). */
async function inflateRaw(buf: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface WireDecoder {
  decode(data: string | ArrayBuffer, inflate: boolean): Promise<ServerMessage>;
  /** Onde a leitura roda (painel de conexão). */
  readonly where: 'worker' | 'página';
}

const inline: WireDecoder = { decode: decodeData, where: 'página' };

/**
 * Leitura num Web Worker: descomprimir, ler o JSON e montar as tropas do bloco binário saem da thread que desenha o
 * jogo (no celular fraco, tudo isso disputava com o 3D 10 vezes por segundo). Se o worker falhar, volta para a página
 * sem perder mensagem (cada uma guarda o dado até a resposta).
 */
class WorkerDecoder implements WireDecoder {
  private seq = 0;
  private readonly pending = new Map<
    number,
    { data: string | ArrayBuffer; inflate: boolean; resolve: (m: ServerMessage) => void; reject: (e: unknown) => void }
  >();
  private broken = false;
  where: 'worker' | 'página' = 'worker';

  constructor(private readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent<{ id: number; msg?: ServerMessage; error?: string }>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.error !== undefined) p.reject(new Error(e.data.error));
      else p.resolve(e.data.msg!);
    };
    worker.onerror = () => this.fail();
  }

  private fail(): void {
    if (this.broken) return;
    this.broken = true;
    this.where = 'página';
    this.worker.terminate();
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      decodeData(p.data, p.inflate).then(p.resolve, p.reject);
    }
  }

  decode(data: string | ArrayBuffer, inflate: boolean): Promise<ServerMessage> {
    if (this.broken) return decodeData(data, inflate);
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { data, inflate, resolve, reject });
      try {
        // cópia (não transferência): o dado fica aqui para o caso de o worker falhar
        this.worker.postMessage({ id, data, inflate });
      } catch {
        this.fail();
      }
    });
  }
}

/** Worker quando o navegador tem; senão, na página (testes, navegadores antigos). */
export function createWireDecoder(): WireDecoder {
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return inline;
  try {
    return new WorkerDecoder(new Worker(new URL('./wire.worker.ts', import.meta.url), { type: 'module' }));
  } catch {
    return inline;
  }
}
