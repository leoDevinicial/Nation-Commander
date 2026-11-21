import { decodeData } from './wireDecode.ts';

/** Web Worker da leitura das mensagens do servidor (21/11; ver `wireDecode.ts`). */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; data: string | ArrayBuffer; inflate: boolean }>) => void) | null;
  postMessage: (m: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, data, inflate } = e.data;
  decodeData(data, inflate).then(
    (msg) => ctx.postMessage({ id, msg }),
    (err: unknown) => ctx.postMessage({ id, error: String((err as Error)?.message ?? err) }),
  );
};
